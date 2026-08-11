import Groq from "groq-sdk";

// ============================================================
// Shared Types
// ============================================================

export interface HasuraActionPayload<T = Record<string, unknown>> {
  action: { name: string };
  input: T;
  session_variables: {
    "x-hasura-user-id": string;
    "x-hasura-role": string;
    "x-hasura-org-id"?: string;
    [key: string]: string | undefined;
  };
  request_query?: string;
}

export interface WorkflowStep {
  id: string;
  step_order: number;
  type:
    | "llm_call"
    | "http_request"
    | "db_write"
    | "notify"
    | "conditional_branch"
    | "approval_gate";
  config: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  triggered_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  step_id: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  input_payload: Record<string, unknown> | null;
  output_payload: Record<string, unknown> | null;
  error_message: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
}

export interface Organization {
  id: string;
  name: string;
  max_quota_per_month: number;
  current_month_usage: number;
}

// ============================================================
// Hasura Admin Client
// ============================================================

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL!;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;

export async function hasuraAdmin<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(HASURA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hasura HTTP error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(
      `Hasura GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`
    );
  }

  return json.data as T;
}

// ============================================================
// Groq Client
// ============================================================

export const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export const GROQ_MODEL = "llama-3.3-70b-versatile";

// ============================================================
// Permission Helpers
// ============================================================

/**
 * Fetches the caller's role in the workflow's org.
 * Returns null if the user is not a member.
 */
export async function getUserOrgRole(
  userId: string,
  orgId: string
): Promise<"owner" | "editor" | "viewer" | null> {
  const data = await hasuraAdmin<{
    org_members: Array<{ role: string }>;
  }>(
    `query GetUserRole($userId: uuid!, $orgId: uuid!) {
      org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }, limit: 1) {
        role
      }
    }`,
    { userId, orgId }
  );

  return (data.org_members[0]?.role as "owner" | "editor" | "viewer") ?? null;
}

/**
 * Returns the org_id for a given workflow.
 */
export async function getWorkflowOrgId(workflowId: string): Promise<string> {
  const data = await hasuraAdmin<{
    workflows_by_pk: { org_id: string } | null;
  }>(
    `query GetWorkflowOrg($id: uuid!) {
      workflows_by_pk(id: $id) { org_id }
    }`,
    { id: workflowId }
  );

  if (!data.workflows_by_pk) {
    throw new Error(`Workflow ${workflowId} not found`);
  }
  return data.workflows_by_pk.org_id;
}

/**
 * Returns the org_id for a given workflow_run.
 */
export async function getRunOrgId(runId: string): Promise<string> {
  const data = await hasuraAdmin<{
    workflow_runs_by_pk: { workflow: { org_id: string } } | null;
  }>(
    `query GetRunOrg($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        workflow { org_id }
      }
    }`,
    { id: runId }
  );

  if (!data.workflow_runs_by_pk) {
    throw new Error(`Workflow run ${runId} not found`);
  }
  return data.workflow_runs_by_pk.workflow.org_id;
}

// ============================================================
// Retry Utility
// ============================================================

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ============================================================
// Template Interpolation
// Replaces {{step_N.output.field}} with values from prior step outputs
// ============================================================

export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const parts = path.trim().split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let val: any = context;
    for (const part of parts) {
      if (val == null) return "";
      val = val[part];
    }
    return val != null ? String(val) : "";
  });
}

import type { Response } from "express";

// ============================================================
// Standard error response builder
// ============================================================

export function errorResponse(res: Response, message: string, statusCode = 400) {
  return res.status(statusCode).json({ message });
}

export function successResponse(res: Response, data: unknown) {
  return res.status(200).json(data);
}
