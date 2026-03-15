"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Zap, Key } from "lucide-react";
import { api } from "@/lib/api";
import { PLAID_MODES } from "@/lib/types";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { data: plaidMode, isLoading } = useQuery({
    queryKey: ["plaid-mode"],
    queryFn: api.getPlaidMode,
  });

  const selectMode = useMutation({
    mutationFn: (mode: string) => api.setPlaidMode(mode),
    onSuccess: () => router.push("/"),
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const managedAvailable = plaidMode?.managed_available ?? false;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">How would you like to connect your bank?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose how you want to link your financial accounts.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {managedAvailable && (
            <button
              onClick={() => selectMode.mutate(PLAID_MODES.MANAGED)}
              disabled={selectMode.isPending}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-6 text-center transition-colors hover:border-accent hover:bg-accent/10 disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
                <Zap className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Connect instantly</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Link your bank accounts right away — no setup required.
                </p>
              </div>
            </button>
          )}

          <button
            onClick={() => selectMode.mutate(PLAID_MODES.BYOK)}
            disabled={selectMode.isPending}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-border p-6 text-center transition-colors hover:border-foreground/20 hover:bg-muted/50 disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Key className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Use your own Plaid keys</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Bring your own Plaid API credentials from your developer account.
              </p>
            </div>
          </button>
        </div>

        {selectMode.isPending && (
          <div className="flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
