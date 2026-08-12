"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOrg } from "@/components/providers/auth-provider";
import { useQuery, useMutation, useApolloClient } from "@apollo/client";
import {
  GET_ORG_MEMBERS,
  GET_ORG_WORKFLOWS,
  REMOVE_ORG_MEMBER,
  UPDATE_ORG_MEMBER_ROLE,
} from "@/lib/graphql";
import { toast } from "sonner";
import {
  Loader2, Trash2, Shield, Users, Mail, Send, X,
  Clock, CheckCircle2, Crown, Pencil, Eye, RefreshCw,
  Lock, Globe, List, ChevronDown, ChevronUp,
} from "lucide-react";
import type { OrgMember, UserRole, Workflow } from "@/lib/types";
import { nhost } from "@/lib/nhost";

import { PendingInvitesBanner } from "@/components/dashboard/pending-invites-banner";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  token: string;
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="w-3 h-3 text-amber-400" />,
  editor: <Pencil className="w-3 h-3 text-violet-400" />,
  viewer: <Eye className="w-3 h-3 text-zinc-400" />,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  editor: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  viewer: "text-zinc-400 bg-zinc-800 border-zinc-700",
};

const VISIBILITY_OPTIONS = [
  { value: "all", label: "All Members", icon: <Globe className="w-3.5 h-3.5 text-emerald-400" />, desc: "Every org member can see this workflow" },
  { value: "owners_only", label: "Owners Only", icon: <Lock className="w-3.5 h-3.5 text-amber-400" />, desc: "Only owners can see this workflow" },
  { value: "allowlist", label: "Specific Members", icon: <List className="w-3.5 h-3.5 text-violet-400" />, desc: "Choose which members can access this workflow" },
] as const;

// ── Access icon ───────────────────────────────────────────────────────────────
function accessColor(access: string) {
  if (access === "edit") return "text-violet-400";
  if (access === "view") return "text-emerald-400";
  return "text-zinc-600";
}

