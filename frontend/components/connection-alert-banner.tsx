"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { PLAID_ITEM_STATUS } from "@/lib/types";
import { useScope } from "@/lib/hooks";

export default function ConnectionAlertBanner() {
  const scope = useScope();
  const { data: connections } = useQuery({
    queryKey: ["plaidItems", scope],
    queryFn: () => api.getPlaidItems(scope),
    staleTime: 60_000,
  });

  const unhealthy = connections?.filter(
    (c) => c.status !== PLAID_ITEM_STATUS.HEALTHY,
  );

  if (!unhealthy || unhealthy.length === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">
          {unhealthy.length} connection{unhealthy.length !== 1 ? "s" : ""} need{unhealthy.length === 1 ? "s" : ""} attention
        </p>
      </div>
      <Link
        href="/connections"
        className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
      >
        View Connections
      </Link>
    </div>
  );
}
