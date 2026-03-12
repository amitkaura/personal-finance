"use client";

import { useQuery } from "@tanstack/react-query";
import { Wallet, Landmark, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise } from "@/lib/hooks";

export default function NetWorthCard() {
  const formatCurrency = useFormatCurrencyPrecise();
  const { data, isLoading } = useQuery({
    queryKey: ["accountSummary"],
    queryFn: api.getAccountSummary,
  });

  const assets = (data?.depository_balance ?? 0) + (data?.investment_balance ?? 0);
  const liabilities = (data?.credit_balance ?? 0) + (data?.loan_balance ?? 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-sm font-medium text-muted-foreground">Net Worth</p>

      {isLoading ? (
        <div className="mt-2 h-10 w-48 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-1 text-4xl font-bold tracking-tight">
          {formatCurrency(data?.net_worth ?? 0)}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-muted/50 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ArrowUp className="h-4 w-4 text-success" />
            <span className="text-xs font-medium">Assets</span>
          </div>
          {isLoading ? (
            <div className="mt-2 h-6 w-28 animate-pulse rounded bg-muted" />
          ) : (
            <p className="mt-1 text-lg font-semibold text-success">
              {formatCurrency(assets)}
            </p>
          )}
          {!isLoading && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <Landmark className="h-3 w-3" /> Cash
                </span>
                <span>{formatCurrency(data?.depository_balance ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Investments
                </span>
                <span>{formatCurrency(data?.investment_balance ?? 0)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-muted/50 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ArrowDown className="h-4 w-4 text-danger" />
            <span className="text-xs font-medium">Liabilities</span>
          </div>
          {isLoading ? (
            <div className="mt-2 h-6 w-28 animate-pulse rounded bg-muted" />
          ) : (
            <p className="mt-1 text-lg font-semibold text-danger">
              {formatCurrency(liabilities)}
            </p>
          )}
          {!isLoading && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Credit Cards</span>
                <span>{formatCurrency(data?.credit_balance ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Loans</span>
                <span>{formatCurrency(data?.loan_balance ?? 0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {!isLoading && (
        <p className="mt-4 text-xs text-muted-foreground">
          <Wallet className="mr-1 inline h-3 w-3" />
          {data?.account_count ?? 0} linked account
          {data?.account_count !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
