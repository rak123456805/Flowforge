"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
import {
  Zap,
  Play,
  Phone,
  ArrowRight,
  Shield,
  Activity,
  Database,
  Network,
  Settings,
  Check,
  ArrowUpRight,
  Menu,
  X,
  Cpu,
  Layers,
  DollarSign,
  TrendingUp,
  Workflow,
  Terminal,
  Loader2,
  AlertCircle,
  ThumbsUp
} from "lucide-react";

function NodeCard({
  title,
  subtext,
  icon: Icon,
  status,
  colorClass,
  badgeText
}: {
  title: string;
  subtext: string;
  icon: any;
  status: "idle" | "running" | "success" | "paused";
  colorClass: string;
  badgeText?: string;
}) {
  const statusColors = {
    idle: "border-zinc-800 text-zinc-500 bg-zinc-950/40",
    running: "border-purple-500/50 text-purple-300 bg-purple-500/5 shadow-[0_0_15px_rgba(139,92,246,0.15)] animate-pulse",
    success: "border-emerald-500/50 text-emerald-300 bg-emerald-500/5 shadow-[0_0_10px_rgba(16,185,129,0.05)]",
    paused: "border-amber-500/50 text-amber-300 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-bounce"
  };

  const statusText = {
    idle: "Idle",
    running: "Active",
    success: "Success",
    paused: "Paused"
  };

  const colorAccents = {
    purple: "text-purple-400 bg-purple-500/10",
    green: "text-emerald-400 bg-emerald-500/10",
    blue: "text-blue-400 bg-blue-500/10",
    orange: "text-amber-400 bg-amber-500/10",
    pink: "text-pink-400 bg-pink-500/10"
  };

  return (
    <div className={`w-[170px] h-[65px] rounded-xl border p-2.5 flex flex-col justify-between select-none transition-all duration-300 text-[10px] ${statusColors[status]}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${colorAccents[colorClass as keyof typeof colorAccents]}`}>
            <Icon className="w-3 h-3" />
          </div>
          <span className="font-bold text-zinc-200 truncate">{title}</span>
        </div>
        {badgeText && (
          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/5 text-[8px] font-medium text-zinc-400 shrink-0">
            {badgeText}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[8px]">
        <span className="text-zinc-500 font-mono truncate max-w-[90px]">{subtext}</span>
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === "success" ? "bg-emerald-500" :
            status === "running" ? "bg-blue-500 animate-ping" :
            status === "paused" ? "bg-amber-500 animate-pulse" : "bg-zinc-700"
          }`} />
          <span className="font-bold text-zinc-400 uppercase tracking-wider">{statusText[status]}</span>
        </div>
      </div>
    </div>
  );
}

function ConnectionLine({
  d,
  active
}: {
  d: string;
  active: boolean;
}) {
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke="rgba(255,255,255,0.02)"
        strokeWidth="3"
      />
      <path
        d={d}
        fill="none"
        stroke={active ? "#8B5CF6" : "rgba(255,255,255,0.06)"}
        strokeWidth="1.5"
        className={active ? "connector-active" : ""}
        style={{
          transition: "stroke 0.3s ease"
        }}
      />
    </>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Playground simulation states
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0); // 0=idle, 1=trigger, 2=llm, 3=conditional, 4=approval, 5=http, 6=db/complete
  const [selectedWorkflow, setSelectedWorkflow] = useState("refund");
  const [logs, setLogs] = useState<string[]>([]);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Monitor scroll for header background
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 40) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Sign out handler
  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Successfully signed out");
      router.refresh();
    } catch {
      toast.error("Failed to sign out");
    }
  };

  // Run workflow simulation
  const startSimulation = () => {
    if (simulating) return;
    setSimulating(true);
    setAwaitingApproval(false);
    setSimStep(1);

    if (selectedWorkflow === "refund") {
      setLogs([
        "[Engine] ⚡ Workflow Run #WR-84091 started via Webhook Trigger.",
        "[Trigger] Inbound payload received:\n  {\n    \"event\": \"refund.request\",\n    \"customer_id\": \"cust_8820\",\n    \"amount\": 650.00,\n    \"reason\": \"Item arrived damaged\"\n  }",
        "[Trigger] Quota checked. 2,410 / 10,000 monthly executions used. Check successful."
      ]);

      // Step 2: LLM Call
      setTimeout(() => {
        setSimStep(2);
        setLogs(prev => [
          ...prev,
          "[Engine] Calling Node 'Analyze Request' (LLM Step)...",
          `[LLM Call] Routed to Groq (llama-3.3-70b-versatile). Attempt 1 of 3.`,
          `[LLM Call] Prompt parsed. Analyzing customer sentiment and history...`,
          `[LLM Call] Response (245ms): {\n  \"risk_score\": 0.12,\n  \"sentiment\": \"frustrated\",\n  \"auto_approve_eligible\": true\n}`
        ]);
      }, 2000);

      // Step 3: Conditional Branch
      setTimeout(() => {
        setSimStep(3);
        setLogs(prev => [
          ...prev,
          "[Engine] Calling Node 'Verify Amount' (Conditional Branch)...",
          "[Conditional] Evaluating expression: `{{analyze_request.output.amount}} > 500`",
          "[Conditional] Result: true (Refund amount $650.00 exceeds standard automatic limit $500)"
        ]);
      }, 4200);

      // Step 4: Approval Gate (Human in the loop)
      setTimeout(() => {
        setSimStep(4);
        setLogs(prev => [
          ...prev,
          "[Engine] Calling Node 'Owner Approval Gate' (Approval Step)...",
          "[Approval] Workflow status changed to 'PAUSED'. Human validation required.",
          "[Approval] Dispatched approval notification email to Rakshith (owner-a@demo.com)...",
          "[System] Waiting for external approval input..."
        ]);
        setAwaitingApproval(true);
      }, 6200);

    } else {
      // Lead Router Workflow
      setLogs([
        "[Engine] ⚡ Workflow Run #WR-84092 started via Webhook Trigger.",
        "[Trigger] Inbound lead payload received:\n  {\n    \"name\": \"Jane Doe\",\n    \"email\": \"jane@enterprise.com\",\n    \"company_size\": \"500+\",\n    \"role\": \"VP of Engineering\"\n  }",
        "[Trigger] Quota check passed."
      ]);

      // Step 2: LLM Call
      setTimeout(() => {
        setSimStep(2);
        setLogs(prev => [
          ...prev,
          "[Engine] Calling Node 'Intent Classifier' (LLM Step)...",
          `[LLM Call] Routed to Groq (llama-3.3-70b-versatile). Response (180ms): {\n  \"intent\": \"enterprise_trial\",\n  \"assigned_priority\": \"high\"\n}`
        ]);
      }, 2000);

      // Step 3: Conditional Branch
      setTimeout(() => {
        setSimStep(3);
        setLogs(prev => [
          ...prev,
          "[Engine] Calling Node 'Check Domain & Title' (Conditional Branch)...",
          "[Conditional] Evaluating: `company_size >= 100 && priority === 'high'`",
          "[Conditional] Result: true (Lead satisfies enterprise parameters)"
        ]);
      }, 4200);

      // Step 4: Approval Gate
      setTimeout(() => {
        setSimStep(4);
        setLogs(prev => [
          ...prev,
          "[Engine] Calling Node 'Enterprise SDR Review' (Approval Step)...",
          "[Approval] Workflow status changed to 'PAUSED'. Direct approval required to provision dedicated sandbox.",
          "[System] Waiting for external approval input..."
        ]);
        setAwaitingApproval(true);
      }, 6200);
    }
  };

  // User clicked "Approve" inside simulator
  const handleApproveSimStep = () => {
    if (!awaitingApproval) return;
    setAwaitingApproval(false);
    setSimStep(5);
    setLogs(prev => [
      ...prev,
      "[Approval] Approval input received: 'APPROVED' by user Rakshith H N.",
      "[Approval] Workflow status changed to 'RUNNING'. Resuming execution...",
      "[Engine] Calling Node 'Trigger SLA Integration' (HTTP Request)...",
      "[HTTP Request] POST https://api.flowforge-integrations.com/provision_sandbox... 200 OK (320ms)"
    ]);

    // Step 6: Database Write / Completion
    setTimeout(() => {
      setSimStep(6);
      setLogs(prev => [
        ...prev,
        "[Engine] Calling Node 'Log Status' (Database Write)...",
        "[Database Write] Inserting row in `organization_logs` table (RLS scope validated).",
        "[Engine] Workflow Run #WR-8409 completed successfully. Status: 'completed'. Duration: 4.8s total active time."
      ]);
      setSimulating(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#020205] text-white selection:bg-purple-600 selection:text-white font-sans antialiased overflow-x-hidden">
      {/* Glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-radial-top opacity-30 pointer-events-none z-10" />

      {/* HEADER / NAVBAR */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#09090b]/80 backdrop-blur-md border-b border-white/5 py-4"
            : "bg-transparent py-6"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                FlowForge
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8 bg-zinc-900/40 border border-white/5 rounded-full px-6 py-2 backdrop-blur-md">
            <Link href="#features" className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
              Features
            </Link>
            <Link href="#value-chain" className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
              How it Works
            </Link>
            <Link href="#playground" className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
              Interactive Simulator
            </Link>
            <Link href="#bento" className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
              Design Pillars
            </Link>
            <Link href="https://github.com/rak123456805/Flowforge" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1">
              Github
              <ArrowUpRight className="w-3 h-3 text-zinc-500" />
            </Link>
          </nav>

          {/* Desktop Auth */}
          <div className="hidden md:flex items-center gap-4">
            {isLoading ? (
              <div className="w-8 h-8 rounded-full border border-white/10 border-t-purple-500 animate-spin" />
            ) : isAuthenticated && user ? (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1.5 text-sm font-semibold text-white px-5 py-2 rounded-full border border-white/10 hover:bg-white/5 transition-all"
                >
                  Dashboard
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-[#09090b] border-b border-white/5 px-6 py-6 space-y-4"
            >
              <div className="flex flex-col gap-4">
                <Link
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-medium"
                >
                  Features
                </Link>
                <Link
                  href="#value-chain"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-medium"
                >
                  How it Works
                </Link>
                <Link
                  href="#playground"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-medium"
                >
                  Interactive Simulator
                </Link>
                <Link
                  href="#bento"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-medium"
                >
                  Design Pillars
                </Link>
              </div>

              <div className="border-t border-white/5 pt-4 flex flex-col gap-3">
                {isAuthenticated && user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full text-center text-sm font-semibold text-white px-5 py-2.5 rounded-full border border-white/10 hover:bg-white/5 transition-all"
                    >
                      Dashboard
                    </Link>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleSignOut();
                      }}
                      className="w-full text-center text-sm font-semibold text-zinc-400 hover:text-zinc-200 py-2 cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center text-sm font-semibold text-zinc-400 hover:text-zinc-200 py-2"
                  >
                    Sign In
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* HERO SECTION */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background Video */}
        <div className="absolute inset-0 z-0">
          <video
            className="w-full h-full object-cover opacity-20"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260510_060007_60275ce7-030c-4668-a160-8f364ec537d3.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020205] via-[#020205]/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#020205]/50 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center mt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase border border-purple-500/20 bg-purple-500/5 text-purple-300 inline-block mb-6">
              ⚙️ Visual Agent Orchestration
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-4xl md:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]"
          >
            Orchestrate custom{" "}
            <span className="block mt-2 bg-gradient-to-r from-[#A78BFA] via-[#EC4899] to-[#8B5CF6] bg-clip-text text-transparent animate-pulse">
              AI Agent
            </span>{" "}
            workflows visually.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg md:text-xl text-zinc-300 mb-12 max-w-3xl mx-auto font-medium"
          >
            A visual pipeline builder to connect LLMs, HTTP integrations, conditional branch routing, and human-in-the-loop approval gates. Secure, fast, and multi-tenant.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link
              href="#playground"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-semibold bg-white text-black hover:bg-zinc-200 hover:scale-103 active:scale-97 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
            >
              Try simulator
              <Play className="w-4 h-4 fill-current" />
            </Link>
            <Link
              href={isAuthenticated ? "/dashboard" : "/register"}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-semibold text-white bg-zinc-900 border border-white/10 hover:bg-zinc-800 hover:border-white/20 hover:scale-103 active:scale-97 transition-all"
            >
              {isAuthenticated ? "Go to Dashboard" : "Start Building Free"}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="mt-16 relative mx-auto max-w-4xl rounded-2xl border border-white/10 bg-zinc-950/80 p-2 shadow-2xl shadow-purple-500/10 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-purple-500/10 to-transparent pointer-events-none" />
            <img
              src="/flowforge_hero_canvas.png"
              alt="FlowForge Visual Workflow Builder Canvas Screenshot"
              className="rounded-xl w-full h-auto object-cover border border-white/5 shadow-2xl"
            />
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS DIAGRAM */}
      <section id="value-chain" className="py-24 max-w-7xl mx-auto px-6 border-t border-white/5 relative">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Visual Pipeline execution
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Design flows in a visual node canvas. The engine handles retries, variable bindings, and data security.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative items-center">
          {/* Triggers */}
          <div className="glass rounded-3xl p-8 border border-white/5 flex flex-col items-center text-center relative z-10 hover:border-purple-500/20 transition-all duration-300">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-6">
              <Network className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">1. Event Triggers</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Start workflows manually via the dashboard or trigger dynamically from external systems using incoming HTTP webhook API calls.
            </p>
          </div>

          {/* Execution Nodes */}
          <div className="glass rounded-3xl p-8 border border-purple-500/30 shadow-[0_0_30px_rgba(139,92,246,0.15)] flex flex-col items-center text-center relative z-10 scale-102 hover:border-purple-400/50 transition-all duration-300">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white mb-6">
              <Cpu className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">2. Execution Engine</h3>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Process steps sequentially. Resolve variables from prior steps, call LLMs, make external REST requests, and evaluate conditional JS branches.
            </p>
          </div>

          {/* Human Verification */}
          <div className="glass rounded-3xl p-8 border border-white/5 flex flex-col items-center text-center relative z-10 hover:border-purple-500/20 transition-all duration-300">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
              <Shield className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">3. Human in the Loop</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Pause runs on sensitive operations (e.g. database updates or massive notifications) until authenticated owners/editors approve step inputs.
            </p>
          </div>
        </div>
      </section>

      {/* INTERACTIVE WORKFLOW SANDBOX */}
      <section id="playground" className="py-24 bg-[#050409] border-t border-white/5 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              Interactive Workflow Sandbox
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              Launch a demo run of our visual orchestrator. Watch how steps execute in 2D space, transition states, and how the human-in-the-loop approval gate halts and resumes execution.
            </p>
          </div>

          {/* VISUAL CANVAS CONTAINER */}
          <div className="glass rounded-3xl p-6 border border-white/5 overflow-x-auto relative mb-8 shadow-2xl shadow-purple-950/20 bg-[#07060f]/90">
            {/* Header toolbar */}
            <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <Workflow className="w-5 h-5 text-purple-400" />
                <span className="text-sm font-bold text-zinc-200">
                  {selectedWorkflow === "refund" ? "Customer Refund Automator" : "Enterprise Lead Router"}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] font-semibold text-purple-400">
                  Visual Canvas
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 font-mono">Zoom: 100%</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Canvas Ready</span>
              </div>
            </div>

            {/* Scrollable node canvas */}
            <div className="relative min-w-[850px] h-[380px] bg-[#09090e]/40 border border-white/5 rounded-2xl overflow-hidden p-2 select-none">
              {/* SVG connection lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                {/* 1. Webhook -> Extract */}
                <ConnectionLine
                  d="M 190 72.5 L 240 72.5"
                  active={simStep >= 2}
                />
                {/* 2. Extract -> Llama 3 Agent */}
                <ConnectionLine
                  d="M 410 72.5 C 470 72.5, 20 242.5, 80 242.5"
                  active={simStep >= 3}
                />
                {/* 3. Llama 3 -> Conditional */}
                <ConnectionLine
                  d="M 250 242.5 L 310 242.5"
                  active={simStep >= 4}
                />
                {/* 4. Conditional -> Slack (Branch 1) */}
                <ConnectionLine
                  d="M 480 227.5 C 510 227.5, 530 52.5, 560 52.5"
                  active={selectedWorkflow === "lead" && simStep >= 5}
                />
                {/* 5. Conditional -> CRM (Branch 1) */}
                <ConnectionLine
                  d="M 480 227.5 C 510 227.5, 530 142.5, 560 142.5"
                  active={selectedWorkflow === "lead" && simStep >= 5}
                />
                {/* 6. Conditional -> Email (Branch 2) */}
                <ConnectionLine
                  d="M 480 257.5 C 510 257.5, 530 232.5, 560 232.5"
                  active={selectedWorkflow === "refund" && (simStep >= 5 || (simStep === 4 && awaitingApproval))}
                />
                {/* 7. Conditional -> Log (Branch 2) */}
                <ConnectionLine
                  d="M 480 257.5 C 510 257.5, 530 322.5, 560 322.5"
                  active={selectedWorkflow === "refund" && simStep >= 6}
                />
              </svg>

              {/* absolute positioned nodes */}
              
              {/* Webhook Trigger */}
              <div className="absolute" style={{ left: "20px", top: "40px" }}>
                <NodeCard
                  title="Webhook Trigger"
                  subtext={simStep >= 2 ? "Success (0.1s)" : simStep === 1 ? "Listening..." : "Trigger Port"}
                  icon={Zap}
                  status={simStep === 1 ? "running" : simStep >= 2 ? "success" : "idle"}
                  colorClass="purple"
                  badgeText="Webhook"
                />
              </div>

              {/* Extract Content */}
              <div className="absolute" style={{ left: "240px", top: "40px" }}>
                <NodeCard
                  title="Extract Content"
                  subtext={simStep >= 3 ? "Success (1.2s)" : simStep === 2 ? "Extracting..." : "JSON payload"}
                  icon={Layers}
                  status={simStep === 2 ? "running" : simStep >= 3 ? "success" : "idle"}
                  colorClass="green"
                  badgeText="Logic"
                />
              </div>

              {/* Llama 3 Agent */}
              <div className="absolute" style={{ left: "80px", top: "210px" }}>
                <NodeCard
                  title="Llama 3 Agent"
                  subtext={simStep >= 4 ? "Success (245ms)" : simStep === 3 ? "Analyzing intent..." : "LLM Inference"}
                  icon={Cpu}
                  status={simStep === 3 ? "running" : simStep >= 4 ? "success" : "idle"}
                  colorClass="blue"
                  badgeText="Agent"
                />
              </div>

              {/* Conditional Branch */}
              <div className="absolute" style={{ left: "310px", top: "210px" }}>
                <NodeCard
                  title="Conditional Branch"
                  subtext={simStep >= 5 ? "Split evaluated" : "Check amount"}
                  icon={Network}
                  status={simStep === 4 && !awaitingApproval ? "running" : simStep >= 5 ? "success" : "idle"}
                  colorClass="purple"
                  badgeText="Branch"
                />
              </div>

              {/* branch tags */}
              <div className="absolute font-semibold text-[8px] tracking-wider uppercase text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded" style={{ left: "490px", top: "110px" }}>
                Branch 1
              </div>
              <div className="absolute font-semibold text-[8px] tracking-wider uppercase text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded" style={{ left: "490px", top: "280px" }}>
                Branch 2
              </div>

              {/* STACK COLUMN (Nodes 5, 6, 7, 8) */}

              {/* Slack Notification (Branch 1) */}
              <div className="absolute transition-opacity duration-300" style={{ left: "580px", top: "20px", opacity: selectedWorkflow === "lead" ? 1 : 0.2 }}>
                <NodeCard
                  title="Slack Notification"
                  subtext={selectedWorkflow === "lead" && simStep >= 6 ? "Success" : "#urgent-channel"}
                  icon={Terminal}
                  status={selectedWorkflow === "lead" && simStep === 5 ? "running" : selectedWorkflow === "lead" && simStep >= 6 ? "success" : "idle"}
                  colorClass="pink"
                  badgeText="Action"
                />
              </div>

              {/* Save to CRM (Branch 1) */}
              <div className="absolute transition-opacity duration-300" style={{ left: "580px", top: "110px", opacity: selectedWorkflow === "lead" ? 1 : 0.2 }}>
                <NodeCard
                  title="Save to CRM"
                  subtext={selectedWorkflow === "lead" && simStep >= 6 ? "Success" : "Database write"}
                  icon={Database}
                  status={selectedWorkflow === "lead" && simStep === 5 ? "running" : selectedWorkflow === "lead" && simStep >= 6 ? "success" : "idle"}
                  colorClass="blue"
                  badgeText="DB"
                />
              </div>

              {/* Email Auto-Reply (Branch 2) */}
              <div className="absolute transition-opacity duration-300" style={{ left: "580px", top: "200px", opacity: selectedWorkflow === "refund" ? 1 : 0.2 }}>
                <NodeCard
                  title="Email Auto-Reply"
                  subtext={selectedWorkflow === "refund" && simStep >= 5 ? "Approved" : selectedWorkflow === "refund" && simStep === 4 && awaitingApproval ? "Paused" : "Standard Response"}
                  icon={Phone}
                  status={selectedWorkflow === "refund" && simStep === 4 && awaitingApproval ? "paused" : selectedWorkflow === "refund" && simStep >= 5 ? "success" : "idle"}
                  colorClass="orange"
                  badgeText={selectedWorkflow === "refund" && simStep === 4 && awaitingApproval ? "Awaiting" : undefined}
                />
              </div>

              {/* Log Issue (Branch 2) */}
              <div className="absolute transition-opacity duration-300" style={{ left: "580px", top: "290px", opacity: selectedWorkflow === "refund" ? 1 : 0.2 }}>
                <NodeCard
                  title="Log Issue"
                  subtext={selectedWorkflow === "refund" && simStep >= 6 ? "Success" : "DB Update"}
                  icon={Activity}
                  status={selectedWorkflow === "refund" && simStep === 5 ? "running" : selectedWorkflow === "refund" && simStep >= 6 ? "success" : "idle"}
                  colorClass="green"
                  badgeText="DB"
                />
              </div>

            </div>
          </div>

          {/* CONSOLE AND CONTROLS SUB-GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Terminal Log Console */}
            <div className="lg:col-span-8 flex flex-col">
              <div className="glass rounded-3xl border border-white/5 overflow-hidden flex flex-col flex-grow min-h-[350px] shadow-2xl bg-zinc-950/40">
                {/* Console header */}
                <div className="bg-zinc-950/60 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-zinc-300">Live Execution Logs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${simulating ? "bg-purple-500 animate-pulse" : "bg-zinc-600"}`} />
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                      {simulating ? "Engine Running" : "Engine Idle"}
                    </span>
                  </div>
                </div>

                {/* Console Output */}
                <div
                  ref={logContainerRef}
                  className="flex-grow p-6 bg-zinc-950/20 font-mono text-xs overflow-y-auto space-y-3 max-h-[350px]"
                >
                  {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center flex-col text-zinc-600 gap-2 min-h-[220px]">
                      <Terminal className="w-8 h-8 opacity-20" />
                      <p className="text-xs">Click &quot;Run Workflow&quot; to test the visual orchestrator execution</p>
                    </div>
                  ) : (
                    logs.map((log, index) => {
                      let color = "text-zinc-400";
                      if (log.startsWith("[Engine]")) color = "text-purple-300 font-semibold";
                      if (log.startsWith("[Trigger]")) color = "text-blue-400";
                      if (log.startsWith("[LLM Call]")) color = "text-pink-400";
                      if (log.startsWith("[Conditional]")) color = "text-yellow-400";
                      if (log.startsWith("[Approval]")) color = "text-amber-400 font-semibold";
                      if (log.startsWith("[Database Write]")) color = "text-emerald-400";
                      if (log.startsWith("[HTTP Request]")) color = "text-teal-400";

                      return (
                        <div key={index} className={`leading-relaxed border-l-2 border-transparent pl-2 ${color}`}>
                          {log}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Controls Panel & Human Approval Dialog */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-6">
              <div className="glass rounded-3xl p-6 border border-white/5 flex flex-col justify-between flex-grow bg-zinc-950/20">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Settings className="w-4 h-4 text-purple-400" />
                    Simulator Controls
                  </h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Choose one of the presets and trigger the run. Watch how steps in the canvas respond to real-time status transitions.
                  </p>

                  <div className="space-y-2 border-t border-white/5 pt-4">
                    <span className="block text-[10px] font-medium text-zinc-500">Selected Workflow Preset:</span>
                    <div className="px-3 py-2 bg-zinc-900 border border-white/5 rounded-lg text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                      {selectedWorkflow === "refund" ? "Refund Automator" : "Enterprise Lead Router"}
                    </div>
                  </div>
                </div>

                <div className="mt-8 space-y-4">
                  <button
                    onClick={startSimulation}
                    disabled={simulating}
                    className="w-full btn-primary justify-center py-3.5 rounded-xl hover:scale-102 active:scale-98 cursor-pointer disabled:opacity-50 text-xs font-bold"
                  >
                    {simulating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-purple-300" />
                        Running Pipeline...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        Run Workflow
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* HUMAN APPROVAL POPUP */}
              <AnimatePresence>
                {awaitingApproval && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass border border-amber-500/30 rounded-3xl p-5 bg-amber-500/5 shadow-[0_4px_30px_rgba(245,158,11,0.15)] flex flex-col gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                        <AlertCircle className="w-4 h-4 animate-pulse" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-100">Action Awaiting Owner Approval</div>
                        <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
                          {selectedWorkflow === "refund"
                            ? "Action 'Refund payout' (Amount: $650.00) exceeds automatic thresholds."
                            : "Action 'Provision enterprise sandbox' requires direct approval."}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleApproveSimStep}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black cursor-pointer transition-all"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        Approve Step Run
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* BENTO GRID (CORE PILLARS) */}
      <section id="bento" className="py-24 max-w-7xl mx-auto px-6 border-t border-white/5 relative">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Engineered for Precision Workflows
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            A secure, multi-tenant visual orchestrator built on PostgreSQL, Hasura, and Groq to bring reliability to AI pipelines.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Visual Canvas */}
          <div className="glass glass-hover rounded-3xl p-8 border border-white/5 group relative overflow-hidden transition-all duration-300 min-h-[300px] flex flex-col justify-between">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Workflow className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Visual Node Canvas</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Connect steps visually. Chain custom LLM triggers, condition loops, Slack notifications, databases, and dynamic payload templates without complex setups.
              </p>
            </div>
          </div>

          {/* Human-in-the-Loop */}
          <div className="glass glass-hover rounded-3xl p-8 border border-white/5 group relative overflow-hidden transition-all duration-300 min-h-[300px] flex flex-col justify-between">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Human Approval Gates</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Secure sensitive steps in your pipeline. Halts workflow execution mid-run, saving state, and notifies administrators to approve before completing.
              </p>
            </div>
          </div>

          {/* Org Scoping */}
          <div className="glass glass-hover rounded-3xl p-8 border border-purple-500/25 shadow-[0_0_20px_rgba(139,92,246,0.05)] group relative overflow-hidden transition-all duration-300 min-h-[300px] flex flex-col justify-between">
            <div className="w-12 h-12 rounded-xl bg-purple-600/25 flex items-center justify-center text-purple-300">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Multi-tenant Scoping</h3>
              <p className="text-zinc-300 text-sm leading-relaxed">
                Separate teams and workspaces cleanly. The system restricts workflow variables, inputs, runs, and databases using PostgreSQL RLS joins.
              </p>
            </div>
          </div>

          {/* GraphQL Streams */}
          <div className="glass glass-hover rounded-3xl p-8 border border-white/5 group relative overflow-hidden transition-all duration-300 min-h-[300px] flex flex-col justify-between md:col-span-2">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Live Status Streams</h3>
              <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
                Observe steps run in real time. Powered by Hasura GraphQL subscriptions over websockets, the visual canvas renders active node outputs, delays, and error triggers instantly.
              </p>
            </div>
          </div>

          {/* Quotas & Usage */}
          <div className="glass glass-hover rounded-3xl p-8 border border-white/5 group relative overflow-hidden transition-all duration-300 min-h-[300px] flex flex-col justify-between">
            <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Usage Quota Gating</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Track run volumes and compute. Enforces organization limits at the PostgreSQL check-constraint level to prevent run credit overdraws.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CORE PLATFORM FEATURES GRID */}
      <section id="features" className="py-24 max-w-7xl mx-auto px-6 border-t border-white/5 relative">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Reliable. Secure. Scalable.
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Everything needed to design, run, and scale AI-driven multi-agent workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: <Cpu className="w-5 h-5" />,
              title: "Llama 3 & Groq Inference",
              desc: "Integrate LLM calls running on ultra-fast Groq servers. Prompt variables are resolved dynamically from prior steps."
            },
            {
              icon: <Layers className="w-5 h-5" />,
              title: "Durable State Engine",
              desc: "Run state is fully written in PostgreSQL. If functions restart mid-run, execution picks up precisely from the paused step."
            },
            {
              icon: <Database className="w-5 h-5" />,
              title: "Database Writes",
              desc: "Owner-scoped nodes can perform database inserts/mutations directly in the target database workspace."
            },
            {
              icon: <Network className="w-5 h-5" />,
              title: "Conditional Routing",
              desc: "Write standard JS expressions to route flows through branches. Evaluations are run inside isolated sandbox functions."
            },
            {
              icon: <Activity className="w-5 h-5" />,
              title: "Webhook Integrations",
              desc: "Expose secure trigger endpoints. Secure webhook triggers using custom API tokens to safely initiate flows."
            },
            {
              icon: <Shield className="w-5 h-5" />,
              title: "Layered Access Scoping",
              desc: "Stateless RLS policies prevent viewers from altering pipelines, and the execution engine validates roles dynamically at runtime."
            }
          ].map((feat, idx) => (
            <div
              key={idx}
              className="glass p-6 rounded-2xl border border-white/5 hover:border-purple-500/20 hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 mb-5">
                {feat.icon}
              </div>
              <h4 className="text-lg font-bold text-white mb-2">{feat.title}</h4>
              <p className="text-zinc-400 text-sm leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TECH STACK & ARCHITECTURE LOGOS */}
      <section className="py-20 border-t border-white/5 bg-[#020205]/40">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h3 className="text-2xl md:text-3xl font-bold mb-4">FlowForge Tech Stack</h3>
          <p className="text-zinc-400 max-w-2xl mx-auto mb-12 text-sm md:text-base">
            FlowForge is built with enterprise technologies that ensure database security, speed, and real-time responsiveness.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 justify-items-center justify-center items-center">
            {[
              { text: "Nhost", badge: "Auth & Backend" },
              { text: "Hasura", badge: "GraphQL Engine" },
              { text: "PostgreSQL", badge: "RLS Database" },
              { text: "GraphQL WS", badge: "Live Subscriptions" },
              { text: "Next.js 14", badge: "App Router" },
              { text: "Groq SDK", badge: "Llama 3 Inference" }
            ].map((badge, idx) => (
              <div
                key={idx}
                className="w-32 h-32 rounded-2xl bg-white border border-zinc-200 shadow-lg shadow-black/10 flex flex-col items-center justify-center p-3 hover:scale-105 hover:shadow-xl transition-all duration-300"
              >
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 font-bold text-xs mb-2">
                  ✓
                </div>
                <span className="text-[11px] font-extrabold text-zinc-800 text-center leading-tight uppercase">
                  {badge.text}
                </span>
                <span className="text-[9px] text-zinc-500 mt-1 font-medium">
                  {badge.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative bg-[#020205] border-t border-white/5 pt-20 pb-12 overflow-hidden">
        {/* Glow */}
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-900/10 rounded-full blur-3xl translate-x-32 translate-y-32 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-6 gap-10 mb-16">
          <div className="col-span-2 space-y-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center">
                <Zap className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">FlowForge</span>
            </Link>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
              The production-ready AI Agent Workflow Orchestrator. Build visual pipelines connecting LLMs, conditional gates, and APIs.
            </p>
          </div>

          <div>
            <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Platform</h5>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#features" className="text-zinc-400 hover:text-white transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#value-chain" className="text-zinc-400 hover:text-white transition-colors">
                  How it Works
                </Link>
              </li>
              <li>
                <Link href="#playground" className="text-zinc-400 hover:text-white transition-colors">
                  Interactive Sandbox
                </Link>
              </li>
              <li>
                <Link href="#bento" className="text-zinc-400 hover:text-white transition-colors">
                  Design Pillars
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Resources</h5>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="https://github.com/rak123456805/Flowforge" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors">
                  Github Codebase
                </Link>
              </li>
              <li>
                <span className="text-zinc-500">API Documentation</span>
              </li>
              <li>
                <span className="text-zinc-500">Usage Guides</span>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Integrations</h5>
            <ul className="space-y-2 text-sm">
              <li>
                <span className="text-zinc-500">Groq AI</span>
              </li>
              <li>
                <span className="text-zinc-500">Slack Webhooks</span>
              </li>
              <li>
                <span className="text-zinc-500">PostgreSQL DB</span>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Portal</h5>
            <ul className="space-y-2 text-sm">
              {isAuthenticated ? (
                <>
                  <li>
                    <Link href="/dashboard" className="text-zinc-400 hover:text-white transition-colors">
                      Go to Dashboard
                    </Link>
                  </li>
                  <li>
                    <button onClick={handleSignOut} className="text-zinc-400 hover:text-white transition-colors text-left cursor-pointer">
                      Sign Out
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link href="/login" className="text-zinc-400 hover:text-white transition-colors">
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="text-zinc-400 hover:text-white transition-colors">
                      Start Building
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-500">
          <span>© {new Date().getFullYear()} FlowForge. Open source MIT license.</span>
          <div className="flex gap-6 mt-4 md:mt-0">
            <span className="hover:text-zinc-400 cursor-pointer">Terms of Service</span>
            <span className="hover:text-zinc-400 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-zinc-400 cursor-pointer">SLA Agreement</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
