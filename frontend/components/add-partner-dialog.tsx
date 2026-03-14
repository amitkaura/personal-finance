"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useHousehold } from "@/components/household-provider";

function extractDetail(err: Error): string {
  const match = err.message.match(/API error \d+: (.+)/);
  if (!match) return err.message;
  try {
    const body = JSON.parse(match[1]);
    return body.detail ?? match[1];
  } catch {
    return match[1];
  }
}

interface AddPartnerDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddPartnerDialog({ open, onClose }: AddPartnerDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { refetch } = useHousehold();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: (inviteEmail: string) => api.invitePartner(inviteEmail),
    onSuccess: () => {
      setEmail("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["household"] });
      refetch();
      onClose();
    },
    onError: (err: Error) => {
      setError(extractDetail(err));
    },
  });

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    inviteMutation.mutate(email.trim());
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-partner-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15">
              <UserPlus className="h-5 w-5 text-accent" />
            </div>
            <h3 id="add-partner-title" className="text-base font-semibold">
              Invite a Partner
            </h3>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Share your finances with a partner. They&apos;ll receive an invitation
          to join your household.
        </p>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Partner's email address"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!email.trim() || inviteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {inviteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
