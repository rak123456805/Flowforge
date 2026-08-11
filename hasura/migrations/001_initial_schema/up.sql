-- ============================================================
-- MIGRATION 001 — Initial Schema
-- AI Agent Workflow Orchestrator
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TABLE: organizations
-- ============================================================
CREATE TABLE public.organizations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  max_quota_per_month   INT         NOT NULL DEFAULT 100,
  current_month_usage   INT         NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS 'Top-level tenant entity. Each org has a monthly quota for workflow executions.';
COMMENT ON COLUMN public.organizations.max_quota_per_month IS 'Maximum workflow runs allowed per calendar month.';
COMMENT ON COLUMN public.organizations.current_month_usage IS 'Number of workflow runs completed in the current month.';

-- ============================================================
-- TABLE: org_members
-- ============================================================
CREATE TABLE public.org_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

COMMENT ON TABLE public.org_members IS 'Maps auth users to organizations with a specific role.';
COMMENT ON COLUMN public.org_members.role IS 'owner: full control | editor: build & run workflows | viewer: read-only';

CREATE INDEX idx_org_members_user_id ON public.org_members (user_id);
CREATE INDEX idx_org_members_org_id  ON public.org_members (org_id);

-- ============================================================
-- TABLE: workflows
-- ============================================================
CREATE TABLE public.workflows (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workflows IS 'A named, ordered pipeline of steps belonging to an org.';

CREATE INDEX idx_workflows_org_id ON public.workflows (org_id);

-- Auto-update updated_at on mutations
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: workflow_steps
-- ============================================================
CREATE TABLE public.workflow_steps (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID        NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order  INT         NOT NULL,
  type        TEXT        NOT NULL CHECK (
    type IN (
      'llm_call',
      'http_request',
      'db_write',
      'notify',
      'conditional_branch',
      'approval_gate'
    )
  ),
  config      JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order)
);

COMMENT ON TABLE public.workflow_steps IS 'Ordered step nodes in a workflow. config is step-type-specific JSONB.';
COMMENT ON COLUMN public.workflow_steps.type IS 'llm_call | http_request | db_write | notify | conditional_branch | approval_gate';
COMMENT ON COLUMN public.workflow_steps.config IS 'Step-type-specific config. e.g. for llm_call: {prompt, model, system_prompt}. For http_request: {url, method, headers, body_template}.';

CREATE INDEX idx_workflow_steps_workflow_id ON public.workflow_steps (workflow_id);

-- ============================================================
-- TABLE: workflow_triggers
-- ============================================================
CREATE TABLE public.workflow_triggers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID        NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_type TEXT        NOT NULL CHECK (
    trigger_type IN ('manual', 'webhook', 'scheduled', 'database_event')
  ),
  config       JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workflow_triggers IS 'Defines how a workflow can be initiated. Multiple triggers per workflow are allowed.';
COMMENT ON COLUMN public.workflow_triggers.config IS 'Trigger-specific config. e.g. for webhook: {secret_token}. For scheduled: {cron_expression}. For database_event: {table, operation}.';

CREATE INDEX idx_workflow_triggers_workflow_id ON public.workflow_triggers (workflow_id);

-- ============================================================
-- TABLE: workflow_runs
-- ============================================================
CREATE TABLE public.workflow_runs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID        NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'paused', 'completed', 'failed')
  ),
  triggered_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.workflow_runs IS 'One row per workflow execution. Status transitions: pending → running → paused ↔ running → completed | failed.';

CREATE INDEX idx_workflow_runs_workflow_id ON public.workflow_runs (workflow_id);
CREATE INDEX idx_workflow_runs_status ON public.workflow_runs (status);

-- ============================================================
-- TABLE: step_runs
-- ============================================================
CREATE TABLE public.step_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id  UUID        NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id          UUID        NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'paused', 'completed', 'failed')
  ),
  input_payload    JSONB,
  output_payload   JSONB,
  error_message    TEXT,
  attempt_count    INT         NOT NULL DEFAULT 0,
  approved_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.step_runs IS 'One row per step per workflow execution. Stores full input/output payloads for debugging.';
COMMENT ON COLUMN public.step_runs.attempt_count IS 'Number of execution attempts. Used for retry logic (max 3).';
COMMENT ON COLUMN public.step_runs.approved_by IS 'User ID of the person who approved an approval_gate step.';

CREATE INDEX idx_step_runs_workflow_run_id ON public.step_runs (workflow_run_id);
CREATE INDEX idx_step_runs_step_id         ON public.step_runs (step_id);
CREATE INDEX idx_step_runs_status          ON public.step_runs (status);

-- ============================================================
-- COMPUTED FIELD: monthly_usage_percentage
-- ============================================================
CREATE OR REPLACE FUNCTION public.organizations_monthly_usage_percentage(
  org_row public.organizations
)
RETURNS FLOAT
STABLE
LANGUAGE sql AS $$
  SELECT
    CASE
      WHEN org_row.max_quota_per_month = 0 THEN 0
      ELSE (org_row.current_month_usage::FLOAT / org_row.max_quota_per_month::FLOAT) * 100
    END;
$$;

COMMENT ON FUNCTION public.organizations_monthly_usage_percentage IS
  'Computed field: returns the percentage of monthly quota consumed (0-100+). Used by Hasura computed field.';

-- ============================================================
-- HELPER FUNCTION: get_user_org_role
-- Used by permission checks in Action handlers
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_org_role(
  p_user_id UUID,
  p_org_id  UUID
)
RETURNS TEXT
STABLE
LANGUAGE sql AS $$
  SELECT role FROM public.org_members
  WHERE user_id = p_user_id AND org_id = p_org_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_org_role IS
  'Returns the role of a user in a specific org. Returns NULL if not a member.';

-- ============================================================
-- HELPER FUNCTION: get_workflow_org_id
-- Used in Action handlers to verify workflow ownership
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workflow_org_id(
  p_workflow_id UUID
)
RETURNS UUID
STABLE
LANGUAGE sql AS $$
  SELECT org_id FROM public.workflows WHERE id = p_workflow_id LIMIT 1;
$$;

-- ============================================================
-- VIEW: org_monthly_stats
-- Aggregation — average run duration per org + total runs this month
-- ============================================================
CREATE OR REPLACE VIEW public.org_monthly_stats AS
SELECT
  o.id                                                             AS org_id,
  o.name                                                           AS org_name,
  o.current_month_usage,
  o.max_quota_per_month,
  COUNT(wr.id) FILTER (WHERE wr.status = 'completed')             AS completed_runs,
  COUNT(wr.id) FILTER (WHERE wr.status = 'failed')                AS failed_runs,
  COUNT(wr.id) FILTER (WHERE wr.status = 'paused')                AS paused_runs,
  AVG(
    EXTRACT(EPOCH FROM (wr.completed_at - wr.created_at))
  ) FILTER (WHERE wr.completed_at IS NOT NULL)                    AS avg_run_duration_seconds
FROM public.organizations o
LEFT JOIN public.workflows w ON w.org_id = o.id
LEFT JOIN public.workflow_runs wr ON wr.workflow_id = w.id
  AND wr.created_at >= date_trunc('month', now())
GROUP BY o.id, o.name, o.current_month_usage, o.max_quota_per_month;

COMMENT ON VIEW public.org_monthly_stats IS 'Aggregated per-org stats for the current calendar month.';

-- ============================================================
-- TABLE: results (for db_write steps)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.results (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  data         JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.results IS 'Generic log/results table for db_write step outputs.';
