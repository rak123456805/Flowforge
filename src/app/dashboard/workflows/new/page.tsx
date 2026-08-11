"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation } from "@apollo/client";
import { CREATE_WORKFLOW } from "@/lib/graphql";
import { useOrg } from "@/components/providers/auth-provider";
import { ArrowLeft, Loader2, GitBranch, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function NewWorkflowPage() {
  const router = useRouter();
  const { activeOrg, activeRole } = useOrg();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [createWorkflow, { loading }] = useMutation(CREATE_WORKFLOW, {
    onCompleted(data) {
      toast.success("Workflow created successfully!");
      router.push(`/dashboard/workflows/${data.insert_workflows_one.id}`);
    },
    onError(e) {
      toast.error(e.message || "Failed to create workflow");
    },
  });

  const canCreate = activeRole === "owner" || activeRole === "editor";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeOrg) return;

    if (!canCreate) {
      toast.error("Permission denied. Viewers cannot create workflows.");
      return;
    }

    createWorkflow({
      variables: {
        orgId: activeOrg.id,
        name: name.trim(),
        description: description.trim() || null,
      },
    });
  }

  return (
    <div className="p-6 max-w-xl mx-auto h-full flex flex-col justify-center min-h-[80vh]">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          href="/dashboard/workflows"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to workflows
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl border border-zinc-800/80 p-6 md:p-8 relative overflow-hidden"
      >
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-1.5">
              Create New Workflow
              <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Build an automated multi-step AI agent workflow.
            </p>
          </div>
        </div>

        {!canCreate && activeRole ? (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-400 mb-6">
            You are logged in as a <strong>{activeRole}</strong>. Only owners and editors are allowed to create workflows.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="workflow-name" className="block text-xs font-semibold text-zinc-400 mb-2">
              Workflow Name
            </label>
            <input
              id="workflow-name"
              type="text"
              required
              disabled={loading || !canCreate}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Customer Support Agent"
              className="input-base"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="workflow-description" className="block text-xs font-semibold text-zinc-400 mb-2">
              Description (Optional)
            </label>
            <textarea
              id="workflow-description"
              disabled={loading || !canCreate}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this workflow accomplishes..."
              rows={4}
              className="input-base py-2.5 resize-none leading-relaxed"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <Link
              href="/dashboard/workflows"
              className="btn-secondary"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !name.trim() || !canCreate}
              className="btn-primary px-6"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Workflow"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
