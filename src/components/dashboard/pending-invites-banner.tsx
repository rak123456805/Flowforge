"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { nhost } from "@/lib/nhost";
import { useOrg } from "@/components/providers/auth-provider";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

interface PendingInvite {
  id: string;
  token: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  organization: { id: string; name: string };
}

export function PendingInvitesBanner() {
  const { refetch, setActiveOrg, orgs } = useOrg();
  const [invitations, setInvitations] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingToken, setProcessingToken] = useState<string | null>(null);

  const fetchPendingInvites = async () => {
    try {
      const token = nhost.auth.getAccessToken();
      if (!token) {
        setInvitations([]);
        return;
      }
      const res = await fetch("/api/orgs/invite/pending-for-me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { invitations?: PendingInvite[] };
        setInvitations(data.invitations ?? []);
      }
    } catch {
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingInvites();
  }, []);

  const handleAccept = async (inv: PendingInvite) => {
    setProcessingToken(inv.token);
    try {
      const accessToken = nhost.auth.getAccessToken();
      const res = await fetch("/api/orgs/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inv.token, accessToken }),
      });
      const data = (await res.json()) as { message?: string; error?: string; orgId?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to accept invitation");
      } else {
        toast.success(data.message ?? `Joined ${inv.organization.name}!`);
        setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
        refetch();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setProcessingToken(null);
    }
  };

  const handleDecline = async (inv: PendingInvite) => {
    setProcessingToken(inv.token);
    try {
      const accessToken = nhost.auth.getAccessToken();
      const res = await fetch("/api/orgs/invite/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inv.token, accessToken }),
      });
      if (!res.ok) {
        toast.error("Failed to decline invitation");
      } else {
        toast.info(`Declined invitation to ${inv.organization.name}`);
        setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      }
    } catch {
      toast.error("Network error");
    } finally {
      setProcessingToken(null);
    }
  };

  if (loading || invitations.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      <AnimatePresence>
        {invitations.map((inv) => (
          <motion.div
            key={inv.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 rounded-xl glass border border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-purple-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-violet-500/5"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-violet-300" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 truncate">
                  Invitation to join <span className="text-violet-300 font-bold">{inv.organization.name}</span>
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  You&apos;ve been invited to collaborate as a{" "}
                  <span className="capitalize font-semibold text-zinc-200">{inv.role}</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
              <button
                onClick={() => handleDecline(inv)}
                disabled={processingToken === inv.token}
                className="btn-secondary px-3 py-1.5 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                {processingToken === inv.token ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Decline"}
              </button>
              <button
                onClick={() => handleAccept(inv)}
                disabled={processingToken === inv.token}
                className="btn-primary px-4 py-1.5 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/30"
              >
                {processingToken === inv.token ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Accept Invite
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
