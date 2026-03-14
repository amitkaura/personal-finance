"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

const SCOPE_KEY_PREFIX = "pf_view_scope";

function scopeKeyFor(userId: number | undefined): string | null {
  return userId ? `${SCOPE_KEY_PREFIX}_${userId}` : null;
}

function readScope(key: string | null): ViewScope {
  if (typeof window === "undefined" || !key) return "personal";
  const stored = localStorage.getItem(key);
  if (stored === "partner" || stored === "household") return stored;
  return "personal";
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const scopeKey = useMemo(() => scopeKeyFor(user?.id), [user?.id]);
  const prevKeyRef = useRef(scopeKey);

  const [scope, setScopeState] = useState<ViewScope>(() => readScope(scopeKey));

  useEffect(() => {
    if (prevKeyRef.current !== scopeKey) {
      setScopeState(readScope(scopeKey));
      prevKeyRef.current = scopeKey;
    }
  }, [scopeKey]);

  const setScope = useCallback(
    (s: ViewScope) => {
      setScopeState(s);
      if (scopeKey) localStorage.setItem(scopeKey, s);
    },
    [scopeKey],
  );

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

  const partner =
    household?.members.find((m) => m.user_id !== user?.id) ?? null;

  useEffect(() => {
    const shouldReset = !householdLoading && (!household || !partner) && scope !== "personal";
    if (shouldReset) {
      setScopeState("personal");
      if (scopeKey) localStorage.setItem(scopeKey, "personal");
    }
  }, [household, householdLoading, partner, scope, scopeKey]);

  const refetch = useCallback(() => {
    refetchHousehold();
    refetchInvitations();
  }, [refetchHousehold, refetchInvitations]);

  const effectiveScope: ViewScope = household && partner ? scope : "personal";

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
