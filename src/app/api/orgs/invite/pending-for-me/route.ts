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

async function authenticateUser(req: NextRequest): Promise<{ id: string; email: string } | null> {
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

// GET /api/orgs/invite/pending-for-me
// Returns pending invitations matching caller's email address
export async function GET(req: NextRequest) {
  const user = await authenticateUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userEmail = user.email.trim().toLowerCase();

  try {
    const data = await hasuraAdmin<{
      org_invitations: Array<{
        id: string;
        token: string;
        role: string;
        status: string;
        created_at: string;
        expires_at: string;
        organization: { id: string; name: string };
      }>;
    }>(
      `query GetPendingForEmail($email: String!) {
        org_invitations(
          where: {
            email: { _ilike: $email },
            status: { _eq: "pending" }
          }
          order_by: { created_at: desc }
        ) {
          id token role status created_at expires_at
          organization { id name }
        }
      }`,
      { email: userEmail }
    );

    return NextResponse.json({ invitations: data.org_invitations });
  } catch (error) {
    console.error("[pending-for-me] Error:", error);
    return NextResponse.json({ error: "Failed to fetch pending invitations", invitations: [] }, { status: 500 });
  }
}
