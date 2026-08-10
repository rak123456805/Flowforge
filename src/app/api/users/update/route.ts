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

  let body: { displayName: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { displayName } = body;
  if (!displayName || !displayName.trim()) {
    return NextResponse.json({ error: "Display name is required" }, { status: 400 });
  }

  try {
    // Update the user's displayName in auth.users using the admin secret
    // Note: Nhost maps users table root fields. The pk_columns update is standard in Hasura.
    const data = await hasuraAdmin<{
      updateUser: {
        id: string;
        displayName: string;
      };
    }>(
      `mutation UpdateUserDisplayName($userId: uuid!, $displayName: String!) {
        updateUser(pk_columns: { id: $userId }, _set: { displayName: $displayName }) {
          id
          displayName
        }
      }`,
      { userId: user.id, displayName: displayName.trim() }
    );

    return NextResponse.json({
      message: "Profile updated successfully",
      user: data.updateUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
