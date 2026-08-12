/**
 * approveStep — Next.js API Route (Hasura Action Handler)
 *
 * Approves a paused approval_gate step_run and executes all remaining steps inline.
 * Verifies that the approver holds owner or editor role in the workflow's org.
 */

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

// ── Types ─────────────────────────────────────────────────────────────────

interface HasuraActionPayload {
  action: { name: string };
  input: { step_run_id: string };
  session_variables: {
    "x-hasura-user-id": string;
    "x-hasura-role": string;
    [key: string]: string | undefined;
  };
}

interface WorkflowStep {
  id: string;
  step_order: number;
  type: "llm_call" | "http_request" | "db_write" | "notify" | "conditional_branch" | "approval_gate";
  config: Record<string, unknown>;
}

// ── Hasura Admin Client ────────────────────────────────────────────────────

const HASURA_ENDPOINT =
  process.env.NHOST_GRAPHQL_URL ||
  `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function hasuraAdmin<T = unknown>(
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

  const responseBody = await res.text();
  let json: { data?: T; errors?: Array<{ message: string }> };
  try {
    json = JSON.parse(responseBody);
  } catch {
    throw new Error(`Invalid JSON from Hasura: ${responseBody.slice(0, 200)}`);
  }

  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

async function getUserOrgRole(
  userId: string,
  orgId: string
): Promise<"owner" | "editor" | "viewer" | null> {
  const data = await hasuraAdmin<{ org_members: Array<{ role: string }> }>(
    `query GetMember($userId: uuid!, $orgId: uuid!) {
      org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) { role }
    }`,
    { userId, orgId }
  );
  return (data.org_members[0]?.role as "owner" | "editor" | "viewer") ?? null;
}

// ── Helpers & Step Execution ──────────────────────────────────────────────

function interpolateTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const parts = path.trim().split(".");
    let val: unknown = context;
    for (const part of parts) {
      if (val && typeof val === "object") val = (val as Record<string, unknown>)[part];
      else return `{{${path}}}`;
    }
    return val !== undefined ? String(val) : `{{${path}}}`;
  });
}

function interpolateJsonTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/"\{\{([^}]+)\}\}"/g, (_, path: string) => {
    const parts = path.trim().split(".");
    let val: unknown = context;
    for (const part of parts) {
      if (val && typeof val === "object") val = (val as Record<string, unknown>)[part];
      else return `"{{${path}}}"`;
    }
    if (val === undefined) return `"{{${path}}}"`;
    return typeof val === "string" ? JSON.stringify(val) : JSON.stringify(val);
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 1500): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastError;
}

async function executeConditionalBranch(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>
): Promise<{ output: Record<string, unknown>; paused: false }> {
  const config = step.config as { condition: string; true_label?: string; false_label?: string };

  if (!config.condition?.trim()) {
    throw new Error("conditional_branch step has no condition expression configured.");
  }

  let result: boolean;
  try {
    // Inner try-catch inside the Function body handles runtime errors like
    // undefined property access (e.g. step_1.output.content is undefined).
    // Outer try-catch handles syntax errors in the condition expression itself.
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

async function executeStep(step: WorkflowStep, context: Record<string, Record<string, unknown>>, callerRole: "owner" | "editor") {
  switch (step.type) {
    case "llm_call": {
      const config = step.config as { prompt: string; system_prompt?: string; model?: string; temperature?: number; max_tokens?: number };
      const prompt = interpolateTemplate(config.prompt, context as Record<string, unknown>);
      const system = config.system_prompt ? interpolateTemplate(config.system_prompt, context as Record<string, unknown>) : "You are a helpful AI assistant.";
      const response = await withRetry(async () => {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
        return groq.chat.completions.create({
          model: config.model ?? GROQ_MODEL,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
          temperature: config.temperature ?? 0.7,
          max_tokens: config.max_tokens ?? 1024,
        });
      });
      return { output: { content: response.choices[0]?.message?.content ?? "", model: response.model }, paused: false };
    }
    case "http_request": {
      const config = step.config as { url: string; method?: string; headers?: Record<string, string>; body_template?: string; timeout_ms?: number };
      const url = interpolateTemplate(config.url, context as Record<string, unknown>);
      const body = config.body_template ? interpolateJsonTemplate(config.body_template, context as Record<string, unknown>) : undefined;
      const response = await withRetry(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.timeout_ms ?? 30000);
        try {
          const r = await fetch(url, { method: config.method ?? "GET", headers: { "Content-Type": "application/json", ...(config.headers ?? {}) }, body: body ?? undefined, signal: controller.signal });
          const text = await r.text();
          let parsed: unknown = text;
          try { parsed = JSON.parse(text); } catch { /* keep as text */ }
          if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
          return { status: r.status, body: parsed };
        } finally { clearTimeout(timer); }
      });
      return { output: response as Record<string, unknown>, paused: false };
    }
    case "db_write": {
      if (callerRole !== "owner") throw new Error("db_write steps require Owner role");
      const config = step.config as { mutation: string; variables_template?: string };
      const varsStr = config.variables_template ? interpolateJsonTemplate(config.variables_template, context as Record<string, unknown>) : "{}";
      const vars = JSON.parse(varsStr) as Record<string, unknown>;
      const result = await hasuraAdmin(config.mutation, vars);
      return { output: result as Record<string, unknown>, paused: false };
    }
    case "notify": {
      if (callerRole !== "owner") throw new Error("notify steps require Owner role");
      const config = step.config as { channel: "slack" | "email" | "webhook"; url?: string; message_template: string; recipient?: string };
      const message = interpolateTemplate(config.message_template, context as Record<string, unknown>);
      if (config.channel === "slack" || config.channel === "webhook") {
        if (!config.url) throw new Error("notify step requires a url");
        const r = await fetch(config.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: message }) });
        if (!r.ok) throw new Error(`Notify failed: HTTP ${r.status}`);
      }
      return { output: { sent: true, channel: config.channel, message }, paused: false };
    }
    case "conditional_branch":
      return executeConditionalBranch(step, context);
    case "approval_gate":
      return { output: null, paused: true };
    default:
      throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
  }
}

// ── Main Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as HasuraActionPayload;

  if (!payload?.session_variables || !payload?.input) {
    return NextResponse.json({ message: "Invalid JSON payload" }, { status: 400 });
  }

  const userId = payload.session_variables["x-hasura-user-id"];
  const stepRunId = payload.input.step_run_id;

  if (!userId || !stepRunId) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
  }

  try {
    // 1. Load step_run with full chain
    const data = await hasuraAdmin<{
      step_runs_by_pk: {
        id: string;
        status: string;
        workflow_run_id: string;
        step: { type: string; step_order: number };
        workflow_run: {
          id: string;
          status: string;
          workflow: { id: string; org_id: string };
        };
      } | null;
    }>(
      `query GetStepRun($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id status workflow_run_id
          step { type step_order }
          workflow_run {
            id status
            workflow { id org_id }
          }
        }
      }`,
      { id: stepRunId }
    );

    const stepRun = data.step_runs_by_pk;
    if (!stepRun) return NextResponse.json({ message: "Step run not found" }, { status: 404 });

    // 2. Verify it's an approval_gate step
    if (stepRun.step.type !== "approval_gate") {
      return NextResponse.json({
        message: `Step type '${stepRun.step.type}' is not an approval_gate.`
      }, { status: 400 });
    }

    // 3. Verify step is paused
    if (stepRun.status !== "paused") {
      return NextResponse.json({
        message: `Step run is '${stepRun.status}', not 'paused'. Cannot approve.`
      }, { status: 400 });
    }
    if (stepRun.workflow_run.status !== "paused") {
      return NextResponse.json({
        message: `Workflow run is '${stepRun.workflow_run.status}', not 'paused'. Cannot approve.`
      }, { status: 400 });
    }

    // 4. Verify approver role
    const orgId = stepRun.workflow_run.workflow.org_id;
    const memberRole = await getUserOrgRole(userId, orgId);
    if (!memberRole) {
      return NextResponse.json({ message: "Not a member of this org" }, { status: 403 });
    }
    if (memberRole === "viewer") {
      return NextResponse.json({ message: "Viewers cannot approve steps." }, { status: 403 });
    }

    // 5. Mark approval_gate step_run as completed
    await hasuraAdmin(
      `mutation ApproveStepRun($id: uuid!, $userId: uuid!, $now: timestamptz!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "completed",
          approved_by: $userId,
          approved_at: $now,
          output_payload: { approved: true }
        }) { id }
      }`,
      { id: stepRunId, userId, now: new Date().toISOString() }
    );

    // 6. Load remaining steps
    const runId = stepRun.workflow_run_id;
    const workflowId = stepRun.workflow_run.workflow.id;

    const remainingData = await hasuraAdmin<{
      workflow_runs_by_pk: {
        step_runs: Array<{ step: { step_order: number }; status: string; output_payload: Record<string, unknown> | null }>;
      } | null;
      workflows_by_pk: {
        workflow_steps: Array<{ id: string; step_order: number; type: string; config: Record<string, unknown> }>;
      } | null;
    }>(
      `query GetResumeContext($runId: uuid!, $workflowId: uuid!) {
        workflow_runs_by_pk(id: $runId) {
          step_runs(order_by: { step: { step_order: asc } }) {
            step { step_order }
            status
            output_payload
          }
        }
        workflows_by_pk(id: $workflowId) {
          workflow_steps(order_by: { step_order: asc }) {
            id step_order type config
          }
        }
      }`,
      { runId, workflowId }
    );

    const completedStepRuns = (remainingData.workflow_runs_by_pk?.step_runs ?? [])
      .filter((sr) => sr.status === "completed");

    const completedOrders = new Set(completedStepRuns.map((sr) => sr.step.step_order));

    // Rebuild step output context from completed step runs
    const stepOutputs: Record<string, Record<string, unknown>> = {};
    completedStepRuns.forEach((sr) => {
      stepOutputs[`step_${sr.step.step_order}`] = { output: sr.output_payload ?? {} };
    });

    const allSteps = remainingData.workflows_by_pk?.workflow_steps ?? [];
    const remainingSteps = (allSteps as WorkflowStep[]).filter((s) => !completedOrders.has(s.step_order));

    // 7. Resume the workflow run
    await hasuraAdmin(
      `mutation ResumeRun($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "running" }) { id }
      }`,
      { id: runId }
    );

    if (remainingSteps.length === 0) {
      await hasuraAdmin(
        `mutation CompleteRun($id: uuid!) {
          update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: "completed", completed_at: "now()"
          }) { id }
        }`,
        { id: runId }
      );
      await hasuraAdmin(
        `mutation IncrementUsage($orgId: uuid!) { update_organization(pk_columns: { id: $orgId }, _inc: { current_month_usage: 1 }) { current_month_usage } }`,
        { orgId }
      );
      return NextResponse.json({
        step_run_id: stepRunId,
        workflow_run_id: runId,
        status: "completed",
        message: "Approval accepted. Workflow completed (no remaining steps).",
      });
    }

    // 8. Execute remaining steps sequentially INLINE (no external fetch)
    for (const step of remainingSteps) {
      const stepRunData = await hasuraAdmin<{ insert_step_runs_one: { id: string } }>(
        `mutation CreateStepRun($runId: uuid!, $stepId: uuid!) {
          insert_step_runs_one(object: { workflow_run_id: $runId, step_id: $stepId, status: "running", attempt_count: 1 }) { id }
        }`,
        { runId, stepId: step.id }
      );
      const curStepRunId = stepRunData.insert_step_runs_one.id;

      let stepOutput: Record<string, unknown> | null = null;
      let stepError: string | null = null;
      let stepStatus: "completed" | "failed" | "paused" = "completed";

      try {
        const result = await executeStep(step, stepOutputs, memberRole);
        if (result.paused) {
          await hasuraAdmin(`mutation PauseStep($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused", output_payload: {} }) { id } }`, { id: curStepRunId });
          await hasuraAdmin(`mutation PauseRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused" }) { id } }`, { id: runId });
          return NextResponse.json({
            step_run_id: stepRunId,
            workflow_run_id: runId,
            status: "paused",
            message: `Approval accepted. Paused at next approval_gate step (step ${step.step_order}).`,
          });
        }
        stepOutput = result.output;
        stepOutputs[`step_${step.step_order}`] = { output: stepOutput ?? {} };
        stepStatus = "completed";
      } catch (err) {
        stepError = err instanceof Error ? err.message : String(err);
        stepStatus = "failed";
      }

      await hasuraAdmin(
        `mutation UpdateStepRun($id: uuid!, $status: String!, $output: jsonb, $error: String) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: $status, output_payload: $output, error_message: $error }) { id }
        }`,
        { id: curStepRunId, status: stepStatus, output: stepOutput, error: stepError }
      );

      if (stepStatus === "failed") {
        await hasuraAdmin(`mutation FailRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", completed_at: "now()" }) { id } }`, { id: runId });
        return NextResponse.json({
          step_run_id: stepRunId,
          workflow_run_id: runId,
          status: "failed",
          message: `Approval accepted, but workflow failed at step ${step.step_order}: ${stepError}`,
        });
      }
    }

    // All steps completed
    await hasuraAdmin(`mutation CompleteRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", completed_at: "now()" }) { id } }`, { id: runId });
    await hasuraAdmin(`mutation IncrementUsage($orgId: uuid!) { update_organization(pk_columns: { id: $orgId }, _inc: { current_month_usage: 1 }) { current_month_usage } }`, { orgId });

    return NextResponse.json({
      step_run_id: stepRunId,
      workflow_run_id: runId,
      status: "completed",
      message: "Approval accepted. All remaining steps completed successfully.",
    });
  } catch (err) {
    console.error("[approveStep] Error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
