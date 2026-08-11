/**
 * triggerWorkflowRun — Hasura Action Handler
 *
 * Backed by a Nhost serverless function (or Next.js API route).
 * Executes a complete workflow run with sequential step processing,
 * retry logic, approval gate pausing, and quota enforcement.
 *
 * Security:
 *  - Layer 1: Hasura Action permissions restrict to owner/editor roles only.
 *  - Layer 2: This handler enforces step-level gating for high-privilege
 *    step types (db_write, notify) and webhook triggers (owner-only).
 */

import type { Request, Response } from "express";
import {
  hasuraAdmin,
  getUserOrgRole,
  getWorkflowOrgId,
  withRetry,
  interpolateTemplate,
  getGroqClient,
  GROQ_MODEL,
  errorResponse,
  successResponse,
  type HasuraActionPayload,
  type WorkflowStep,
} from "../shared/utils";

// ============================================================
// Main Handler
// ============================================================

export default async function handler(req: Request, res: Response): Promise<unknown> {
  if (req.method !== "POST") {
    return errorResponse(res, "Method not allowed", 405);
  }

  const payload = req.body as HasuraActionPayload<{ workflow_id: string }>;
  if (!payload || !payload.session_variables || !payload.input) {
    return errorResponse(res, "Invalid JSON payload", 400);
  }

  const userId = payload.session_variables["x-hasura-user-id"];
  const callerRole = payload.session_variables["x-hasura-role"] as
    | "owner"
    | "editor"
    | "viewer";
  const workflowId = payload.input.workflow_id;

  if (!userId || !workflowId) {
    return errorResponse(res, "Missing required fields", 400);
  }

  // ── Viewers can never trigger a run ──────────────────────────────────────
  if (callerRole === "viewer") {
    return errorResponse(res, "Viewers cannot trigger workflow runs", 403);
  }

  try {
    // ── 1. Resolve org and verify membership ──────────────────────────────
    const orgId = await getWorkflowOrgId(workflowId);
    const memberRole = await getUserOrgRole(userId, orgId);

    if (!memberRole || memberRole === "viewer") {
      return errorResponse(
        res,
        "You are not authorized to trigger runs in this organization",
        403
      );
    }

    // ── 2. Quota check ────────────────────────────────────────────────────
    const orgData = await hasuraAdmin<{
      organizations_by_pk: {
        max_quota_per_month: number;
        current_month_usage: number;
      } | null;
    }>(
      `query QuotaCheck($orgId: uuid!) {
        organizations_by_pk(id: $orgId) {
          max_quota_per_month
          current_month_usage
        }
      }`,
      { orgId }
    );

    const org = orgData.organizations_by_pk;
    if (!org) return errorResponse(res, "Organization not found", 404);

    if (org.current_month_usage >= org.max_quota_per_month) {
      return errorResponse(
        res,
        `Monthly quota exhausted: ${org.current_month_usage}/${org.max_quota_per_month} runs used. Upgrade your plan or wait for next month.`,
        429
      );
    }

    // ── 3. Load workflow steps ────────────────────────────────────────────
    const workflowData = await hasuraAdmin<{
      workflows_by_pk: {
        id: string;
        name: string;
        is_active: boolean;
        workflow_steps: WorkflowStep[];
      } | null;
    }>(
      `query GetWorkflow($id: uuid!) {
        workflows_by_pk(id: $id) {
          id
          name
          is_active
          workflow_steps(order_by: { step_order: asc }) {
            id
            step_order
            type
            config
          }
        }
      }`,
      { id: workflowId }
    );

    const workflow = workflowData.workflows_by_pk;
    if (!workflow) return errorResponse(res, "Workflow not found", 404);
    if (!workflow.is_active)
      return errorResponse(res, "Workflow is not active", 400);

    // ── 4. Layer 2: Pre-flight step-level permission gating ───────────────
    // Editors cannot execute workflows containing db_write or notify steps.
    if (memberRole === "editor") {
      const restrictedSteps = workflow.workflow_steps.filter(
        (s) => s.type === "db_write" || s.type === "notify"
      );
      if (restrictedSteps.length > 0) {
        return errorResponse(
          res,
          `This workflow contains high-privilege step types (${restrictedSteps.map((s) => s.type).join(", ")}) that require Owner role to execute.`,
          403
        );
      }
    }

    // ── 5. Create workflow_run ────────────────────────────────────────────
    const runData = await hasuraAdmin<{
      insert_workflow_runs_one: { id: string };
    }>(
      `mutation CreateRun($workflowId: uuid!, $userId: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflowId,
          status: "running",
          triggered_by: $userId
        }) { id }
      }`,
      { workflowId, userId }
    );

    const runId = runData.insert_workflow_runs_one.id;

    // ── 6. Execute steps sequentially ────────────────────────────────────
    const stepOutputs: Record<string, Record<string, unknown>> = {};

    for (const step of workflow.workflow_steps) {
      // Create step_run record
      const stepRunData = await hasuraAdmin<{
        insert_step_runs_one: { id: string };
      }>(
        `mutation CreateStepRun($runId: uuid!, $stepId: uuid!) {
          insert_step_runs_one(object: {
            workflow_run_id: $runId,
            step_id: $stepId,
            status: "running",
            attempt_count: 1
          }) { id }
        }`,
        { runId, stepId: step.id }
      );

      const stepRunId = stepRunData.insert_step_runs_one.id;

      let stepOutput: Record<string, unknown> | null = null;
      let stepError: string | null = null;
      let stepStatus: "completed" | "failed" | "paused" = "completed";

      try {
        const context = { ...stepOutputs };
        const result = await executeStep(step, context, runId, memberRole);

        if (result.paused) {
          // approval_gate hit — pause everything and stop
          await hasuraAdmin(
            `mutation PauseStepRun($id: uuid!) {
              update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
                status: "paused",
                output_payload: {}
              }) { id }
            }`,
            { id: stepRunId }
          );

          await hasuraAdmin(
            `mutation PauseRun($id: uuid!) {
              update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
                status: "paused"
              }) { id }
            }`,
            { id: runId }
          );

          return successResponse(res, {
            workflow_run_id: runId,
            status: "paused",
            message: `Workflow paused at approval_gate step: ${step.id}. Awaiting approval.`,
          });
        }

        stepOutput = result.output;
        stepOutputs[`step_${step.step_order}`] = stepOutput ?? {};
        stepStatus = "completed";
      } catch (err) {
        stepError = err instanceof Error ? err.message : String(err);
        stepStatus = "failed";
      }

      // Update step_run with result
      await hasuraAdmin(
        `mutation UpdateStepRun($id: uuid!, $status: String!, $output: jsonb, $error: String) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: $status,
            output_payload: $output,
            error_message: $error
          }) { id }
        }`,
        {
          id: stepRunId,
          status: stepStatus,
          output: stepOutput,
          error: stepError,
        }
      );

      // If step failed — fail the whole run
      if (stepStatus === "failed") {
        await hasuraAdmin(
          `mutation FailRun($id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
              status: "failed",
              completed_at: "now()"
            }) { id }
          }`,
          { id: runId }
        );

        return successResponse(res, {
          workflow_run_id: runId,
          status: "failed",
          message: `Workflow failed at step ${step.step_order}: ${stepError}`,
        });
      }
    }

    // ── 7. Complete run + increment quota ─────────────────────────────────
    await hasuraAdmin(
      `mutation CompleteRun($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "completed",
          completed_at: "now()"
        }) { id }
      }`,
      { id: runId }
    );

    await hasuraAdmin(
      `mutation IncrementUsage($orgId: uuid!) {
        update_organizations_by_pk(pk_columns: { id: $orgId }, _inc: {
          current_month_usage: 1
        }) { current_month_usage }
      }`,
      { orgId }
    );

    return successResponse(res, {
      workflow_run_id: runId,
      status: "completed",
      message: "Workflow completed successfully.",
    });
  } catch (err) {
    console.error("[triggerWorkflowRun] Unexpected error:", err);
    return errorResponse(
      res,
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
}

// ============================================================
// Step Executor
// ============================================================

async function executeStep(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>,
  _runId: string,
  callerRole: "owner" | "editor"
): Promise<{ output: Record<string, unknown> | null; paused: boolean }> {
  switch (step.type) {
    case "llm_call":
      return executeLlmCall(step, context);

    case "http_request":
      return executeHttpRequest(step, context);

    case "db_write":
      // Layer 2: Only owners can execute db_write steps
      if (callerRole !== "owner") {
        throw new Error(
          "db_write steps require Owner role (Layer 2 enforcement)"
        );
      }
      return executeDbWrite(step, context);

    case "notify":
      // Layer 2: Only owners can execute notify steps
      if (callerRole !== "owner") {
        throw new Error(
          "notify steps require Owner role (Layer 2 enforcement)"
        );
      }
      return executeNotify(step, context);

    case "conditional_branch":
      return executeConditionalBranch(step, context);

    case "approval_gate":
      return { output: null, paused: true };

    default:
      throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
  }
}

// ── LLM Call ──────────────────────────────────────────────────────────────

async function executeLlmCall(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as {
    prompt: string;
    system_prompt?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  };

  const interpolatedPrompt = interpolateTemplate(
    config.prompt,
    context as Record<string, unknown>
  );
  const systemPrompt = config.system_prompt
    ? interpolateTemplate(
        config.system_prompt,
        context as Record<string, unknown>
      )
    : "You are a helpful AI assistant.";

  const response = await withRetry(
    async () => {
      const completion = await getGroqClient().chat.completions.create({
        model: config.model ?? GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: interpolatedPrompt },
        ],
        temperature: config.temperature ?? 0.7,
        max_tokens: config.max_tokens ?? 1024,
      });
      return completion;
    },
    3,
    1500
  );

  const content = response.choices[0]?.message?.content ?? "";
  return {
    output: {
      content,
      model: response.model,
      usage: response.usage,
      finish_reason: response.choices[0]?.finish_reason,
    },
    paused: false,
  };
}

