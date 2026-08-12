"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Sparkles,
  GitBranch,
  Zap,
  Play,
  CheckCircle2,
  Shield,
  Users,
  Code,
  Cpu,
  Terminal,
  Sliders,
  HelpCircle,
  ChevronRight,
  Copy,
  Check,
  Globe,
  Database,
  Bell,
  Lock,
  ArrowRight,
  Mail,
  AlertCircle,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

// ── Interactive Prompt Interpolation Demo ──────────────────────────────────────
function PromptPlaygroundDemo() {
  const [template, setTemplate] = useState(
    "Summarize the following customer feedback for {{input.company_name}}:\n\n\"{{input.feedback_text}}\"\n\nFormat as key bullet points with tone analysis."
  );
  const [companyName, setCompanyName] = useState("Acme Corp");
  const [feedbackText, setFeedbackText] = useState(
    "The new workflow builder interface is incredibly fast and responsive! However, we would love to see more webhook integration options in future releases."
  );
  const [copied, setCopied] = useState(false);

  const interpolatedOutput = template
    .replace(/\{\{\s*input\.company_name\s*\}\}/g, companyName || "[Company Name]")
    .replace(/\{\{\s*input\.feedback_text\s*\}\}/g, feedbackText || "[Feedback Text]");

  const copyTemplate = () => {
    navigator.clipboard.writeText(template);
    setCopied(true);
    toast.success("Template copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-5 rounded-xl glass border border-violet-500/20 bg-zinc-900/60 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          Interactive Prompt Interpolation Playground
        </h4>
        <button
          onClick={copyTemplate}
          className="btn-secondary text-xs px-2.5 py-1 gap-1 text-zinc-400 hover:text-zinc-200"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy Template"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: Inputs */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Prompt Template (with <code className="text-violet-400 font-mono">{"{{variable}}"}</code> tags)
            </label>
            <textarea
              rows={5}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="input-base text-xs font-mono w-full bg-zinc-950/80 border-zinc-800 text-zinc-200 focus:border-violet-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                Company Name (<code className="text-violet-400">input.company_name</code>)
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="input-base text-xs w-full bg-zinc-950/80 border-zinc-800 text-zinc-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                Feedback Text (<code className="text-violet-400">input.feedback_text</code>)
              </label>
              <input
                type="text"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="input-base text-xs w-full bg-zinc-950/80 border-zinc-800 text-zinc-200 truncate"
              />
            </div>
          </div>
        </div>

        {/* Right column: Result */}
        <div>
          <label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Live Interpolated Output Sent to Groq LLaMA 3.3
          </label>
          <div className="p-3.5 rounded-lg bg-zinc-950/90 border border-emerald-500/20 text-xs font-mono text-zinc-300 min-h-[175px] whitespace-pre-wrap leading-relaxed">
            {interpolatedOutput}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page Component ────────────────────────────────────────────────────────
export default function UserGuidePage() {
  const [activeTab, setActiveTab] = useState<string>("overview");

  const SECTIONS = [
    { id: "overview", label: "Getting Started", icon: Zap },
    { id: "workflows", label: "Creating Workflows", icon: GitBranch },
    { id: "prompts", label: "Prompts & Step Config", icon: Sliders },
    { id: "execution", label: "Running & Triggers", icon: Play },
    { id: "approvals", label: "Human Approvals", icon: Shield },
    { id: "teams", label: "Team & Invites", icon: Users },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-8 rounded-2xl glass border border-violet-500/30 overflow-hidden bg-gradient-to-r from-violet-950/40 via-zinc-900 to-indigo-950/40"
      >
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs font-semibold text-violet-300">
            <BookOpen className="w-3.5 h-3.5" />
            Complete Documentation & Guide
          </div>
          <h1 className="text-3xl font-extrabold text-zinc-100 tracking-tight">
            How FlowForge Works
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Master building multi-step AI pipelines, configuring LLaMA 3.3 prompts, setting up human approval gates, triggering runs via webhooks, and inviting team members.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/dashboard/workflows/new"
              className="btn-primary px-4 py-2 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30"
            >
              <Zap className="w-3.5 h-3.5" />
              Build a Workflow
            </Link>
            <Link
              href="/dashboard/settings"
              className="btn-secondary px-4 py-2 text-xs gap-1.5 border-zinc-700 hover:bg-zinc-800 text-zinc-300"
            >
              <Users className="w-3.5 h-3.5" />
              Manage Team & Invites
            </Link>
          </div>
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none hidden lg:block">
          <Cpu className="w-64 h-64 text-violet-400" />
        </div>
      </motion.div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-zinc-800 scrollbar-none">
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveTab(sec.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-violet-600/20 text-violet-300 border border-violet-500/40 shadow-sm shadow-violet-500/20"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-violet-400" : "text-zinc-500"}`} />
              {sec.label}
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      <div className="space-y-8">
        {/* ── SECTION 1: OVERVIEW ── */}
        {(activeTab === "overview" || activeTab === "all") && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
              <Zap className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-bold text-zinc-100">1. Getting Started & Core Concepts</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass rounded-xl p-5 space-y-2 border-zinc-800">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-xs">
                  01
                </div>
                <h3 className="text-sm font-bold text-zinc-200">Organizations & Quotas</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Every workflow belongs to an Organization. Run usage is tracked against monthly quotas shown in the top header.
                </p>
              </div>

              <div className="glass rounded-xl p-5 space-y-2 border-zinc-800">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
                  02
                </div>
                <h3 className="text-sm font-bold text-zinc-200">Role-Based Access</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Members hold roles (<span className="text-amber-400 font-medium">Owner</span>, <span className="text-violet-400 font-medium">Editor</span>, or <span className="text-zinc-400 font-medium">Viewer</span>) governing what actions they can perform.
                </p>
              </div>

              <div className="glass rounded-xl p-5 space-y-2 border-zinc-800">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs">
                  03
                </div>
                <h3 className="text-sm font-bold text-zinc-200">Live DAG Execution</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Workflows run step-by-step through a Directed Acyclic Graph (DAG) with live GraphQL WebSocket status streaming.
                </p>
              </div>
            </div>

            {/* Permission Table */}
            <div className="glass rounded-xl overflow-hidden border border-zinc-800">
              <div className="px-5 py-3.5 bg-zinc-900/60 border-b border-zinc-800 font-semibold text-xs text-zinc-200">
                Permission Matrix by Role
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-zinc-500">
                      <th className="p-3 font-semibold">Action / Capability</th>
                      <th className="p-3 font-semibold text-amber-400">👑 Owner</th>
                      <th className="p-3 font-semibold text-violet-400">✏️ Editor</th>
                      <th className="p-3 font-semibold text-zinc-400">👁 Viewer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                    <tr>
                      <td className="p-3 font-medium">View Workflows, Steps & Run Outputs</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Create, Edit & Delete Workflows</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-rose-400">Denied</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Trigger & Run Workflows</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-rose-400">Denied</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Approve / Reject Human Gates</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-rose-400">Denied</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">Invite & Remove Members, Quotas</td>
                      <td className="p-3 text-emerald-400">Allowed</td>
                      <td className="p-3 text-rose-400">Denied</td>
                      <td className="p-3 text-rose-400">Denied</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </motion.section>
        )}

        {/* ── SECTION 2: CREATING WORKFLOWS ── */}
        {(activeTab === "workflows" || activeTab === "all") && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
              <GitBranch className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-bold text-zinc-100">2. How to Create Workflows & Add Nodes</h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl glass border border-zinc-800 flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300 font-bold text-sm flex-shrink-0">
                  1
                </div>
                <div className="space-y-1 text-xs">
                  <h3 className="font-bold text-zinc-200 text-sm">Navigate to Workflows and click &quot;New Workflow&quot;</h3>
                  <p className="text-zinc-400 leading-relaxed">
                    Provide a name and description for your pipeline. A fresh canvas will open automatically.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl glass border border-zinc-800 flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300 font-bold text-sm flex-shrink-0">
                  2
                </div>
                <div className="space-y-2 text-xs">
                  <h3 className="font-bold text-zinc-200 text-sm">Available Node Types</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-violet-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-violet-300 font-semibold">
                        <Cpu className="w-4 h-4" /> LLM Call
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Generates AI responses using Groq LLaMA 3.3 70B with customizable system & user prompts.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-blue-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-blue-300 font-semibold">
                        <Globe className="w-4 h-4" /> HTTP Request
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Sends external REST API calls (GET/POST/PUT/DELETE) with headers and JSON body templates.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-emerald-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                        <Database className="w-4 h-4" /> DB Write
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Inserts structured records into internal Postgres database tables.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-amber-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-amber-300 font-semibold">
                        <Shield className="w-4 h-4" /> Approval Gate
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Pauses execution until an authorized human user signs off on the step payload.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-purple-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-purple-300 font-semibold">
                        <GitBranch className="w-4 h-4" /> Conditional Branch
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Evaluates rules and routes downstream execution dynamically.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900/80 border border-pink-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-pink-300 font-semibold">
                        <Bell className="w-4 h-4" /> Notification
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Dispatches notifications or emails upon workflow milestone completions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* ── SECTION 3: PROMPTS & STEP CONFIG ── */}
        {(activeTab === "prompts" || activeTab === "all") && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
              <Sliders className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-bold text-zinc-100">3. How to Change Prompts & Step Content</h2>
            </div>

            <div className="space-y-4 text-xs text-zinc-300">
              <p className="leading-relaxed text-zinc-400">
                Editing LLM prompts or step parameters in FlowForge is done directly inside the <strong className="text-zinc-200">Step Inspector Drawer</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl glass border border-zinc-800 space-y-2">
                  <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                    <Code className="w-4 h-4 text-violet-400" />
                    How to Edit an LLM Step Prompt
                  </h3>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-400 leading-relaxed">
                    <li>Open your workflow on the canvas.</li>
                    <li>Click on the <strong className="text-zinc-200">LLM Call</strong> node you want to edit.</li>
                    <li>The step configuration panel opens on the right side.</li>
                    <li>
                      Modify the <strong className="text-zinc-200">System Prompt</strong> (defines model behavior/rules) and <strong className="text-zinc-200">User Prompt Template</strong>.
                    </li>
                    <li>Click <strong className="text-violet-400">Save Workflow</strong> in the top header.</li>
                  </ol>
                </div>

                <div className="p-4 rounded-xl glass border border-zinc-800 space-y-2">
                  <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    Using Variable Tags <code className="text-violet-400 font-mono">{"{{...}}"}</code>
                  </h3>
                  <p className="text-zinc-400 leading-relaxed">
                    You can reference prior step outputs or input payload values directly inside your prompts:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-zinc-400 font-mono text-[11px]">
                    <li><span className="text-violet-300">{"{{input.user_email}}"}</span> — Value from run input</li>
                    <li><span className="text-violet-300">{"{{step_1.output.result}}"}</span> — Result from Step 1</li>
                    <li><span className="text-violet-300">{"{{step_2.output.summary}}"}</span> — Summary from Step 2</li>
                  </ul>
                </div>
              </div>

              {/* Playground */}
              <PromptPlaygroundDemo />
            </div>
          </motion.section>
        )}

        {/* ── SECTION 4: RUNNING & TRIGGERS ── */}
        {(activeTab === "execution" || activeTab === "all") && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
              <Play className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-bold text-zinc-100">4. How to Run & Trigger Workflows</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl glass border border-zinc-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-zinc-200 text-sm">
                  <Play className="w-4 h-4 text-emerald-400" />
                  Manual Run Button
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Click <strong>Run Workflow</strong> on the canvas or detail page. Input optional JSON payload variables and click Run.
                </p>
              </div>

              <div className="p-4 rounded-xl glass border border-zinc-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-zinc-200 text-sm">
                  <Globe className="w-4 h-4 text-blue-400" />
                  Inbound Webhook API
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Send a HTTP POST to <code>/api/webhooks/trigger</code> with your secret header to trigger automated background runs.
                </p>
              </div>

              <div className="p-4 rounded-xl glass border border-zinc-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-zinc-200 text-sm">
                  <Play className="w-4 h-4 text-purple-400" />
                  Run Monitor Page
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Track active, completed, and failed workflow runs live under <code>/dashboard/runs</code>.
                </p>
              </div>
            </div>
          </motion.section>
        )}

        {/* ── SECTION 5: HUMAN APPROVALS ── */}
        {(activeTab === "approvals" || activeTab === "all") && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
              <Shield className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-bold text-zinc-100">5. Human-in-the-Loop Approval Gates</h2>
            </div>

            <div className="p-5 rounded-xl glass border border-amber-500/20 bg-amber-500/5 space-y-3 text-xs text-zinc-300">
              <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                How Approval Gates Function
              </div>
              <p className="leading-relaxed text-zinc-400">
                When a workflow reaches an <strong className="text-zinc-200">Approval Gate</strong> step, the run status automatically changes to <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">paused</span>.
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-400">
                <li>Authorized organization members (<strong className="text-zinc-200">Owner</strong> or <strong className="text-zinc-200">Editor</strong>) can inspect the current step output payload.</li>
                <li>Click <strong className="text-emerald-400">Approve</strong> to resume workflow execution.</li>
                <li>Click <strong className="text-rose-400">Reject</strong> to terminate the run cleanly.</li>
              </ul>
            </div>
          </motion.section>
        )}

        {/* ── SECTION 6: TEAM & INVITATIONS ── */}
        {(activeTab === "teams" || activeTab === "all") && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
              <Users className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-bold text-zinc-100">6. Managing Members & Email Invitations</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
              <div className="p-4 rounded-xl glass border border-zinc-800 space-y-2">
                <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                  <Mail className="w-4 h-4 text-violet-400" />
                  Sending Invitations
                </h3>
                <p className="text-zinc-400 leading-relaxed">
                  Owners can invite members from <strong className="text-zinc-200">Settings → Invite a Member</strong>.
                </p>
                <ul className="list-disc list-inside space-y-1 text-zinc-400">
                  <li>An invitation email with an accept link is dispatched to the user.</li>
                  <li>Invitees see a banner at the top of their FlowForge dashboard to accept or decline.</li>
                  <li><strong className="text-zinc-200">No member is added directly without their explicit approval.</strong></li>
                </ul>
              </div>

              <div className="p-4 rounded-xl glass border border-zinc-800 space-y-2">
                <h3 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400" />
                  Removing Members
                </h3>
                <p className="text-zinc-400 leading-relaxed">
                  Owners can remove active organization members from <strong className="text-zinc-200">Settings → Members</strong>.
                </p>
                <ul className="list-disc list-inside space-y-1 text-zinc-400">
                  <li>A confirmation dialog prevents accidental deletions.</li>
                  <li>Access permissions and pending workflow states are cleaned up automatically.</li>
                </ul>
              </div>
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
}
