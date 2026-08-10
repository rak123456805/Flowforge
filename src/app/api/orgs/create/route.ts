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

  let body: { name: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name } = body;
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  }

  try {
    // Insert organization and assign the user as owner in a single mutation
    const data = await hasuraAdmin<{
      insert_organization: {
        id: string;
        name: string;
        max_quota_per_month: number;
        current_month_usage: number;
      };
    }>(
      `mutation CreateOrgAndMember($name: String!, $userId: uuid!) {
        insert_organization(object: {
          name: $name,
          org_members: {
            data: {
              user_id: $userId,
              role: "owner"
            }
          }
        }) {
          id
          name
          max_quota_per_month
          current_month_usage
        }
      }`,
      { name: name.trim(), userId: user.id }
    );

    return NextResponse.json({
      organization: data.insert_organization,
    });
  } catch (error) {
    console.error("Create organization error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
