/**
 * webhookTrigger — Inbound webhook endpoint
 *
 * Validates requests via WORKFLOW_WEBHOOK_SECRET header.
 * Starts a workflow run without requiring a user JWT session.
 * Uses admin role for all internal mutations.
 */

import {
  hasuraAdmin,
  errorResponse,
  successResponse,
} from "../shared/utils";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // ── 1. Validate webhook secret ────────────────────────────────────────
  const incomingSecret = req.headers.get("x-workflow-webhook-secret");
  const expectedSecret = process.env.WORKFLOW_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error("[webhookTrigger] WORKFLOW_WEBHOOK_SECRET not configured");
    return errorResponse("Webhook endpoint not configured", 500);
  }

  if (!incomingSecret || incomingSecret !== expectedSecret) {
    return errorResponse("Invalid or missing webhook secret", 401);
  }

  // ── 2. Parse payload ──────────────────────────────────────────────────
  let body: { workflow_id: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON payload", 400);
  }

  const { workflow_id: workflowId, payload: incomingPayload = {} } = body;

  if (!workflowId) {
    return errorResponse("workflow_id is required", 400);
  }

  try {
    // ── 3. Verify workflow exists and is active ───────────────────────────
    const workflowData = await hasuraAdmin<{
      workflows_by_pk: {
        id: string;
        org_id: string;
        is_active: boolean;
        workflow_steps: Array<{
          id: string;
          step_order: number;
          type: string;
          config: Record<string, unknown>;
        }>;
      } | null;
    }>(
      `query GetWorkflowForWebhook($id: uuid!) {
        workflows_by_pk(id: $id) {
          id
          org_id
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
    if (!workflow) return errorResponse("Workflow not found", 404);
    if (!workflow.is_active) return errorResponse("Workflow is not active", 400);

    // ── 4. Check quota ────────────────────────────────────────────────────
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
      { orgId: workflow.org_id }
    );

    const org = orgData.organizations_by_pk;
    if (!org) return errorResponse("Organization not found", 404);
    if (org.current_month_usage >= org.max_quota_per_month) {
      return errorResponse(
        `Monthly quota exhausted: ${org.current_month_usage}/${org.max_quota_per_month}`,
        429
      );
    }

    // ── 5. Create workflow run (triggered_by = null for webhook) ──────────
    const runData = await hasuraAdmin<{
      insert_workflow_runs_one: { id: string };
    }>(
      `mutation CreateWebhookRun($workflowId: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflowId,
          status: "running",
          triggered_by: null
        }) { id }
      }`,
      { workflowId }
    );

    const runId = runData.insert_workflow_runs_one.id;

    // ── 6. Fire-and-forget: kick off execution ────────────────────────────
    // Use internal resumeWorkflowRun to execute steps asynchronously
    fetch(`${process.env.NHOST_FUNCTIONS_URL}/resumeWorkflowRun`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-nhost-internal-secret": process.env.NHOST_ADMIN_SECRET!,
      },
      body: JSON.stringify({
        run_id: runId,
        workflow_id: workflowId,
        org_id: workflow.org_id,
        approved_by: null,
        approver_role: "owner", // webhook runs with owner privilege level
        remaining_steps: workflow.workflow_steps,
        initial_payload: incomingPayload,
      }),
    }).catch((err) => {
      console.error("[webhookTrigger] Fire-and-forget execution failed:", err);
    });

    return successResponse({
      workflow_run_id: runId,
      status: "running",
      message: "Workflow triggered via webhook. Execution started.",
    });
  } catch (err) {
    console.error("[webhookTrigger] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
}