// ── Workflow Access Panel ─────────────────────────────────────────────────────
function WorkflowAccessPanel({
  workflow,
  members,
  myUserId,
  onClose,
  onSaved,
}: {
  workflow: Workflow;
  members: OrgMember[];
  myUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [visibility, setVisibility] = useState<Workflow["visibility"]>(
    workflow.visibility ?? "all"
  );
  const [memberAccess, setMemberAccess] = useState<Record<string, "view" | "edit" | "none">>(() => {
    const m: Record<string, "view" | "edit" | "none"> = {};
    (workflow.workflow_accesses ?? []).forEach((a) => { m[a.user_id] = a.access; });
    return m;
  });
  const [saving, setSaving] = useState(false);

  const nonOwnerMembers = members.filter((m) => m.role !== "owner");

  async function save() {
    setSaving(true);
    try {
      const token = nhost.auth.getAccessToken();
      const accesses = nonOwnerMembers.map((m) => ({
        userId: m.user_id,
        access: memberAccess[m.user_id] ?? "view",
      }));
      const res = await fetch("/api/workflows/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workflowId: workflow.id, visibility, accesses }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save");
      } else {
        toast.success("Workflow access updated!");
        onSaved();
        onClose();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass rounded-2xl w-full max-w-lg shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-100">{workflow.name}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Manage who can access this workflow</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visibility */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Visibility</p>
          <div className="space-y-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setVisibility(opt.value)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  visibility === opt.value
                    ? "border-violet-500/40 bg-violet-500/10"
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/30"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  visibility === opt.value ? "bg-violet-500/20" : "bg-zinc-800"
                }`}>
                  {opt.icon}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${visibility === opt.value ? "text-zinc-100" : "text-zinc-400"}`}>
                    {opt.label}
                  </p>
                  <p className="text-[10px] text-zinc-600">{opt.desc}</p>
                </div>
                {visibility === opt.value && (
                  <CheckCircle2 className="w-4 h-4 text-violet-400 ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Per-member access (only when allowlist) */}
        <AnimatePresence>
          {visibility === "allowlist" && nonOwnerMembers.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Member Access
                </p>
                <div className="space-y-2">
                  {nonOwnerMembers.map((m) => {
                    const access = memberAccess[m.user_id] ?? "view";
                    const name = m.user?.displayName || m.user?.email || "Unknown User";
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-900/40 border border-zinc-800">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[10px] font-bold text-violet-300 uppercase flex-shrink-0">
                            {name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-200 truncate">{name}</p>
                            <p className="text-[10px] text-zinc-600 truncate">{m.user?.email}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {(["view", "edit", "none"] as const).map((level) => (
                            <button
                              key={level}
                              onClick={() => setMemberAccess((prev) => ({ ...prev, [m.user_id]: level }))}
                              className={`px-2.5 py-1 rounded text-[10px] font-semibold capitalize transition-all ${
                                access === level
                                  ? level === "edit"
                                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                                    : level === "view"
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                    : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                                  : "bg-zinc-900 text-zinc-600 border border-zinc-800 hover:text-zinc-400"
                              }`}
                            >
                              {level === "none" ? "No Access" : level}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {nonOwnerMembers.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-2">No non-owner members to configure</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary px-5 py-2 text-sm gap-2"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save Access
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { activeOrg, activeRole } = useOrg();
  const client = useApolloClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");
  const [inviting, setInviting] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [pendingInviteLink, setPendingInviteLink] = useState<string | null>(null);
  const [pendingInviteEmail, setPendingInviteEmail] = useState<string | null>(null);
  const [accessWorkflow, setAccessWorkflow] = useState<Workflow | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  const isOwner = activeRole === "owner";
  const myUserId = nhost.auth.getUser()?.id ?? "";

  // ── Members ──────────────────────────────────────────────────────────────────
  const { data: membersData, loading: loadingMembers, refetch: refetchMembers } = useQuery(GET_ORG_MEMBERS, {
    variables: { orgId: activeOrg?.id },
    skip: !activeOrg,
  });

  // ── Workflows (for access panel) ─────────────────────────────────────────────
  const { data: workflowsData, loading: loadingWorkflows, refetch: refetchWorkflows } = useQuery(GET_ORG_WORKFLOWS, {
    variables: { orgId: activeOrg?.id },
    skip: !activeOrg || !isOwner,
  });

  const handleRemoveMember = async () => {
    if (!memberToRemove || !activeOrg) return;
    setRemovingMember(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch(`/api/orgs/members?memberId=${memberToRemove.id}&orgId=${activeOrg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to remove member");
      } else {
        toast.success("Member removed from organization");
        setMemberToRemove(null);
        refetchMembers();
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setRemovingMember(false);
    }
  };

  const [updateRole] = useMutation(UPDATE_ORG_MEMBER_ROLE, {
    onCompleted() { toast.success("Role updated"); refetchMembers(); },
    onError(e) { toast.error(e.message); },
  });

  // ── Invitations ───────────────────────────────────────────────────────────────
  const fetchInvitations = async () => {
    if (!activeOrg || !isOwner) return;
    setLoadingInvites(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch(`/api/orgs/invite?orgId=${activeOrg.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { invitations?: Invitation[] };
      setInvitations(data.invitations ?? []);
    } catch { setInvitations([]); }
    finally { setLoadingInvites(false); }
  };

  useEffect(() => { fetchInvitations(); }, [activeOrg?.id, isOwner]); // eslint-disable-line

  // ── Invite ────────────────────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeOrg) return;
    setInviting(true);
    setPendingInviteLink(null);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch("/api/orgs/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, orgId: activeOrg.id }),
      });
      const data = await res.json() as {
        message?: string;
        error?: string;
        inviteLink?: string;
        emailSent?: boolean;
        simulated?: boolean;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send invitation");
      } else {
        if (data.emailSent) {
          toast.success(data.message ?? `Invitation email sent to ${inviteEmail.trim()}!`);
        } else {
          toast.info(data.message ?? "Invitation created. Share the link with the recipient.");
        }
        setPendingInviteEmail(inviteEmail.trim());
        setPendingInviteLink(data.inviteLink ?? null);
        setInviteEmail("");
        setInviteRole("viewer");
        fetchInvitations();
      }
    } catch { toast.error("Network error — please try again"); }
    finally { setInviting(false); }
  };

  // ── Revoke ────────────────────────────────────────────────────────────────────
  const revokeInvitation = async (id: string, email: string) => {
    if (!confirm(`Revoke invitation for ${email}?`)) return;
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch(`/api/orgs/invite?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Invitation revoked");
        setInvitations((prev) => prev.filter((i) => i.id !== id));
      } else { toast.error("Failed to revoke invitation"); }
    } catch { toast.error("Network error"); }
  };

  const members: OrgMember[] = membersData?.org_members ?? [];
  const workflows: Workflow[] = workflowsData?.workflows ?? [];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Remove Member Confirmation Modal */}
      <AnimatePresence>
        {memberToRemove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="glass rounded-2xl p-6 max-w-md w-full space-y-4 border border-zinc-800"
            >
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                Remove Member
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Are you sure you want to remove{" "}
                <strong className="text-zinc-200">
                  {memberToRemove.user?.displayName || memberToRemove.user?.email}
                </strong>{" "}
                from <strong className="text-zinc-200">{activeOrg?.name}</strong>? They will immediately lose access to all workflows in this organization.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setMemberToRemove(null)}
                  className="btn-secondary px-4 py-2 text-xs"
                  disabled={removingMember}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveMember}
                  disabled={removingMember}
                  className="btn-primary bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-xs gap-2"
                >
                  {removingMember ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Remove Member
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workflow Access Modal */}
      <AnimatePresence>
        {accessWorkflow && (
          <WorkflowAccessPanel
            workflow={accessWorkflow}
            members={members}
            myUserId={myUserId}
            onClose={() => setAccessWorkflow(null)}
            onSaved={() => { refetchWorkflows(); client.resetStore(); }}
          />
        )}
      </AnimatePresence>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <PendingInvitesBanner />
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-bold text-zinc-100 mb-1">Settings</h1>
          <p className="text-sm text-zinc-500">
            Manage members for <span className="text-zinc-300 font-medium">{activeOrg?.name}</span>
          </p>
        </motion.div>

        {/* Org Info */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="glass rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-5"
        >
          {[
            { label: "Organization", value: activeOrg?.name ?? "—" },
            { label: "Your Role", value: <span className="capitalize">{activeRole ?? "—"}</span> },
            { label: "Members", value: members.length },
            { label: "Pending Invites", value: invitations.length },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">{item.label}</p>
              <p className="text-sm font-semibold text-zinc-200">{item.value}</p>
            </div>
          ))}
        </motion.div>

        {/* Invite Form (owner only) */}
        {isOwner && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="glass rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
              <Send className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-zinc-200">Invite a Member</h2>
            </div>
            <form onSubmit={handleInvite} className="p-5 space-y-4">
              <p className="text-xs text-zinc-500">
                An invitation email will be sent to the recipient. They must accept the invitation to join the organization.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none z-10" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Enter member's email address"
                    className="input-base pl-10 py-2.5 text-sm w-full bg-zinc-900/90 border border-zinc-700/80 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500"
                    required
                  />
                </div>
                <select
                  value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="input-base sm:w-36 py-2.5 text-sm"
                >
                  <option value="viewer">👁 Viewer</option>
                  <option value="editor">✏️ Editor</option>
                  <option value="owner">👑 Owner</option>
                </select>
                <button type="submit" disabled={inviting || !inviteEmail.trim()} className="btn-primary py-2.5 px-5 justify-center gap-2 whitespace-nowrap">
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {inviting ? "Sending…" : "Invite"}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Invite Link Card */}
        <AnimatePresence>
          {pendingInviteLink && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="glass rounded-xl p-5 border border-amber-500/20 bg-amber-500/5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Invite Link for {pendingInviteEmail}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Invitation email sent. You can also copy and share this direct link with them to join.
                  </p>
                </div>
                <button onClick={() => setPendingInviteLink(null)} className="p-1 rounded hover:bg-zinc-800 text-zinc-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                <input readOnly value={pendingInviteLink}
                  className="input-base text-xs font-mono flex-1 bg-zinc-900/60 text-zinc-300"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(pendingInviteLink); toast.success("Copied!"); }}
                  className="btn-secondary px-3 text-xs whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pending Invitations */}
        {isOwner && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="glass rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Pending Invitations</h2>
                {invitations.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{invitations.length}</span>
                )}
              </div>
              <button onClick={fetchInvitations} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInvites ? "animate-spin" : ""}`} />
              </button>
            </div>
            {loadingInvites ? (
              <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-600" /></div>
            ) : invitations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-zinc-700 mb-2" />
                <p className="text-sm text-zinc-600">No pending invitations</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                <AnimatePresence>
                  {invitations.map((inv) => {
                    const expiresAt = new Date(inv.expires_at);
                    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const isExpiringSoon = daysLeft < 2;
                    return (
                      <motion.div key={inv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-900/20"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <Mail className="w-3.5 h-3.5 text-amber-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">{inv.email}</p>
                            <p className={`text-[10px] ${isExpiringSoon ? "text-rose-400" : "text-zinc-500"}`}>
                              {isExpiringSoon ? `⚠ Expires in ${daysLeft}d` : `Expires in ${daysLeft} days`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[inv.role]}`}>
                            {ROLE_ICONS[inv.role]}<span className="capitalize">{inv.role}</span>
                          </span>
                          <button
                            onClick={() => { const link = `${window.location.origin}/invite/accept?token=${inv.token}`; navigator.clipboard.writeText(link); toast.success("Link copied!"); }}
                            className="p-1.5 rounded hover:bg-violet-500/10 text-zinc-600 hover:text-violet-400 transition-colors" title="Copy invite link"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                          <button onClick={() => revokeInvitation(inv.id, inv.email)}
                            className="p-1.5 rounded hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 transition-colors" title="Revoke">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {/* Members */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="glass rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Members</h2>
            {!loadingMembers && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">{members.length}</span>
            )}
          </div>
          {loadingMembers ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-600" /></div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {members.map((m) => {
                const isMe = m.user_id === myUserId;
                const name = m.user?.displayName || m.user?.email?.split("@")[0] || "Unknown";
                const email = m.user?.email ?? "";
                const avatar = (m.user?.displayName || email).charAt(0).toUpperCase();
                return (
                  <div key={m.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-900/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[11px] font-bold text-violet-300 flex-shrink-0">
                        {avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate flex items-center gap-1.5">
                          {name}
                          {isMe && <span className="text-[9px] text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-1.5 py-0.5">You</span>}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">{email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOwner && !isMe ? (
                        <select value={m.role} onChange={(e) => updateRole({ variables: { id: m.id, role: e.target.value } })}
                          className="input-base text-xs py-1 w-28"
                        >
                          <option value="owner">👑 Owner</option>
                          <option value="editor">✏️ Editor</option>
                          <option value="viewer">👁 Viewer</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[m.role]}`}>
                          {ROLE_ICONS[m.role]}<span className="capitalize">{m.role}</span>
                        </span>
                      )}
                      {isOwner && !isMe && (
                        <button onClick={() => setMemberToRemove(m)}
                          className="p-1.5 rounded hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 transition-colors" title="Remove Member">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Workflow Access Control (owner only) */}
        {isOwner && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}
            className="glass rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
              <Lock className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-zinc-200">Workflow Access Control</h2>
              <span className="text-[10px] text-zinc-500 ml-1">— configure per-workflow visibility</span>
            </div>
            {loadingWorkflows ? (
              <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-600" /></div>
            ) : workflows.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-sm">No workflows yet.</div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {workflows.map((wf) => {
                  const vis = wf.visibility ?? "all";
                  const visOpt = VISIBILITY_OPTIONS.find((v) => v.value === vis);
                  return (
                    <div key={wf.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-900/20">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                          {visOpt?.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">{wf.name}</p>
                          <p className="text-[10px] text-zinc-500">{visOpt?.label ?? "All Members"}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setAccessWorkflow(wf)}
                        className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
                      >
                        <Pencil className="w-3 h-3" />
                        Configure
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* Permission Legend */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
          className="glass rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Permission Levels</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {[
              { role: "owner", icon: "👑", color: "text-amber-400", desc: "Full access: manage members, all workflow steps, billing, settings." },
              { role: "editor", icon: "✏️", color: "text-violet-400", desc: "Build & run workflows. Cannot run db_write or notify steps." },
              { role: "viewer", icon: "👁", color: "text-zinc-400", desc: "Read-only: view workflows, runs, and outputs. Cannot trigger runs." },
            ].map((r) => (
              <div key={r.role} className="p-3 rounded-lg bg-zinc-900/50 space-y-1.5">
                <p className={`font-semibold capitalize ${r.color}`}>{r.icon} {r.role}</p>
                <p className="text-zinc-500 leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </>
  );
}
