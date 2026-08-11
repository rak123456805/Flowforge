"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@apollo/client";
import {
  GET_ORG_WORKFLOWS,
  CREATE_WORKFLOW,
  DELETE_WORKFLOW,
} from "@/lib/graphql";
import { useOrg } from "@/components/providers/auth-provider";
import {
  GitBranch,
  Plus,
  Loader2,
  Trash2,
  ExternalLink,
  Zap,
  Clock,
  Globe,
  Database,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDate, getStatusBg } from "@/lib/utils";
import type { WorkflowRun } from "@/lib/types";

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  manual: Zap,
  webhook: Globe,
  scheduled: Clock,
  database_event: Database,
};

export default function WorkflowsPage() {
  const router = useRouter();
  const { activeOrg, activeRole } = useOrg();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data, loading, refetch } = useQuery(GET_ORG_WORKFLOWS, {
    variables: { orgId: activeOrg?.id },
    skip: !activeOrg,
    pollInterval: 5000,
  });

  const [createWorkflow, { loading: createLoading }] = useMutation(CREATE_WORKFLOW, {
    onCompleted(data) {
      toast.success("Workflow created!");
      refetch();
      router.push(`/dashboard/workflows/${data.insert_workflows_one.id}`);
    },
    onError(e) {
      toast.error(e.message);
    },
  });

  const [deleteWorkflow] = useMutation(DELETE_WORKFLOW, {
    onCompleted() {
      toast.success("Workflow deleted");
      refetch();
    },
    onError(e) {
      toast.error(e.message);
    },
  });

  const workflows = data?.workflows ?? [];
  const canEdit = activeRole === "owner" || activeRole === "editor";

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !activeOrg) return;
    createWorkflow({
      variables: { orgId: activeOrg.id, name: newName.trim() },
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will delete all runs and steps.`)) return;
    deleteWorkflow({ variables: { id } });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Workflows</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {workflows.length} workflow{workflows.length !== 1 ? "s" : ""} in{" "}
            {activeOrg?.name}
          </p>
        </div>
        {canEdit && (
          <button
            id="new-workflow-btn"
            onClick={() => setCreating(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
        )}
      </motion.div>

      {/* Create Form */}
      {creating && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-5"
        >
          <form
            onSubmit={handleCreate}
            className="glass rounded-xl p-4 flex gap-3 items-end border border-violet-500/20"
          >
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Workflow name
              </label>
              <input
                id="workflow-name-input"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="input-base"
                placeholder="e.g. AI Content Pipeline"
                required
              />
            </div>
            <button
              type="submit"
              disabled={createLoading || !newName.trim()}
              className="btn-primary"
            >
              {createLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </form>
        </motion.div>
      )}

      {/* Workflow Grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading workflows…</span>
        </div>
      ) : workflows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-xl p-16 text-center"
        >
          <GitBranch className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-zinc-300 mb-2">
            No workflows yet
          </h2>
          <p className="text-sm text-zinc-500 mb-5">
            Build your first AI agent workflow with steps, triggers, and
            approval gates.
          </p>
          {canEdit && (
            <button
              onClick={() => setCreating(true)}
              className="btn-primary mx-auto"
            >
              <Plus className="w-4 h-4" />
              Create your first workflow
            </button>
          )}
          {!canEdit && (
            <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
              <Lock className="w-4 h-4" />
              Viewers cannot create workflows
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {workflows.map((wf: {
            id: string;
            name: string;
            description: string | null;
            is_active: boolean;
            created_at: string;
            workflow_triggers: Array<{ trigger_type: string }>;
            workflow_runs: WorkflowRun[];
            workflow_steps_aggregate: { aggregate: { count: number } };
          }) => {
            const lastRun = wf.workflow_runs?.[0];
            const TriggerIcon = TRIGGER_ICONS[wf.workflow_triggers?.[0]?.trigger_type ?? "manual"] ?? Zap;

            return (
              <motion.div
                key={wf.id}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="glass glass-hover rounded-xl overflow-hidden group"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center group-hover:border-violet-500/40 transition-colors">
                        <GitBranch className="w-4 h-4 text-zinc-400 group-hover:text-violet-400 transition-colors" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${wf.is_active ? "bg-emerald-400" : "bg-zinc-600"}`}
                          />
                          <span className="text-[10px] text-zinc-500">
                            {wf.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {activeRole === "owner" && (
                      <button
                        onClick={() => handleDelete(wf.id, wf.name)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 transition-all"
                        title="Delete workflow"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <h3 className="font-semibold text-zinc-100 mb-1 truncate">
                    {wf.name}
                  </h3>
                  {wf.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
                      {wf.description}
                    </p>
                  )}

                  {/* Meta */}
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <TriggerIcon className="w-3 h-3" />
                      {wf.workflow_triggers?.[0]?.trigger_type ?? "manual"}
                    </span>
                    <span>
                      {wf.workflow_steps_aggregate?.aggregate?.count ?? 0} steps
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-800/60 px-5 py-3 flex items-center justify-between">
                  {lastRun ? (
                    <span className={`badge text-xs ${getStatusBg(lastRun.status)}`}>
                      {lastRun.status}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600">Never run</span>
                  )}
                  <Link
                    href={`/dashboard/workflows/${wf.id}`}
                    className="text-xs text-zinc-500 hover:text-violet-400 transition-colors flex items-center gap-1"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
