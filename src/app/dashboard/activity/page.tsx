"use client";

import { motion } from "framer-motion";
import { useQuery } from "@apollo/client";
import { GET_ALL_RUNS } from "@/lib/graphql";
import { useOrg } from "@/components/providers/auth-provider";
import {
  Activity,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Clock,
  Loader2,
  GitBranch,
} from "lucide-react";
import { formatDuration, getStatusBg } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { WorkflowRun } from "@/lib/types";
import Link from "next/link";

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  running: Activity,
  paused: PauseCircle,
  completed: CheckCircle2,
  failed: XCircle,
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function ActivityPage() {
  const { activeOrg } = useOrg();

  const { data, loading } = useQuery(GET_ALL_RUNS, {
    variables: { orgId: activeOrg?.id },
    skip: !activeOrg,
    pollInterval: 5000,
  });

  const runs: (WorkflowRun & { workflow?: { id: string; name: string } })[] =
    data?.workflow_runs ?? [];

  // Group runs by date
  const grouped: Record<string, typeof runs> = {};
  for (const run of runs) {
    const dateKey = new Date(run.created_at).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(run);
  }

  const completedCount = runs.filter((r) => r.status === "completed").length;
  const failedCount = runs.filter((r) => r.status === "failed").length;
  const pausedCount = runs.filter((r) => r.status === "paused").length;
  const runningCount = runs.filter((r) => r.status === "running").length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-xl font-bold text-zinc-100">Activity</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Full execution history for {activeOrg?.name}
        </p>
      </motion.div>

      {/* Quick stats strip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-4 gap-3 mb-6"
      >
        {[
          { label: "Running", value: runningCount, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "Paused", value: pausedCount, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
          { label: "Completed", value: completedCount, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "Failed", value: failedCount, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
        ].map((s) => (
          <div
            key={s.label}
            className={cn("rounded-xl px-4 py-3 border", s.bg)}
          >
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading activity…</span>
        </div>
      ) : runs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-xl p-16 text-center"
        >
          <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-zinc-300 mb-2">No activity yet</h2>
          <p className="text-sm text-zinc-500 mb-5">
            Run a workflow to see live execution history here.
          </p>
          <Link href="/dashboard/workflows" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
            Go to Workflows →
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, dateRuns]) => (
            <motion.div
              key={date}
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
            >
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                  {date}
                </p>
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-600">{dateRuns.length} run{dateRuns.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Timeline entries */}
              <div className="relative pl-5">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-800" />
                <div className="space-y-1">
                  {dateRuns.map((run) => {
                    const StatusIcon = STATUS_ICONS[run.status] ?? Activity;
                    return (
                      <motion.div key={run.id} variants={fadeUp} className="relative">
                        {/* Timeline dot */}
                        <div
                          className={cn(
                            "absolute -left-[13px] top-3.5 w-3.5 h-3.5 rounded-full border-2 border-zinc-950",
                            run.status === "completed" ? "bg-emerald-500" :
                            run.status === "running" ? "bg-blue-500" :
                            run.status === "paused" ? "bg-amber-500" :
                            run.status === "failed" ? "bg-rose-500" : "bg-zinc-600"
                          )}
                        />
                        {/* Click opens Run Monitor with this run's drawer */}
                        <Link
                          href={`/dashboard/runs?run=${run.id}`}
                          className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-zinc-800/40 transition-colors group ml-2"
                        >
                          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0 group-hover:border-violet-500/30 transition-colors">
                            <GitBranch className="w-3.5 h-3.5 text-zinc-500 group-hover:text-violet-400 transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">
                              {run.workflow?.name ?? "Unknown Workflow"}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-zinc-500">
                                {new Date(run.created_at).toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {run.completed_at && (
                                <span className="text-xs text-zinc-600">
                                  {formatDuration(run.created_at, run.completed_at)}
                                </span>
                              )}
                              {run.status === "running" && (
                                <span className="text-xs text-blue-400 flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                                  Live
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={cn("badge text-xs flex-shrink-0", getStatusBg(run.status))}>
                            <StatusIcon className={cn("w-3 h-3", run.status === "running" && "animate-spin")} />
                            {run.status}
                          </span>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
