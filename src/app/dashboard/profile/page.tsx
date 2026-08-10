"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth, useOrg } from "@/components/providers/auth-provider";
import { User, Mail, Shield, Building2, Key, Loader2, Save } from "lucide-react";
import { nhost } from "@/lib/nhost";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user } = useAuth();
  const { orgs } = useOrg();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [saving, setSaving] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setSaving(true);
    try {
      const token = nhost.auth.getAccessToken();
      const res = await fetch("/api/users/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update profile");
      } else {
        toast.success("Profile updated successfully!");
        window.location.reload();
      }
    } catch (err) {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-xl font-bold text-zinc-100">Profile</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Manage your account credentials and organization access
        </p>
      </motion.div>

      {/* User Info Form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass rounded-xl p-6"
      >
        <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-violet-400" />
          Account Details
        </h2>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Display Name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-base"
              placeholder="Jane Doe"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={user?.email || ""}
                disabled
                className="input-base pl-10 opacity-60 cursor-not-allowed"
              />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">
              Email cannot be changed directly. Contact support if needed.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              User ID
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={user?.id || ""}
                disabled
                className="input-base pl-10 font-mono text-xs opacity-60"
              />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">
              Share this ID with organization owners to be added to their organizations.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving || displayName === user?.displayName}
            className="btn-primary mt-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </form>
      </motion.div>

      {/* Organizations & Roles */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-400" />
            Your Organizations
          </h2>
        </div>
        <div className="divide-y divide-zinc-800/50">
          {orgs.map((org) => {
            const member = org.org_members?.find((m) => m.user_id === user?.id);
            return (
              <div key={org.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{org.name}</p>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">{org.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-violet-400" />
                  <span className="badge capitalize bg-violet-500/10 text-violet-400 border-violet-500/20 text-xs">
                    {member?.role || "member"}
                  </span>
                </div>
              </div>
            );
          })}
          {orgs.length === 0 && (
            <div className="p-6 text-center text-sm text-zinc-500">
              You are not a member of any organization yet. Create one or request an invite.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
