/**
 * triggerWorkflowRun — Next.js API Route (Hasura Action Handler)
 *
 * This is the production handler for the triggerWorkflowRun Hasura Action.
 * It mirrors the logic in /functions/triggerWorkflowRun/index.ts but runs
 * as a Next.js API route on Vercel instead of a Nhost serverless function.
 */

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

// ── Types ─────────────────────────────────────────────────────────────────

interface HasuraActionPayload {
  action: { name: string };
  input: { workflow_id: string };
  session_variables: {
    "x-hasura-user-id": string;
    "x-hasura-role": string;
    [key: string]: string | undefined;
  };
}

interface WorkflowStep {
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

// ── Hasura Admin Client ────────────────────────────────────────────────────

const HASURA_ENDPOINT =
  process.env.NHOST_GRAPHQL_URL ||
  `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const GROQ_MODEL = "llama3-70b-8192";

async function hasuraAdmin<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const secretLength = HASURA_ADMIN_SECRET ? HASURA_ADMIN_SECRET.length : 0;
  const secretStart = HASURA_ADMIN_SECRET ? HASURA_ADMIN_SECRET.slice(0, 3) : "none";
  console.log(`[hasuraAdmin] Connecting to endpoint: ${HASURA_ENDPOINT}`);
  console.log(`[hasuraAdmin] Secret length: ${secretLength}, starts with: ${secretStart}`);

  try {
    const res = await fetch(HASURA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({ query, variables }),
    });
    
    const responseBody = await res.text();
    let json: any;
    try {
      json = JSON.parse(responseBody);
    } catch (e) {
      console.error("[hasuraAdmin] Failed to parse JSON response:", responseBody);
      throw new Error(`Invalid JSON response from Hasura: ${responseBody.slice(0, 200)}`);
    }

    if (json.errors?.length) {
      console.error("[hasuraAdmin] Hasura returned GraphQL errors:", json.errors);
      throw new Error(json.errors[0].message);
    }

    if (!res.ok) {
      console.error("[hasuraAdmin] HTTP error:", res.status, responseBody);
      throw new Error(`HTTP ${res.status}: ${responseBody.slice(0, 200)}`);
    }

    return json.data as T;
  } catch (err) {
    console.error("[hasuraAdmin] Fetch exception:", err);
    throw err;
  }
}

function getGroqClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY! });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

function interpolateTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const parts = path.trim().split(".");
    let val: unknown = context;
    for (const part of parts) {
      if (val && typeof val === "object") {
        val = (val as Record<string, unknown>)[part];
      } else {
        return `{{${path}}}`;
      }
    }
    return val !== undefined ? String(val) : `{{${path}}}`;
  });
}

function interpolateJsonTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/"\{\{([^}]+)\}\}"/g, (_, path: string) => {
    const parts = path.trim().split(".");
    let val: unknown = context;
    for (const part of parts) {
      if (val && typeof val === "object") {
        val = (val as Record<string, unknown>)[part];
      } else {
        return `"{{${path}}}"`;
      }
    }
    if (val === undefined) return `"{{${path}}}"`;
    if (typeof val === "string") return JSON.stringify(val);
    return JSON.stringify(val);
  });
}

// ── Step Executors ─────────────────────────────────────────────────────────

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
    ? interpolateTemplate(config.system_prompt, context as Record<string, unknown>)
    : "You are a helpful AI assistant.";

  const response = await withRetry(async () => {
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
  }, 3, 1500);

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
        body: body ?? undefined,
        signal: controller.signal,
      });
      const responseBody = await res.text();
      let parsedBody: unknown = responseBody;
      try { parsedBody = JSON.parse(responseBody); } catch { /* keep as text */ }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${responseBody.slice(0, 200)}`);
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
  const config = step.config as { mutation: string; variables_template?: string };
  const variablesStr = config.variables_template
    ? interpolateJsonTemplate(config.variables_template, context as Record<string, unknown>)
    : "{}";
  let variables: Record<string, unknown>;
  try { variables = JSON.parse(variablesStr) as Record<string, unknown>; }
  catch { throw new Error("Invalid variables_template: must be valid JSON after interpolation"); }
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
      throw new Error(`Invalid URL: "${config.url}". Notify URL must start with http:// or https://.`);
    }
    const res = await fetch(urlTrimmed, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) throw new Error(`Notify failed: HTTP ${res.status}`);
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
  const config = step.config as { condition: string; true_label?: string; false_label?: string };
  let result: boolean;
  try {
    const conditionFn = new Function("context", `with(context) { return Boolean(${config.condition}); }`);
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

async function executeStep(
  step: WorkflowStep,
  context: Record<string, Record<string, unknown>>,
  callerRole: "owner" | "editor"
): Promise<{ output: Record<string, unknown> | null; paused: boolean }> {
  switch (step.type) {
    case "llm_call": return executeLlmCall(step, context);
    case "http_request": return executeHttpRequest(step, context);
    case "db_write":
      if (callerRole !== "owner") throw new Error("db_write steps require Owner role");
      return executeDbWrite(step, context);
    case "notify":
      if (callerRole !== "owner") throw new Error("notify steps require Owner role");
      return executeNotify(step, context);
    case "conditional_branch": return executeConditionalBranch(step, context);
    case "approval_gate": return { output: null, paused: true };
    default: throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
  }
}

// ── Main Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as HasuraActionPayload;

  if (!payload?.session_variables || !payload?.input) {
    return NextResponse.json({ message: "Invalid JSON payload" }, { status: 400 });
  }

  const userId = payload.session_variables["x-hasura-user-id"];
  const callerRole = payload.session_variables["x-hasura-role"] as "owner" | "editor" | "viewer";
  const workflowId = payload.input.workflow_id;

  if (!userId || !workflowId) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
  }
  if (callerRole === "viewer") {
    return NextResponse.json({ message: "Viewers cannot trigger workflow runs" }, { status: 403 });
  }

  try {
    // 1. Verify org membership
    const orgData = await hasuraAdmin<{ workflows_by_pk: { org_id: string } | null }>(
      `query GetWorkflowOrg($id: uuid!) { workflows_by_pk(id: $id) { org_id } }`,
      { id: workflowId }
    );
    const orgId = orgData.workflows_by_pk?.org_id;
    if (!orgId) return NextResponse.json({ message: "Workflow not found" }, { status: 404 });

    const memberData = await hasuraAdmin<{ org_members: Array<{ role: string }> }>(
      `query GetMember($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) { role }
      }`,
      { userId, orgId }
    );
    const memberRole = memberData.org_members[0]?.role as "owner" | "editor" | "viewer" | undefined;
    if (!memberRole || memberRole === "viewer") {
      return NextResponse.json({ message: "Not authorized to trigger runs" }, { status: 403 });
    }

    // 2. Quota check
    const quotaData = await hasuraAdmin<{
      organization: { max_quota_per_month: number; current_month_usage: number } | null;
    }>(
      `query QuotaCheck($orgId: uuid!) {
        organization(id: $orgId) { max_quota_per_month current_month_usage }
      }`,
      { orgId }
    );
    const org = quotaData.organization;
    if (!org) return NextResponse.json({ message: "Organization not found" }, { status: 404 });
    if (org.current_month_usage >= org.max_quota_per_month) {
      return NextResponse.json({
        message: `Monthly quota exhausted: ${org.current_month_usage}/${org.max_quota_per_month} runs used.`
      }, { status: 429 });
    }

    // 3. Load workflow steps
    const workflowData = await hasuraAdmin<{
      workflows_by_pk: { id: string; name: string; is_active: boolean; workflow_steps: WorkflowStep[] } | null;
    }>(
      `query GetWorkflow($id: uuid!) {
        workflows_by_pk(id: $id) {
          id name is_active
          workflow_steps(order_by: { step_order: asc }) { id step_order type config }
        }
      }`,
      { id: workflowId }
    );
    const workflow = workflowData.workflows_by_pk;
    if (!workflow) return NextResponse.json({ message: "Workflow not found" }, { status: 404 });
    if (!workflow.is_active) return NextResponse.json({ message: "Workflow is not active" }, { status: 400 });

    // 4. Step-level permission gating for editors
    if (memberRole === "editor") {
      const restricted = workflow.workflow_steps.filter((s) => s.type === "db_write" || s.type === "notify");
      if (restricted.length > 0) {
        return NextResponse.json({
          message: `This workflow contains high-privilege steps (${restricted.map((s) => s.type).join(", ")}) that require Owner role.`
        }, { status: 403 });
      }
    }

    // 5. Create workflow_run
    const runData = await hasuraAdmin<{ insert_workflow_runs_one: { id: string } }>(
      `mutation CreateRun($workflowId: uuid!, $userId: uuid!) {
        insert_workflow_runs_one(object: { workflow_id: $workflowId, status: "running", triggered_by: $userId }) { id }
      }`,
      { workflowId, userId }
    );
    const runId = runData.insert_workflow_runs_one.id;

    // 6. Execute steps sequentially
    const stepOutputs: Record<string, Record<string, unknown>> = {};

    for (const step of workflow.workflow_steps) {
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
        const result = await executeStep(step, stepOutputs, memberRole);
        if (result.paused) {
          await hasuraAdmin(
            `mutation PauseStepRun($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused", output_payload: {} }) { id } }`,
            { id: stepRunId }
          );
          await hasuraAdmin(
            `mutation PauseRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "paused" }) { id } }`,
            { id: runId }
          );
          return NextResponse.json({
            workflow_run_id: runId,
            status: "paused",
            message: `Workflow paused at approval_gate step. Awaiting approval.`,
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
        { id: stepRunId, status: stepStatus, output: stepOutput, error: stepError }
      );

      if (stepStatus === "failed") {
        await hasuraAdmin(
          `mutation FailRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", completed_at: "now()" }) { id } }`,
          { id: runId }
        );
        return NextResponse.json({
          workflow_run_id: runId,
          status: "failed",
          message: `Workflow failed at step ${step.step_order}: ${stepError}`,
        });
      }
    }

    // 7. Complete run + increment quota
    await hasuraAdmin(
      `mutation CompleteRun($id: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { status: "completed", completed_at: "now()" }) { id } }`,
      { id: runId }
    );
    await hasuraAdmin(
      `mutation IncrementUsage($orgId: uuid!) { update_organization(pk_columns: { id: $orgId }, _inc: { current_month_usage: 1 }) { current_month_usage } }`,
      { orgId }
    );

    return NextResponse.json({
      workflow_run_id: runId,
      status: "completed",
      message: "Workflow completed successfully.",
    });
  } catch (err) {
    console.error("[triggerWorkflowRun] Unexpected error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
