/**
 * resume-workflow-run — Internal API Route
 *
 * Called by approveStep to continue executing remaining steps
 * after an approval_gate is approved. This is an internal-only
 * endpoint protected by the admin secret.
 */

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const HASURA_ENDPOINT =
  process.env.NHOST_GRAPHQL_URL ||
  `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const GROQ_MODEL = "llama-3.3-70b-versatile";

interface WorkflowStep {
  id: string;
  step_order: number;
  type: "llm_call" | "http_request" | "db_write" | "notify" | "conditional_branch" | "approval_gate";
  config: Record<string, unknown>;
}

async function hasuraAdmin<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(HASURA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": HASURA_ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json: { data?: T; errors?: Array<{ message: string }> };
  try { json = JSON.parse(text); } catch { throw new Error(`Invalid JSON from Hasura: ${text.slice(0, 200)}`); }
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

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
    case "conditional_branch": {
      const config = step.config as { condition: string; true_label?: string; false_label?: string };
      let result: boolean;
      try { const fn = new Function("context", `with(context) { return Boolean(${config.condition}); }`); result = fn(context) as boolean; }
      catch (e) { throw new Error(`Condition failed: ${e instanceof Error ? e.message : String(e)}`); }
      return { output: { condition: config.condition, result, branch: result ? (config.true_label ?? "true") : (config.false_label ?? "false") }, paused: false };
    }
    case "approval_gate":
      return { output: null, paused: true };
    default:
      throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    run_id: string;
    workflow_id: string;
    org_id: string;
    approver_role: "owner" | "editor";
    remaining_steps: WorkflowStep[];
    step_outputs: Record<string, Record<string, unknown>>;
    secret: string;
  };

  // Internal endpoint — validate by checking secret
  if (body.secret !== HASURA_ADMIN_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { run_id: runId, org_id: orgId, approver_role: callerRole, remaining_steps, step_outputs } = body;
  const stepOutputs = { ...step_outputs };

  try {
    for (const step of remaining_steps) {
      const stepRunData = await hasuraAdmin<{ insert_step_runs_one: { id: string } }>(
        `mutation CreateStepRun($runId: uuid!, $stepId: uuid!) {
          insert_step_runs_one(object: { workflow_run_id: $runId, step_id: $stepId, status: "running", attempt_count: 1 }) { id }
        }`,
        { runId, stepId: step.id }
      );
      const stepRunId = stepRunData.insert_step_runs_one.id;

      let stepOutput: Record<string, unknown> | null = null;
      let stepError: string | null = null;
      let stepStatus: "completed" | "failed" | "paused" = "completed";

      try {
        const result = await executeStep(step, stepOutputs, callerRole);
        if (result.paused) {
          await hasuraAdmin(`mutation PauseStep($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused", output_payload: {} }) { id } }`, { id: stepRunId });
          await hasuraAdmin(`mutation PauseRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused" }) { id } }`, { id: runId });
          return NextResponse.json({ run_id: runId, status: "paused", message: "Paused at approval_gate." });
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
        { id: stepRunId, status: stepStatus, output: stepOutput, error: stepError }
      );

      if (stepStatus === "failed") {
        await hasuraAdmin(`mutation FailRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", completed_at: "now()" }) { id } }`, { id: runId });
        return NextResponse.json({ run_id: runId, status: "failed", message: `Failed at step ${step.step_order}: ${stepError}` });
      }
    }

    // All remaining steps completed
    await hasuraAdmin(`mutation CompleteRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", completed_at: "now()" }) { id } }`, { id: runId });
    await hasuraAdmin(`mutation IncrementUsage($orgId: uuid!) { update_organization(pk_columns: { id: $orgId }, _inc: { current_month_usage: 1 }) { current_month_usage } }`, { orgId });

    return NextResponse.json({ run_id: runId, status: "completed", message: "Workflow completed after approval." });
  } catch (err) {
    console.error("[resume-workflow-run] Error:", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
