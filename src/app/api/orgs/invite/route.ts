import { NextRequest, NextResponse } from "next/server";

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL!;
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET!;
const NHOST_SUBDOMAIN = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN!;
const NHOST_REGION = process.env.NEXT_PUBLIC_NHOST_REGION || "ap-south-1";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://flowforge-rose.vercel.app";

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

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/orgs/invite
// Smart invite:
//   • If invitee already registered → add directly (no email needed)
//   • If not registered → create pending invitation + return shareable link
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await authenticateUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { email: string; role: "owner" | "editor" | "viewer"; orgId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, role, orgId } = body;
  if (!email?.trim() || !role || !orgId) {
    return NextResponse.json({ error: "Email, role, and orgId are required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // 1. Verify caller is owner
    const roleCheck = await hasuraAdmin<{ org_members: Array<{ role: string }> }>(
      `query CheckCallerRole($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) { role }
      }`,
      { userId: user.id, orgId }
    );
    if (roleCheck.org_members[0]?.role !== "owner") {
      return NextResponse.json({ error: "Only owners can invite members" }, { status: 403 });
    }

    // 2. Look up target user by email (citext comparison)
    const userLookup = await hasuraAdmin<{ authUsers: Array<{ id: string; email: string }> }>(
      `query FindUser($email: citext!) {
        authUsers(where: { email: { _eq: $email } }) { id email }
      }`,
      { email: normalizedEmail }
    );

    const existingUser = userLookup.authUsers[0];

    if (existingUser) {
      // ── Fast path: user is already registered — add directly ──────────────
      const memberCheck = await hasuraAdmin<{ org_members: Array<{ id: string }> }>(
        `query CheckMembership($userId: uuid!, $orgId: uuid!) {
          org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) { id }
        }`,
        { userId: existingUser.id, orgId }
      );
      if (memberCheck.org_members.length > 0) {
        return NextResponse.json(
          { error: "This user is already a member of the organization." },
          { status: 400 }
        );
      }

      await hasuraAdmin(
        `mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) {
          insert_org_members_one(object: { org_id: $orgId, user_id: $userId, role: $role }) { id }
        }`,
        { orgId, userId: existingUser.id, role }
      );

      // Remove any stale invitations for this email
      await hasuraAdmin(
        `mutation CleanInvites($orgId: uuid!, $email: String!) {
          delete_org_invitations(where: { org_id: { _eq: $orgId }, email: { _eq: $email } }) { affected_rows }
        }`,
        { orgId, email: normalizedEmail }
      ).catch(() => null); // non-critical

      return NextResponse.json({
        message: `✅ ${normalizedEmail} has been added to the organization as ${role}.`,
        addedDirectly: true,
      });
    }

    // ── Slow path: user not registered yet — create pending invitation ─────
    // Remove any stale invitation for same email (expired/declined)
    const existingInvite = await hasuraAdmin<{
      org_invitations: Array<{ id: string; status: string }>;
    }>(
      `query CheckExistingInvite($orgId: uuid!, $email: String!) {
        org_invitations(where: { org_id: { _eq: $orgId }, email: { _eq: $email } }) { id status }
      }`,
      { orgId, email: normalizedEmail }
    );

    if (existingInvite.org_invitations.length > 0) {
      const inv = existingInvite.org_invitations[0];
      if (inv.status === "pending") {
        return NextResponse.json(
          { error: "A pending invitation already exists for this email." },
          { status: 400 }
        );
      }
      // Expired/declined — delete it and re-create
      await hasuraAdmin(
        `mutation DeleteInvite($id: uuid!) { delete_org_invitations_by_pk(id: $id) { id } }`,
        { id: inv.id }
      );
    }

    const inviteResult = await hasuraAdmin<{
      insert_org_invitations_one: { id: string; token: string };
    }>(
      `mutation CreateInvitation($orgId: uuid!, $email: String!, $role: String!, $invitedBy: uuid!) {
        insert_org_invitations_one(object: {
          org_id: $orgId, email: $email, role: $role, invited_by: $invitedBy, status: "pending"
        }) { id token }
      }`,
      { orgId, email: normalizedEmail, role, invitedBy: user.id }
    );

    const token = inviteResult.insert_org_invitations_one.token;
    const acceptUrl = `${APP_URL}/invite/accept?token=${token}`;

    // Return the shareable link — user can copy and send manually
    // or email services can be wired in later
    return NextResponse.json({
      message: `📧 ${normalizedEmail} is not registered yet. Share the invite link with them — they can sign up and then visit the link to join.`,
      addedDirectly: false,
      inviteLink: acceptUrl,
      token,
    });
  } catch (error) {
    console.error("[invite] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/orgs/invite?orgId=xxx — list pending invitations
export async function GET(req: NextRequest) {
  const user = await authenticateUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  try {
    const data = await hasuraAdmin<{
      org_invitations: Array<{
        id: string; email: string; role: string; status: string;
        created_at: string; expires_at: string; token: string;
      }>;
    }>(
      `query GetInvitations($orgId: uuid!) {
        org_invitations(
          where: { org_id: { _eq: $orgId }, status: { _eq: "pending" } }
          order_by: { created_at: desc }
        ) { id email role status created_at expires_at token }
      }`,
      { orgId }
    );
    return NextResponse.json({ invitations: data.org_invitations });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch invitations", invitations: [] }, { status: 500 });
  }
}

// DELETE /api/orgs/invite?id=xxx — revoke invitation
export async function DELETE(req: NextRequest) {
  const user = await authenticateUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await hasuraAdmin(
      `mutation RevokeInvitation($id: uuid!) { delete_org_invitations_by_pk(id: $id) { id } }`,
      { id }
    );
    return NextResponse.json({ message: "Invitation revoked" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to revoke invitation" }, { status: 500 });
  }
}
