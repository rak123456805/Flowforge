"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useOrg } from "@/components/providers/auth-provider";
import { useQuery, useMutation } from "@apollo/client";
import { GET_ORG_MEMBERS, REMOVE_ORG_MEMBER, UPDATE_ORG_MEMBER_ROLE } from "@/lib/graphql";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Shield, Lock, Users, Mail, UserPlus } from "lucide-react";
import type { OrgMember, UserRole } from "@/lib/types";
import { nhost } from "@/lib/nhost";

interface DirectoryUser {
  id: string;
  email: string;
  displayName?: string;
}

export default function SettingsPage() {
  const { activeOrg, activeRole } = useOrg();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");
  const [inviting, setInviting] = useState(false);
  
  // Directory users (all users registered on FlowForge)
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  const isOwner = activeRole === "owner";

  // Fetch organization members
  const { data, loading: loadingMembers, refetch: refetchMembers } = useQuery(GET_ORG_MEMBERS, {
    variables: { orgId: activeOrg?.id },
    skip: !activeOrg,
  });

  const [removeMember] = useMutation(REMOVE_ORG_MEMBER, {
    onCompleted() {
      toast.success("Member removed");
      refetchMembers();
    },
    onError(e) {
      toast.error(e.message);
    },
  });

  const [updateRole] = useMutation(UPDATE_ORG_MEMBER_ROLE, {
    onCompleted() {
      toast.success("Role updated");
      refetchMembers();
    },
    onError(e) {
      toast.error(e.message);
    },
  });

  // Fetch all registered users directory
  const fetchDirectory = async () => {
    setLoadingDirectory(true);
    try {
      const res = await fetch("/api/users/list");
      const data = await res.json();
      if (res.ok) {
        setDirectoryUsers(data.users || []);
      }
    } catch (err) {
      console.error("Error fetching directory:", err);
    } finally {
      setLoadingDirectory(false);
    }
  };

  useEffect(() => {
    fetchDirectory();
  }, []);

  const handleInvite = async (emailToInvite: string, roleToInvite: UserRole) => {
    if (!emailToInvite.trim() || !activeOrg) return;
    setInviting(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch("/api/orgs/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: emailToInvite.trim(),
          role: roleToInvite,
          orgId: activeOrg.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to invite member");
      } else {
        toast.success(data.message || "Member added successfully!");
        setInviteEmail("");
        refetchMembers();
      }
    } catch (err) {
      toast.error("Failed to add member");
    } finally {
      setInviting(false);
    }
  };

  const members: OrgMember[] = data?.org_members ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-zinc-100 mb-1">Settings</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Manage your organization — {activeOrg?.name}
        </p>
      </motion.div>

      {/* Org Info */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass rounded-xl p-5"
      >
        <h2 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-400" />
          Organization Info
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-zinc-500 text-xs mb-0.5">Name</p>
            <p className="text-zinc-200 font-medium">{activeOrg?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs mb-0.5">Your Role</p>
            <p className="text-zinc-200 font-medium capitalize">{activeRole ?? "—"}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs mb-0.5">Monthly Quota</p>
            <p className="text-zinc-200 font-medium">
              {activeOrg?.current_month_usage ?? 0} / {activeOrg?.max_quota_per_month ?? 100} runs
            </p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs mb-0.5">Org ID</p>
            <p className="font-mono text-xs text-zinc-500 select-all">{activeOrg?.id}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Members Management Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 glass rounded-xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" />
              Members ({members.length})
            </h2>
            {!isOwner && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Lock className="w-3.5 h-3.5" />
                Only owners can manage members
              </div>
            )}
          </div>

          {loadingMembers ? (
            <div className="flex-1 flex items-center justify-center p-8 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading members…</span>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50 flex-1">
              {members.map((m) => {
                // Find display details from directory
                const directoryDetails = directoryUsers.find((u) => u.id === m.user_id);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {(directoryDetails?.displayName || directoryDetails?.email || m.user_id)
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {directoryDetails?.displayName || "FlowForge User"}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {directoryDetails?.email || m.user_id}
                      </p>
                    </div>
                    {isOwner ? (
                      <select
                        value={m.role}
                        onChange={(e) => updateRole({ variables: { id: m.id, role: e.target.value } })}
                        className="input-base w-28 text-xs py-1"
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="badge text-xs bg-zinc-800 text-zinc-400 border-zinc-700">
                        {m.role}
                      </span>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => removeMember({ variables: { id: m.id } })}
                        className="p-1.5 rounded hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add member form (owner only) */}
          {isOwner && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleInvite(inviteEmail, inviteRole);
              }}
              className="p-4 border-t border-zinc-800 bg-zinc-900/20 space-y-3"
            >
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Invite Member
              </h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Enter email address"
                    type="email"
                    className="input-base pl-10 py-2 text-xs"
                    required
                  />
                </div>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="input-base sm:w-28 py-2 text-xs"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="btn-primary text-xs py-2 px-4 justify-center"
                >
                  {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                  Invite
                </button>
              </div>
            </form>
          )}
        </motion.div>

        {/* Directory Users (SaaS helper directory) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-xl overflow-hidden flex flex-col max-h-[500px]"
        >
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" />
              User Directory
            </h2>
            <p className="text-[10px] text-zinc-500 mt-1">
              Registered users on the system (useful for testing invites)
            </p>
          </div>

          {loadingDirectory ? (
            <div className="flex-1 flex items-center justify-center p-6 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50 overflow-y-auto flex-1">
              {directoryUsers.map((user) => {
                const isAlreadyMember = members.some((m) => m.user_id === user.id);
                return (
                  <div key={user.id} className="p-3.5 space-y-1.5 hover:bg-zinc-900/20 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate">
                          {user.displayName || "No name set"}
                        </p>
                        <p className="text-[10px] text-zinc-400 truncate">{user.email}</p>
                        <p className="text-[9px] font-mono text-zinc-600 truncate">{user.id}</p>
                      </div>
                      {isOwner && !isAlreadyMember && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleInvite(user.email, "editor")}
                            className="btn-secondary px-1.5 py-1 text-[9px] h-fit flex items-center gap-1 border border-zinc-700 hover:border-violet-500/50"
                            title="Add as Editor"
                          >
                            <UserPlus className="w-3 h-3" />
                            Editor
                          </button>
                          <button
                            onClick={() => handleInvite(user.email, "viewer")}
                            className="btn-secondary px-1.5 py-1 text-[9px] h-fit flex items-center gap-1 border border-zinc-700 hover:border-violet-500/50"
                            title="Add as Viewer"
                          >
                            <UserPlus className="w-3 h-3" />
                            Viewer
                          </button>
                        </div>
                      )}
                      {isAlreadyMember && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                          Member
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
