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

// POST /api/orgs/invite/decline
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

  const user = await authenticateUser(accessToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const invData = await hasuraAdmin<{
      org_invitations: Array<{ id: string; email: string; status: string }>;
    }>(
      `query GetInvitation($token: uuid!) {
        org_invitations(where: { token: { _eq: $token } }) { id email status }
      }`,
      { token: inviteToken }
    );

    const invitation = invData.org_invitations[0];
    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json({ error: "Invitation email does not match logged-in user" }, { status: 403 });
    }

    await hasuraAdmin(
      `mutation DeclineInvite($id: uuid!) {
        update_org_invitations_by_pk(pk_columns: { id: $id }, _set: { status: "declined" }) { id }
      }`,
      { id: invitation.id }
    );

    return NextResponse.json({ message: "Invitation declined" });
  } catch (error) {
    console.error("[decline-invite] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
