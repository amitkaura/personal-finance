"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  type AutoCatProgressEvent,
  type SyncProgressEvent,
  type SyncCompleteEvent,
  type AutoCatCompleteEvent,
} from "@/lib/api";

type ProgressState = "idle" | "syncing" | "categorizing" | "complete" | "error";

interface CategorizationProgressValue {
  state: ProgressState;
  institution: string | null;
  syncCurrent: number;
  syncTotal: number;
  catCurrent: number;
  catTotal: number;
  merchantName: string | null;
  category: string | null;
  result: { synced: number; categorized: number; skipped: number } | null;
  errorMessage: string | null;
  startSync: () => void;
  startAutoCategorize: () => void;
  dismiss: () => void;
}

const INITIAL: CategorizationProgressValue = {
  state: "idle",
  institution: null,
  syncCurrent: 0,
  syncTotal: 0,
  catCurrent: 0,
  catTotal: 0,
  merchantName: null,
  category: null,
  result: null,
  errorMessage: null,
  startSync: () => {},
  startAutoCategorize: () => {},
  dismiss: () => {},
};

const CategorizationProgressContext =
  createContext<CategorizationProgressValue>(INITIAL);

export function useCategorizationProgress() {
  return useContext(CategorizationProgressContext);
}

const INVALIDATION_KEYS = [
  "transactions",
  "accounts",
  "accountSummary",
  "netWorthHistory",
  "budgetSummary",
  "recurring",
  "spendingByCategory",
  "monthlyTrends",
  "topMerchants",
];

export function CategorizationProgressProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<ProgressState>("idle");
  const [institution, setInstitution] = useState<string | null>(null);
  const [syncCurrent, setSyncCurrent] = useState(0);
  const [syncTotal, setSyncTotal] = useState(0);
  const [catCurrent, setCatCurrent] = useState(0);
  const [catTotal, setCatTotal] = useState(0);
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [result, setResult] = useState<{
    synced: number;
    categorized: number;
    skipped: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runningRef = useRef(false);
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    for (const key of INVALIDATION_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);

  const reset = useCallback(() => {
    setState("idle");
    setInstitution(null);
    setSyncCurrent(0);
    setSyncTotal(0);
    setCatCurrent(0);
    setCatTotal(0);
    setMerchantName(null);
    setCategory(null);
    setResult(null);
    setErrorMessage(null);
    runningRef.current = false;
  }, []);

  const startSync = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState("syncing");

    api
      .syncAllStream((event) => {
        if ((event as SyncProgressEvent).status === "syncing") {
          const e = event as SyncProgressEvent;
          setState("syncing");
          setInstitution(e.institution);
          setSyncCurrent(e.current);
          setSyncTotal(e.total);
        } else {
          const e = event as AutoCatProgressEvent;
          setState("categorizing");
          setCatCurrent(e.current);
          setCatTotal(e.total);
          setMerchantName(e.merchant_name);
          setCategory(e.category);
        }
      })
      .then((complete: SyncCompleteEvent) => {
        setResult({
          synced: complete.synced,
          categorized: complete.categorized,
          skipped: complete.skipped,
        });
        setState("complete");
        runningRef.current = false;
        invalidateAll();
      })
      .catch((err: Error) => {
        setErrorMessage(err.message);
        setState("error");
        runningRef.current = false;
      });
  }, [invalidateAll]);

  const startAutoCategorize = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState("categorizing");

    api
      .autoCategorize((event: AutoCatProgressEvent) => {
        setCatCurrent(event.current);
        setCatTotal(event.total);
        setMerchantName(event.merchant_name);
        setCategory(event.category);
      })
      .then((complete: AutoCatCompleteEvent) => {
        setResult({
          synced: 0,
          categorized: complete.categorized,
          skipped: complete.skipped,
        });
        setState("complete");
        runningRef.current = false;
        invalidateAll();
      })
      .catch((err: Error) => {
        setErrorMessage(err.message);
        setState("error");
        runningRef.current = false;
      });
  }, [invalidateAll]);

  const dismiss = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <CategorizationProgressContext.Provider
      value={{
        state,
        institution,
        syncCurrent,
        syncTotal,
        catCurrent,
        catTotal,
        merchantName,
        category,
        result,
        errorMessage,
        startSync,
        startAutoCategorize,
        dismiss,
      }}
    >
      {children}
    </CategorizationProgressContext.Provider>
  );
}
