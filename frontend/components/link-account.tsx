"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export default function LinkAccount() {
  const queryClient = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "linking" | "exchanging" | "done">("idle");
  const [result, setResult] = useState<{ accounts_synced: number } | null>(null);

  const fetchToken = useMutation({
    mutationFn: api.createLinkToken,
    onSuccess: (data) => {
      setLinkToken(data.link_token);
      setStatus("linking");
    },
  });

  const exchangeToken = useMutation({
    mutationFn: ({
      publicToken,
      institutionName,
    }: {
      publicToken: string;
      institutionName?: string;
    }) => api.exchangeToken(publicToken, institutionName),
    onSuccess: (data) => {
      setResult(data);
      setStatus("done");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["plaidItems"] });
      queryClient.invalidateQueries({ queryKey: ["netWorthHistory"] });
    },
    onError: () => {
      setStatus("idle");
      setLinkToken(null);
    },
  });

  const onSuccess = useCallback(
    (publicToken: string, metadata: { institution?: { name?: string } | null }) => {
      setStatus("exchanging");
      exchangeToken.mutate({
        publicToken,
        institutionName: metadata?.institution?.name ?? undefined,
      });
    },
    [exchangeToken]
  );

  const onExit = useCallback(() => {
    if (status === "linking") {
      setStatus("idle");
      setLinkToken(null);
    }
  }, [status]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  const handleClick = () => {
    if (linkToken && ready) {
      open();
    } else {
      fetchToken.mutate();
    }
  };

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "done") {
      resetTimer.current = setTimeout(() => {
        setStatus("idle");
        setResult(null);
        setLinkToken(null);
      }, 3000);
    }
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
    };
  }, [status]);

  useEffect(() => {
    if (status === "linking" && linkToken && ready) {
      open();
    }
  }, [status, linkToken, ready, open]);

  if (status === "done" && result) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg bg-success/15 px-4 py-2 text-sm font-medium text-success">
        <CheckCircle className="h-4 w-4" />
        {result.accounts_synced} account{result.accounts_synced !== 1 ? "s" : ""} linked!
      </div>
    );
  }

  if (status === "exchanging") {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground opacity-50"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Saving...
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={fetchToken.isPending}
      className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
    >
      {fetchToken.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
      Link Account
    </button>
  );
}
