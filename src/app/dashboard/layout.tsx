"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, OrgProvider, useOrg } from "@/components/providers/auth-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Loader2, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { nhost } from "@/lib/nhost";
import { toast } from "sonner";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { orgs, loading, refetch } = useOrg();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-[#09090b]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          <p className="text-sm text-zinc-500">Loading organization data…</p>
        </div>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch("/api/orgs/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create organization");
      } else {
        toast.success("Organization created successfully!");
        setName("");
        refetch();
        window.location.reload();
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (orgs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-dot-grid min-h-screen bg-[#09090b]">
        <div className="absolute inset-0 gradient-radial-top pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative glass max-w-md w-full p-8 rounded-2xl shadow-2xl shadow-black/50 space-y-6"
        >
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mx-auto text-violet-400">
              <Building2 className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">Create an Organization</h2>
            <p className="text-sm text-zinc-400">
              Organizations are where you build, run, and collaborate on your AI agent workflows.
            </p>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Organization Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My AI Agency"
                className="input-base"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="btn-primary w-full justify-center"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Organization
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          <p className="text-sm text-zinc-500">Loading organization…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  return (
    <OrgProvider userId={user.id}>
      <DashboardContent>
        <div className="min-h-screen bg-[#09090b] flex">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </DashboardContent>
    </OrgProvider>
  );
}
