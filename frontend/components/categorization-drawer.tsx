"use client";

import { CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCategorizationProgress } from "@/components/categorization-progress-provider";

export default function CategorizationDrawer() {
  const {
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
    dismiss,
  } = useCategorizationProgress();
  const { data: llmConfig } = useQuery({ queryKey: ["llm-config"], queryFn: api.getLLMConfig });

  if (state === "idle") return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card shadow-lg">
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0 flex-1">
          {state === "syncing" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                Syncing {institution}...
              </div>
              {syncTotal > 1 && (
                <p className="text-xs text-muted-foreground">
                  Account {syncCurrent} of {syncTotal}
                </p>
              )}
            </div>
          )}

          {state === "categorizing" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                Categorizing...
              </div>
              {merchantName && (
                <p className="truncate text-xs text-muted-foreground">
                  {merchantName}
                  {category && (
                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                      {category}
                    </span>
                  )}
                </p>
              )}
              {catTotal > 0 && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{catCurrent} / {catTotal}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-200"
                      style={{
                        width: `${(catCurrent / catTotal) * 100}%`,
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {state === "complete" && result && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Sync complete
              </div>
              <p className="text-xs text-muted-foreground">
                {result.synced > 0 && (
                  <>Synced {result.synced} transactions. </>
                )}
                {result.categorized} categorized
                {result.skipped > 0 && `, ${result.skipped} skipped`}.
              </p>
              {result.skipped > 0 && !llmConfig?.configured && (
                <p className="text-xs text-muted-foreground">
                  Tip: <a href="/settings?section=ai" className="underline hover:text-foreground">configure AI categorization</a> in Settings to reduce skipped transactions.
                </p>
              )}
            </div>
          )}

          {state === "error" && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Sync failed
              </div>
              <p className="text-xs text-muted-foreground">
                {errorMessage || "An unexpected error occurred."}
              </p>
            </div>
          )}
        </div>

        {(state === "complete" || state === "error") && (
          <button
            onClick={dismiss}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
