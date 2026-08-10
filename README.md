# FlowForge — AI Agent Workflow Orchestrator

**A production-ready mini-n8n platform built with Nhost, Hasura, PostgreSQL, GraphQL, Next.js 14, Groq AI, Tailwind CSS, and Framer Motion.**

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- An [Nhost](https://app.nhost.io) project (free tier works)
- A [Groq](https://console.groq.com) API key

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/flowforge
cd flowforge
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=your-project-subdomain
NEXT_PUBLIC_NHOST_REGION=eu-central-1
NEXT_PUBLIC_NHOST_GRAPHQL_URL=https://your-subdomain.hasura.eu-central-1.nhost.run/v1/graphql
NHOST_GRAPHQL_URL=https://your-subdomain.hasura.eu-central-1.nhost.run/v1/graphql
NHOST_ADMIN_SECRET=your-nhost-admin-secret
GROQ_API_KEY=gsk_your_groq_api_key
WORKFLOW_WEBHOOK_SECRET=generate-a-strong-random-value
NHOST_FUNCTIONS_URL=https://your-subdomain.functions.eu-central-1.nhost.run/v0/functions
```

### 3. Apply Database Migrations

In your Nhost dashboard → SQL editor, run:

```sql
-- Run the contents of:
hasura/migrations/001_initial_schema/up.sql
```

### 4. Apply Hasura Metadata

In Hasura Console → Metadata → Import metadata, upload the YAML files from `hasura/metadata/`.

Or use Hasura CLI:

```bash
hasura metadata apply --endpoint https://your-subdomain.hasura.eu-central-1.nhost.run \
  --admin-secret your-admin-secret
```

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🏗️ Architecture

```
flowforge/
├── src/
│   ├── app/                     # Next.js 14 App Router
│   │   ├── (auth) login/        # Login + register pages
│   │   ├── dashboard/           # Protected dashboard shell
│   │   │   ├── page.tsx         # Overview + stats
│   │   │   ├── workflows/       # Workflow list + builder
│   │   │   │   └── [id]/page.tsx  # Visual pipeline builder
│   │   │   └── runs/page.tsx    # Live run monitor
│   │   └── api/
│   │       └── webhooks/trigger/  # Inbound webhook endpoint
│   ├── components/
│   │   ├── layout/              # Sidebar, Header, QuotaBar
│   │   ├── workflow/            # Pipeline canvas, step nodes
│   │   ├── runs/                # Run drawer with subscriptions
│   │   └── providers/           # Apollo, Auth, Org context
│   └── lib/
│       ├── graphql.ts           # All GQL queries/mutations/subs
│       ├── types.ts             # Full TypeScript schema types
│       ├── nhost.ts             # Nhost client
│       └── apollo-client.ts    # Apollo with WS subscriptions
├── hasura/
│   ├── migrations/              # SQL schema
│   └── metadata/                # Table tracking + permissions
└── functions/                   # Nhost serverless handlers
    ├── triggerWorkflowRun/      # Main execution engine
    ├── approveStep/             # Approval gate handler
    └── webhookTrigger/          # Webhook entry point
```

---

## 🔒 Permission Architecture

### Layer 1 — Hasura RLS (Database-level org scoping)

Every query, mutation, and subscription on `workflows`, `workflow_steps`, `workflow_runs`, `step_runs` is filtered through:

```yaml
filter:
  org_id:
    _in:
      _select:
        table: org_members
        columns: [org_id]
        where: { user_id: { _eq: X-Hasura-User-Id } }
```

This means **even if a user from Org B guesses a valid UUID from Org A, Hasura returns an empty result** — the org_members join finds no matching row for their user_id, so the filter eliminates all data.

Role permissions:
- **owner**: Full CRUD on all tables including org_members
- **editor**: Create/edit workflows and steps. Cannot add `db_write`/`notify` steps (enforced in both Hasura check constraints AND the action handler)
- **viewer**: SELECT only. Cannot mutate or trigger runs

### Layer 2 — Action Handler Code Enforcement

The `triggerWorkflowRun` handler enforces step-level gating **in code**, not just DB permissions:

1. **Before execution starts**: If an `editor` is running a workflow that contains `db_write` or `notify` steps, the handler returns HTTP 403 immediately — even though Hasura allowed the `triggerWorkflowRun` action call.

2. **During step execution**: Each step executor checks `callerRole` before running restricted steps:
```typescript
if (step.type === "db_write" && callerRole !== "owner") {
  throw new Error("db_write steps require Owner role (Layer 2 enforcement)");
}
```

3. **Approval gate**: The `approveStep` handler verifies the approver's role in `org_members` using an admin-secret query before updating the step_run. A viewer calling this action gets a 403 with a clear message.

---

## ⚡ Step Execution Engine

The `triggerWorkflowRun` function in `functions/triggerWorkflowRun/index.ts`:

1. Resolves org from workflow
2. Checks quota (`current_month_usage < max_quota_per_month`)
3. Creates `workflow_run` with `status = 'running'`
4. Iterates steps in `step_order` order:
   - `llm_call` → Groq SDK (`llama-3.3-70b-versatile`) with 3-attempt retry
   - `http_request` → `fetch()` with configurable timeout and 3-attempt retry
   - `conditional_branch` → Safe `Function` eval of JS expression against step outputs
   - `approval_gate` → Sets run to `paused`, returns immediately
   - `db_write` / `notify` → Hasura admin mutation / webhook POST (owner-only)
5. Updates `step_runs` and `workflow_runs` after each step
6. On completion, increments `organizations.current_month_usage`

Template interpolation: `{{step_1.output.content}}` is replaced with actual prior step outputs before each step executes.

---

## 📺 Final Task Scenario Walkthrough

The scenario proving all six requirements:

1. **Two orgs, separate users**: Org A (owner-a@demo.com, editor-a@demo.com), Org B (owner-b@demo.com)
2. **Workflow with 3+ step types**: LLM Call → HTTP Request → Conditional Branch → Approval Gate
3. **Two trigger types**: Manual (Run button) + Webhook (`POST /api/webhooks/trigger`)
4. **Approval gate**: Run pauses, approval drawer shows, only owner/editor can approve
5. **Live status streaming**: GraphQL subscription on `step_runs` shows each step update in real time
6. **Cross-org isolation**: Org B user cannot see, trigger, or approve anything in Org A — even by ID

---

## 🌐 Deployment

### Vercel (Recommended)

```bash
npx vercel --prod
```

Set environment variables in Vercel dashboard matching `.env.example`.

### Render

Push to GitHub, connect repo in Render, set env vars matching `.env.example`.

---

## 🧪 Webhook Test

```bash
curl -X POST https://your-app.vercel.app/api/webhooks/trigger \
  -H "Content-Type: application/json" \
  -H "x-workflow-webhook-secret: your-webhook-secret" \
  -d '{"workflow_id": "your-workflow-uuid"}'
```

---

## 📝 Write-up

See [DESIGN_WRITEUP.md](./DESIGN_WRITEUP.md) for detailed schema reasoning, permission layer explanation, and approval gate implementation.
