"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Globe,
  Database,
  Bell,
  GitFork,
  ShieldAlert,
  Plus,
  Trash2,
  Lock,
  ChevronDown,
  X,
  Zap,
  Clock,
  Search,
  Workflow,
  Sliders,
  Sparkles,
  Undo2,
  Redo2,
  Info,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowRight,
} from "lucide-react";
import type {
  StepType,
  TriggerType,
  WorkflowStep,
  WorkflowTrigger,
} from "@/lib/types";
import { cn, getStepTypeColor, isOwnerOnlyStep } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────
const NODE_W = 300; // px, canvas units
const NODE_H = 88;

// ── Step type metadata ─────────────────────────────────────────────────────
const STEP_META: Array<{
  type: StepType;
  label: string;
  category: "agent" | "logic" | "action";
  icon: React.ElementType;
  description: string;
  ownerOnly?: boolean;
}> = [
  {
    type: "llm_call",
    label: "Llama 3 Agent",
    category: "agent",
    icon: Bot,
    description: "Groq LLM API — llama-3.3-70b",
  },
  {
    type: "conditional_branch",
    label: "Conditional Branch",
    category: "logic",
    icon: GitFork,
    description: "Route based on JS expression",
  },
  {
    type: "approval_gate",
    label: "Approval Gate",
    category: "logic",
    icon: ShieldAlert,
    description: "Pause & await human approval",
  },
  {
    type: "http_request",
    label: "HTTP Request",
    category: "action",
    icon: Globe,
    description: "Call any external HTTP endpoint",
  },
  {
    type: "db_write",
    label: "DB Write",
    category: "action",
    icon: Database,
    description: "Write to Hasura DB",
    ownerOnly: true,
  },
  {
    type: "notify",
    label: "Notify (Slack / Email)",
    category: "action",
    icon: Bell,
    description: "Send notification alert",
    ownerOnly: true,
  },
];

const TRIGGER_META: Array<{
  type: TriggerType;
  label: string;
  icon: React.ElementType;
  description: string;
  ownerOnly?: boolean;
}> = [
  {
    type: "webhook",
    label: "Webhook Trigger",
    icon: Globe,
    description: "HTTP POST from external system",
    ownerOnly: true,
  },
  {
    type: "manual",
    label: "Manual Run",
    icon: Zap,
    description: "Dashboard button click",
  },
  {
    type: "scheduled",
    label: "Scheduled Cron",
    icon: Clock,
    description: "Time-based schedule",
  },
  {
    type: "database_event",
    label: "DB Event",
    icon: Database,
    description: "PostgreSQL row change",
  },
];

const ICON_MAP: Record<StepType, React.ElementType> = {
  llm_call: Bot,
  http_request: Globe,
  db_write: Database,
  notify: Bell,
  conditional_branch: GitFork,
  approval_gate: ShieldAlert,
};

// ── Default configs ────────────────────────────────────────────────────────
function defaultConfig(type: StepType): Record<string, unknown> {
  switch (type) {
    case "llm_call":
      return {
        prompt: "{{step_1.output.content}}\n\nAnalyze and summarize.",
        system_prompt: "You are a helpful AI assistant.",
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 1024,
      };
    case "http_request":
      return {
        url: "https://postman-echo.com/post",
        method: "POST",
        body_template: '{"data":"{{step_1.output.content}}"}',
        timeout_ms: 30000,
      };
    case "db_write":
      return {
        mutation:
          "mutation InsertResult($data: jsonb!) { insert_results_one(object:{data:$data}){id} }",
        variables_template: '{"data":"{{step_1.output.content}}"}',
      };
    case "notify":
      return {
        channel: "email",
        recipient: "user@example.com",
        message_template: "Workflow update:\n\n{{step_1.output.content}}",
      };
    case "conditional_branch":
      return {
        condition: "step_1.output.content.includes('success')",
        true_label: "True",
        false_label: "False",
      };
    case "approval_gate":
      return {
        message: "Please review and approve to continue.",
        required_role: "editor",
      };
    default:
      return {};
  }
}

// ── Connection color per type ──────────────────────────────────────────────
function connColor(type: string): string {
  const map: Record<string, string> = {
    webhook: "#10B981",
    manual: "#10B981",
    scheduled: "#10B981",
    database_event: "#10B981",
    llm_call: "#3B82F6",
    conditional_branch: "#8B5CF6",
    approval_gate: "#F59E0B",
    http_request: "#EC4899",
    db_write: "#EF4444",
    notify: "#F59E0B",
  };
  return map[type] ?? "#6366F1";
}

