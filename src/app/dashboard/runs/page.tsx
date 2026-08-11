"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@apollo/client";
import { GET_ALL_RUNS } from "@/lib/graphql";
import { useOrg } from "@/components/providers/auth-provider";
import { RunDetailDrawer } from "@/components/runs/run-detail-drawer";
import {
  Activity,
  Loader2,
  Filter,
  Search,
} from "lucide-react";
import { formatDate, formatDuration, getStatusBg } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { WorkflowRun } from "@/lib/types";

type FilterStatus = "all" | "running" | "paused" | "completed" | "failed" | "pending";

function RunsPageInner() {
  const { activeOrg, activeRole } = useOrg();
  const searchParams = useSearchParams();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  // Auto-open drawer if ?run=<id> is in the URL (coming from Activity page)
  useEffect(() => {
    const runParam = searchParams.get("run");
    if (runParam) setActiveRunId(runParam);
  }, [searchParams]);

  const { data, loading } = useQuery(GET_ALL_RUNS, {
    variables: { orgId: activeOrg?.id },
    skip: !activeOrg,
    pollInterval: 5000,
  });

  const allRuns: (WorkflowRun & { workflow?: { id: string; name: string } })[] =
    data?.workflow_runs ?? [];

  const filtered = allRuns.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !r.workflow?.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const STATUS_FILTERS: FilterStatus[] = ["all", "running", "paused", "completed", "failed", "pending"];

  return (
    <div className="h-full flex overflow-hidden">
      <div className="flex-1 p-6 overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-xl font-bold text-zinc-100">Run Monitor</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Live execution status for all workflows in {activeOrg?.name}
          </p>
        </motion.div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows…"
              className="input-base pl-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs transition-colors capitalize",
                  filter === s
                    ? "bg-violet-600 text-white"
                    : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading runs…</span>
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_120px_100px_80px] gap-3 px-4 py-2.5 border-b border-zinc-800 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
              <span>Workflow</span>
              <span>Started</span>
              <span>Duration</span>
              <span>Status</span>
              <span>Steps</span>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {filtered.map((run) => (
                <motion.button
                  key={run.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setActiveRunId(run.id)}
                  className={cn(
                    "w-full grid grid-cols-[1fr_140px_120px_100px_80px] gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/40 transition-colors items-center",
                    activeRunId === run.id && "bg-zinc-800/60"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {run.workflow?.name ?? "Unknown"}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
                      {run.id.slice(0, 8)}…
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {formatDate(run.created_at)}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">
                    {run.completed_at
                      ? formatDuration(run.created_at, run.completed_at)
                      : run.status === "running"
                        ? formatDuration(run.created_at)
                        : "—"}
                  </span>
                  <span className={cn("badge text-xs w-fit", getStatusBg(run.status))}>
                    {run.status === "running" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    )}
                    {run.status}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {(run as WorkflowRun & { step_runs_aggregate?: { aggregate?: { count?: number } } }).step_runs_aggregate?.aggregate?.count ?? "—"}
                  </span>
                </motion.button>
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <Activity className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">
                  {search || filter !== "all" ? "No runs match your filters" : "No runs yet"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {activeRunId && (
          <RunDetailDrawer
            runId={activeRunId}
            onClose={() => setActiveRunId(null)}
            userRole={activeRole}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function RunsPage() {
  return (
    <Suspense fallback={null}>
      <RunsPageInner />
    </Suspense>
  );
}
