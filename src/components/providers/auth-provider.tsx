"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  NhostProvider,
  useSignInEmailPassword,
  useSignUpEmailPassword,
  useSignOut,
  useUserId,
  useUserEmail,
  useUserDisplayName,
  useAuthenticationStatus,
} from "@nhost/nextjs";
import { nhost } from "@/lib/nhost";
import { useQuery } from "@apollo/client";
import { GET_MY_ORGS } from "@/lib/graphql";
import type { Organization, OrgMember, UserRole } from "@/lib/types";

// ── Nhost Provider wrapper ────────────────────────────────────────────────

export function NhostAuthProvider({ children }: { children: React.ReactNode }) {
  return <NhostProvider nhost={nhost}>{children}</NhostProvider>;
}

// ── Auth Context (wraps Nhost hooks into a unified interface) ─────────────

interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Internal component that uses Nhost hooks (must be inside NhostProvider)
function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const userId = useUserId();
  const email = useUserEmail();
  const displayName = useUserDisplayName();
  const { isAuthenticated, isLoading } = useAuthenticationStatus();

  const { signInEmailPassword } = useSignInEmailPassword();
  const { signUpEmailPassword } = useSignUpEmailPassword();
  const { signOut: nhostSignOut } = useSignOut();

  const user: AuthUser | null =
    isAuthenticated && userId
      ? { id: userId, email: email ?? "", displayName: displayName ?? undefined }
      : null;

  const signIn = async (emailArg: string, password: string): Promise<{ error: string | null }> => {
    const result = await signInEmailPassword(emailArg, password);
    if (result.isError) {
      return { error: result.error?.message ?? "Sign in failed" };
    }
    return { error: null };
  };

  const signUp = async (
    emailArg: string,
    password: string,
    displayNameArg?: string
  ): Promise<{ error: string | null }> => {
    const result = await signUpEmailPassword(emailArg, password, {
      displayName: displayNameArg,
    });
    if (result.isError) {
      return { error: result.error?.message ?? "Sign up failed" };
    }
    return { error: null };
  };

  const signOut = async () => {
    await nhostSignOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, isLoading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <NhostAuthProvider>
      <AuthContextProvider>{children}</AuthContextProvider>
    </NhostAuthProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// ── Org Context ───────────────────────────────────────────────────────────

interface OrgContextValue {
  orgs: Organization[];
  activeOrg: Organization | null;
  activeRole: UserRole | null;
  setActiveOrg: (org: Organization) => void;
  loading: boolean;
  refetch: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const [activeOrg, setActiveOrgState] = useState<Organization | null>(null);

  const { data, loading, refetch } = useQuery(GET_MY_ORGS, {
    skip: !userId,
  });

  const orgs: Organization[] = data?.organizations ?? [];

  // Restore from localStorage or default to first org
  useEffect(() => {
    if (orgs.length > 0 && !activeOrg) {
      const saved = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
      const found = saved ? orgs.find((o: Organization) => o.id === saved) : null;
      setActiveOrgState(found ?? orgs[0]);
    }
  }, [orgs, activeOrg]);

  const setActiveOrg = (org: Organization) => {
    setActiveOrgState(org);
    if (typeof window !== "undefined") {
      localStorage.setItem("activeOrgId", org.id);
    }
  };

  // Sync activeOrg if org list updates
  useEffect(() => {
    if (activeOrg && orgs.length > 0) {
      const updated = orgs.find((o: Organization) => o.id === activeOrg.id);
      if (updated) setActiveOrgState(updated);
    }
  }, [orgs]); // eslint-disable-line

  const activeRole = React.useMemo((): UserRole | null => {
    if (!activeOrg || !userId) return null;
    const membership = activeOrg.org_members?.find(
      (m: OrgMember) => m.user_id === userId
    );
    return membership?.role ?? null;
  }, [activeOrg, userId]);

  return (
    <OrgContext.Provider
      value={{
        orgs,
        activeOrg,
        activeRole,
        setActiveOrg,
        loading,
        refetch,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
