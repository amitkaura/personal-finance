"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import type {
  Household,
  HouseholdInvitation,
  HouseholdMember,
  ViewScope,
} from "@/lib/types";

interface HouseholdContextValue {
  household: Household | null;
  partner: HouseholdMember | null;
  scope: ViewScope;
  setScope: (scope: ViewScope) => void;
  pendingInvitations: HouseholdInvitation[];
  isLoading: boolean;
  refetch: () => void;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  household: null,
  partner: null,
  scope: "personal",
  setScope: () => {},
  pendingInvitations: [],
  isLoading: true,
  refetch: () => {},
});

export function useHousehold() {
  return useContext(HouseholdContext);
}

const SCOPE_KEY = "pf_view_scope";

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [scope, setScopeState] = useState<ViewScope>(() => {
    if (typeof window === "undefined") return "personal";
    const stored = localStorage.getItem(SCOPE_KEY);
    if (stored === "partner" || stored === "household") {
      return stored;
    }
    return "personal";
  });

  const setScope = useCallback((s: ViewScope) => {
    setScopeState(s);
    localStorage.setItem(SCOPE_KEY, s);
  }, []);

  const {
    data: household,
    isLoading: householdLoading,
    refetch: refetchHousehold,
  } = useQuery({
    queryKey: ["household"],
    queryFn: api.getHousehold,
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: pendingInvitations, refetch: refetchInvitations } = useQuery({
    queryKey: ["pendingInvitations"],
    queryFn: api.getPendingInvitations,
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!householdLoading && !household && scope !== "personal") {
      localStorage.setItem(SCOPE_KEY, "personal");
    }
  }, [household, householdLoading, scope]);

  const partner =
    household?.members.find((m) => m.user_id !== user?.id) ?? null;

  const refetch = useCallback(() => {
    refetchHousehold();
    refetchInvitations();
  }, [refetchHousehold, refetchInvitations]);

  const effectiveScope: ViewScope = household ? scope : "personal";

  return (
    <HouseholdContext.Provider
      value={{
        household: household ?? null,
        partner,
        scope: effectiveScope,
        setScope,
        pendingInvitations: pendingInvitations ?? [],
        isLoading: householdLoading,
        refetch,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}
