/**
 * approveStep — Next.js API Route (Hasura Action Handler)
 *
 * Approves a paused approval_gate step_run. Verifies that the
 * approver holds owner or editor role in the workflow's org before
 * resuming. Mirrors functions/approveStep/index.ts but runs on Vercel.
 */

import { NextRequest, NextResponse } from "next/server";

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

// ── Hasura Admin Client ────────────────────────────────────────────────────

const HASURA_ENDPOINT =
  process.env.NHOST_GRAPHQL_URL ||
  `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1/graphql`;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;

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
    const remainingSteps = allSteps.filter((s) => !completedOrders.has(s.step_order));

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
      return NextResponse.json({
        step_run_id: stepRunId,
        workflow_run_id: runId,
        status: "completed",
        message: "Approval accepted. Workflow completed (no remaining steps).",
      });
    }

    // 8. Execute remaining steps sequentially (inline - no Nhost function needed)
    const VERCEL_URL = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    // Call our own trigger route with remaining steps context via internal API
    const resumeRes = await fetch(
      `${VERCEL_URL}/api/actions/resume-workflow-run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          workflow_id: workflowId,
          org_id: orgId,
          approver_role: memberRole,
          remaining_steps: remainingSteps,
          step_outputs: stepOutputs,
          secret: HASURA_ADMIN_SECRET,
        }),
      }
    );

    if (!resumeRes.ok) {
      const err = await resumeRes.text();
      console.error("[approveStep] Resume failed:", err);
    }

    return NextResponse.json({
      step_run_id: stepRunId,
      workflow_run_id: runId,
      status: "resuming",
      message: `Approval accepted by ${memberRole}. Workflow resuming from next step.`,
    });
  } catch (err) {
    console.error("[approveStep] Error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
