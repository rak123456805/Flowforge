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

export async function GET(req: NextRequest) {
  try {
    // Fetch all users from auth.users (via Hasura using admin secret)
    // Note: Nhost auth users are typically exposed as "users" in GraphQL
    const data = await hasuraAdmin<{
      users: Array<{
        id: string;
        email: string;
        displayName: string;
        avatarUrl?: string;
      }>;
    }>(
      `query ListAllUsers {
        users {
          id
          email
          displayName
          avatarUrl
        }
      }`
    );

    return NextResponse.json({
      users: data.users,
    });
  } catch (error) {
    console.error("List users error:", error);
    // If "users" table is not tracked, we can try to fall back or return empty list
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", users: [] },
      { status: 500 }
    );
  }
}
