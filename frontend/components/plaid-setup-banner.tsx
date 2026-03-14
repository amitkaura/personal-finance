"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Link2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useHousehold } from "@/components/household-provider";

const DISMISS_KEY = "plaid-setup-banner-dismissed";

export default function PlaidSetupBanner() {
  const router = useRouter();
  const { household } = useHousehold();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DISMISS_KEY) === "true";
  });

  const { data: config } = useQuery({
    queryKey: ["plaid-config"],
    queryFn: api.getPlaidConfig,
    staleTime: 30_000,
  });

  const isOwner = household?.members.some((m) => m.role === "owner");

  if (dismissed || !config || config.configured || !isOwner) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="relative rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4">
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15">
          <Link2 className="h-4.5 w-4.5 text-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Connect your bank accounts</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Set up your Plaid integration in Settings to automatically sync
            transactions and balances.
          </p>
          <button
            onClick={() => router.push("/settings?section=integrations")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/80"
          >
            Set up Plaid
          </button>
        </div>
      </div>
    </div>
  );
}
