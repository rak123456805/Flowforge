-- ============================================================
-- MIGRATION 001 — Rollback
-- ============================================================
DROP VIEW IF EXISTS public.org_monthly_stats;
DROP FUNCTION IF EXISTS public.get_workflow_org_id(UUID);
DROP FUNCTION IF EXISTS public.get_user_org_role(UUID, UUID);
DROP FUNCTION IF EXISTS public.organizations_monthly_usage_percentage(public.organizations);
DROP TABLE IF EXISTS public.step_runs CASCADE;
DROP TABLE IF EXISTS public.results CASCADE;
DROP TABLE IF EXISTS public.workflow_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_triggers CASCADE;
DROP TABLE IF EXISTS public.workflow_steps CASCADE;
DROP TABLE IF EXISTS public.workflows CASCADE;
DROP TABLE IF EXISTS public.org_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at();
