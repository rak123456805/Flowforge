import { gql } from "@apollo/client";

// ============================================================
// QUERIES
// ============================================================

export const GET_MY_ORGS = gql`
  query GetMyOrgs {
    organizations(order_by: { created_at: asc }) {
      id
      name
      max_quota_per_month
      current_month_usage
      monthly_usage_percentage
      created_at
      org_members {
        id
        user_id
        role
      }
    }
  }
`;

export const GET_ORG_WORKFLOWS = gql`
  query GetOrgWorkflows($orgId: uuid!) {
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      org_id
      name
      description
      is_active
      visibility
      created_at
      updated_at
      workflow_triggers {
        id
        trigger_type
        config
      }
      workflow_runs(order_by: { created_at: desc }, limit: 1) {
        id
        status
        created_at
        completed_at
      }
      workflow_steps_aggregate {
        aggregate {
          count
        }
      }
      workflow_accesses {
        id
        user_id
        access
      }
    }
  }
`;

export const GET_WORKFLOW_WITH_STEPS = gql`
  query GetWorkflowWithSteps($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      org_id
      name
      description
      is_active
      visibility
      created_at
      updated_at
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        config
        created_at
      }
      workflow_triggers {
        id
        trigger_type
        config
        created_at
      }
      workflow_accesses {
        id
        user_id
        access
      }
      workflow_runs(order_by: { created_at: desc }, limit: 5) {
        id
        status
        triggered_by
        created_at
        completed_at
        step_runs(order_by: { step: { step_order: asc } }) {
          id
          status
          attempt_count
          error_message
          approved_by
          approved_at
          created_at
          step {
            id
            step_order
            type
          }
        }
      }
    }
  }
`;

export const GET_WORKFLOW_RUN_DETAIL = gql`
  query GetWorkflowRunDetail($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      id
      workflow_id
      status
      triggered_by
      created_at
      completed_at
      step_runs(order_by: { step: { step_order: asc } }) {
        id
        status
        input_payload
        output_payload
        error_message
        attempt_count
        approved_by
        approved_at
        created_at
        step {
          id
          step_order
          type
          config
        }
      }
    }
  }
`;

export const GET_ORG_MEMBERS = gql`
  query GetOrgMembers($orgId: uuid!) {
    org_members(where: { org_id: { _eq: $orgId } }, order_by: { created_at: asc }) {
      id
      user_id
      role
      created_at
      user {
        id
        displayName
        email
        avatarUrl
      }
    }
  }
`;

export const GET_WORKFLOW_ACCESS = gql`
  query GetWorkflowAccess($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id
      visibility
      workflow_accesses {
        id
        user_id
        access
      }
    }
  }
`;

export const UPDATE_WORKFLOW_VISIBILITY = gql`
  mutation UpdateWorkflowVisibility($id: uuid!, $visibility: String!) {
    update_workflows_by_pk(pk_columns: { id: $id }, _set: { visibility: $visibility }) {
      id
      visibility
    }
  }
`;

export const UPSERT_WORKFLOW_ACCESS = gql`
  mutation UpsertWorkflowAccess($workflowId: uuid!, $userId: uuid!, $access: String!) {
    insert_workflow_access_one(
      object: { workflow_id: $workflowId, user_id: $userId, access: $access }
      on_conflict: { constraint: workflow_access_workflow_id_user_id_key, update_columns: [access] }
    ) {
      id
      user_id
      access
    }
  }
`;

export const DELETE_WORKFLOW_ACCESS = gql`
  mutation DeleteWorkflowAccess($workflowId: uuid!, $userId: uuid!) {
    delete_workflow_access(where: { workflow_id: { _eq: $workflowId }, user_id: { _eq: $userId } }) {
      affected_rows
    }
  }
`;

export const GET_ALL_RUNS = gql`
  query GetAllRuns($orgId: uuid!) {
    workflow_runs(
      where: { workflow: { org_id: { _eq: $orgId } } }
      order_by: { created_at: desc }
      limit: 50
    ) {
      id
      status
      triggered_by
      created_at
      completed_at
      workflow {
        id
        name
      }
      step_runs_aggregate {
        aggregate {
          count
        }
      }
    }
  }
`;

// ============================================================
// MUTATIONS
// ============================================================

export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow(
    $orgId: uuid!
    $name: String!
    $description: String
  ) {
    insert_workflows_one(
      object: { org_id: $orgId, name: $name, description: $description }
    ) {
      id
      name
      description
      created_at
    }
  }
