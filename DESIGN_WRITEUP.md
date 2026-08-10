# FlowForge Design Write-up (~1 page)

## Schema Reasoning

The schema is designed around a strict **tenant isolation model** where `organizations` is the root entity. Every data object is reachable through a chain: `org → workflows → steps/triggers → runs → step_runs`. This hierarchy enables Hasura's nested relationship filters to enforce org scoping with a single permission rule rather than duplicating org_id across every table.

**Key design decisions:**

- **`step_runs` stores full input/output payloads as JSONB**: This enables debugging, conditional branching (reading prior step outputs), and template interpolation without needing a separate audit log table.
- **`attempt_count` on `step_runs`**: Tracks retries in-database so the execution engine can pick up and report "Attempt 2 of 3" accurately, even across function restarts.
- **`approved_by` + `approved_at` on `step_runs`**: Stores the complete approval audit trail in the step run itself, not a separate table. This co-locates execution state with authorization state for a single source of truth.
- **`monthly_usage_percentage` as a computed field**: Avoids client-side division and keeps the quota logic consistent — the Postgres function handles the division-by-zero edge case.
- **`org_monthly_stats` view**: Provides aggregated metrics (avg run duration, completed/failed/paused counts) without requiring application-layer aggregation.

---

## Two Permission Layers — How They Differ

### Layer 1: Hasura RLS (Declarative, Database-Enforced)

Hasura permission rules are stateless declarations that run on every request. The key insight is that **role alone is insufficient** — every permission uses a **nested org_members subquery** that joins through the caller's `X-Hasura-User-Id` session variable:

```yaml
filter:
  org_id:
    _in:
      _select:
        table: org_members
        columns: [org_id]
        where: { user_id: { _eq: X-Hasura-User-Id } }
```

This means a user with the `editor` JWT claim from Org A **cannot access Org B's data** — their `user_id` simply has no `org_id` row in `org_members` for Org B. This is enforced at the Postgres query level before any result is returned. Even a direct `workflow_runs_by_pk(id: org-b-run-id)` call returns `null` rather than a 403, which leaks no information about whether the ID even exists.

Layer 1 also enforces static step-type restrictions: `workflow_steps` has a Hasura check constraint on INSERT that blocks `editor` roles from adding `db_write` or `notify` steps at the mutation level.

### Layer 2: Action Handler Code (Dynamic, Runtime-Enforced)

Layer 2 handles decisions that **cannot be expressed as static permission rules** because they depend on runtime context:

1. **Pre-execution step type gating**: The `triggerWorkflowRun` handler scans the entire step list before execution starts. If an editor's workflow contains a `db_write` step (perhaps added before their role changed to editor, or by an admin API), execution is blocked at the handler level — not just the DB.

2. **Mid-execution gating**: The `step.type === 'db_write'` check inside `executeStep()` is a second defense-in-depth check within the step execution loop itself.

3. **Approval gate authorization**: The `approveStep` handler uses an **admin-secret Hasura query** to fetch the approver's role in `org_members` independently, rather than trusting the JWT claim alone. This prevents a user who knows the `step_run_id` from exploiting clock skew or token replay to approve without the correct current role.

The critical difference: Layer 1 controls *what data you can see and mutate via GraphQL*. Layer 2 controls *what actions you can cause the system to perform on your behalf*.

---

## Approval Gate Pause/Resume Implementation

The approval gate is implemented as a **cooperative halt** in the sequential execution loop:

**Pause (in `triggerWorkflowRun` handler)**:
1. When `step.type === 'approval_gate'` is reached, `executeStep()` returns `{ paused: true }`.
2. The handler updates the current `step_run.status = 'paused'` and `workflow_run.status = 'paused'`.
3. The function **returns immediately** with a `paused` response — no more steps execute.
4. The GraphQL subscription on `step_runs` pushes the `paused` state to all connected clients in real time.

**Approve (in `approveStep` handler)**:
1. Caller's role is verified against `org_members` using admin-secret query (Layer 2).
2. The `step_run` is updated: `status = 'completed'`, `approved_by = userId`, `approved_at = now()`.
3. The handler calls a resume function with the remaining steps (those not yet completed).
4. The `workflow_run.status` is set back to `'running'`.
5. Execution continues from the next `step_order` — previous step outputs are passed forward as context.

This design means the approval gate is **durable across restarts** — the partially-completed run state is fully persisted in PostgreSQL. If the server restarts mid-run, the `approveStep` handler can reconstruct the remaining steps from the database.
