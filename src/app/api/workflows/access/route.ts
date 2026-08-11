import { NextRequest, NextResponse } from "next/server";

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL!;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const NHOST_SUBDOMAIN = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN!;
const NHOST_REGION = process.env.NEXT_PUBLIC_NHOST_REGION || "ap-south-1";

async function hasuraAdmin<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(HASURA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": HASURA_ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

async function authenticateUser(req: NextRequest): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  try {
    const res = await fetch(
      `https://${NHOST_SUBDOMAIN}.auth.${NHOST_REGION}.nhost.run/v1/user`,
      { headers: { Authorization: authHeader } }
    );
    if (!res.ok) return null;
    return (await res.json()) as { id: string };
  } catch { return null; }
}

// PUT /api/workflows/access — set workflow visibility + member access
export async function PUT(req: NextRequest) {
  const user = await authenticateUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    workflowId: string;
    visibility: "all" | "owners_only" | "allowlist";
    accesses?: Array<{ userId: string; access: "view" | "edit" | "none" }>;
  };

  const { workflowId, visibility, accesses = [] } = body;

  try {
    // Verify caller is owner of workflow's org
    const wf = await hasuraAdmin<{ workflows_by_pk: { org_id: string } | null }>(
      `query GetWfOrg($id: uuid!) { workflows_by_pk(id: $id) { org_id } }`,
      { id: workflowId }
    );
    const orgId = wf.workflows_by_pk?.org_id;
    if (!orgId) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    const roleCheck = await hasuraAdmin<{ org_members: Array<{ role: string }> }>(
      `query CheckRole($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) { role }
      }`,
      { userId: user.id, orgId }
    );
    if (roleCheck.org_members[0]?.role !== "owner") {
      return NextResponse.json({ error: "Only owners can manage workflow access" }, { status: 403 });
    }

    // Update visibility
    await hasuraAdmin(
      `mutation SetVisibility($id: uuid!, $v: String!) {
        update_workflows_by_pk(pk_columns: { id: $id }, _set: { visibility: $v }) { id }
      }`,
      { id: workflowId, v: visibility }
    );

    // Clear existing access records and re-insert
    await hasuraAdmin(
      `mutation ClearAccess($wfId: uuid!) {
        delete_workflow_access(where: { workflow_id: { _eq: $wfId } }) { affected_rows }
      }`,
      { wfId: workflowId }
    );

    if (accesses.length > 0) {
      const objects = accesses
        .filter((a) => a.access !== "none")
        .map((a) => ({ workflow_id: workflowId, user_id: a.userId, access: a.access }));
      if (objects.length > 0) {
        await hasuraAdmin(
          `mutation InsertAccess($objects: [workflow_access_insert_input!]!) {
            insert_workflow_access(objects: $objects) { affected_rows }
          }`,
          { objects }
        );
      }
    }

    return NextResponse.json({ message: "Workflow access updated" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
