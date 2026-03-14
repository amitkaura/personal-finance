"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

function dismissKey(accountId: number): string {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `statement_dismissed_${accountId}_${month}`;
}

export default function StatementReminderBanner() {
  const router = useRouter();
  const { data: reminders } = useQuery({
    queryKey: ["statementReminders"],
    queryFn: () => api.getStatementReminders(),
  });

  const [dismissed, setDismissed] = useState<Set<number>>(() => {
    const set = new Set<number>();
    if (typeof window !== "undefined" && reminders) {
      for (const r of reminders) {
        if (localStorage.getItem(dismissKey(r.id))) set.add(r.id);
      }
    }
    return set;
  });

  if (!reminders) return null;

  const visible = reminders.filter(
    (r) => !dismissed.has(r.id) && !localStorage.getItem(dismissKey(r.id)),
  );
  if (visible.length === 0) return null;

  function handleDismiss(id: number) {
    localStorage.setItem(dismissKey(id), "1");
    setDismissed((prev) => new Set(prev).add(id));
  }

  return (
    <div className="space-y-2 mb-6">
      {visible.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-4 rounded-xl border border-accent/30 bg-accent/5 px-5 py-3.5"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15">
            <FileText className="h-4 w-4 text-accent" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Your <span className="text-accent">{r.name}</span> statement is ready
            </p>
            <p className="text-xs text-muted-foreground">
              Time to upload transactions for the previous statement period
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/accounts")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
            >
              Import CSV
            </button>
            <button
              onClick={() => handleDismiss(r.id)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
