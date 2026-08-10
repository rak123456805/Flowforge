"use client";

import { useState } from "react";
import { use } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@apollo/client";
import {
  GET_WORKFLOW_WITH_STEPS,
  UPSERT_WORKFLOW_STEPS,
  UPSERT_WORKFLOW_TRIGGER,
  TRIGGER_WORKFLOW_RUN,
} from "@/lib/graphql";
import { useOrg } from "@/components/providers/auth-provider";
import { PipelineCanvas } from "@/components/workflow/pipeline-canvas";
import { RunDetailDrawer } from "@/components/runs/run-detail-drawer";
import {
  ArrowLeft,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Clock,
  Play,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import type { WorkflowStep, WorkflowTrigger, TriggerType, WorkflowRun } from "@/lib/types";

export default function WorkflowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { activeRole } = useOrg();

  const [localSteps, setLocalSteps] = useState<WorkflowStep[] | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery(GET_WORKFLOW_WITH_STEPS, {
    variables: { id },
    onCompleted(d) {
      if (localSteps === null && d?.workflows_by_pk?.workflow_steps) {
        setLocalSteps(d.workflows_by_pk.workflow_steps);
      }
    },
  });

  const [upsertSteps, { loading: savingSteps }] = useMutation(UPSERT_WORKFLOW_STEPS, {
    onCompleted() {
      toast.success("Steps saved!");
      refetch();
    },
    onError(e) { toast.error(e.message); },
  });

  const [upsertTrigger] = useMutation(UPSERT_WORKFLOW_TRIGGER, {
    onCompleted() { toast.success("Trigger saved!"); refetch(); },
    onError(e) { toast.error(e.message); },
  });

  const [triggerRun, { loading: isRunning }] = useMutation(TRIGGER_WORKFLOW_RUN, {
    onCompleted(d) {
      const result = d.triggerWorkflowRun;
      if (result.status === "paused") {
        toast.info("Workflow paused — approval required", { duration: 6000 });
      } else if (result.status === "completed") {
        toast.success("Workflow completed!");
      } else if (result.status === "failed") {
        toast.error(`Workflow failed: ${result.message}`);
      }
      setActiveRunId(result.workflow_run_id);
      refetch();
    },
    onError(e) {
      // Show meaningful quota/permission errors
      if (e.message.includes("quota")) {
        toast.error("Monthly quota exhausted. Upgrade your plan.", { duration: 8000 });
      } else if (e.message.includes("403") || e.message.includes("Owner")) {
        toast.error("Permission denied — Owner role required for this workflow.", { duration: 8000 });
      } else {
        toast.error(e.message);
      }
    },
  });

  const workflow = data?.workflows_by_pk;
  const steps: WorkflowStep[] = localSteps ?? workflow?.workflow_steps ?? [];
  const triggers: WorkflowTrigger[] = workflow?.workflow_triggers ?? [];
  const runs: WorkflowRun[] = workflow?.workflow_runs ?? [];

  function handleSaveSteps() {
    if (!id) return;
    const stepsToSave = steps.map((s, i) => ({
      workflow_id: id,
      step_order: i + 1,
      type: s.type,
      config: s.config,
    }));
    upsertSteps({ variables: { workflowId: id, steps: stepsToSave } });
  }

  function handleSaveTrigger(type: TriggerType, config: Record<string, unknown>) {
    upsertTrigger({ variables: { workflowId: id, triggerType: type, config } });
  }

  function handleRun() {
    triggerRun({ variables: { workflowId: id } });
  }

  if (loading && !workflow) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <p className="text-zinc-400">Workflow not found or access denied.</p>
        <Link href="/dashboard/workflows" className="text-violet-400 text-sm mt-2 block">
          ← Back to workflows
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Main builder */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-6">
          {/* Back + title */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Link
              href="/dashboard/workflows"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to workflows
            </Link>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-zinc-100">{workflow.name}</h1>
                {workflow.description && (
                  <p className="text-sm text-zinc-500 mt-0.5">{workflow.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-zinc-600">
                  <Clock className="w-3 h-3" />
                  Updated {formatDate(workflow.updated_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 text-xs ${workflow.is_active ? "text-emerald-400" : "text-zinc-500"}`}>
                  {workflow.is_active ? (
                    <ToggleRight className="w-4 h-4" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                  {workflow.is_active ? "Active" : "Inactive"}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Pipeline Canvas */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <PipelineCanvas
              steps={steps}
              triggers={triggers}
              userRole={activeRole}
              saving={savingSteps}
              onStepsChange={setLocalSteps}
              onSaveTrigger={handleSaveTrigger}
              onSaveSteps={handleSaveSteps}
              onRun={handleRun}
              isRunning={isRunning}
            />
          </motion.div>
        </div>
      </div>

      {/* Run history sidebar */}
      <div className="w-72 border-l border-zinc-800 bg-zinc-950/60 flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Run History</h2>
          <span className="text-xs text-zinc-500">{runs.length} runs</span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setActiveRunId(run.id)}
              className={`w-full px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors ${
                activeRunId === run.id ? "bg-zinc-800/60 border-l-2 border-violet-500" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    run.status === "completed" ? "bg-emerald-400" :
                    run.status === "running" ? "bg-blue-400 animate-pulse" :
                    run.status === "paused" ? "bg-amber-400" :
                    run.status === "failed" ? "bg-rose-400" : "bg-zinc-600"
                  }`}
                />
                <span className="text-xs font-medium text-zinc-200 capitalize">
                  {run.status}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500">{formatDate(run.created_at)}</p>
              {run.status === "paused" && (
                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-400">
                  <Play className="w-2.5 h-2.5" />
                  Awaiting approval
                </div>
              )}
            </button>
          ))}
          {runs.length === 0 && (
            <div className="p-6 text-center text-xs text-zinc-600">
              No runs yet. Click Run to start.
            </div>
          )}
        </div>
      </div>

      {/* Run Detail Drawer */}
      {activeRunId && (
        <RunDetailDrawer
          runId={activeRunId}
          onClose={() => setActiveRunId(null)}
          userRole={activeRole}
        />
      )}
    </div>
  );
}
