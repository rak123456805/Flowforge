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
  Save,
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
      <div className="flex-1 flex flex-col overflow-hidden bg-[#09090b]">
        {/* Header: Title and Actions */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between flex-shrink-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/workflows"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-bold text-zinc-100 tracking-tight">{workflow.name}</h1>
                <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${
                  workflow.is_active 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                    : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500"
                }`}>
                  <div className={`w-1 h-1 rounded-full ${workflow.is_active ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
                  {workflow.is_active ? "Active" : "Inactive"}
                </div>
              </div>
              {workflow.description && (
                <p className="text-xs text-zinc-500 mt-0.5 font-medium">{workflow.description}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {activeRole !== "viewer" && (
              <button
                id="header-save-btn"
                onClick={handleSaveSteps}
                disabled={savingSteps}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 text-xs font-semibold shadow-sm hover:bg-zinc-800/50 disabled:opacity-40 transition-all cursor-pointer"
              >
                {savingSteps ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {savingSteps ? "Saving…" : "Save Changes"}
              </button>
            )}
            
            <button
              id="header-run-btn"
              onClick={handleRun}
              disabled={isRunning || steps.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 text-white disabled:text-zinc-600 text-xs font-semibold shadow-md shadow-violet-900/20 disabled:shadow-none hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              {isRunning ? "Running…" : "Run Workflow"}
            </button>
          </div>
        </div>

        {/* Builder Canvas Area */}
        <div className="flex-1 overflow-hidden relative">
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
        </div>
      </div>

      {/* Run history sidebar */}
      <div className="w-72 border-l border-zinc-800/80 bg-[#09090b]/80 backdrop-blur-md flex flex-col overflow-hidden flex-shrink-0 z-10">
        <div className="px-4 py-3.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/20">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Run History</h2>
          <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800">
            {runs.length} Runs
          </span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setActiveRunId(run.id)}
              className={`w-full px-4 py-3.5 text-left hover:bg-zinc-900/50 transition-colors flex flex-col gap-1.5 ${
                activeRunId === run.id ? "bg-zinc-900/70 border-l-2 border-violet-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      run.status === "completed" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" :
                      run.status === "running" ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.4)]" :
                      run.status === "paused" ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.4)]" :
                      run.status === "failed" ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-xs font-semibold text-zinc-200 capitalize">
                    {run.status}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-zinc-600">
                  {run.id.slice(0, 8)}
                </span>
              </div>
              <p className="text-[10px] font-medium text-zinc-500">{formatDate(run.created_at)}</p>
              {run.status === "paused" && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded w-max">
                  <Play className="w-2.5 h-2.5 fill-current" />
                  Awaiting Approval
                </div>
              )}
            </button>
          ))}
          {runs.length === 0 && (
            <div className="p-8 text-center text-xs text-zinc-600 font-medium">
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
