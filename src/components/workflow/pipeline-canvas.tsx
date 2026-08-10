"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
import type { StepType, TriggerType, WorkflowStep, WorkflowTrigger } from "@/lib/types";
import { cn, getStepTypeColor, isOwnerOnlyStep } from "@/lib/utils";

// ── Step type metadata ────────────────────────────────────────────────────

const STEP_TYPES: Array<{
  type: StepType;
  label: string;
  icon: React.ElementType;
  description: string;
  ownerOnly?: boolean;
}> = [
  { type: "llm_call", label: "LLM Call", icon: Bot, description: "Call Groq LLM API (llama-3.3-70b)" },
  { type: "http_request", label: "HTTP Request", icon: Globe, description: "Make external HTTP calls" },
  { type: "conditional_branch", label: "Conditional Branch", icon: GitFork, description: "Branch based on prior output" },
  { type: "approval_gate", label: "Approval Gate", icon: ShieldAlert, description: "Pause and await human approval" },
  { type: "db_write", label: "DB Write", icon: Database, description: "Write to database tables", ownerOnly: true },
  { type: "notify", label: "Notify", icon: Bell, description: "Send Slack/email notification", ownerOnly: true },
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
        url: "https://httpbin.org/post",
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
        channel: "slack",
        url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
        message_template: "Workflow completed: {{step_1.output.content}}",
      };
    case "conditional_branch":
      return {
        condition: "context.step_1.output.content.includes('success')",
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
  isLast,
}: {
  step: WorkflowStep;
  index: number;
  total: number;
  userRole: "owner" | "editor" | "viewer" | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ICON_MAP[step.type];
  const colorClass = getStepTypeColor(step.type);
  const ownerOnly = isOwnerOnlyStep(step.type);
  const canEdit = userRole === "owner" || (userRole === "editor" && !ownerOnly);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="relative"
    >
      {/* Connector from above */}
      {index > 0 && (
        <div className="flex justify-center">
          <div className="w-px h-6 bg-gradient-to-b from-zinc-700 to-zinc-600" />
        </div>
      )}

      <div
        className={cn(
          "glass rounded-xl border overflow-hidden",
          expanded ? "border-violet-500/30" : "border-zinc-800",
          "transition-all duration-200"
        )}
      >
        {/* Step header */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-800/40 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {/* Drag handle + order */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <GripVertical className="w-3.5 h-3.5 text-zinc-600" />
            <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-500">
              {step.step_order}
            </span>
          </div>

          {/* Step type icon */}
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border", colorClass)}>
            <Icon className="w-4 h-4" />
          </div>

          {/* Label */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200">
                {STEP_TYPES.find((s) => s.type === step.type)?.label ?? step.type}
              </span>
              {ownerOnly && (
                <div
                  className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full"
                  title="Requires Owner role to add or execute"
                >
                  <Lock className="w-2.5 h-2.5" />
                  Owner only
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 truncate">
              {step.type === "llm_call" && (step.config as { prompt?: string }).prompt
                ? `"${String((step.config as { prompt?: string }).prompt).slice(0, 50)}…"`
                : step.type === "http_request" && (step.config as { url?: string }).url
                  ? (step.config as { url: string }).url
                  : STEP_TYPES.find((s) => s.type === step.type)?.description}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {canEdit && (
              <>
                <button
                  onClick={onMoveUp}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
                  title="Move up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={index === total - 1}
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
                  title="Move down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onDelete}
                  className="p-1 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-colors"
                  title="Delete step"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <ChevronDown
              className={cn(
                "w-4 h-4 text-zinc-500 transition-transform ml-1",
                expanded && "rotate-180"
              )}
            />
          </div>
        </div>

        {/* Config panel */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-zinc-800"
            >
              <div className="p-4 bg-zinc-900/50">
                {!canEdit && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                    <Lock className="w-3 h-3" />
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

      {/* Connector to below */}
      {!isLast && (
        <div className="flex justify-center">
          <div className="w-px h-6 bg-gradient-to-b from-zinc-600 to-zinc-700" />
        </div>
      )}
    </motion.div>
  );
}

// ── Config Editor ──────────────────────────────────────────────────────────

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
      <div key={key}>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
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
    <div className="space-y-3">
      {type === "llm_call" && (
        <>
          {field("system_prompt", "System Prompt", { rows: 2, placeholder: "You are a helpful assistant." })}
          {field("prompt", "User Prompt", { rows: 4, placeholder: "Use {{step_1.output.content}} to reference prior steps." })}
          {field("model", "Model", { placeholder: "llama-3.3-70b-versatile" })}
          {field("temperature", "Temperature", { type: "number", placeholder: "0.7" })}
          {field("max_tokens", "Max Tokens", { type: "number", placeholder: "1024" })}
        </>
      )}
      {type === "http_request" && (
        <>
          {field("url", "URL", { placeholder: "https://api.example.com/endpoint" })}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Method</label>
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
          {field("body_template", "Body Template (JSON)", { rows: 3, placeholder: '{"key": "{{step_1.output.content}}"}' })}
          {field("timeout_ms", "Timeout (ms)", { type: "number", placeholder: "30000" })}
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
            <label className="block text-xs font-medium text-zinc-400 mb-1">Channel</label>
            <select
              disabled={disabled}
              value={String(config.channel ?? "slack")}
              onChange={(e) => onChange?.({ ...config, channel: e.target.value })}
              className="input-base"
            >
              <option value="slack">Slack</option>
              <option value="email">Email</option>
              <option value="webhook">Generic Webhook</option>
            </select>
          </div>
          {field("url", "Webhook URL / Email", { placeholder: "https://hooks.slack.com/..." })}
          {field("message_template", "Message Template", { rows: 2, placeholder: "Workflow finished: {{step_1.output.content}}" })}
        </>
      )}
      {type === "conditional_branch" && (
        <>
          {field("condition", "JavaScript Condition", { rows: 2, placeholder: "context.step_1.output.result.includes('yes')" })}
          {field("true_label", "True Branch Label", { placeholder: "success" })}
          {field("false_label", "False Branch Label", { placeholder: "fallback" })}
          <p className="text-[10px] text-zinc-600">
            Use <code className="text-zinc-500">context.step_N.output.field</code> to reference prior step outputs.
          </p>
        </>
      )}
      {type === "approval_gate" && (
        <>
          {field("message", "Approval Message", { rows: 2, placeholder: "Please review and approve to continue." })}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Required Role</label>
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

// ── Add Step Menu ──────────────────────────────────────────────────────────

function AddStepMenu({
  userRole,
  onAdd,
}: {
  userRole: "owner" | "editor" | "viewer" | null;
  onAdd: (type: StepType) => void;
}) {
  const [open, setOpen] = useState(false);
  const canAdd = userRole === "owner" || userRole === "editor";
  if (!canAdd) return null;

  return (
    <div className="relative flex justify-center">
      <div className="flex justify-center">
        <div className="w-px h-5 bg-zinc-700" />
      </div>
      <div className="absolute top-5">
        <button
          id="add-step-btn"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-dashed border-zinc-700 hover:border-violet-500/60 text-zinc-500 hover:text-violet-400 text-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Add step
        </button>

        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-9 left-1/2 -translate-x-1/2 w-64 glass border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-20"
              >
                <div className="p-1">
                  {STEP_TYPES.map((st) => {
                    const blocked = st.ownerOnly && userRole !== "owner";
                    return (
                      <button
                        key={st.type}
                        onClick={() => {
                          if (!blocked) {
                            onAdd(st.type);
                            setOpen(false);
                          }
                        }}
                        disabled={blocked}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left",
                          blocked
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-zinc-800"
                        )}
                        title={blocked ? "Requires Owner role" : st.description}
                      >
                        <div className={cn("w-7 h-7 rounded-md flex items-center justify-center border flex-shrink-0", getStepTypeColor(st.type))}>
                          <st.icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 flex items-center gap-1.5">
                            {st.label}
                            {st.ownerOnly && <Lock className="w-2.5 h-2.5 text-rose-400" />}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate">
                            {st.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Trigger Config ─────────────────────────────────────────────────────────

function TriggerSection({
  triggers,
  userRole,
  onSave,
}: {
  triggers: WorkflowTrigger[];
  userRole: "owner" | "editor" | "viewer" | null;
  onSave: (type: TriggerType, config: Record<string, unknown>) => void;
}) {
  const trigger = triggers[0];
  const [type, setType] = useState<TriggerType>(trigger?.trigger_type ?? "manual");
  const [config, setConfig] = useState<Record<string, unknown>>(
    (trigger?.config as Record<string, unknown>) ?? {}
  );
  const canEdit = userRole === "owner" || userRole === "editor";

  const TRIGGER_TYPES: Array<{ type: TriggerType; label: string; icon: React.ElementType; ownerOnly?: boolean }> = [
    { type: "manual", label: "Manual", icon: Zap },
    { type: "scheduled", label: "Scheduled (Cron)", icon: Clock },
    { type: "webhook", label: "Webhook", icon: Globe, ownerOnly: true },
    { type: "database_event", label: "Database Event", icon: Database },
  ];

  return (
    <div className="glass rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <Zap className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Trigger</h3>
        <span className="text-xs text-zinc-600">How this workflow starts</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {TRIGGER_TYPES.map((t) => {
            const blocked = t.ownerOnly && userRole !== "owner";
            return (
              <button
                key={t.type}
                onClick={() => !blocked && canEdit && setType(t.type)}
                disabled={blocked || !canEdit}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all",
                  type === t.type
                    ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                  (blocked || !canEdit) && "opacity-40 cursor-not-allowed"
                )}
                title={blocked ? "Requires Owner role" : t.label}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {t.ownerOnly && <Lock className="w-2.5 h-2.5 ml-auto text-rose-400" />}
              </button>
            );
          })}
        </div>

        {type === "webhook" && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Secret Token</label>
            <input
              disabled={!canEdit}
              value={String(config.secret_token ?? "")}
              onChange={(e) => setConfig({ ...config, secret_token: e.target.value })}
              className="input-base"
              placeholder="your-webhook-secret"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              POST to <code>/api/webhooks/trigger</code> with header{" "}
              <code>x-workflow-webhook-secret: your-secret</code>
            </p>
          </div>
        )}
        {type === "scheduled" && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Cron Expression</label>
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
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Table</label>
              <input
                disabled={!canEdit}
                value={String(config.table ?? "")}
                onChange={(e) => setConfig({ ...config, table: e.target.value })}
                className="input-base"
                placeholder="public.my_table"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Operation</label>
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
            onClick={() => onSave(type, config)}
            className="btn-secondary text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            Save trigger
          </button>
        )}
      </div>
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
  const canEdit = userRole === "owner" || userRole === "editor";
  const canRun = userRole === "owner" || userRole === "editor";

  const addStep = useCallback(
    (type: StepType) => {
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
    [steps, onStepsChange]
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

  // Layer 2 warning: check if editor is trying to run a restricted workflow
  const hasRestrictedSteps = steps.some((s) => isOwnerOnlyStep(s.type));
  const editorBlocked = userRole === "editor" && hasRestrictedSteps;

  return (
    <div className="flex flex-col gap-4">
      {/* Trigger */}
      <TriggerSection
        triggers={triggers}
        userRole={userRole}
        onSave={onSaveTrigger}
      />

      {/* Steps Pipeline */}
      <div className="flex flex-col">
        {/* Start node */}
        <div className="flex justify-center mb-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Workflow starts here
          </div>
        </div>
        <div className="flex justify-center">
          <div className="w-px h-5 bg-zinc-700" />
        </div>

        {/* Step nodes */}
        <AnimatePresence mode="popLayout">
          {steps.map((step, index) => (
            <StepNode
              key={step.id}
              step={step}
              index={index}
              total={steps.length}
              userRole={userRole}
              onMoveUp={() => moveStep(index, "up")}
              onMoveDown={() => moveStep(index, "down")}
              onDelete={() => deleteStep(index)}
              onConfigChange={(cfg) => updateStepConfig(index, cfg)}
              isLast={index === steps.length - 1}
            />
          ))}
        </AnimatePresence>

        {/* Add step button */}
        {canEdit && (
          <div className="mt-2 mb-4">
            <AddStepMenu userRole={userRole} onAdd={addStep} />
          </div>
        )}

        {/* End node */}
        <div className="flex justify-center mt-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            Workflow ends
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
        {canEdit && (
          <button
            id="save-steps-btn"
            onClick={onSaveSteps}
            disabled={saving}
            className="btn-secondary"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}

        {canRun && (
          <div className="flex items-center gap-2">
            <button
              id="run-workflow-btn"
              onClick={onRun}
              disabled={isRunning || steps.length === 0 || editorBlocked}
              className="btn-primary"
              title={
                editorBlocked
                  ? "This workflow contains db_write/notify steps. Owner role required to run."
                  : steps.length === 0
                    ? "Add steps first"
                    : "Run workflow"
              }
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isRunning ? "Running…" : "Run"}
            </button>
            {editorBlocked && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Owner required for db_write/notify steps
              </div>
            )}
          </div>
        )}

        {userRole === "viewer" && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Lock className="w-3.5 h-3.5" />
            Read-only access
          </div>
        )}
      </div>
    </div>
  );
}
