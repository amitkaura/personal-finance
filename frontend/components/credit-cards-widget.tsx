"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { api } from "@/lib/api";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(Math.abs(n));
}

export default function CreditCardsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["accountSummary"],
    queryFn: api.getAccountSummary,
  });

  const cards = data?.credit_accounts ?? [];
  const totalOwed = data?.credit_balance ?? 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Credit Cards
          </h3>
        </div>
        {!isLoading && cards.length > 0 && (
          <span className="text-sm font-semibold text-danger">
            {formatCurrency(totalOwed)} owed
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No credit cards linked.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {cards.map((card) => {
            const balance = Math.abs(card.current_balance);
            const limit = card.credit_limit ?? 0;
            const utilization = limit > 0 ? (balance / limit) * 100 : 0;
            const barColor =
              utilization > 70
                ? "bg-danger"
                : utilization > 30
                  ? "bg-amber-400"
                  : "bg-success";

            return (
              <li key={card.id} className="rounded-lg bg-muted/40 px-3 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{card.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {card.subtype || card.official_name || "Credit Card"}
                    </p>
                  </div>
                  <div className="ml-3 text-right">
                    <span className="text-sm font-semibold text-danger">
                      {formatCurrency(card.current_balance)}
                    </span>
                    {limit > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        of {formatCurrency(limit)} limit
                      </p>
                    )}
                  </div>
                </div>
                {limit > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>{utilization.toFixed(0)}% utilized</span>
                      <span>
                        {formatCurrency(
                          card.available_balance ?? (limit - balance)
                        )}{" "}
                        available
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={`h-1.5 rounded-full ${barColor} transition-all`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
