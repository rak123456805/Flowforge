/**
 * approveStep — Hasura Action Handler
 *
 * Approves a paused approval_gate step_run. Verifies that the
 * approver holds owner or editor role in the workflow's org before
 * resuming. This is Layer 2 enforcement — cannot be done via DB
 * permissions alone since it's a mid-execution decision.
 */

import {
  hasuraAdmin,
  getUserOrgRole,
  errorResponse,
  successResponse,
  type HasuraActionPayload,
} from "../shared/utils";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let payload: HasuraActionPayload<{ step_run_id: string }>;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON payload", 400);
  }

  const userId = payload.session_variables["x-hasura-user-id"];
  const stepRunId = payload.input.step_run_id;

  if (!userId || !stepRunId) {
    return errorResponse("Missing required fields", 400);
  }

  try {
    // ── 1. Load the step_run with full chain ─────────────────────────────
    const data = await hasuraAdmin<{
      step_runs_by_pk: {
        id: string;
        status: string;
        workflow_run_id: string;
        step: { type: string };
        workflow_run: {
          id: string;
          status: string;
          workflow: {
            id: string;
            org_id: string;
          };
        };
      } | null;
    }>(
      `query GetStepRun($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id
          status
          workflow_run_id
          step { type }
          workflow_run {
            id
            status
            workflow {
              id
              org_id
            }
          }
        }
      }`,
      { id: stepRunId }
    );

    const stepRun = data.step_runs_by_pk;
    if (!stepRun) return errorResponse("Step run not found", 404);

    // ── 2. Verify it's actually an approval_gate step ────────────────────
    if (stepRun.step.type !== "approval_gate") {
      return errorResponse(
        `Step type '${stepRun.step.type}' is not an approval_gate. Only approval_gate steps can be approved.`,
        400
      );
    }

    // ── 3. Verify step is paused ─────────────────────────────────────────
    if (stepRun.status !== "paused") {
      return errorResponse(
        `Step run is '${stepRun.status}', not 'paused'. Cannot approve.`,
        400
      );
    }

    if (stepRun.workflow_run.status !== "paused") {
      return errorResponse(
        `Workflow run is '${stepRun.workflow_run.status}', not 'paused'. Cannot approve.`,
        400
      );
    }

    // ── 4. Layer 2: Verify approver role ─────────────────────────────────
    const orgId = stepRun.workflow_run.workflow.org_id;
    const memberRole = await getUserOrgRole(userId, orgId);

    if (!memberRole) {
      return errorResponse(
        "You are not a member of the organization that owns this workflow.",
        403
      );
    }

    if (memberRole === "viewer") {
      return errorResponse(
        "Viewers cannot approve steps. Owner or Editor role required.",
        403
      );
    }

    // ── 5. Mark approval_gate step_run as completed ──────────────────────
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

    // ── 6. Resume workflow from next step ─────────────────────────────────
    const runId = stepRun.workflow_run_id;
    const workflowId = stepRun.workflow_run.workflow.id;

    // Load the approved step's order and find remaining steps
    const remainingData = await hasuraAdmin<{
      workflow_runs_by_pk: {
        step_runs: Array<{
          step: { step_order: number };
          status: string;
        }>;
      } | null;
      workflows_by_pk: {
        workflow_steps: Array<{
          id: string;
          step_order: number;
          type: string;
          config: Record<string, unknown>;
        }>;
      } | null;
    }>(
      `query GetResumeContext($runId: uuid!, $workflowId: uuid!) {
        workflow_runs_by_pk(id: $runId) {
          step_runs(order_by: { step: { step_order: asc } }) {
            step { step_order }
            status
          }
        }
        workflows_by_pk(id: $workflowId) {
          workflow_steps(order_by: { step_order: asc }) {
            id
            step_order
            type
            config
          }
        }
      }`,
      { runId, workflowId }
    );

    // The approval gate step was the last paused one — find next step_order
    const completedOrders = new Set(
      (remainingData.workflow_runs_by_pk?.step_runs ?? [])
        .filter((sr) => sr.status === "completed")
        .map((sr) => sr.step.step_order)
    );

    const allSteps = remainingData.workflows_by_pk?.workflow_steps ?? [];
    const remainingSteps = allSteps.filter(
      (s) => !completedOrders.has(s.step_order)
    );

    // Mark workflow as running again
    await hasuraAdmin(
      `mutation ResumeRun($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "running"
        }) { id }
      }`,
      { id: runId }
    );

    // If no remaining steps, complete the run
    if (remainingSteps.length === 0) {
      await hasuraAdmin(
        `mutation CompleteRun($id: uuid!) {
          update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: "completed",
            completed_at: "now()"
          }) { id }
        }`,
        { id: runId }
      );

      return successResponse({
        step_run_id: stepRunId,
        workflow_run_id: runId,
        status: "completed",
        message: "Approval accepted. Workflow completed (no remaining steps).",
      });
    }

    // Trigger continued execution via the workflow action
    // In production this would call triggerWorkflowRun with resume context.
    // Here we call the execution function directly for the remaining steps.
    const triggerRes = await fetch(
      `${process.env.NHOST_FUNCTIONS_URL}/resumeWorkflowRun`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-nhost-internal-secret": process.env.NHOST_ADMIN_SECRET!,
        },
        body: JSON.stringify({
          run_id: runId,
          workflow_id: workflowId,
          org_id: orgId,
          approved_by: userId,
          approver_role: memberRole,
          remaining_steps: remainingSteps,
        }),
      }
    );

    if (!triggerRes.ok) {
      console.error("[approveStep] Resume trigger failed:", await triggerRes.text());
    }

    return successResponse({
      step_run_id: stepRunId,
      workflow_run_id: runId,
      status: "resuming",
      message: `Approval accepted by ${memberRole}. Workflow resuming from next step.`,
    });
  } catch (err) {
    console.error("[approveStep] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
}
