"use client";

import { RefreshCw } from "lucide-react";
import { useCategorizationProgress } from "@/components/categorization-progress-provider";

export default function SyncButton() {
  const { startSync, state } = useCategorizationProgress();
  const busy = state !== "idle" && state !== "complete" && state !== "error";

  return (
    <button
      onClick={startSync}
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50 sm:w-auto sm:justify-start"
    >
      <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Syncing..." : "Sync Now"}
    </button>
  );
}
