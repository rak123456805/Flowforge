"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useSubscription, useMutation, useQuery } from "@apollo/client";
import {
  SUBSCRIBE_STEP_RUNS,
  SUBSCRIBE_WORKFLOW_RUN_STATUS,
  APPROVE_STEP,
  CANCEL_WORKFLOW_RUN,
  GET_WORKFLOW_RUN_DETAIL,
} from "@/lib/graphql";
import {
  X,
  Bot,
  Globe,
  Database,
  Bell,
  GitFork,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ThumbsUp,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Lock,
  StopCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn, formatDate, formatDuration, getStatusBg, getStepTypeColor } from "@/lib/utils";
import type { StepRun } from "@/lib/types";

const STEP_ICONS: Record<string, React.ElementType> = {
  llm_call: Bot,
  http_request: Globe,
  db_write: Database,
  notify: Bell,
  conditional_branch: GitFork,
  approval_gate: ShieldAlert,
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  running: Loader2,
  paused: ShieldAlert,
  completed: CheckCircle2,
  failed: XCircle,
};

// ── Step run row ───────────────────────────────────────────────────────────

function StepRunRow({
  stepRun,
  userRole,
  onApprove,
  approving,
}: {
  stepRun: StepRun & { step: { type: string; step_order: number; config: Record<string, unknown> } };
  userRole: "owner" | "editor" | "viewer" | null;
  onApprove: (id: string) => void;
  approving: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STEP_ICONS[stepRun.step.type] ?? Bot;
  const StatusIcon = STATUS_ICONS[stepRun.status] ?? Clock;
  const colorClass = getStepTypeColor(stepRun.step.type);
  const statusClass = getStatusBg(stepRun.status);
  const canApprove = userRole === "owner" || userRole === "editor";

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      {/* Row header */}
      <div
        className={cn(
          "flex items-center gap-3 p-3 cursor-pointer transition-colors",
          stepRun.status === "paused" ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-zinc-800/40"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Step type icon */}
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0", colorClass)}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Step info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200">
              Step {stepRun.step.step_order} — {stepRun.step.type.replace(/_/g, " ")}
            </span>
            {stepRun.attempt_count > 1 && (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">
                Attempt {stepRun.attempt_count}
              </span>
            )}
          </div>
          {stepRun.error_message && (
            <p className="text-xs text-rose-400 truncate mt-0.5">
              {stepRun.error_message}
            </p>
          )}
          {stepRun.status === "paused" && (
            <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              Awaiting approval
              {stepRun.step.config?.message ? (
                <span className="text-zinc-500 ml-1 truncate">— {String(stepRun.step.config.message as string).slice(0, 40)}</span>
              ) : null}
            </p>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn("badge text-xs", statusClass)}>
            <StatusIcon
              className={cn(
                "w-3 h-3",
                stepRun.status === "running" && "animate-spin",
                stepRun.status === "paused" && "text-amber-400"
              )}
            />
            {stepRun.status}
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </div>
      </div>

      {/* Approval gate action */}
      {stepRun.status === "paused" && stepRun.step.type === "approval_gate" && (
        <div className="px-3 pb-3 flex items-center gap-3">
          {canApprove ? (
            <button
              id={`approve-btn-${stepRun.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onApprove(stepRun.id);
              }}
              disabled={approving === stepRun.id}
              className="btn-primary text-xs"
            >
              {approving === stepRun.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ThumbsUp className="w-3.5 h-3.5" />
              )}
              {approving === stepRun.id ? "Approving…" : "Approve & Continue"}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Lock className="w-3.5 h-3.5" />
              {userRole === "viewer"
                ? "Viewers cannot approve steps"
                : "Insufficient role to approve"}
            </div>
          )}
          {stepRun.approved_by && (
            <span className="text-xs text-emerald-400">
              Approved ✓
            </span>
          )}
        </div>
      )}

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-zinc-800"
          >
            <div className="p-3 space-y-3 bg-zinc-900/50">
              {stepRun.output_payload && Object.keys(stepRun.output_payload).length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">
                    Output
                  </p>
                  <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-48 font-mono whitespace-pre-wrap">
                    {JSON.stringify(stepRun.output_payload, null, 2)}
                  </pre>
                </div>
              )}
              {stepRun.input_payload && Object.keys(stepRun.input_payload).length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">
                    Input
                  </p>
                  <pre className="text-[10px] text-zinc-400 bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-32 font-mono whitespace-pre-wrap">
                    {JSON.stringify(stepRun.input_payload, null, 2)}
                  </pre>
                </div>
              )}
              {stepRun.error_message && (
                <div>
                  <p className="text-[10px] font-medium text-rose-500 mb-1.5 uppercase tracking-wider">
                    Error
                  </p>
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 font-mono">
                    {stepRun.error_message}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-4 text-[10px] text-zinc-600">
                <span>Started {formatDate(stepRun.created_at)}</span>
                {stepRun.attempt_count > 0 && (
                  <span>{stepRun.attempt_count} attempt{stepRun.attempt_count > 1 ? "s" : ""}</span>
                )}
                {stepRun.approved_at && (
                  <span className="text-emerald-600">
                    Approved {formatDate(stepRun.approved_at)}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Run Detail Drawer ──────────────────────────────────────────────────────

export function RunDetailDrawer({
  runId,
  onClose,
  userRole,
}: {
  runId: string;
  onClose: () => void;
  userRole: "owner" | "editor" | "viewer" | null;
}) {
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Initial load
  const { data: initialData } = useQuery(GET_WORKFLOW_RUN_DETAIL, {
    variables: { id: runId },
    skip: !runId,
  });

  // Real-time subscription for live status
  const { data: subData } = useSubscription(SUBSCRIBE_WORKFLOW_RUN_STATUS, {
    variables: { id: runId },
    skip: !runId,
  });

  // Live step runs subscription
  const { data: stepRunsData } = useSubscription(SUBSCRIBE_STEP_RUNS, {
    variables: { workflowRunId: runId },
    skip: !runId,
  });

  const [approveStep] = useMutation(APPROVE_STEP, {
    onCompleted(d) {
      const result = d.approveStep;
      setApprovingId(null);
      if (result.status === "resuming" || result.status === "completed") {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError(e) {
      setApprovingId(null);
      if (e.message.includes("403") || e.message.includes("Viewer")) {
        toast.error("Permission denied — Owner or Editor role required to approve.");
      } else {
        toast.error(e.message);
      }
    },
  });

  const [cancelRun] = useMutation(CANCEL_WORKFLOW_RUN, {
    onCompleted() {
      toast.success("Workflow run cancelled.");
    },
    onError(e) {
      toast.error(e.message);
    },
  });

  const run = subData?.workflow_runs_by_pk ?? initialData?.workflow_runs_by_pk;
  const stepRuns = stepRunsData?.step_runs ?? run?.step_runs ?? [];

  function handleApprove(stepRunId: string) {
    setApprovingId(stepRunId);
    approveStep({ variables: { stepRunId } });
  }

  function handleCancel() {
    if (!run) return;
    if (!confirm("Cancel this workflow run? This will mark it as failed.")) return;
    cancelRun({ variables: { id: run.id } });
  }

  const completedSteps = stepRuns.filter((sr: StepRun) => sr.status === "completed").length;
  const totalSteps = stepRuns.length;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 bottom-0 w-[480px] bg-zinc-950 border-l border-zinc-800 flex flex-col z-50 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold text-zinc-200">Run Details</h2>
            {run && (
              <span className={cn("badge text-xs", getStatusBg(run.status))}>
                {run.status === "running" && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                {run.status === "paused" && (
                  <ShieldAlert className="w-3 h-3" />
                )}
                {run.status}
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-zinc-600">{runId}</p>
        </div>
        <div className="flex items-center gap-2">
          {run && (run.status === "running" || run.status === "paused") && userRole === "owner" && (
            <button
              onClick={handleCancel}
              title="Cancel run"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-rose-400 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/15 transition-colors"
            >
              <StopCircle className="w-3.5 h-3.5" />
              Cancel
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="px-5 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
            <span>Progress</span>
            <span className="font-mono">{completedSteps}/{totalSteps} steps</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full",
                run?.status === "failed" ? "bg-rose-500" :
                run?.status === "completed" ? "bg-emerald-500" :
                "bg-blue-500"
              )}
              animate={{ width: `${totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          {run?.status === "paused" && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              Paused — awaiting approval to continue
            </div>
          )}
        </div>
      )}

      {/* Run meta */}
      {run && (
        <div className="px-5 py-2.5 border-b border-zinc-800 flex items-center gap-4 text-xs text-zinc-500 flex-shrink-0">
          <span>Started {formatDate(run.created_at)}</span>
          {run.completed_at && (
            <span>Duration: {formatDuration(run.created_at, run.completed_at)}</span>
          )}
        </div>
      )}

      {/* Step runs list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!run && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {(stepRuns as Array<StepRun & { step: { type: string; step_order: number; config: Record<string, unknown> } }>).map((stepRun) => (
            <motion.div
              key={stepRun.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              layout
            >
              <StepRunRow
                stepRun={stepRun}
                userRole={userRole}
                onApprove={handleApprove}
                approving={approvingId}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {run && stepRuns.length === 0 && (
          <div className="text-center py-8 text-xs text-zinc-600">
            No step runs yet — execution starting…
          </div>
        )}
      </div>

      {/* Live indicator */}
      <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2 flex-shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] text-zinc-600">
          Live updates via GraphQL subscription
        </span>
      </div>
    </motion.div>
  );
}
