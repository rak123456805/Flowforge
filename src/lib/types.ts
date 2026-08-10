// ============================================================
// Full TypeScript Type Definitions
// Mirrors the PostgreSQL schema exactly
// ============================================================

export type UserRole = "owner" | "editor" | "viewer";

export type StepType =
  | "llm_call"
  | "http_request"
  | "db_write"
  | "notify"
  | "conditional_branch"
  | "approval_gate";

export type TriggerType =
  | "manual"
  | "webhook"
  | "scheduled"
  | "database_event";

export type RunStatus = "pending" | "running" | "paused" | "completed" | "failed";

// ── Core Entities ─────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  max_quota_per_month: number;
  current_month_usage: number;
  created_at: string;
  monthly_usage_percentage?: number;
  org_members?: OrgMember[];
  workflows?: Workflow[];
}

export interface OrgMember {
  id: string;
  user_id: string;
  org_id: string;
  role: UserRole;
  created_at: string;
  organization?: Organization;
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  organization?: Organization;
  workflow_steps?: WorkflowStep[];
  workflow_triggers?: WorkflowTrigger[];
  workflow_runs?: WorkflowRun[];
}

// ── Step Config Types (JSONB schemas per step type) ───────────────────────

export interface LlmCallConfig {
  prompt: string;
  system_prompt?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface HttpRequestConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body_template?: string;
  timeout_ms?: number;
}

export interface DbWriteConfig {
  mutation: string;
  variables_template?: string;
}

export interface NotifyConfig {
  channel: "slack" | "email" | "webhook";
  url?: string;
  message_template: string;
  recipient?: string;
}

export interface ConditionalBranchConfig {
  condition: string;
  true_label?: string;
  false_label?: string;
}

export interface ApprovalGateConfig {
  message?: string;
  required_role?: "owner" | "editor";
}

export type StepConfig =
  | LlmCallConfig
  | HttpRequestConfig
  | DbWriteConfig
  | NotifyConfig
  | ConditionalBranchConfig
  | ApprovalGateConfig;

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  type: StepType;
  config: StepConfig;
  created_at: string;
  workflow?: Workflow;
  step_runs?: StepRun[];
}

// ── Trigger Config Types ───────────────────────────────────────────────────

export interface WebhookTriggerConfig {
  secret_token?: string;
}

export interface ScheduledTriggerConfig {
  cron_expression: string;
  timezone?: string;
}

export interface DatabaseEventTriggerConfig {
  table: string;
  schema?: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "MANUAL";
}

export type TriggerConfig =
  | WebhookTriggerConfig
  | ScheduledTriggerConfig
  | DatabaseEventTriggerConfig
  | Record<string, never>;

export interface WorkflowTrigger {
  id: string;
  workflow_id: string;
  trigger_type: TriggerType;
  config: TriggerConfig;
  created_at: string;
  workflow?: Workflow;
}

// ── Run Entities ───────────────────────────────────────────────────────────

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: RunStatus;
  triggered_by: string | null;
  created_at: string;
  completed_at: string | null;
  workflow?: Workflow;
  step_runs?: StepRun[];
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  step_id: string;
  status: RunStatus;
  input_payload: Record<string, unknown> | null;
  output_payload: Record<string, unknown> | null;
  error_message: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  workflow_run?: WorkflowRun;
  step?: WorkflowStep;
}

// ── Frontend State Types ───────────────────────────────────────────────────

export interface OrgContext {
  org: Organization | null;
  role: UserRole | null;
  loading: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
}

// ── Action Response Types ──────────────────────────────────────────────────

export interface TriggerWorkflowRunOutput {
  workflow_run_id: string;
  status: string;
  message: string;
}

export interface ApproveStepOutput {
  step_run_id: string;
  workflow_run_id: string;
  status: string;
  message: string;
}

// ── GraphQL Query Result Types ─────────────────────────────────────────────

export interface WorkflowWithDetails extends Workflow {
  workflow_steps: WorkflowStep[];
  workflow_triggers: WorkflowTrigger[];
  workflow_runs: Array<WorkflowRun & { step_runs: StepRun[] }>;
}