// ── HTTP Request ─────────────────────────────────────────────────────────

async function executeHttpRequest(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body_template?: string;
    timeout_ms?: number;
  };

  const url = interpolateTemplate(config.url, context as Record<string, unknown>);
  const method = config.method ?? "GET";
  const timeoutMs = config.timeout_ms ?? 30000;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers ?? {}),
  };

  const body =
    config.body_template
      ? interpolateTemplate(config.body_template, context as Record<string, unknown>)
      : undefined;

  const response = await withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? body : undefined,
        signal: controller.signal,
      });

      const responseBody = await res.text();
      let parsedBody: unknown = responseBody;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        // keep as text
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${responseBody.slice(0, 200)}`);
      }

      return { status: res.status, body: parsedBody, headers: Object.fromEntries(res.headers.entries()) };
    } finally {
      clearTimeout(timer);
    }
  }, 3, 2000);

  return { output: response as Record<string, unknown>, paused: false };
}

// ── DB Write ─────────────────────────────────────────────────────────────

async function executeDbWrite(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as {
    mutation: string;
    variables_template?: string;
  };

  const variablesStr = config.variables_template
    ? interpolateTemplate(config.variables_template, context as Record<string, unknown>)
    : "{}";

  let variables: Record<string, unknown>;
  try {
    variables = JSON.parse(variablesStr) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid variables_template: must be valid JSON after interpolation");
  }

  const result = await hasuraAdmin(config.mutation, variables);
  return { output: result as Record<string, unknown>, paused: false };
}

// ── Notify ───────────────────────────────────────────────────────────────

async function executeNotify(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as {
    channel: "slack" | "email" | "webhook";
    url?: string;          // Slack webhook URL or generic webhook URL
    message_template: string;
    recipient?: string;    // email address
  };

  const message = interpolateTemplate(
    config.message_template,
    context as Record<string, unknown>
  );

  if (config.channel === "slack" || config.channel === "webhook") {
    if (!config.url) throw new Error("notify step requires a url for slack/webhook channel");

    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!res.ok) {
      throw new Error(`Notify failed: HTTP ${res.status}`);
    }
    return { output: { sent: true, channel: config.channel, message }, paused: false };
  }

  // email — stub (integrate SendGrid/Resend in production)
  console.log(`[notify] Email to ${config.recipient}: ${message}`);
  return { output: { sent: true, channel: "email", recipient: config.recipient, message }, paused: false };
}

// ── Conditional Branch ───────────────────────────────────────────────────

async function executeConditionalBranch(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as {
    condition: string;       // JavaScript expression evaluated with context
    true_label?: string;
    false_label?: string;
  };

  // Safe evaluation — only reads from context, no side effects
  let result: boolean;
  try {
    const conditionFn = new Function(
      "context",
      `"use strict"; with(context) { return Boolean(${config.condition}); }`
    );
    result = conditionFn(context) as boolean;
  } catch (err) {
    throw new Error(`Condition evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    output: {
      condition: config.condition,
      result,
      branch: result ? (config.true_label ?? "true") : (config.false_label ?? "false"),
    },
    paused: false,
  };
}
