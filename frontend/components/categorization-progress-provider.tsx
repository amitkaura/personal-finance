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
  type AccountDiscoveredEvent,
  type AutoCatProgressEvent,
  type SyncProgressEvent,
  type SyncCompleteEvent,
  type AutoCatCompleteEvent,
  type ImportProgressEvent,
  type ImportCompleteEvent,
  type BulkImportPayload,
} from "@/lib/api";

type ImportRow = { date: string; amount: number; merchant_name: string; category?: string };

type ProgressState = "idle" | "importing" | "syncing" | "categorizing" | "complete" | "error";

interface ImportResult {
  imported: number;
  skipped: number;
}

interface CategorizationProgressValue {
  state: ProgressState;
  institution: string | null;
  syncCurrent: number;
  syncTotal: number;
  catCurrent: number;
  catTotal: number;
  merchantName: string | null;
  category: string | null;
  importCurrent: number;
  importTotal: number;
  importMerchant: string | null;
  importAccountName: string | null;
  result: { synced: number; categorized: number; skipped: number } | null;
  importResult: ImportResult | null;
  discoveredAccounts: string[];
  errorMessage: string | null;
  startSync: () => void;
  startAutoCategorize: () => void;
  startImport: (accountId: number, accountName: string, rows: ImportRow[]) => void;
  startBulkImport: (payload: BulkImportPayload) => void;
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
  importCurrent: 0,
  importTotal: 0,
  importMerchant: null,
  importAccountName: null,
  result: null,
  importResult: null,
  discoveredAccounts: [],
  errorMessage: null,
  startSync: () => {},
  startAutoCategorize: () => {},
  startImport: () => {},
  startBulkImport: () => {},
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
  const [importCurrent, setImportCurrent] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importMerchant, setImportMerchant] = useState<string | null>(null);
  const [importAccountName, setImportAccountName] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [discoveredAccounts, setDiscoveredAccounts] = useState<string[]>([]);

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
    setImportCurrent(0);
    setImportTotal(0);
    setImportMerchant(null);
    setImportAccountName(null);
    setResult(null);
    setImportResult(null);
    setDiscoveredAccounts([]);
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
        } else if ((event as AccountDiscoveredEvent).status === "account_discovered") {
          const e = event as AccountDiscoveredEvent;
          setDiscoveredAccounts((prev) => [...prev, ...e.accounts]);
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
        if (complete.discoveredAccounts?.length) {
          setDiscoveredAccounts((prev) => {
            const merged = new Set([...prev, ...complete.discoveredAccounts!]);
            return [...merged];
          });
        }
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

  const chainAutoCategorize = useCallback(
    (impResult: ImportResult) => {
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
          setImportResult(impResult);
          setState("complete");
          runningRef.current = false;
          invalidateAll();
        })
        .catch((err: Error) => {
          setErrorMessage(err.message);
          setState("error");
          runningRef.current = false;
        });
    },
    [invalidateAll],
  );

  const startImport = useCallback(
    (accountId: number, accountName: string, rows: ImportRow[]) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setState("importing");
      setImportAccountName(accountName);

      api
        .streamImportTransactions(
          accountId,
          rows,
          (evt: ImportProgressEvent) => {
            setImportCurrent(evt.current);
            setImportTotal(evt.total);
            setImportMerchant(evt.merchant);
          },
        )
        .then((complete: ImportCompleteEvent) => {
          const impResult = { imported: complete.imported, skipped: complete.skipped };
          invalidateAll();
          if (complete.imported > complete.categorized) {
            setImportResult(impResult);
            chainAutoCategorize(impResult);
          } else {
            setResult({ synced: 0, categorized: complete.categorized, skipped: 0 });
            setImportResult(impResult);
            setState("complete");
            runningRef.current = false;
          }
        })
        .catch((err: Error) => {
          setErrorMessage(err.message);
          setState("error");
          runningRef.current = false;
        });
    },
    [invalidateAll, chainAutoCategorize],
  );

  const startBulkImport = useCallback(
    (payload: BulkImportPayload) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setState("importing");
      setImportAccountName("Bulk Import");

      api
        .bulkImportTransactions(payload, (evt: ImportProgressEvent) => {
          setImportCurrent(evt.current);
          setImportTotal(evt.total);
          setImportMerchant(evt.merchant);
        })
        .then((complete: ImportCompleteEvent) => {
          const impResult = { imported: complete.imported, skipped: complete.skipped };
          invalidateAll();
          if (complete.imported > complete.categorized) {
            setImportResult(impResult);
            chainAutoCategorize(impResult);
          } else {
            setResult({ synced: 0, categorized: complete.categorized, skipped: 0 });
            setImportResult(impResult);
            setState("complete");
            runningRef.current = false;
          }
        })
        .catch((err: Error) => {
          setErrorMessage(err.message);
          setState("error");
          runningRef.current = false;
        });
    },
    [invalidateAll, chainAutoCategorize],
  );

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
        importCurrent,
        importTotal,
        importMerchant,
        importAccountName,
        result,
        importResult,
        discoveredAccounts,
        errorMessage,
        startSync,
        startAutoCategorize,
        startImport,
        startBulkImport,
        dismiss,
      }}
    >
      {children}
    </CategorizationProgressContext.Provider>
  );
}
