"use client";

import { motion } from "framer-motion";
import { useQuery } from "@apollo/client";
import { GET_ORG_WORKFLOWS, GET_ALL_RUNS } from "@/lib/graphql";
import { useOrg } from "@/components/providers/auth-provider";
import {
  Activity,
  CheckCircle2,
  GitBranch,
  Loader2,
  PauseCircle,
  Play,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { formatDate, formatDuration, getStatusBg } from "@/lib/utils";
import type { WorkflowRun } from "@/lib/types";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="glass glass-hover rounded-xl p-5 flex items-center gap-4"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-100">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { activeOrg, activeRole } = useOrg();

  const { data: wfData, loading: wfLoading } = useQuery(GET_ORG_WORKFLOWS, {
    variables: { orgId: activeOrg?.id },
    skip: !activeOrg,
  });

  const { data: runsData, loading: runsLoading } = useQuery(GET_ALL_RUNS, {
    variables: { orgId: activeOrg?.id },
    skip: !activeOrg,
  });

  const workflows = wfData?.workflows ?? [];
  const runs: WorkflowRun[] = runsData?.workflow_runs ?? [];

  const stats = {
    total: workflows.length,
    active: workflows.filter((w: { is_active: boolean }) => w.is_active).length,
    completed: runs.filter((r) => r.status === "completed").length,
    failed: runs.filter((r) => r.status === "failed").length,
    paused: runs.filter((r) => r.status === "paused").length,
    running: runs.filter((r) => r.status === "running").length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-zinc-100">
          Welcome back{" "}
          <span className="gradient-text">
            {activeOrg?.name ?? "…"}
          </span>
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {activeRole === "viewer"
            ? "You have read-only access to this organization."
            : `You're logged in as ${activeRole}. Build and run AI workflows.`}
        </p>
      </motion.div>

      {/* Stats Grid */}
      {(wfLoading || runsLoading) ? (
        <div className="flex items-center gap-2 text-zinc-500 mb-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading stats…</span>
        </div>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8"
        >
          <StatCard icon={GitBranch} label="Workflows" value={stats.total} color="bg-violet-500/15 text-violet-400" />
          <StatCard icon={Zap} label="Active" value={stats.active} color="bg-emerald-500/15 text-emerald-400" />
          <StatCard icon={Activity} label="Running" value={stats.running} color="bg-blue-500/15 text-blue-400" />
          <StatCard icon={PauseCircle} label="Paused" value={stats.paused} color="bg-amber-500/15 text-amber-400" />
          <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} color="bg-emerald-500/15 text-emerald-400" />
          <StatCard icon={XCircle} label="Failed" value={stats.failed} color="bg-rose-500/15 text-rose-400" />
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Workflows */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="font-semibold text-zinc-200 text-sm">
              Recent Workflows
            </h2>
            <Link
              href="/dashboard/workflows"
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {workflows.slice(0, 5).map((wf: { id: string; name: string; is_active: boolean; workflow_runs: WorkflowRun[]; created_at: string }) => (
              <Link
                key={wf.id}
                href={`/dashboard/workflows/${wf.id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-800/40 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 group-hover:border-violet-500/40 transition-colors">
                  <GitBranch className="w-3.5 h-3.5 text-zinc-400 group-hover:text-violet-400 transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {wf.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {wf.workflow_runs?.[0]
                      ? `Last run ${formatDate(wf.workflow_runs[0].created_at)}`
                      : "Never run"}
                  </p>
                </div>
                {wf.workflow_runs?.[0] && (
                  <span className={`badge text-xs ${getStatusBg(wf.workflow_runs[0].status)}`}>
                    {wf.workflow_runs[0].status}
                  </span>
                )}
              </Link>
            ))}
            {workflows.length === 0 && (
              <div className="px-5 py-10 text-center">
                <GitBranch className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No workflows yet</p>
                {activeRole !== "viewer" && (
                  <Link
                    href="/dashboard/workflows/new"
                    className="text-xs text-violet-400 hover:text-violet-300 mt-1 block"
                  >
                    Create your first workflow →
                  </Link>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Recent Runs */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="font-semibold text-zinc-200 text-sm">
              Recent Runs
            </h2>
            <Link
              href="/dashboard/runs"
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {runs.slice(0, 6).map((run) => (
              <Link
                key={run.id}
                href={`/dashboard/runs/${run.id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-800/40 transition-colors group"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  run.status === "completed" ? "bg-emerald-400" :
                  run.status === "running" ? "bg-blue-400 animate-pulse" :
                  run.status === "paused" ? "bg-amber-400" :
                  run.status === "failed" ? "bg-rose-400" : "bg-zinc-600"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate font-medium">
                    {(run as WorkflowRun & { workflow?: { name: string } }).workflow?.name ?? "Unknown Workflow"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatDate(run.created_at)}
                    {run.completed_at && (
                      <span className="ml-2 text-zinc-600">
                        · {formatDuration(run.created_at, run.completed_at)}
                      </span>
                    )}
                  </p>
                </div>
                <span className={`badge text-xs ${getStatusBg(run.status)}`}>
                  {run.status}
                </span>
              </Link>
            ))}
            {runs.length === 0 && (
              <div className="px-5 py-10 text-center">
                <Play className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No runs yet</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