// ── Props ──────────────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
// PipelineCanvas
// ═══════════════════════════════════════════════════════════════════════════
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
  // ── Viewport state ───────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1.0); // 1.0 = 100 %
  const [offset, setOffset] = useState({ x: 40, y: 40 }); // pan in screen px

  const [isPanning, setIsPanning] = useState(false);
  const [panAnchor, setPanAnchor] = useState({ x: 0, y: 0 });

  // ── Node drag state ──────────────────────────────────────────────────────
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragAnchor, setDragAnchor] = useState({ x: 0, y: 0 }); // canvas coords

  // ── Node positions (canvas coords) ──────────────────────────────────────
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // ── Sidebar / config ─────────────────────────────────────────────────────
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    triggers: false,
    agents: false,
    logic: false,
    actions: false,
  });

  const canEdit = userRole === "owner" || userRole === "editor";
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Sync positions from persisted config ────────────────────────────────
  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      // Trigger
      if (!next["trigger"]) {
        const t = triggers[0];
        next["trigger"] =
          (t?.config as Record<string, { x: number; y: number }>)?.position ??
          { x: 60, y: 180 };
      }
      // Steps — only set if not already placed
      steps.forEach((step, idx) => {
        if (!next[step.id]) {
          next[step.id] =
            (step.config as Record<string, { x: number; y: number }>)?.position ?? {
              x: 420 + idx * 360,
              y: 180 + (idx % 2 === 0 ? 0 : 160),
            };
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.map((s) => s.id).join(","), triggers[0]?.id]);

  // ── Mouse-wheel zoom ────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0008;
      setZoom((prev) => Math.min(2.0, Math.max(0.25, prev + delta)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Canvas-to-screen coord helpers ──────────────────────────────────────
  const clientToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
      };
      return {
        x: (clientX - rect.left - offset.x) / zoom,
        y: (clientY - rect.top - offset.y) / zoom,
      };
    },
    [offset, zoom]
  );

  // ── Canvas panning ───────────────────────────────────────────────────────
  const onCanvasPD = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest(".canvas-node, input, select, textarea, button")) {
        return;
      }
      setIsPanning(true);
      setPanAnchor({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offset]
  );

  const onCanvasPM = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      setOffset({ x: e.clientX - panAnchor.x, y: e.clientY - panAnchor.y });
    },
    [isPanning, panAnchor]
  );

  const onCanvasPU = useCallback((e: React.PointerEvent) => {
    setIsPanning(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // ── Node drag ────────────────────────────────────────────────────────────
  const onNodePD = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (!canEdit) return;
      if ((e.target as HTMLElement).closest("input,select,textarea,button"))
        return;
      e.stopPropagation();
      const currentPos = positions[id] ?? { x: 100, y: 100 };
      const cp = clientToCanvas(e.clientX, e.clientY);
      setDragAnchor({ x: cp.x - currentPos.x, y: cp.y - currentPos.y });
      setActiveDragId(id);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [canEdit, positions, clientToCanvas]
  );

  const onNodePM = useCallback(
    (e: React.PointerEvent) => {
      if (!activeDragId) return;
      const cp = clientToCanvas(e.clientX, e.clientY);
      setPositions((prev) => ({
        ...prev,
        [activeDragId]: {
          x: Math.round(cp.x - dragAnchor.x),
          y: Math.round(cp.y - dragAnchor.y),
        },
      }));
    },
    [activeDragId, dragAnchor, clientToCanvas]
  );

  const onNodePU = useCallback(
    (e: React.PointerEvent) => {
      if (!activeDragId) return;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      const finalPos = positions[activeDragId];
      if (finalPos) {
        if (activeDragId === "trigger") {
          const t = triggers[0];
          if (t)
            onSaveTrigger(t.trigger_type, {
              ...(t.config as Record<string, unknown>),
              position: finalPos,
            });
        } else {
          onStepsChange(
            steps.map((s) =>
              s.id === activeDragId
                ? ({
                    ...s,
                    config: {
                      ...(s.config as Record<string, unknown>),
                      position: finalPos,
                    } as WorkflowStep["config"],
                  } as WorkflowStep)
                : s
            )
          );
        }
      }
      setActiveDragId(null);
    },
    [activeDragId, positions, triggers, onSaveTrigger, steps, onStepsChange]
  );

  // ── Add / delete / update steps ──────────────────────────────────────────
  const addStep = useCallback(
    (type: StepType) => {
      if (!canEdit) return;
      const newStep: WorkflowStep = {
        id: `temp-${Date.now()}`,
        workflow_id: "",
        step_order: steps.length + 1,
        type,
        config: {
          ...defaultConfig(type),
          position: { x: 420 + steps.length * 360, y: 180 },
        } as WorkflowStep["config"],
        created_at: new Date().toISOString(),
      };
      onStepsChange([...steps, newStep]);
      setActiveConfigId(newStep.id);
    },
    [steps, onStepsChange, canEdit]
  );

  const deleteStep = useCallback(
    (id: string) => {
      onStepsChange(
        steps
          .filter((s) => s.id !== id)
          .map((s, i) => ({ ...s, step_order: i + 1 }))
      );
      if (activeConfigId === id) setActiveConfigId(null);
    },
    [steps, onStepsChange, activeConfigId]
  );

  const updateStepConfig = useCallback(
    (id: string, cfg: Record<string, unknown>) => {
      onStepsChange(
        steps.map((s) =>
          s.id === id ? { ...s, config: cfg as WorkflowStep["config"] } : s
        )
      );
    },
    [steps, onStepsChange]
  );

  // ── Build connection edges ────────────────────────────────────────────────
  // Supports any-to-any: multiple edges can converge on a single node (LangGraph style)
  const edges = useMemo(() => {
    type Edge = {
      id: string;
      fromId: string;
      toId: string;
      label?: string;
      color: string;
    };
    const result: Edge[] = [];

    const addEdge = (
      fromId: string,
      toId: string,
      label: string | undefined,
      color: string
    ) => {
      if (positions[fromId] && positions[toId]) {
        result.push({ id: `${fromId}→${toId}`, fromId, toId, label, color });
      }
    };

    const trigger = triggers[0];

    // Trigger → first step (or explicit override)
    const trigNextId = (trigger?.config as Record<string, unknown>)?.next_step_id as
      | string
      | undefined;
    const trigTarget =
      (trigNextId && steps.find((s) => s.id === trigNextId)) || steps[0];
    if (trigTarget) {
      addEdge(
        "trigger",
        trigTarget.id,
        undefined,
        connColor(trigger?.trigger_type ?? "manual")
      );
    }

    // Step → step edges
    steps.forEach((step, idx) => {
      const cfg = step.config as Record<string, unknown>;

      if (step.type === "conditional_branch") {
        // True path
        const trueId = cfg.true_step_id as string | undefined;
        const trueTarget = trueId && steps.find((s) => s.id === trueId);
        if (trueTarget) {
          addEdge(
            step.id,
            trueTarget.id,
            (cfg.true_label as string) || "True",
            "#8B5CF6"
          );
        } else if (steps[idx + 1]) {
          // Fallback sequential
          addEdge(step.id, steps[idx + 1].id, "True (seq)", "#8B5CF6");
        }
        // False path
        const falseId = cfg.false_step_id as string | undefined;
        const falseTarget = falseId && steps.find((s) => s.id === falseId);
        if (falseTarget) {
          addEdge(
            step.id,
            falseTarget.id,
            (cfg.false_label as string) || "False",
            "#EC4899"
          );
        }
      } else {
        // Explicit next_step_id override (any node can explicitly route)
        const nextId = cfg.next_step_id as string | undefined;
        const nextTarget = nextId && steps.find((s) => s.id === nextId);
        if (nextTarget) {
          addEdge(step.id, nextTarget.id, undefined, connColor(step.type));
        } else if (steps[idx + 1]) {
          // Sequential fallback
          addEdge(step.id, steps[idx + 1].id, undefined, connColor(step.type));
        }
      }
    });

    return result;
  }, [steps, positions, triggers]);

  // ── Sidebar filtered list ────────────────────────────────────────────────
  const filteredMeta = useMemo(
    () =>
      STEP_META.filter(
        (m) =>
          m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [searchQuery]
  );

  // ── Zoom buttons ────────────────────────────────────────────────────────
  const zoomIn = () => setZoom((z) => Math.min(2.0, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)));
  const zoomReset = () => {
    setZoom(1.0);
    setOffset({ x: 40, y: 40 });
  };

  // ── Active items for config panel ────────────────────────────────────────
  const activeTrigger = triggers[0];
  const activeStep = steps.find((s) => s.id === activeConfigId);

  // ═══════════════════════════════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="h-full flex overflow-hidden bg-[#050409] text-zinc-300">
      <style>{`
        @keyframes dash { to { stroke-dashoffset: -18; } }
        .flow-path { stroke-dasharray: 6 4; animation: dash 1.2s linear infinite; }
        .canvas-bg {
          background-color: #050409;
          background-image: radial-gradient(rgba(139,92,246,0.07) 1px, transparent 1px);
          background-size: 28px 28px;
        }
      `}</style>

      {/* ── Component Library Sidebar ─────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-zinc-900 bg-zinc-950/60 flex flex-col overflow-hidden z-20">
        {/* Search */}
        <div className="p-4 border-b border-zinc-900 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            Component Library
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-600" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes…"
              className="w-full text-xs bg-zinc-900/60 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/40"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Triggers */}
          <Section
            label="Triggers"
            open={!collapsed.triggers}
            onToggle={() =>
              setCollapsed((p) => ({ ...p, triggers: !p.triggers }))
            }
          >
            {TRIGGER_META.map((t) => {
              const active = activeTrigger?.trigger_type === t.type;
              return (
                <SidebarItem
                  key={t.type}
                  icon={t.icon}
                  label={t.label}
                  active={active}
                  disabled={!canEdit}
                  ownerOnly={t.ownerOnly && userRole !== "owner"}
                  iconColor="text-emerald-400"
                  onClick={() => {
                    if (canEdit) {
                      onSaveTrigger(
                        t.type,
                        (activeTrigger?.config as Record<string, unknown>) ?? {}
                      );
                      setActiveConfigId("trigger");
                    }
                  }}
                />
              );
            })}
          </Section>

          {/* Agents */}
          <Section
            label="Agents"
            open={!collapsed.agents}
            onToggle={() => setCollapsed((p) => ({ ...p, agents: !p.agents }))}
          >
            {filteredMeta
              .filter((m) => m.category === "agent")
              .map((m) => (
                <SidebarItem
                  key={m.type}
                  icon={m.icon}
                  label={m.label}
                  disabled={!canEdit}
                  iconColor="text-blue-400"
                  onClick={() => addStep(m.type)}
                />
              ))}
          </Section>

          {/* Logic */}
          <Section
            label="Logic & Routing"
            open={!collapsed.logic}
            onToggle={() => setCollapsed((p) => ({ ...p, logic: !p.logic }))}
          >
            {filteredMeta
              .filter((m) => m.category === "logic")
              .map((m) => (
                <SidebarItem
                  key={m.type}
                  icon={m.icon}
                  label={m.label}
                  disabled={!canEdit}
                  iconColor="text-violet-400"
                  onClick={() => addStep(m.type)}
                />
              ))}
          </Section>

          {/* Actions */}
          <Section
            label="Actions & APIs"
            open={!collapsed.actions}
            onToggle={() =>
              setCollapsed((p) => ({ ...p, actions: !p.actions }))
            }
          >
            {filteredMeta
              .filter((m) => m.category === "action")
              .map((m) => {
                const blocked = m.ownerOnly && userRole !== "owner";
                return (
                  <SidebarItem
                    key={m.type}
                    icon={m.icon}
                    label={m.label}
                    ownerOnly={blocked}
                    disabled={!canEdit || !!blocked}
                    iconColor="text-pink-400"
                    onClick={() => !blocked && addStep(m.type)}
                  />
                );
              })}
          </Section>
        </div>

        {/* Quick Tips */}
        <div className="p-3 mx-3 mb-3 bg-zinc-900/40 rounded-xl border border-zinc-800/60 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
            <Info className="w-3 h-3 text-violet-400" />
            Quick Tips
          </div>
          <p className="text-[9px] text-zinc-600 leading-relaxed">
            Drag nodes to position. Click to configure. Use{" "}
            <kbd className="px-1 rounded bg-zinc-800 text-zinc-400">scroll</kbd>{" "}
            to zoom. Connect any node to any other via{" "}
            <strong className="text-zinc-500">Next Node</strong> dropdown.
          </p>
        </div>
      </aside>

      {/* ── Canvas ────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 relative overflow-hidden canvas-bg",
          isPanning ? "cursor-grabbing" : "cursor-grab",
          activeDragId && "cursor-grabbing"
        )}
        onPointerDown={onCanvasPD}
        onPointerMove={onCanvasPM}
        onPointerUp={onCanvasPU}
      >
        {/* Canvas Controls */}
        <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 rounded-xl px-2.5 py-1.5 backdrop-blur-md shadow-xl">
          <Workflow className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mr-1">
            Visual Canvas
          </span>
          <div className="w-px h-4 bg-zinc-800" />
          <button
            onClick={zoomOut}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
            title="Zoom Out (or scroll ↓)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono font-bold text-zinc-400 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
            title="Zoom In (or scroll ↑)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-zinc-800" />
          <button
            onClick={zoomReset}
            className="px-2 py-0.5 text-[9px] font-bold rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Reset
          </button>
          <div className="w-px h-4 bg-zinc-800" />
          <button className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400 transition-colors">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400 transition-colors">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scalable canvas world */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            transformOrigin: "0 0",
            transform: `translate(${offset.x}px,${offset.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Edges */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "6000px",
              height: "4000px",
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            <defs>
              {edges.map((e) => (
                <marker
                  key={`marker-${e.id}`}
                  id={`arrow-${e.id}`}
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path
                    d="M0,0 L0,6 L6,3 z"
                    fill={e.color}
                    opacity="0.8"
                  />
                </marker>
              ))}
            </defs>
            {edges.map((edge) => {
              const fp = positions[edge.fromId];
              const tp = positions[edge.toId];
              if (!fp || !tp) return null;
              const x1 = fp.x + NODE_W;
              const y1 = fp.y + NODE_H / 2;
              const x2 = tp.x;
              const y2 = tp.y + NODE_H / 2;
              const dx = Math.max(80, Math.abs(x2 - x1) * 0.45);
              const path = `M${x1} ${y1} C${x1 + dx} ${y1},${x2 - dx} ${y2},${x2} ${y2}`;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              return (
                <g key={edge.id}>
                  {/* Glow */}
                  <path
                    d={path}
                    fill="none"
                    stroke={edge.color}
                    strokeWidth={5}
                    opacity={0.08}
                  />
                  {/* Animated dash */}
                  <path
                    d={path}
                    fill="none"
                    stroke={edge.color}
                    strokeWidth={2}
                    opacity={0.75}
                    className="flow-path"
                    markerEnd={`url(#arrow-${edge.id})`}
                  />
                  {/* Label */}
                  {edge.label && (
                    <foreignObject
                      x={midX - 26}
                      y={midY - 9}
                      width={52}
                      height={18}
                    >
                      <div
                        style={{
                          fontSize: "7px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: edge.color,
                          background: "#09090b",
                          border: `1px solid ${edge.color}40`,
                          borderRadius: "999px",
                          padding: "0 5px",
                          lineHeight: "16px",
                          whiteSpace: "nowrap",
                          textAlign: "center",
                        }}
                      >
                        {edge.label}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>

          {/* ── Trigger Node ──────────────────────────────────────────── */}
          {activeTrigger && (
            <CanvasNode
              id="trigger"
              x={positions["trigger"]?.x ?? 60}
              y={positions["trigger"]?.y ?? 180}
              active={activeConfigId === "trigger"}
              onPointerDown={(e) => onNodePD("trigger", e)}
              onPointerMove={onNodePM}
              onPointerUp={onNodePU}
              onClick={() => setActiveConfigId("trigger")}
            >
              <NodeHeader
                icon={Globe}
                iconBg="bg-emerald-500/15 border-emerald-500/30"
                iconColor="text-emerald-400"
                title={
                  TRIGGER_META.find(
                    (t) => t.type === activeTrigger.trigger_type
                  )?.label ?? "Trigger"
                }
                badge="Trigger"
                badgeColor="bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                subtitle={
                  activeTrigger.trigger_type === "webhook"
                    ? "Awaiting HTTP POST"
                    : activeTrigger.trigger_type === "scheduled"
                    ? `Cron: ${(activeTrigger.config as Record<string, string>).cron_expression ?? "not set"}`
                    : activeTrigger.trigger_type === "database_event"
                    ? `DB ${(activeTrigger.config as Record<string, string>).operation ?? "INSERT"} on ${(activeTrigger.config as Record<string, string>).table ?? "table"}`
                    : "Manual trigger"
                }
              />
              {/* Output port */}
              <Port side="right" color="#10B981" />
            </CanvasNode>
          )}

          {/* ── Step Nodes ───────────────────────────────────────────── */}
          {steps.map((step) => {
            const meta = STEP_META.find((m) => m.type === step.type);
            const Icon = ICON_MAP[step.type];
            const pos = positions[step.id] ?? { x: 420, y: 180 };
            const isApproval = step.type === "approval_gate";
            const isBranch = step.type === "conditional_branch";
            const color = connColor(step.type);

            const nodeBorderMap: Record<string, string> = {
              llm_call: "border-blue-500/25 hover:border-blue-500/50",
              http_request: "border-pink-500/25 hover:border-pink-500/50",
              db_write: "border-red-500/25 hover:border-red-500/50",
              notify: "border-amber-500/25 hover:border-amber-500/50",
              conditional_branch: "border-violet-500/25 hover:border-violet-500/50",
              approval_gate: "border-amber-500/25 hover:border-amber-500/50",
            };
            const activeBorderMap: Record<string, string> = {
              llm_call: "border-blue-500 ring-1 ring-blue-500/30",
              http_request: "border-pink-500 ring-1 ring-pink-500/30",
              db_write: "border-red-500 ring-1 ring-red-500/30",
              notify: "border-amber-500 ring-1 ring-amber-500/30",
              conditional_branch: "border-violet-500 ring-1 ring-violet-500/30",
              approval_gate: "border-amber-500 ring-1 ring-amber-500/30",
            };

            const statusBadge = isApproval ? (
              <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Gate Active
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Ready
              </div>
            );

            let subtitle = meta?.description ?? step.type;
            const cfg = step.config as Record<string, unknown>;
            if (step.type === "llm_call")
              subtitle = `Groq · ${(cfg.model as string) ?? "llama-3.3-70b"}`;
            else if (step.type === "http_request")
              subtitle = `${(cfg.method as string) ?? "POST"} · ${((cfg.url as string) ?? "").slice(0, 30)}`;
            else if (step.type === "conditional_branch")
              subtitle = `IF ${((cfg.condition as string) ?? "").slice(0, 28)}`;
            else if (step.type === "notify")
              subtitle = `${(cfg.channel as string) ?? "email"} notification`;

            return (
              <CanvasNode
                key={step.id}
                id={step.id}
                x={pos.x}
                y={pos.y}
                active={activeConfigId === step.id}
                borderClass={
                  activeConfigId === step.id
                    ? activeBorderMap[step.type]
                    : nodeBorderMap[step.type]
                }
                onPointerDown={(e) => onNodePD(step.id, e)}
                onPointerMove={onNodePM}
                onPointerUp={onNodePU}
                onClick={() => setActiveConfigId(step.id)}
              >
                <NodeHeader
                  icon={Icon}
                  iconBg={getStepTypeColor(step.type)}
                  title={
                    <span className="flex items-center gap-1.5">
                      {meta?.label ?? step.type}
                      {isOwnerOnlyStep(step.type) && (
                        <Lock className="w-2.5 h-2.5 text-rose-400 flex-shrink-0" />
                      )}
                    </span>
                  }
                  subtitle={subtitle}
                  statusBadge={statusBadge}
                  stepOrder={step.step_order}
                />
                {/* Input port */}
                <Port side="left" color="#71717a" />
                {/* Output port(s) */}
                {isBranch ? (
                  <>
                    <Port side="right" color="#8B5CF6" offsetY={-16} />
                    <Port side="right" color="#EC4899" offsetY={16} />
                  </>
                ) : (
                  <Port side="right" color={color} />
                )}
              </CanvasNode>
            );
          })}
        </div>
      </div>

      {/* ── Config Side Panel ──────────────────────────────────────────── */}
      <AnimatePresence>
        {activeConfigId && (
          <motion.aside
            key="config-panel"
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="w-[380px] flex-shrink-0 border-l border-zinc-900 bg-zinc-950/95 flex flex-col shadow-2xl z-20"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-900">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-violet-400" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-200">
                  {activeConfigId === "trigger"
                    ? "Trigger Configuration"
                    : "Step Configuration"}
                </h3>
              </div>
              <button
                onClick={() => setActiveConfigId(null)}
                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {/* Trigger Config */}
              {activeConfigId === "trigger" && activeTrigger && (
                <TriggerConfig
                  trigger={activeTrigger}
                  canEdit={canEdit}
                  onSave={onSaveTrigger}
                />
              )}

              {/* Step Config */}
              {activeStep && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-600">
                      Type: {activeStep.type} · Step #{activeStep.step_order}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => deleteStep(activeStep.id)}
                        className="flex items-center gap-1 text-[10px] font-bold text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-500/20 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    )}
                  </div>

                  <StepConfigPanel
                    step={activeStep}
                    allSteps={steps}
                    disabled={!canEdit}
                    onChange={(cfg) => updateStepConfig(activeStep.id, cfg)}
                  />
                </>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function Section({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform",
            !open && "-rotate-90"
          )}
        />
      </button>
      {open && <div className="space-y-0.5 pl-1">{children}</div>}
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  disabled,
  ownerOnly,
  iconColor,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  ownerOnly?: boolean;
  iconColor: string;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left",
        active
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
          : "border-transparent hover:bg-zinc-900 hover:border-zinc-800 text-zinc-400 hover:text-zinc-200",
        (disabled || ownerOnly) && "opacity-30 cursor-not-allowed"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("w-3.5 h-3.5", iconColor)} />
        <span>{label}</span>
        {ownerOnly && <Lock className="w-2.5 h-2.5 text-rose-400" />}
      </div>
      {!active && <Plus className="w-3 h-3 text-zinc-600 group-hover:text-violet-400" />}
    </button>
  );
}

function CanvasNode({
  id,
  x,
  y,
  active,
  borderClass,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
}: {
  id: string;
  x: number;
  y: number;
  active: boolean;
  borderClass?: string;
  children: React.ReactNode;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: NODE_W,
        userSelect: "none",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      className={cn(
        "canvas-node rounded-xl border backdrop-blur-sm bg-zinc-950/70 shadow-xl cursor-grab active:cursor-grabbing transition-colors relative",
        borderClass ??
          (active
            ? "border-violet-500 ring-1 ring-violet-500/30"
            : "border-zinc-800/80 hover:border-zinc-700")
      )}
    >
      {children}
    </div>
  );
}

function NodeHeader({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  badge,
  badgeColor,
  subtitle,
  statusBadge,
  stepOrder,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor?: string;
  title: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  subtitle?: string;
  statusBadge?: React.ReactNode;
  stepOrder?: number;
}) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border",
          iconBg
        )}
      >
        <Icon className={cn("w-4.5 h-4.5", iconColor ?? "text-zinc-300")} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-zinc-100 truncate">
            {title}
          </span>
          {badge && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[7px] font-bold uppercase border",
                badgeColor
              )}
            >
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[9px] text-zinc-600 font-mono truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {statusBadge}
        {stepOrder !== undefined && (
          <span className="text-[7px] font-mono text-zinc-700">
            #{stepOrder}
          </span>
        )}
      </div>
    </div>
  );
}

