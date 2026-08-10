import { NextRequest, NextResponse } from "next/server";

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL!;
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
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

// Helper to authenticate user using Nhost auth server
async function authenticateUser(req: NextRequest): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  try {
    const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
    const region = process.env.NEXT_PUBLIC_NHOST_REGION || "eu-central-1";
    const authUrl = `https://${subdomain}.auth.${region}.nhost.run/v1/user`;

    const res = await fetch(authUrl, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    });

    if (!res.ok) return null;
    const userData = (await res.json()) as { id: string; email: string };
    return userData;
  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await authenticateUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email: string; role: "owner" | "editor" | "viewer"; orgId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, role, orgId } = body;
  if (!email || !role || !orgId) {
    return NextResponse.json({ error: "Email, role, and orgId are required" }, { status: 400 });
  }

  try {
    // 1. Verify caller has "owner" role in this organization
    const roleCheck = await hasuraAdmin<{
      org_members: Array<{ role: string }>;
    }>(
      `query CheckCallerRole($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) {
          role
        }
      }`,
      { userId: user.id, orgId }
    );

    const callerRole = roleCheck.org_members[0]?.role;
    if (callerRole !== "owner") {
      return NextResponse.json({ error: "Only owners can invite members" }, { status: 403 });
    }

    // 2. Find target user by email in the auth.users table
    const userSearch = await hasuraAdmin<{
      users: Array<{ id: string; email: string }>;
    }>(
      `query FindUserByEmail($email: String!) {
        users(where: { email: { _eq: $email } }) {
          id
          email
        }
      }`,
      { email: email.trim().toLowerCase() }
    );

    const targetUser = userSearch.users[0];
    if (!targetUser) {
      return NextResponse.json({
        error: `User with email "${email}" not found. They must sign up for FlowForge first.`,
      }, { status: 404 });
    }

    // 3. Check if target user is already a member
    const memberCheck = await hasuraAdmin<{
      org_members: Array<{ id: string }>;
    }>(
      `query CheckMembership($userId: uuid!, $orgId: uuid!) {
        org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) {
          id
        }
      }`,
      { userId: targetUser.id, orgId }
    );

    if (memberCheck.org_members.length > 0) {
      return NextResponse.json({ error: "User is already a member of this organization" }, { status: 400 });
    }

    // 4. Insert membership
    const addMember = await hasuraAdmin<{
      insert_org_members_one: { id: string; role: string };
    }>(
      `mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) {
        insert_org_members_one(object: { org_id: $orgId, user_id: $userId, role: $role }) {
          id
          role
        }
      }`,
      { orgId, userId: targetUser.id, role }
    );

    return NextResponse.json({
      message: "Member added successfully",
      member: addMember.insert_org_members_one,
    });
  } catch (error) {
    console.error("Invite member error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