`;

export const UPDATE_WORKFLOW = gql`
  mutation UpdateWorkflow(
    $id: uuid!
    $name: String!
    $description: String
    $isActive: Boolean!
  ) {
    update_workflows_by_pk(
      pk_columns: { id: $id }
      _set: { name: $name, description: $description, is_active: $isActive }
    ) {
      id
      name
      description
      is_active
      updated_at
    }
  }
`;

export const DELETE_WORKFLOW = gql`
  mutation DeleteWorkflow($id: uuid!) {
    delete_workflows_by_pk(id: $id) {
      id
    }
  }
`;

export const UPSERT_WORKFLOW_STEPS = gql`
  mutation UpsertWorkflowSteps($steps: [workflow_steps_insert_input!]!, $workflowId: uuid!) {
    delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
    insert_workflow_steps(objects: $steps) {
      returning {
        id
        step_order
        type
        config
      }
    }
  }
`;

export const ADD_WORKFLOW_STEP = gql`
  mutation AddWorkflowStep(
    $workflowId: uuid!
    $stepOrder: Int!
    $type: String!
    $config: jsonb!
  ) {
    insert_workflow_steps_one(
      object: {
        workflow_id: $workflowId
        step_order: $stepOrder
        type: $type
        config: $config
      }
    ) {
      id
      step_order
      type
      config
    }
  }
`;

export const UPDATE_WORKFLOW_STEP = gql`
  mutation UpdateWorkflowStep($id: uuid!, $type: String!, $config: jsonb!, $stepOrder: Int!) {
    update_workflow_steps_by_pk(
      pk_columns: { id: $id }
      _set: { type: $type, config: $config, step_order: $stepOrder }
    ) {
      id
      step_order
      type
      config
    }
  }
`;

export const DELETE_WORKFLOW_STEP = gql`
  mutation DeleteWorkflowStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) {
      id
    }
  }
`;

export const UPSERT_WORKFLOW_TRIGGER = gql`
  mutation UpsertWorkflowTrigger(
    $workflowId: uuid!
    $triggerType: String!
    $config: jsonb!
  ) {
    delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
    insert_workflow_triggers_one(
      object: {
        workflow_id: $workflowId
        trigger_type: $triggerType
        config: $config
      }
    ) {
      id
      trigger_type
      config
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(workflow_id: $workflowId) {
      workflow_run_id
      status
      message
    }
  }
`;

export const APPROVE_STEP = gql`
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(step_run_id: $stepRunId) {
      step_run_id
      workflow_run_id
      status
      message
    }
  }
`;

export const CANCEL_WORKFLOW_RUN = gql`
  mutation CancelWorkflowRun($id: uuid!) {
    update_workflow_runs_by_pk(
      pk_columns: { id: $id }
      _set: { status: "failed", completed_at: "now()" }
    ) {
      id
      status
    }
  }
`;

export const ADD_ORG_MEMBER = gql`
  mutation AddOrgMember($orgId: uuid!, $userId: uuid!, $role: String!) {
    insert_org_members_one(
      object: { org_id: $orgId, user_id: $userId, role: $role }
    ) {
      id
      user_id
      role
    }
  }
`;

export const UPDATE_ORG_MEMBER_ROLE = gql`
  mutation UpdateOrgMemberRole($id: uuid!, $role: String!) {
    update_org_members_by_pk(pk_columns: { id: $id }, _set: { role: $role }) {
      id
      role
    }
  }
`;

export const REMOVE_ORG_MEMBER = gql`
  mutation RemoveOrgMember($id: uuid!) {
    delete_org_members_by_pk(id: $id) {
      id
    }
  }
`;

// ============================================================
// SUBSCRIPTIONS — Live step-by-step execution streaming
// ============================================================

export const SUBSCRIBE_STEP_RUNS = gql`
  subscription StepRunsLive($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { step: { step_order: asc } }
    ) {
      id
      status
      attempt_count
      error_message
      output_payload
      approved_by
      approved_at
      created_at
      step {
        id
        step_order
        type
        config
      }
    }
  }
`;

export const SUBSCRIBE_WORKFLOW_RUN_STATUS = gql`
  subscription WorkflowRunStatus($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      id
      status
      created_at
      completed_at
      step_runs(order_by: { step: { step_order: asc } }) {
        id
        status
        attempt_count
        approved_by
        approved_at
        step {
          id
          step_order
          type
        }
      }
    }
  }
`;

export const SUBSCRIBE_ORG_QUOTA = gql`
  subscription OrgQuotaLive($orgId: uuid!) {
    organization(id: $orgId) {
      id
      current_month_usage
      max_quota_per_month
      monthly_usage_percentage
    }
  }
`;
