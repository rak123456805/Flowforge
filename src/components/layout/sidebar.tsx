"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  LayoutDashboard,
  GitBranch,
  Play,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  BookOpen,
} from "lucide-react";
import { useOrg } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/workflows", icon: GitBranch, label: "Workflows" },
  { href: "/dashboard/runs", icon: Play, label: "Run Monitor" },
  { href: "/dashboard/activity", icon: Activity, label: "Activity" },
  { href: "/dashboard/guide", icon: BookOpen, label: "User Guide" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { activeOrg, activeRole } = useOrg();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative h-screen flex flex-col border-r border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl overflow-hidden flex-shrink-0 z-10"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-zinc-800/60 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-500/20">
          <Zap className="w-3.5 h-3.5 text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="text-sm font-bold tracking-tight gradient-text whitespace-nowrap"
            >
              FlowForge
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "sidebar-item relative",
                isActive && "sidebar-item-active"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-zinc-800 rounded-lg border border-zinc-700/50"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <item.icon
                className={cn(
                  "w-4 h-4 flex-shrink-0 relative z-10",
                  isActive ? "text-zinc-100" : "text-zinc-500"
                )}
              />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className={cn(
                      "text-sm relative z-10 whitespace-nowrap",
                      isActive ? "text-zinc-100" : "text-zinc-400"
                    )}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Org + role pill */}
      <AnimatePresence>
        {!collapsed && activeOrg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-3 pb-3"
          >
            <div className="px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
              <p className="text-xs font-medium text-zinc-200 truncate">
                {activeOrg.name}
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "badge text-[10px]",
                    activeRole === "owner"
                      ? "bg-violet-500/15 text-violet-400 border-violet-500/20"
                      : activeRole === "editor"
                        ? "bg-blue-500/15 text-blue-400 border-blue-500/20"
                        : "bg-zinc-700/50 text-zinc-400 border-zinc-700"
                  )}
                >
                  {activeRole ?? "member"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-[52px] -right-3 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 transition-colors z-20 shadow-md"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-zinc-400" />
        ) : (
          <ChevronLeft className="w-3 h-3 text-zinc-400" />
        )}
      </button>
    </motion.aside>
  );
}
