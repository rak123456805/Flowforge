/**
 * Webhook trigger API route — Next.js App Router
 *
 * POST /api/webhooks/trigger
 * Validates the x-workflow-webhook-secret header,
 * then fires a workflow run without requiring a JWT.
 */

import { NextRequest, NextResponse } from "next/server";

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL!;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const WEBHOOK_SECRET = process.env.WORKFLOW_WEBHOOK_SECRET!;

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
  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

export async function POST(req: NextRequest) {
  // ── 1. Validate secret ──────────────────────────────────────────────────
  const incomingSecret = req.headers.get("x-workflow-webhook-secret");
  if (!incomingSecret || incomingSecret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Invalid or missing webhook secret" }, { status: 401 });
  }

  // ── 2. Parse body ───────────────────────────────────────────────────────
  let body: { workflow_id: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { workflow_id } = body;
  if (!workflow_id) {
    return NextResponse.json({ error: "workflow_id required" }, { status: 400 });
  }

  try {
    // ── 3. Verify workflow + quota ─────────────────────────────────────────
    const data = await hasuraAdmin<{
      workflows_by_pk: { org_id: string; is_active: boolean } | null;
    }>(
      `query WebhookCheck($id: uuid!) {
        workflows_by_pk(id: $id) { org_id is_active }
      }`,
      { id: workflow_id }
    );

    const wf = data.workflows_by_pk;
    if (!wf) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    if (!wf.is_active) return NextResponse.json({ error: "Workflow inactive" }, { status: 400 });

    const orgData = await hasuraAdmin<{
      organizations_by_pk: { current_month_usage: number; max_quota_per_month: number } | null;
    }>(
      `query QuotaCheck($orgId: uuid!) {
        organizations_by_pk(id: $orgId) { current_month_usage max_quota_per_month }
      }`,
      { orgId: wf.org_id }
    );

    const org = orgData.organizations_by_pk;
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    if (org.current_month_usage >= org.max_quota_per_month) {
      return NextResponse.json({ error: "Monthly quota exhausted" }, { status: 429 });
    }

    // ── 4. Create workflow run ─────────────────────────────────────────────
    const runData = await hasuraAdmin<{ insert_workflow_runs_one: { id: string } }>(
      `mutation CreateWebhookRun($workflowId: uuid!) {
        insert_workflow_runs_one(object: { workflow_id: $workflowId, status: "running" }) { id }
      }`,
      { workflowId: workflow_id }
    );

    const runId = runData.insert_workflow_runs_one.id;

    // In production: kick off actual step execution via Nhost functions
    // For now, the run is created and can be monitored via subscription

    return NextResponse.json({
      workflow_run_id: runId,
      status: "running",
      message: "Workflow triggered via webhook",
    });
  } catch (err) {
    console.error("[webhook trigger]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