function Port({
  side,
  color,
  offsetY = 0,
}: {
  side: "left" | "right";
  color: string;
  offsetY?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        [side]: side === "left" ? -6 : -6,
        top: `calc(50% + ${offsetY}px)`,
        transform: "translateY(-50%)",
        width: 12,
        height: 12,
        borderRadius: "50%",
        backgroundColor: color,
        border: "2px solid #09090b",
        boxShadow: `0 0 8px ${color}60`,
      }}
    />
  );
}

// ── Trigger Config ──────────────────────────────────────────────────────────
function TriggerConfig({
  trigger,
  canEdit,
  onSave,
}: {
  trigger: WorkflowTrigger;
  canEdit: boolean;
  onSave: (type: TriggerType, config: Record<string, unknown>) => void;
}) {
  const cfg = trigger.config as Record<string, unknown>;
  const upd = (patch: Record<string, unknown>) =>
    onSave(trigger.trigger_type, { ...cfg, ...patch });

  return (
    <div className="space-y-4">
      <ConfigField label="Trigger Type">
        <select
          disabled={!canEdit}
          value={trigger.trigger_type}
          onChange={(e) =>
            onSave(e.target.value as TriggerType, cfg)
          }
          className="cfg-input"
        >
          {TRIGGER_META.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </ConfigField>

      {trigger.trigger_type === "webhook" && (
        <ConfigField label="Webhook Secret Token">
          <input
            disabled={!canEdit}
            value={String(cfg.secret_token ?? "")}
            onChange={(e) => upd({ secret_token: e.target.value })}
            placeholder="your-strong-secret"
            className="cfg-input"
          />
          <p className="text-[9px] text-zinc-600 mt-1">
            Header: <code>x-workflow-webhook-secret</code>
          </p>
        </ConfigField>
      )}

      {trigger.trigger_type === "scheduled" && (
        <ConfigField label="Cron Expression">
          <input
            disabled={!canEdit}
            value={String(cfg.cron_expression ?? "")}
            onChange={(e) => upd({ cron_expression: e.target.value })}
            placeholder="0 9 * * 1 (Mon 9am)"
            className="cfg-input"
          />
        </ConfigField>
      )}

      {trigger.trigger_type === "database_event" && (
        <>
          <ConfigField label="Table Name">
            <input
              disabled={!canEdit}
              value={String(cfg.table ?? "")}
              onChange={(e) => upd({ table: e.target.value })}
              placeholder="public.my_table"
              className="cfg-input"
            />
          </ConfigField>
          <ConfigField label="Operation">
            <select
              disabled={!canEdit}
              value={String(cfg.operation ?? "INSERT")}
              onChange={(e) => upd({ operation: e.target.value })}
              className="cfg-input"
            >
              {["INSERT", "UPDATE", "DELETE"].map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </ConfigField>
        </>
      )}
    </div>
  );
}

// ── Step Config Panel ────────────────────────────────────────────────────────
function StepConfigPanel({
  step,
  allSteps,
  disabled,
  onChange,
}: {
  step: WorkflowStep;
  allSteps: WorkflowStep[];
  disabled: boolean;
  onChange: (cfg: Record<string, unknown>) => void;
}) {
  const cfg = step.config as Record<string, unknown>;
  const upd = (patch: Record<string, unknown>) => onChange({ ...cfg, ...patch });
  const others = allSteps.filter((s) => s.id !== step.id);

  // ── Shared connection router (every non-branch step) ──────────────────────
  const routerSection = step.type !== "conditional_branch" && (
    <div className="pt-3 border-t border-zinc-900 space-y-2">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
        <ArrowRight className="w-3 h-3 text-violet-400" />
        Route Output To
      </div>
      <ConfigField label="Next Node (overrides sequential order)">
        <select
          disabled={disabled}
          value={String(cfg.next_step_id ?? "")}
          onChange={(e) => upd({ next_step_id: e.target.value || null })}
          className="cfg-input"
        >
          <option value="">— Sequential (default) —</option>
          {others.map((s) => (
            <option key={s.id} value={s.id}>
              Step {s.step_order}: {STEP_META.find((m) => m.type === s.type)?.label ?? s.type}
            </option>
          ))}
        </select>
      </ConfigField>
    </div>
  );

  switch (step.type) {
    case "llm_call":
      return (
        <div className="space-y-4">
          <ConfigField label="System Prompt">
            <textarea
              disabled={disabled}
              rows={2}
              value={String(cfg.system_prompt ?? "")}
              onChange={(e) => upd({ system_prompt: e.target.value })}
              placeholder="You are a helpful AI assistant."
              className="cfg-input font-mono"
            />
          </ConfigField>
          <ConfigField label="User Prompt">
            <textarea
              disabled={disabled}
              rows={4}
              value={String(cfg.prompt ?? "")}
              onChange={(e) => upd({ prompt: e.target.value })}
              placeholder="Use {{step_1.output.content}} to reference prior step output."
              className="cfg-input font-mono"
            />
          </ConfigField>
          <div className="grid grid-cols-2 gap-3">
            <ConfigField label="Model">
              <input
                disabled={disabled}
                value={String(cfg.model ?? "")}
                onChange={(e) => upd({ model: e.target.value })}
                placeholder="llama-3.3-70b-versatile"
                className="cfg-input"
              />
            </ConfigField>
            <ConfigField label="Temperature">
              <input
                disabled={disabled}
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={String(cfg.temperature ?? "0.7")}
                onChange={(e) => upd({ temperature: Number(e.target.value) })}
                className="cfg-input"
              />
            </ConfigField>
          </div>
          <ConfigField label="Max Tokens">
            <input
              disabled={disabled}
              type="number"
              value={String(cfg.max_tokens ?? "1024")}
              onChange={(e) => upd({ max_tokens: Number(e.target.value) })}
              className="cfg-input"
            />
          </ConfigField>
          {routerSection}
        </div>
      );

    case "http_request":
      return (
        <div className="space-y-4">
          <ConfigField label="Endpoint URL">
            <input
              disabled={disabled}
              value={String(cfg.url ?? "")}
              onChange={(e) => upd({ url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
              className="cfg-input"
            />
          </ConfigField>
          <div className="grid grid-cols-2 gap-3">
            <ConfigField label="Method">
              <select
                disabled={disabled}
                value={String(cfg.method ?? "GET")}
                onChange={(e) => upd({ method: e.target.value })}
                className="cfg-input"
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </ConfigField>
            <ConfigField label="Timeout (ms)">
              <input
                disabled={disabled}
                type="number"
                value={String(cfg.timeout_ms ?? "30000")}
                onChange={(e) => upd({ timeout_ms: Number(e.target.value) })}
                className="cfg-input"
              />
            </ConfigField>
          </div>
          <ConfigField label="JSON Body Template">
            <textarea
              disabled={disabled}
              rows={3}
              value={String(cfg.body_template ?? "")}
              onChange={(e) => upd({ body_template: e.target.value })}
              placeholder={'{"input": "{{step_1.output.content}}"}'}
              className="cfg-input font-mono"
            />
          </ConfigField>
          {routerSection}
        </div>
      );

    case "db_write":
      return (
        <div className="space-y-4">
          <ConfigField label="GraphQL Mutation">
            <textarea
              disabled={disabled}
              rows={4}
              value={String(cfg.mutation ?? "")}
              onChange={(e) => upd({ mutation: e.target.value })}
              placeholder="mutation InsertResult($data: jsonb!) { ... }"
              className="cfg-input font-mono"
            />
          </ConfigField>
          <ConfigField label="Variables Template (JSON)">
            <textarea
              disabled={disabled}
              rows={2}
              value={String(cfg.variables_template ?? "")}
              onChange={(e) => upd({ variables_template: e.target.value })}
              placeholder={'{"data": "{{step_1.output.content}}"}'}
              className="cfg-input font-mono"
            />
          </ConfigField>
          {routerSection}
        </div>
      );

    case "notify":
      return (
        <div className="space-y-4">
          <ConfigField label="Channel">
            <select
              disabled={disabled}
              value={String(cfg.channel ?? "email")}
              onChange={(e) => upd({ channel: e.target.value })}
              className="cfg-input"
            >
              <option value="email">Email (log only)</option>
              <option value="slack">Slack Webhook</option>
              <option value="webhook">Generic Webhook</option>
            </select>
          </ConfigField>
          {cfg.channel === "slack" || cfg.channel === "webhook" ? (
            <ConfigField label="Webhook URL">
              <input
                disabled={disabled}
                value={String(cfg.url ?? "")}
                onChange={(e) => upd({ url: e.target.value })}
                placeholder="https://hooks.slack.com/services/…"
                className="cfg-input"
              />
            </ConfigField>
          ) : (
            <ConfigField label="Recipient Email">
              <input
                disabled={disabled}
                value={String(cfg.recipient ?? "")}
                onChange={(e) => upd({ recipient: e.target.value })}
                placeholder="user@example.com"
                className="cfg-input"
              />
            </ConfigField>
          )}
          <ConfigField label="Message Template">
            <textarea
              disabled={disabled}
              rows={2}
              value={String(cfg.message_template ?? "")}
              onChange={(e) => upd({ message_template: e.target.value })}
              placeholder="Workflow update: {{step_1.output.content}}"
              className="cfg-input font-mono"
            />
          </ConfigField>
          {routerSection}
        </div>
      );

    case "conditional_branch":
      return (
        <div className="space-y-4">
          <ConfigField label="JavaScript Condition">
            <textarea
              disabled={disabled}
              rows={3}
              value={String(cfg.condition ?? "")}
              onChange={(e) => upd({ condition: e.target.value })}
              placeholder={"// Each step output is in scope by name:\n// step_1?.output?.content?.includes('approve')\n// step_2?.output?.status === 200"}
              className="cfg-input font-mono text-[10px]"
            />
            <div className="text-[9px] text-zinc-600 mt-1 space-y-0.5">
              <p>Use <code className="text-violet-400">step_N?.output?.field</code> to safely access prior step outputs.</p>
              <p className="text-amber-500/70">⚠ Always use optional chaining (<code className="text-amber-400">?.</code>) to avoid errors on undefined values.</p>
            </div>
          </ConfigField>

          <div className="pt-3 border-t border-zinc-900 space-y-3">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
              <GitFork className="w-3 h-3 text-violet-400" />
              Branch Routing
            </div>

            {/* True branch */}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-500 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <ConfigField label="True Path Label">
                  <input
                    disabled={disabled}
                    value={String(cfg.true_label ?? "True")}
                    onChange={(e) => upd({ true_label: e.target.value })}
                    className="cfg-input"
                    placeholder="Success"
                  />
                </ConfigField>
                <ConfigField label="True → Route To Node">
                  <select
                    disabled={disabled}
                    value={String(cfg.true_step_id ?? "")}
                    onChange={(e) =>
                      upd({ true_step_id: e.target.value || null })
                    }
                    className="cfg-input"
                  >
                    <option value="">— Sequential next —</option>
                    {others.map((s) => (
                      <option key={s.id} value={s.id}>
                        Step {s.step_order}:{" "}
                        {STEP_META.find((m) => m.type === s.type)?.label ??
                          s.type}
                      </option>
                    ))}
                  </select>
                </ConfigField>
              </div>
            </div>

            {/* False branch */}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-pink-500 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <ConfigField label="False Path Label">
                  <input
                    disabled={disabled}
                    value={String(cfg.false_label ?? "False")}
                    onChange={(e) => upd({ false_label: e.target.value })}
                    className="cfg-input"
                    placeholder="Fallback"
                  />
                </ConfigField>
                <ConfigField label="False → Route To Node">
                  <select
                    disabled={disabled}
                    value={String(cfg.false_step_id ?? "")}
                    onChange={(e) =>
                      upd({ false_step_id: e.target.value || null })
                    }
                    className="cfg-input"
                  >
                    <option value="">— No false path —</option>
                    {others.map((s) => (
                      <option key={s.id} value={s.id}>
                        Step {s.step_order}:{" "}
                        {STEP_META.find((m) => m.type === s.type)?.label ??
                          s.type}
                      </option>
                    ))}
                  </select>
                </ConfigField>
              </div>
            </div>
          </div>
        </div>
      );

    case "approval_gate":
      return (
        <div className="space-y-4">
          <ConfigField label="Approval Message">
            <textarea
              disabled={disabled}
              rows={2}
              value={String(cfg.message ?? "")}
              onChange={(e) => upd({ message: e.target.value })}
              placeholder="Please review and approve to continue."
              className="cfg-input font-mono"
            />
          </ConfigField>
          <ConfigField label="Minimum Approver Role">
            <select
              disabled={disabled}
              value={String(cfg.required_role ?? "editor")}
              onChange={(e) => upd({ required_role: e.target.value })}
              className="cfg-input"
            >
              <option value="editor">Editor or Owner</option>
              <option value="owner">Owner only</option>
            </select>
          </ConfigField>
          {routerSection}
        </div>
      );

    default:
      return null;
  }
}

function ConfigField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}
