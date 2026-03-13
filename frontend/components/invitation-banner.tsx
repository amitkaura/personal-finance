"use client";

import { useState } from "react";
import Image from "next/image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Check, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useHousehold } from "@/components/household-provider";

export default function InvitationBanner() {
  const { pendingInvitations, refetch } = useHousehold();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const acceptMutation = useMutation({
    mutationFn: api.acceptInvitation,
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries();
      refetch();
    },
    onError: () => setError("Failed to accept invitation. Please try again."),
  });

  const declineMutation = useMutation({
    mutationFn: api.declineInvitation,
    onSuccess: (_data, token) => {
      setError(null);
      setDismissed((prev) => new Set(prev).add(token));
      queryClient.invalidateQueries({ queryKey: ["pendingInvitations"] });
      refetch();
    },
    onError: () => setError("Failed to decline invitation. Please try again."),
  });

  const visible = pendingInvitations.filter((inv) => !dismissed.has(inv.token));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}
      {visible.map((inv) => (
        <div
          key={inv.id}
          className="flex items-center gap-4 rounded-xl border border-accent/30 bg-accent/5 px-5 py-3.5"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15">
            {inv.invited_by_picture ? (
              <Image
                src={inv.invited_by_picture}
                alt={inv.invited_by_name}
                width={36}
                height={36}
                className="rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Users className="h-4 w-4 text-accent" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              <span className="text-accent">{inv.invited_by_name}</span> invited
              you to join{" "}
              <span className="text-accent">{inv.household_name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Accept to share Mine / Yours / Ours financial views
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => acceptMutation.mutate(inv.token)}
              disabled={acceptMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Accept
            </button>
            <button
              onClick={() => declineMutation.mutate(inv.token)}
              disabled={declineMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
            >
              {declineMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
