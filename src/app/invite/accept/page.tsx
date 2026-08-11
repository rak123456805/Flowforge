"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { nhost } from "@/lib/nhost";
import { CheckCircle2, XCircle, Loader2, Building2, LogIn, ShieldCheck } from "lucide-react";

type State =
  | { phase: "loading" }
  | { phase: "unauthenticated" }
  | { phase: "accepting" }
  | { phase: "success"; orgName: string; role: string; orgId: string }
  | { phase: "error"; message: string };

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ phase: "error", message: "No invitation token found in the URL." });
      return;
    }

    const session = nhost.auth.getSession();

    if (!session?.accessToken) {
      // Not logged in — save token and redirect to auth
      if (typeof window !== "undefined") {
        sessionStorage.setItem("pending_invite_token", token);
      }
      setState({ phase: "unauthenticated" });
      return;
    }

    // User is logged in — try to accept the invitation
    acceptInvitation(token, session.accessToken);
  }, [token]);

  async function acceptInvitation(inviteToken: string, accessToken: string) {
    setState({ phase: "accepting" });
    try {
      const res = await fetch("/api/orgs/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken, accessToken }),
      });
      const data = await res.json() as {
        message?: string; error?: string;
        orgId?: string; orgName?: string; role?: string;
      };
      if (!res.ok) {
        setState({ phase: "error", message: data.error ?? "Failed to accept invitation." });
      } else {
        setState({
          phase: "success",
          orgName: data.orgName ?? "your organization",
          role: data.role ?? "member",
          orgId: data.orgId ?? "",
        });
        // Redirect to dashboard after 2s
        setTimeout(() => router.push("/dashboard"), 2500);
      }
    } catch {
      setState({ phase: "error", message: "Network error. Please try again." });
    }
  }

  function handleLogin() {
    router.push(`/login?returnTo=/invite/accept?token=${token}`);
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {state.phase === "loading" || state.phase === "accepting" ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass rounded-2xl p-10 max-w-sm w-full text-center space-y-4"
          >
            <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto" />
            <h1 className="text-lg font-semibold text-zinc-200">
              {state.phase === "accepting" ? "Accepting invitation…" : "Loading…"}
            </h1>
            <p className="text-sm text-zinc-500">Please wait</p>
          </motion.div>
        ) : state.phase === "unauthenticated" ? (
          <motion.div
            key="unauth"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="glass rounded-2xl p-8 max-w-sm w-full space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-7 h-7 text-violet-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-100">You&apos;ve been invited!</h1>
              <p className="text-sm text-zinc-400">
                Sign in or create an account to accept this organization invitation.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-300 text-center">
                ⚠ Make sure to sign in with the <strong>same email address</strong> the invite was sent to.
              </p>
            </div>
            <button
              onClick={handleLogin}
              className="btn-primary w-full justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In / Sign Up
            </button>
          </motion.div>
        ) : state.phase === "success" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass rounded-2xl p-10 max-w-sm w-full text-center space-y-5"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
              className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto"
            >
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </motion.div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-zinc-100">Welcome aboard!</h1>
              <p className="text-sm text-zinc-400">
                You&apos;ve joined{" "}
                <span className="text-zinc-200 font-semibold">{state.orgName}</span>{" "}
                as <span className="text-violet-400 font-semibold capitalize">{state.role}</span>.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Building2 className="w-3.5 h-3.5" />
              Redirecting to dashboard…
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="glass rounded-2xl p-10 max-w-sm w-full text-center space-y-5"
          >
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-rose-400" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-zinc-100">Invitation Failed</h1>
              <p className="text-sm text-zinc-400">{state.message}</p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="btn-secondary w-full justify-center"
            >
              Go to Dashboard
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-10 max-w-sm w-full text-center space-y-4">
            <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto" />
            <h1 className="text-lg font-semibold text-zinc-200">Loading invitation…</h1>
          </div>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
