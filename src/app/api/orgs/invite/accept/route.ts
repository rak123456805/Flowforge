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

async function authenticateUser(token: string): Promise<{ id: string; email: string } | null> {
  try {
    const authUrl = `https://${NHOST_SUBDOMAIN}.auth.${NHOST_REGION}.nhost.run/v1/user`;
    const res = await fetch(authUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as { id: string; email: string };
  } catch {
    return null;
  }
}

// POST /api/orgs/invite/accept
// Body: { token: string, accessToken: string }
export async function POST(req: NextRequest) {
  let body: { token: string; accessToken: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token: inviteToken, accessToken } = body;
  if (!inviteToken || !accessToken) {
    return NextResponse.json({ error: "token and accessToken are required" }, { status: 400 });
  }

  // Authenticate the current user
  const user = await authenticateUser(accessToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — please sign in first" }, { status: 401 });
  }

  try {
    // 1. Look up invitation by token
    const invData = await hasuraAdmin<{
      org_invitations: Array<{
        id: string; org_id: string; email: string; role: string;
        status: string; expires_at: string;
        organization: { name: string };
      }>;
    }>(
      `query GetInvitation($token: uuid!) {
        org_invitations(where: { token: { _eq: $token } }) {
          id org_id email role status expires_at
          organization { name }
        }
      }`,
      { token: inviteToken }
    );

    const invitation = invData.org_invitations[0];
    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found or already used." }, { status: 404 });
    }
    if (invitation.status !== "pending") {
      return NextResponse.json({ error: `Invitation is ${invitation.status}. It can only be accepted once.` }, { status: 400 });
    }
    if (new Date(invitation.expires_at) < new Date()) {
      await hasuraAdmin(
        `mutation ExpireInvite($id: uuid!) { update_org_invitations_by_pk(pk_columns: { id: $id }, _set: { status: "expired" }) { id } }`,
        { id: invitation.id }
      );
      return NextResponse.json({ error: "This invitation has expired. Please ask the owner to send a new one." }, { status: 410 });
    }

    // 2. Verify the logged-in user's email matches the invitation email
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json({
        error: `This invitation was sent to ${invitation.email}. Please sign in with that email address.`,
      }, { status: 403 });
    }

    // 3. Check if already a member
    const memberCheck = await hasuraAdmin<{ org_members: Array<{ id: string }> }>(
      `query CheckMembership($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) { id }
      }`,
      { userId: user.id, orgId: invitation.org_id }
    );
    if (memberCheck.org_members.length > 0) {
      // Already a member — still mark invite as accepted for consistency
      await hasuraAdmin(
        `mutation AcceptInvite($id: uuid!) { update_org_invitations_by_pk(pk_columns: { id: $id }, _set: { status: "accepted" }) { id } }`,
        { id: invitation.id }
      );
      return NextResponse.json({
        message: "You are already a member of this organization.",
        orgId: invitation.org_id,
        orgName: invitation.organization.name,
        role: invitation.role,
        alreadyMember: true,
      });
    }

    // 4. Add user to org
    await hasuraAdmin(
      `mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) {
        insert_org_members_one(object: { org_id: $orgId, user_id: $userId, role: $role }) { id }
      }`,
      { orgId: invitation.org_id, userId: user.id, role: invitation.role }
    );

    // 5. Mark invitation as accepted
    await hasuraAdmin(
      `mutation AcceptInvite($id: uuid!) {
        update_org_invitations_by_pk(pk_columns: { id: $id }, _set: { status: "accepted" }) { id }
      }`,
      { id: invitation.id }
    );

    return NextResponse.json({
      message: `Welcome! You've joined "${invitation.organization.name}" as ${invitation.role}.`,
      orgId: invitation.org_id,
      orgName: invitation.organization.name,
      role: invitation.role,
    });
  } catch (error) {
    console.error("[accept-invite] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
