"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Globe,
  Database,
  Bell,
  GitFork,
  ShieldAlert,
  GripVertical,
  Plus,
  Trash2,
  Lock,
  Play,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  X,
  Zap,
  Clock,
  AlertTriangle,
  Search,
  Maximize2,
  Workflow,
  PlusCircle,
  GitCommit,
  Maximize,
  Minimize,
  Eye,
  Sliders,
} from "lucide-react";
import type { StepType, TriggerType, WorkflowStep, WorkflowTrigger } from "@/lib/types";
import { cn, getStepTypeColor, isOwnerOnlyStep } from "@/lib/utils";

// ── Step metadata ──────────────────────────────────────────────────────────

const STEP_TYPES: Array<{
  type: StepType;
  label: string;
  category: "agent" | "logic" | "action";
  icon: React.ElementType;
  description: string;
  ownerOnly?: boolean;
}> = [
  { type: "llm_call", label: "LLM Call", category: "agent", icon: Bot, description: "Call Groq LLM API (llama-3.3-70b)" },
  { type: "conditional_branch", label: "Conditional Branch", category: "logic", icon: GitFork, description: "Branch based on prior output" },
  { type: "approval_gate", label: "Approval Gate", category: "logic", icon: ShieldAlert, description: "Pause and await human approval" },
  { type: "http_request", label: "HTTP Request", category: "action", icon: Globe, description: "Make external HTTP calls" },
  { type: "db_write", label: "DB Write", category: "action", icon: Database, description: "Write to database tables", ownerOnly: true },
  { type: "notify", label: "Notify", category: "action", icon: Bell, description: "Send Slack/email notification", ownerOnly: true },
];

const TRIGGER_TYPES: Array<{
  type: TriggerType;
  label: string;
  icon: React.ElementType;
  description: string;
  ownerOnly?: boolean;
}> = [
  { type: "manual", label: "Manual Run", icon: Zap, description: "Run via dashboard button" },
  { type: "webhook", label: "Webhook Trigger", icon: Globe, description: "Run via inbound HTTP POST", ownerOnly: true },
  { type: "scheduled", label: "Scheduled Cron", icon: Clock, description: "Run at scheduled intervals" },
  { type: "database_event", label: "DB Event", icon: Database, description: "Run on PostgreSQL changes" },
];

const ICON_MAP: Record<StepType, React.ElementType> = {
  llm_call: Bot,
  http_request: Globe,
  db_write: Database,
  notify: Bell,
  conditional_branch: GitFork,
  approval_gate: ShieldAlert,
};

// ── Default configs per step type ──────────────────────────────────────────

function defaultConfig(type: StepType): Record<string, unknown> {
  switch (type) {
    case "llm_call":
      return {
        prompt: "{{step_1.output.content}}\n\nAnalyze the above and provide a structured summary.",
        system_prompt: "You are a helpful AI assistant.",
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 1024,
      };
    case "http_request":
      return {
        url: "https://postman-echo.com/post",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body_template: '{"data": "{{step_1.output.content}}"}',
        timeout_ms: 30000,
      };
    case "db_write":
      return {
        mutation: "mutation InsertResult($data: jsonb!) { insert_results_one(object: { data: $data }) { id } }",
        variables_template: '{"data": "{{step_1.output.content}}"}',
      };
    case "notify":
      return {
        channel: "email",
        recipient: "user@example.com",
        message_template: "Workflow completed:\n\n{{step_1.output.content}}",
      };
    case "conditional_branch":
      return {
        condition: "step_1.output.content.includes('success')",
        true_label: "Success path",
        false_label: "Fallback path",
      };
    case "approval_gate":
      return {
        message: "Please review the output from the previous steps and approve to continue.",
        required_role: "editor",
      };
    default:
      return {};
  }
}

// ── Visual Connector Path ──────────────────────────────────────────────────

