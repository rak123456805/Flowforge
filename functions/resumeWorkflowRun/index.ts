/**
 * resumeWorkflowRun — Private Nhost Serverless Function
 *
 * Resumes execution of a paused workflow run starting from the remaining steps.
 * Called directly by approveStep after an approval gate is cleared.
 */

import type { Request, Response } from "express";
import {
  hasuraAdmin,
  withRetry,
  interpolateTemplate,
  interpolateJsonTemplate,
  getGroqClient,
  GROQ_MODEL,
  errorResponse,
  successResponse,
  type WorkflowStep,
} from "../shared/utils";

// ============================================================
// Main Handler
// ============================================================

export default async function handler(req: Request, res: Response): Promise<unknown> {
  if (req.method !== "POST") {
    return errorResponse(res, "Method not allowed", 405);
  }

  // Verify internal secret to secure this private endpoint
  const internalSecret = req.headers["x-nhost-internal-secret"];
  if (!internalSecret || internalSecret !== process.env.NHOST_ADMIN_SECRET) {
    return errorResponse(res, "Unauthorized", 401);
  }

  const { run_id, workflow_id, org_id, approved_by, approver_role, remaining_steps, initial_payload } = req.body as {
    run_id: string;
    workflow_id: string;
    org_id: string;
    approved_by: string | null;
    approver_role: "owner" | "editor";
    remaining_steps: WorkflowStep[];
    initial_payload?: Record<string, unknown>;
  };

  if (!run_id || !workflow_id || !org_id || !approver_role || !remaining_steps) {
    return errorResponse(res, "Missing required fields", 400);
  }

  try {
    // ── 1. Restore completed step outputs context ───────────────────────────
    const completedRuns = await hasuraAdmin<{
      step_runs: Array<{
        step: { step_order: number };
        output_payload: Record<string, unknown> | null;
      }>;
    }>(
      `query GetCompletedStepRuns($runId: uuid!) {
        step_runs(where: { workflow_run_id: { _eq: $runId }, status: { _eq: "completed" } }) {
          step { step_order }
          output_payload
        }
      }`,
      { runId: run_id }
    );

    const stepOutputs: Record<string, Record<string, unknown>> = {};
    if (initial_payload) {
      stepOutputs["trigger"] = { payload: initial_payload };
    }

    for (const sr of completedRuns.step_runs ?? []) {
      stepOutputs[`step_${sr.step.step_order}`] = { output: sr.output_payload ?? {} };
    }

    // ── 2. Load all steps and execute them following the visual routes ──────
    const workflowStepsData = await hasuraAdmin<{
      workflows_by_pk: {
        workflow_steps: WorkflowStep[];
      } | null;
    }>(
      `query GetWorkflowSteps($id: uuid!) {
        workflows_by_pk(id: $id) {
          workflow_steps(order_by: { step_order: asc }) {
            id
            step_order
            type
            config
          }
        }
      }`,
      { id: workflow_id }
    );

    const allSteps = workflowStepsData.workflows_by_pk?.workflow_steps ?? [];

    let currentStep: WorkflowStep | null = remaining_steps[0]
      ? (allSteps.find((s) => s.id === remaining_steps[0].id) || null)
      : null;

    while (currentStep) {
      const step: WorkflowStep = currentStep;

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
        { runId: run_id, stepId: step.id }
      );

      const stepRunId = stepRunData.insert_step_runs_one.id;

      let stepOutput: Record<string, unknown> | null = null;
      let stepError: string | null = null;
      let stepStatus: "completed" | "failed" | "paused" = "completed";

      try {
        const context = { ...stepOutputs };
        const result = await executeStep(step, context, run_id, approver_role);

        if (result.paused) {
          // another approval_gate hit — pause everything and stop
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
            { id: run_id }
          );

          return successResponse(res, {
            workflow_run_id: run_id,
            status: "paused",
            message: `Workflow paused at approval_gate step: ${step.id}. Awaiting approval.`,
          });
        }

        stepOutput = result.output;
        stepOutputs[`step_${step.step_order}`] = { output: stepOutput ?? {} };
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
          { id: run_id }
        );

        return successResponse(res, {
          workflow_run_id: run_id,
          status: "failed",
          message: `Workflow failed at step ${step.step_order}: ${stepError}`,
        });
      }

      // Determine the next step using graph routing logic
      const cfg = step.config as Record<string, unknown>;
      let nextStep: WorkflowStep | null = null;

      if (step.type === "conditional_branch") {
        const conditionResult = stepOutput?.result as boolean;
        const targetStepId = conditionResult
          ? (cfg.true_step_id as string | undefined)
          : (cfg.false_step_id as string | undefined);

        if (targetStepId) {
          nextStep = allSteps.find((s) => s.id === targetStepId) || null;
        } else {
          if (conditionResult) {
            // True fallback: next step by order
            nextStep = allSteps.find((s) => s.step_order > step.step_order) || null;
          } else {
            // False fallback: terminate path
            nextStep = null;
          }
        }
      } else {
        const nextStepId = cfg.next_step_id as string | undefined;
        if (nextStepId) {
          nextStep = allSteps.find((s) => s.id === nextStepId) || null;
        } else {
          // Fallback sequential
          nextStep = allSteps.find((s) => s.step_order > step.step_order) || null;
        }
      }

      currentStep = nextStep;
    }

    // ── 3. Complete run + increment quota ───────────────────────────────────
    await hasuraAdmin(
      `mutation CompleteRun($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "completed",
          completed_at: "now()"
        }) { id }
      }`,
      { id: run_id }
    );

    await hasuraAdmin(
      `mutation IncrementUsage($orgId: uuid!) {
        update_organization(pk_columns: { id: $orgId }, _inc: {
          current_month_usage: 1
        }) { current_month_usage }
      }`,
      { orgId: org_id }
    );

    return successResponse(res, {
      workflow_run_id: run_id,
      status: "completed",
      message: "Workflow resumed and completed successfully.",
    });

  } catch (err) {
    console.error("[resumeWorkflowRun] Unexpected error:", err);
    return errorResponse(
      res,
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
}

// ============================================================
// Step Execution Helpers
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
      if (callerRole !== "owner") {
        throw new Error("db_write steps require Owner role (Layer 2 enforcement)");
      }
      return executeDbWrite(step, context);

    case "notify":
      if (callerRole !== "owner") {
        throw new Error("notify steps require Owner role (Layer 2 enforcement)");
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

  const interpolatedPrompt = interpolateTemplate(config.prompt, context as Record<string, unknown>);
  const systemPrompt = config.system_prompt
    ? interpolateTemplate(config.system_prompt, context as Record<string, unknown>)
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

  const body = config.body_template
    ? interpolateJsonTemplate(config.body_template, context as Record<string, unknown>)
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

async function executeDbWrite(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as {
    mutation: string;
    variables_template?: string;
  };

  const variablesStr = config.variables_template
    ? interpolateJsonTemplate(config.variables_template, context as Record<string, unknown>)
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

async function executeNotify(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as {
    channel: "slack" | "email" | "webhook";
    url?: string;
    message_template: string;
    recipient?: string;
  };

  const message = interpolateTemplate(config.message_template, context as Record<string, unknown>);

  if (config.channel === "slack" || config.channel === "webhook") {
    if (!config.url) throw new Error("notify step requires a url for slack/webhook channel");

    const urlTrimmed = config.url.trim();
    if (!urlTrimmed.startsWith("http://") && !urlTrimmed.startsWith("https://")) {
      throw new Error(`Invalid URL: "${config.url}". Notify URL must start with http:// or https://. If this is an email address, please make sure you change the Channel dropdown to Email.`);
    }

    const res = await fetch(urlTrimmed, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!res.ok) {
      throw new Error(`Notify failed: HTTP ${res.status}`);
    }
    return { output: { sent: true, channel: config.channel, message }, paused: false };
  }

  const recipient = config.recipient || config.url || "unknown@example.com";
  console.log(`[notify] Email to ${recipient}: ${message}`);
  return { output: { sent: true, channel: "email", recipient, message }, paused: false };
}

async function executeConditionalBranch(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as {
    condition: string;
    true_label?: string;
    false_label?: string;
  };

  if (!config.condition?.trim()) {
    throw new Error("conditional_branch step has no condition expression configured.");
  }

  // Inner try-catch handles runtime errors (undefined property access, etc.).
  // Outer try-catch handles syntax errors in the condition expression.
  let result: boolean;
  try {
    const conditionFn = new Function(
      "context",
      `try {
        with(context) { return Boolean(${config.condition}); }
      } catch(runtimeErr) {
        // Safely return false for undefined property access etc.
        return false;
      }`
    );
    result = conditionFn(context) as boolean;
  } catch (syntaxErr) {
    throw new Error(
      `Condition syntax error in expression: "${config.condition}". ` +
      `Error: ${syntaxErr instanceof Error ? syntaxErr.message : String(syntaxErr)}. ` +
      `Hint: Use step_1?.output?.content?.includes?.('text') for safe property access.`
    );
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
