import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDuration(startDate: string, endDate?: string | null): string {
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  const ms = end - start;

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: "text-zinc-400",
    running: "text-blue-400",
    paused: "text-amber-400",
    completed: "text-emerald-400",
    failed: "text-rose-400",
  };
  return map[status] ?? "text-zinc-400";
}

export function getStatusBg(status: string): string {
  const map: Record<string, string> = {
    pending: "bg-zinc-800 text-zinc-300",
    running: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    paused: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    failed: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  };
  return map[status] ?? "bg-zinc-800 text-zinc-300";
}

export function getStepTypeIcon(type: string): string {
  const map: Record<string, string> = {
    llm_call: "Bot",
    http_request: "Globe",
    db_write: "Database",
    notify: "Bell",
    conditional_branch: "GitFork",
    approval_gate: "ShieldAlert",
  };
  return map[type] ?? "Zap";
}

export function getStepTypeColor(type: string): string {
  const map: Record<string, string> = {
    llm_call: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    http_request: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    db_write: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    notify: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    conditional_branch: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    approval_gate: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  };
  return map[type] ?? "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
}

export function isOwnerOnlyStep(type: string): boolean {
  return ["db_write", "notify"].includes(type);
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}