function CanvasConnector() {
  return (
    <div className="flex justify-center h-10 w-full relative">
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
        <line
          x1="50%"
          y1="0"
          x2="50%"
          y2="100%"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth="3"
        />
        <line
          x1="50%"
          y1="0"
          x2="50%"
          y2="100%"
          stroke="#8B5CF6"
          strokeWidth="1.5"
          className="flow-connector"
        />
      </svg>
    </div>
  );
}

// ── Trigger Node (Renders as a first canvas node) ──────────────────────────

function TriggerNode({
  triggers,
  userRole,
  onSave,
}: {
  triggers: WorkflowTrigger[];
  userRole: "owner" | "editor" | "viewer" | null;
  onSave: (type: TriggerType, config: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const trigger = triggers[0];
  const [type, setType] = useState<TriggerType>(trigger?.trigger_type ?? "manual");
  const [config, setConfig] = useState<Record<string, unknown>>(
    (trigger?.config as Record<string, unknown>) ?? {}
  );
  const canEdit = userRole === "owner" || userRole === "editor";
  const activeTriggerInfo = TRIGGER_TYPES.find((t) => t.type === type);
  const TriggerIcon = activeTriggerInfo?.icon ?? Zap;

  const handleTriggerSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave(type, config);
  };

  return (
    <div className="w-[450px] glass rounded-xl border border-zinc-800/80 overflow-hidden shadow-lg transition-all duration-300 hover:border-zinc-700/80">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-900/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
            <TriggerIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-200">
                {activeTriggerInfo?.label ?? "Trigger"}
              </span>
              <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[8px] font-bold text-purple-400 uppercase">
                Trigger Port
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              {type === "manual" && "Runs manually on button click"}
              {type === "webhook" && `Webhook URL listener`}
              {type === "scheduled" && `Cron: ${config.cron_expression ?? "Not set"}`}
              {type === "database_event" && `On DB ${config.operation ?? "INSERT"} on ${config.table ?? "table"}`}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform", expanded && "rotate-180")} />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-zinc-800/60 bg-zinc-950/20 p-4 space-y-4"
          >
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_TYPES.map((t) => {
                const blocked = t.ownerOnly && userRole !== "owner";
                return (
                  <button
                    key={t.type}
                    onClick={() => !blocked && canEdit && setType(t.type)}
                    disabled={blocked || !canEdit}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all cursor-pointer",
                      type === t.type
                        ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                      (blocked || !canEdit) && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                    {t.ownerOnly && <Lock className="w-2.5 h-2.5 ml-auto text-rose-400" />}
                  </button>
                );
              })}
            </div>

            {type === "webhook" && (
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-zinc-400">Secret Token</label>
                <input
                  disabled={!canEdit}
                  value={String(config.secret_token ?? "")}
                  onChange={(e) => setConfig({ ...config, secret_token: e.target.value })}
                  className="input-base"
                  placeholder="your-webhook-secret"
                />
                <p className="text-[10px] text-zinc-500">
                  Header name: <code>x-workflow-webhook-secret</code>
                </p>
              </div>
            )}

            {type === "scheduled" && (
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-zinc-400">Cron Expression</label>
                <input
                  disabled={!canEdit}
                  value={String(config.cron_expression ?? "")}
                  onChange={(e) => setConfig({ ...config, cron_expression: e.target.value })}
                  className="input-base"
                  placeholder="0 9 * * 1 (every Monday at 9am)"
                />
              </div>
            )}

            {type === "database_event" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-400">Table Name</label>
                  <input
                    disabled={!canEdit}
                    value={String(config.table ?? "")}
                    onChange={(e) => setConfig({ ...config, table: e.target.value })}
                    className="input-base"
                    placeholder="public.my_table"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-400">Operation</label>
                  <select
                    disabled={!canEdit}
                    value={String(config.operation ?? "INSERT")}
                    onChange={(e) => setConfig({ ...config, operation: e.target.value })}
                    className="input-base"
                  >
                    {["INSERT", "UPDATE", "DELETE"].map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {canEdit && (
              <button
                onClick={handleTriggerSave}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save Trigger
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Step Node Card ─────────────────────────────────────────────────────────

function StepNode({
  step,
  index,
  total,
  userRole,
  onMoveUp,
  onMoveDown,
  onDelete,
  onConfigChange,
}: {
  step: WorkflowStep;
  index: number;
  total: number;
  userRole: "owner" | "editor" | "viewer" | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ICON_MAP[step.type];
  const colorClass = getStepTypeColor(step.type);
  const ownerOnly = isOwnerOnlyStep(step.type);
  const canEdit = userRole === "owner" || (userRole === "editor" && !ownerOnly);

  const stepMeta = STEP_TYPES.find((s) => s.type === step.type);

  // Border glows and shadows depending on type
  const typeGlows = {
    llm_call: "border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.02)]",
    http_request: "border-pink-500/20 shadow-[0_0_15px_rgba(236,72,153,0.02)]",
    db_write: "border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.02)]",
    notify: "border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.02)]",
    conditional_branch: "border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.02)]",
    approval_gate: "border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.03)] animate-pulse",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      className="w-[450px]"
    >
      <div
        className={cn(
          "glass rounded-xl border overflow-hidden transition-all duration-300 hover:bg-zinc-950/40",
          expanded ? "border-violet-500/40" : "border-zinc-800/80",
          typeGlows[step.type as keyof typeof typeGlows]
        )}
      >
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <GripVertical className="w-3.5 h-3.5 text-zinc-600" />
            <span className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-mono text-zinc-400 font-bold">
              {step.step_order}
            </span>
          </div>

          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border", colorClass)}>
            <Icon className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-200">
                {stepMeta?.label ?? step.type}
              </span>
              {ownerOnly && (
                <div className="flex items-center gap-1 text-[8px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full uppercase">
                  <Lock className="w-2.5 h-2.5" />
                  Owner only
                </div>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 truncate mt-0.5 font-medium">
              {step.type === "llm_call" && (step.config as { prompt?: string }).prompt
                ? `Prompt: "${String((step.config as { prompt?: string }).prompt).slice(0, 45)}…"`
                : step.type === "http_request" && (step.config as { url?: string }).url
                  ? `${(step.config as { method?: string }).method ?? "GET"} ${(step.config as { url: string }).url}`
                  : step.type === "conditional_branch" && (step.config as { condition?: string }).condition
                    ? `If: ${String((step.config as { condition?: string }).condition)}`
                    : stepMeta?.description}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {canEdit && (
              <>
                <button
                  onClick={onMoveUp}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-20 transition-all cursor-pointer"
                  title="Move Up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={index === total - 1}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-20 transition-all cursor-pointer"
                  title="Move Down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onDelete}
                  className="p-1 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-all cursor-pointer"
                  title="Delete Step"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform ml-1", expanded && "rotate-180")} />
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-zinc-850 bg-zinc-950/20"
            >
              <div className="p-4">
                {!canEdit && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3 font-medium">
                    <Lock className="w-3.5 h-3.5" />
                    {ownerOnly
                      ? "Owner role required to configure this step type"
                      : "You have read-only access to this step"}
                  </div>
                )}
                <StepConfigEditor
                  type={step.type}
                  config={step.config as Record<string, unknown>}
                  onChange={canEdit ? onConfigChange : undefined}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Step Config Editor ─────────────────────────────────────────────────────

function StepConfigEditor({
  type,
  config,
  onChange,
}: {
  type: StepType;
  config: Record<string, unknown>;
  onChange?: (c: Record<string, unknown>) => void;
}) {
  const disabled = !onChange;

  function field(key: string, label: string, opts?: { type?: string; rows?: number; placeholder?: string }) {
    return (
      <div key={key} className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-zinc-400">
          {label}
        </label>
        {opts?.rows ? (
          <textarea
            disabled={disabled}
            value={String(config[key] ?? "")}
            onChange={(e) => onChange?.({ ...config, [key]: e.target.value })}
            rows={opts.rows}
            className="textarea-base"
            placeholder={opts?.placeholder}
          />
        ) : (
          <input
            disabled={disabled}
            type={opts?.type ?? "text"}
            value={String(config[key] ?? "")}
            onChange={(e) =>
              onChange?.({
                ...config,
                [key]: opts?.type === "number" ? Number(e.target.value) : e.target.value,
              })
            }
            className="input-base"
            placeholder={opts?.placeholder}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {type === "llm_call" && (
        <>
          {field("system_prompt", "System Prompt", { rows: 2, placeholder: "You are a helpful assistant." })}
          {field("prompt", "User Prompt", { rows: 4, placeholder: "Use {{step_1.output.content}} to reference prior steps." })}
          <div className="grid grid-cols-2 gap-3">
            {field("model", "Model", { placeholder: "llama-3.3-70b-versatile" })}
            {field("temperature", "Temperature", { type: "number", placeholder: "0.7" })}
          </div>
          {field("max_tokens", "Max Tokens", { type: "number", placeholder: "1024" })}
        </>
      )}
      {type === "http_request" && (
        <>
          {field("url", "Endpoint URL", { placeholder: "https://api.example.com/endpoint" })}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">Method</label>
              <select
                disabled={disabled}
                value={String(config.method ?? "GET")}
                onChange={(e) => onChange?.({ ...config, method: e.target.value })}
                className="input-base"
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {field("timeout_ms", "Timeout (ms)", { type: "number", placeholder: "30000" })}
          </div>
          {field("body_template", "Body Template (JSON)", { rows: 3, placeholder: '{"key": "{{step_1.output.content}}"}' })}
        </>
      )}
      {type === "db_write" && (
        <>
          {field("mutation", "GraphQL Mutation", { rows: 4, placeholder: "mutation { ... }" })}
          {field("variables_template", "Variables Template (JSON)", { rows: 2, placeholder: '{"key": "{{step_1.output.content}}"}' })}
        </>
      )}
      {type === "notify" && (
        <>
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">Channel</label>
            <select
              disabled={disabled}
              value={String(config.channel ?? "email")}
              onChange={(e) => onChange?.({ ...config, channel: e.target.value })}
              className="input-base"
            >
              <option value="email">Email Logs (log only)</option>
              <option value="slack">Slack Webhook</option>
              <option value="webhook">Generic Webhook</option>
            </select>
          </div>
          {(config.channel === "slack" || config.channel === "webhook") ? (
            field("url", "Webhook URL", { placeholder: "https://hooks.slack.com/services/T.../B.../..." })
          ) : (
            field("recipient", "Recipient Email", { placeholder: "user@example.com" })
          )}
          {field("message_template", "Message Template", { rows: 2, placeholder: "Workflow finished: {{step_1.output.content}}" })}
        </>
      )}
      {type === "conditional_branch" && (
        <>
          {field("condition", "JavaScript Logic Expression", { rows: 2, placeholder: "step_1.output.content.includes('success')" })}
          <div className="grid grid-cols-2 gap-3">
            {field("true_label", "True Branch Path", { placeholder: "success" })}
            {field("false_label", "False Branch Path", { placeholder: "fallback" })}
          </div>
        </>
      )}
      {type === "approval_gate" && (
        <>
          {field("message", "Approval Gating Message", { rows: 2, placeholder: "Please review and approve to continue." })}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">Required Role</label>
            <select
              disabled={disabled}
              value={String(config.required_role ?? "editor")}
              onChange={(e) => onChange?.({ ...config, required_role: e.target.value })}
              className="input-base"
            >
              <option value="editor">Editor or Owner</option>
              <option value="owner">Owner only</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Pipeline Canvas (exported) ───────────────────────────────────────

export interface PipelineCanvasProps {
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  userRole: "owner" | "editor" | "viewer" | null;
  saving: boolean;
  onStepsChange: (steps: WorkflowStep[]) => void;
  onSaveTrigger: (type: TriggerType, config: Record<string, unknown>) => void;
  onSaveSteps: () => void;
  onRun: () => void;
  isRunning: boolean;
}

export function PipelineCanvas({
  steps,
  triggers,
  userRole,
  saving,
  onStepsChange,
  onSaveTrigger,
  onSaveSteps,
  onRun,
  isRunning,
}: PipelineCanvasProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [zoom, setZoom] = useState(100);

  const canEdit = userRole === "owner" || userRole === "editor";

  // Filter components in library
  const filteredSteps = useMemo(() => {
    return STEP_TYPES.filter((st) =>
      st.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const addStep = useCallback(
    (type: StepType) => {
      if (!canEdit) return;
      const nextOrder = steps.length + 1;
      const newStep: WorkflowStep = {
        id: `temp-${Date.now()}`,
        workflow_id: "",
        step_order: nextOrder,
        type,
        config: defaultConfig(type) as WorkflowStep["config"],
        created_at: new Date().toISOString(),
      };
      onStepsChange([...steps, newStep]);
    },
    [steps, onStepsChange, canEdit]
  );

  const deleteStep = useCallback(
    (index: number) => {
      const updated = steps
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_order: i + 1 }));
      onStepsChange(updated);
    },
    [steps, onStepsChange]
  );

  const moveStep = useCallback(
    (index: number, direction: "up" | "down") => {
      const newSteps = [...steps];
      const swapIdx = direction === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= newSteps.length) return;
      [newSteps[index], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[index]];
      onStepsChange(newSteps.map((s, i) => ({ ...s, step_order: i + 1 })));
    },
    [steps, onStepsChange]
  );

  const updateStepConfig = useCallback(
    (index: number, config: Record<string, unknown>) => {
      const updated = steps.map((s, i) =>
        i === index ? { ...s, config: config as WorkflowStep["config"] } : s
      );
      onStepsChange(updated);
    },
    [steps, onStepsChange]
  );

  const handleZoom = (action: "in" | "out" | "reset") => {
    if (action === "in") setZoom(Math.min(zoom + 10, 130));
    if (action === "out") setZoom(Math.max(zoom - 10, 70));
    if (action === "reset") setZoom(100);
  };

  return (
    <div className="h-full flex overflow-hidden">
      <style>{`
        @keyframes flowDash {
          to {
            stroke-dashoffset: -20;
          }
        }
        .flow-connector {
          stroke-dasharray: 6 4;
          animation: flowDash 1.5s linear infinite;
        }
      `}</style>

      {/* Component Library Sidebar */}
      <div className="w-60 border-r border-zinc-800/80 bg-zinc-950/40 p-4 space-y-4 flex flex-col flex-shrink-0 z-10 overflow-y-auto">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-violet-400" />
            Component Library
          </h3>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-600" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search components..."
              className="w-full text-xs bg-zinc-900/60 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/40"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-4 flex-1">
          {/* Agent Category */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Agents</span>
            <div className="space-y-1">
              {filteredSteps.filter(s => s.category === "agent").map(st => {
                const blocked = st.ownerOnly && userRole !== "owner";
                return (
                  <button
                    key={st.type}
                    disabled={blocked || !canEdit}
                    onClick={() => addStep(st.type)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left group cursor-pointer border border-transparent",
                      blocked ? "opacity-30 cursor-not-allowed" : "hover:bg-zinc-900 hover:border-zinc-800"
                    )}
                  >
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center border text-zinc-400 flex-shrink-0 group-hover:text-blue-400", getStepTypeColor(st.type))}>
                      <st.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 truncate">
                        {st.label}
                      </p>
                    </div>
                    <Plus className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Logic Category */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Logic / Routing</span>
            <div className="space-y-1">
              {filteredSteps.filter(s => s.category === "logic").map(st => {
                const blocked = st.ownerOnly && userRole !== "owner";
                return (
                  <button
                    key={st.type}
                    disabled={blocked || !canEdit}
                    onClick={() => addStep(st.type)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left group cursor-pointer border border-transparent",
                      blocked ? "opacity-30 cursor-not-allowed" : "hover:bg-zinc-900 hover:border-zinc-800"
                    )}
                  >
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center border text-zinc-400 flex-shrink-0 group-hover:text-green-400", getStepTypeColor(st.type))}>
                      <st.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 truncate">
                        {st.label}
                      </p>
                    </div>
                    <Plus className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions Category */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Actions & Integrations</span>
            <div className="space-y-1">
              {filteredSteps.filter(s => s.category === "action").map(st => {
                const blocked = st.ownerOnly && userRole !== "owner";
                return (
                  <button
                    key={st.type}
                    disabled={blocked || !canEdit}
                    onClick={() => addStep(st.type)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left group cursor-pointer border border-transparent",
                      blocked ? "opacity-30 cursor-not-allowed" : "hover:bg-zinc-900 hover:border-zinc-800"
                    )}
                  >
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center border text-zinc-400 flex-shrink-0", getStepTypeColor(st.type))}>
                      <st.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 truncate flex items-center gap-1.5">
                        {st.label}
                        {st.ownerOnly && <Lock className="w-2.5 h-2.5 text-rose-400" />}
                      </p>
                    </div>
                    <Plus className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Visual Canvas Area */}
      <div className="flex-1 bg-[#050409] bg-dot-grid relative overflow-auto p-8 select-none flex flex-col items-center">
        {/* Canvas Toolbar Controls */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-zinc-950/80 border border-zinc-800 rounded-xl px-3 py-1.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-2">
            <Workflow className="w-3.5 h-3.5 text-violet-400" />
            Visual Canvas
          </div>
          <div className="h-4 w-px bg-zinc-850 mx-1" />
          <button
            onClick={() => handleZoom("out")}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <Minimize className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-mono font-bold text-zinc-400 px-1 w-10 text-center">{zoom}%</span>
          <button
            onClick={() => handleZoom("in")}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <Maximize className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleZoom("reset")}
            className="p-1 rounded hover:bg-zinc-800 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Reset Zoom"
          >
            Reset
          </button>
        </div>

        {/* Mock Mini-Map */}
        <div className="absolute top-4 right-4 z-10 w-24 h-16 bg-zinc-950/80 border border-zinc-850 rounded-xl p-1.5 flex flex-col justify-between shadow-2xl backdrop-blur-sm pointer-events-none hidden md:flex">
          <div className="flex items-center justify-between text-[7px] text-zinc-500 font-bold uppercase tracking-wider">
            <span>Mini-Map</span>
            <div className="w-1 h-1 rounded-full bg-emerald-500" />
          </div>
          <div className="flex-1 border border-dashed border-zinc-800 rounded bg-zinc-950/50 mt-1 flex flex-col items-center justify-center gap-0.5 py-0.5 overflow-hidden opacity-50">
            <div className="w-8 h-1 bg-purple-500/20 rounded" />
            <div className="w-8 h-1 bg-zinc-800 rounded" />
            <div className="w-8 h-1 bg-blue-500/20 rounded" />
            <div className="w-8 h-1 bg-green-500/20 rounded" />
          </div>
        </div>

        {/* Node Flow (supports scale transforms from zoom) */}
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
          className="flex flex-col items-center py-8 transition-transform duration-200"
        >
          {/* Start node */}
          <div className="flex justify-center mb-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wide shadow-md">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
              Workflow Entry Port
            </div>
          </div>
          
          <CanvasConnector />

          {/* Trigger Node */}
          <TriggerNode
            triggers={triggers}
            userRole={userRole}
            onSave={onSaveTrigger}
          />

          {steps.length > 0 && <CanvasConnector />}

          {/* Step nodes */}
          <div className="flex flex-col items-center">
            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center">
                <StepNode
                  step={step}
                  index={index}
                  total={steps.length}
                  userRole={userRole}
                  onMoveUp={() => moveStep(index, "up")}
                  onMoveDown={() => moveStep(index, "down")}
                  onDelete={() => deleteStep(index)}
                  onConfigChange={(cfg) => updateStepConfig(index, cfg)}
                />
                {index < steps.length - 1 && <CanvasConnector />}
              </div>
            ))}
          </div>

          <CanvasConnector />

          {/* End node */}
          <div className="flex justify-center mt-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wide shadow-md">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              Workflow Termination
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
