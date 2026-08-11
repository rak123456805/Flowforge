"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Check,
  LogOut,
  User,
  Building2,
  AlertTriangle,
  Plus,
  Loader2,
} from "lucide-react";
import { useAuth, useOrg } from "@/components/providers/auth-provider";
import { useSubscription } from "@apollo/client";
import { SUBSCRIBE_ORG_QUOTA } from "@/lib/graphql";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Organization } from "@/lib/types";
import { nhost } from "@/lib/nhost";

function QuotaBar({ orgId }: { orgId: string }) {
  const { data } = useSubscription(SUBSCRIBE_ORG_QUOTA, {
    variables: { orgId },
    skip: !orgId,
  });

  const org = data?.organization;
  const pct = org?.monthly_usage_percentage ?? 0;
  const used = org?.current_month_usage ?? 0;
  const max = org?.max_quota_per_month ?? 100;

  const color =
    pct >= 100
      ? "bg-rose-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";

  const textColor =
    pct >= 100
      ? "text-rose-400"
      : pct >= 80
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-zinc-500 whitespace-nowrap">
            Monthly quota
          </span>
          <span className={cn("text-xs font-mono font-medium", textColor)}>
            {used}/{max}
          </span>
        </div>
        <div className="w-32 h-1 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", color)}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(pct, 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
      {pct >= 80 && (
        <AlertTriangle
          className={cn("w-3.5 h-3.5 flex-shrink-0", textColor)}
        />
      )}
    </div>
  );
}

function OrgSwitcher() {
  const { orgs, activeOrg, activeRole, setActiveOrg, refetch } = useOrg();
  const [open, setOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch("/api/orgs/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create organization");
      } else {
        toast.success("Organization created!");
        setNewOrgName("");
        refetch();
        setOpen(false);
        window.location.reload();
      }
    } catch (err) {
      toast.error("Failed to create organization");
    } finally {
      setCreatingOrg(false);
    }
  };

  return (
    <div className="relative">
      <button
        id="org-switcher"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-sm"
      >
        <Building2 className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
        <span className="text-zinc-200 max-w-[140px] truncate">
          {activeOrg?.name ?? "Select org"}
        </span>
        <span
          className={cn(
            "badge text-[10px] ml-1",
            activeRole === "owner"
              ? "bg-violet-500/15 text-violet-400 border-violet-500/20"
              : activeRole === "editor"
                ? "bg-blue-500/15 text-blue-400 border-blue-500/20"
                : "bg-zinc-700/50 text-zinc-400 border-zinc-700"
          )}
        >
          {activeRole ?? "—"}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-zinc-500 flex-shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full mt-1.5 left-0 w-64 glass rounded-xl shadow-2xl shadow-black/50 border border-zinc-800 overflow-hidden z-20"
            >
              <div className="p-1">
                <p className="px-2 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Organizations
                </p>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {orgs.map((org: Organization) => (
                    <button
                      key={org.id}
                      onClick={() => {
                        setActiveOrg(org);
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate">
                          {org.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {org.current_month_usage}/{org.max_quota_per_month}{" "}
                          runs
                        </p>
                      </div>
                      {org.id === activeOrg?.id && (
                        <Check className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="border-t border-zinc-800/80 my-1" />
                <form onSubmit={handleCreateOrg} className="p-1 space-y-1">
                  <input
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="New organization name..."
                    className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 text-xs rounded text-zinc-200 focus:outline-none focus:border-violet-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="submit"
                    disabled={creatingOrg || !newOrgName.trim()}
                    className="w-full btn-primary justify-center text-[10px] py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {creatingOrg ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                    Create Organization
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    router.push("/");
  };

  return (
    <div className="relative">
      <button
        id="user-menu-btn"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
          {user?.displayName?.charAt(0) ?? user?.email?.charAt(0) ?? "U"}
        </div>
        <span className="text-sm text-zinc-300 max-w-[120px] truncate hidden md:block">
          {user?.displayName ?? user?.email}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-zinc-500 hidden md:block transition-transform",
            open && "rotate-180"
          )}
        />
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
              className="absolute top-full right-0 mt-1.5 w-56 glass rounded-xl shadow-2xl shadow-black/50 border border-zinc-800 overflow-hidden z-20"
            >
              <div className="p-3 border-b border-zinc-800">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {user?.displayName ?? "User"}
                </p>
                <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
              </div>
              <div className="p-1">
                <Link
                  href="/dashboard/profile"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-sm text-zinc-400 hover:text-zinc-200"
                >
                  <User className="w-4 h-4" /> Profile
                </Link>
                <button
                  id="sign-out-btn"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-rose-500/10 transition-colors text-sm text-zinc-400 hover:text-rose-400"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header() {
  const { activeOrg } = useOrg();

  return (
    <header className="h-14 flex items-center gap-3 px-4 border-b border-zinc-800/60 bg-zinc-950/60 backdrop-blur-xl flex-shrink-0">
      <div className="flex-1 flex items-center gap-3">
        <OrgSwitcher />
        {activeOrg && <QuotaBar orgId={activeOrg.id} />}
      </div>
      <UserMenu />
    </header>
  );
}
