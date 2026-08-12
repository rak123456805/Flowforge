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
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

async function authenticateUser(
  req: NextRequest
): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  try {
    const authUrl = `https://${NHOST_SUBDOMAIN}.auth.${NHOST_REGION}.nhost.run/v1/user`;
    const res = await fetch(authUrl, { headers: { Authorization: authHeader } });
    if (!res.ok) return null;
    return (await res.json()) as { id: string; email: string };
  } catch {
    return null;
  }
}

// DELETE /api/orgs/members?memberId=xxx&orgId=yyy
export async function DELETE(req: NextRequest) {
  const user = await authenticateUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  let memberId = searchParams.get("memberId");
  let orgId = searchParams.get("orgId");

  if (!memberId || !orgId) {
    try {
      const body = await req.json();
      memberId = memberId || body.memberId;
      orgId = orgId || body.orgId;
    } catch {
      // ignore
    }
  }

  if (!memberId || !orgId) {
    return NextResponse.json({ error: "memberId and orgId are required" }, { status: 400 });
  }

  try {
    // 1. Verify caller is owner in this org
    const roleCheck = await hasuraAdmin<{ org_members: Array<{ role: string }> }>(
      `query CheckCallerRole($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) { role }
      }`,
      { userId: user.id, orgId }
    );

    if (roleCheck.org_members[0]?.role !== "owner") {
      return NextResponse.json({ error: "Only owners can remove members" }, { status: 403 });
    }

    // 2. Fetch target member details
    const targetMember = await hasuraAdmin<{
      org_members_by_pk: { id: string; user_id: string; org_id: string; role: string } | null;
    }>(
      `query GetTargetMember($memberId: uuid!) {
        org_members_by_pk(id: $memberId) { id user_id org_id role }
      }`,
      { memberId }
    );

    if (!targetMember.org_members_by_pk) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const member = targetMember.org_members_by_pk;

    if (member.org_id !== orgId) {
      return NextResponse.json({ error: "Member does not belong to this organization" }, { status: 400 });
    }

    if (member.user_id === user.id) {
      return NextResponse.json({ error: "You cannot remove yourself from the organization" }, { status: 400 });
    }

    // 3. Delete member from org_members
    await hasuraAdmin(
      `mutation DeleteMember($memberId: uuid!) {
        delete_org_members_by_pk(id: $memberId) { id }
      }`,
      { memberId }
    );

    // 4. Clean up any workflow_access entries for this user in this org
    await hasuraAdmin(
      `mutation CleanupWorkflowAccess($userId: uuid!, $orgId: uuid!) {
        delete_workflow_access(
          where: {
            user_id: { _eq: $userId }
            workflow: { org_id: { _eq: $orgId } }
          }
        ) { affected_rows }
      }`,
      { userId: member.user_id, orgId }
    ).catch(() => null);

    return NextResponse.json({ message: "Member successfully removed" });
  } catch (error) {
    console.error("[remove-member] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
