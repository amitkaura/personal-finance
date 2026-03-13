"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Download,
  Eye,
  EyeOff,
  Users,
  UserPlus,
  LogOut,
  Mail,
  UserCircle,
  RotateCcw,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import type { UserSettings, UserProfile, CategoryRule } from "@/lib/types";
import ConfirmDialog from "@/components/confirm-dialog";
import BulkCsvImportDialog from "@/components/bulk-csv-import-dialog";

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "JPY", "CHF", "INR", "BRL", "MXN"];
const DATE_FORMATS = ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];
const LOCALES = [
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr-CA", label: "French (Canada)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German" },
  { value: "es-ES", label: "Spanish" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "ja-JP", label: "Japanese" },
];
const TIMEZONES = [
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];
const CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transportation",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Health & Fitness",
  "Travel",
  "Education",
  "Subscriptions",
  "Income",
  "Transfer",
  "Rent & Mortgage",
  "Insurance",
  "Investments",
  "Other",
];

const selectClass =
  "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer";
const inputClass =
  "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";
const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";

export default function SettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Configure your preferences and manage your data.
      </p>
      <div className="mt-8 space-y-6">
        <ProfileSection />
        <HouseholdSection />
        <GeneralSection />
        <SyncSection />
        <AiSection />
        <DataSection />
      </div>
    </>
  );
}

// ── Profile & Account ─────────────────────────────────────────

function ProfileSection() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: api.getProfile,
  });

  const [form, setForm] = useState<Partial<UserProfile>>({});
  const [saved, setSaved] = useState(false);

  const displayName = form.display_name ?? profile?.display_name ?? "";
  const avatarUrl = form.avatar_url ?? profile?.avatar_url ?? "";
  const bio = form.bio ?? profile?.bio ?? "";

  const dirty =
    form.display_name !== undefined ||
    form.avatar_url !== undefined ||
    form.bio !== undefined;

  const mutation = useMutation({
    mutationFn: api.updateProfile,
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      await refreshUser();
      setForm({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function handleSave() {
    const payload: { display_name?: string; avatar_url?: string; bio?: string } = {};
    if (form.display_name !== undefined) payload.display_name = form.display_name ?? "";
    if (form.avatar_url !== undefined) payload.avatar_url = form.avatar_url ?? "";
    if (form.bio !== undefined) payload.bio = form.bio ?? "";
    mutation.mutate(payload);
  }

  function handleReset(field: "display_name" | "avatar_url") {
    setForm({ ...form, [field]: "" });
  }

  const previewName = displayName || profile?.google_name || user?.name || "";
  const previewPicture = avatarUrl || profile?.google_picture || user?.picture || "";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <UserCircle className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Profile & Account</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Manage your display identity. Overrides are optional -- Google values
        are used as defaults.
      </p>

      <div className="mt-5 flex gap-6">
        {/* Avatar preview */}
        <div className="flex flex-col items-center gap-2">
          {previewPicture ? (
            <Image
              src={previewPicture}
              alt={previewName}
              width={64}
              height={64}
              className="rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-xl font-semibold text-accent">
              {previewName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-[10px] text-muted-foreground">Preview</span>
        </div>

        {/* Fields */}
        <div className="flex-1 space-y-4">
          {/* Read-only email */}
          <div>
            <label className={labelClass}>Email (from Google)</label>
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {user?.email}
            </p>
          </div>

          {/* Display name */}
          <div>
            <label className={labelClass}>Display Name</label>
            <div className="flex gap-2">
              <input
                value={displayName}
                onChange={(e) =>
                  setForm({ ...form, display_name: e.target.value })
                }
                placeholder={profile?.google_name || user?.name || "Your name"}
                className={`${inputClass} flex-1`}
                maxLength={100}
              />
              {displayName && (
                <button
                  type="button"
                  onClick={() => handleReset("display_name")}
                  className="rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Reset to Google name"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!displayName && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Using Google name: {profile?.google_name || user?.name}
              </p>
            )}
          </div>

          {/* Avatar URL */}
          <div>
            <label className={labelClass}>Avatar URL</label>
            <div className="flex gap-2">
              <input
                value={avatarUrl}
                onChange={(e) =>
                  setForm({ ...form, avatar_url: e.target.value })
                }
                placeholder="https://..."
                className={`${inputClass} flex-1`}
                maxLength={500}
              />
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => handleReset("avatar_url")}
                  className="rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Reset to Google avatar"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!avatarUrl && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Using Google avatar
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className={labelClass}>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="A short tagline about yourself (optional)"
              rows={2}
              maxLength={300}
              className={`${inputClass} w-full resize-none`}
            />
            <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
              {bio.length}/300
            </p>
          </div>
        </div>
      </div>

      {(dirty || saved) && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && (
            <span className="text-xs text-green-400">Profile saved</span>
          )}
          {mutation.isError && (
            <span className="text-xs text-red-400">
              {(mutation.error as Error).message}
            </span>
          )}
          {dirty && (
            <SaveButton loading={mutation.isPending} onClick={handleSave} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Household ─────────────────────────────────────────────────

function HouseholdSection() {
  const queryClient = useQueryClient();
  const { household, refetch } = useHousehold();
  const [email, setEmail] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  }

  const inviteMutation = useMutation({
    mutationFn: api.invitePartner,
    onSuccess: () => {
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["household"] });
      refetch();
      showFeedback("Invitation sent! Your partner will see it when they log in.");
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: api.cancelInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["household"] });
      refetch();
      showFeedback("Invitation cancelled.");
    },
  });

  const renameMutation = useMutation({
    mutationFn: api.updateHouseholdName,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["household"] });
      refetch();
      setEditingName(false);
    },
  });

  async function handleLeave() {
    setLeaving(true);
    try {
      await api.leaveHousehold();
      queryClient.invalidateQueries({ queryKey: ["household"] });
      refetch();
      setConfirmLeave(false);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Household</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Share your financial dashboard with a partner. Both of you get Mine,
        Yours, and Ours views.
      </p>

      {feedback && (
        <div className="mt-3 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-2.5">
          <p className="text-xs font-medium text-green-400">{feedback}</p>
        </div>
      )}

      {household ? (
        <div className="mt-5 space-y-4">
          {/* Household Name */}
          <div>
            <label className={labelClass}>Household Name</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className={`${inputClass} flex-1`}
                  maxLength={100}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nameInput.trim())
                      renameMutation.mutate(nameInput.trim());
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <button
                  onClick={() =>
                    nameInput.trim() && renameMutation.mutate(nameInput.trim())
                  }
                  disabled={!nameInput.trim() || renameMutation.isPending}
                  className="rounded p-1.5 text-green-400 hover:bg-green-500/15"
                >
                  {renameMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm">{household.name}</span>
                <button
                  onClick={() => {
                    setNameInput(household.name);
                    setEditingName(true);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Members */}
          <div>
            <label className={labelClass}>Members</label>
            <div className="space-y-2">
              {household.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3"
                >
                  {m.picture ? (
                    <Image
                      src={m.picture}
                      alt={m.name}
                      width={28}
                      height={28}
                      className="rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-medium text-accent">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Invitations */}
          {household.pending_invitations.length > 0 && (
            <div>
              <label className={labelClass}>Pending Invitations</label>
              <div className="space-y-2">
                {household.pending_invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-2.5"
                  >
                    <Mail className="h-4 w-4 text-amber-400" />
                    <span className="flex-1 text-sm text-muted-foreground">
                      {inv.invited_email}
                    </span>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                      Pending
                    </span>
                    <button
                      onClick={() => cancelInviteMutation.mutate(inv.token)}
                      disabled={cancelInviteMutation.isPending}
                      className="rounded p-1 text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
                      title="Cancel invitation"
                    >
                      {cancelInviteMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Your partner needs to sign in with the email above to see and accept
                the invitation.
              </p>
            </div>
          )}

          {/* Invite form (when less than 2 members and no pending invites) */}
          {household.members.length < 2 &&
            household.pending_invitations.length === 0 && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className={labelClass}>Invite Partner</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="partner@email.com"
                    className={`${inputClass} w-full`}
                  />
                </div>
                <button
                  onClick={() =>
                    email.trim() && inviteMutation.mutate(email.trim())
                  }
                  disabled={!email.trim() || inviteMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Invite
                </button>
              </div>
            )}

          {inviteMutation.isError && (
            <p className="text-xs text-red-400">
              {(inviteMutation.error as Error).message}
            </p>
          )}

          <div className="pt-2">
            <button
              onClick={() => setConfirmLeave(true)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Leave Household
            </button>
          </div>

          <ConfirmDialog
            open={confirmLeave}
            title="Leave household?"
            description="You will lose access to your partner's data and the shared view. Your own data is unaffected. You can rejoin if they invite you again."
            confirmLabel="Leave"
            destructive
            loading={leaving}
            onConfirm={handleLeave}
            onCancel={() => setConfirmLeave(false)}
          />
        </div>
      ) : (
        <div className="mt-5">
          <p className="mb-3 text-xs text-muted-foreground">
            You are not part of a household yet. Invite a partner by email to get
            started.
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className={labelClass}>Partner&apos;s Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@email.com"
                className={`${inputClass} w-full`}
              />
            </div>
            <button
              onClick={() =>
                email.trim() && inviteMutation.mutate(email.trim())
              }
              disabled={!email.trim() || inviteMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {inviteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Invite Partner
            </button>
          </div>
          {inviteMutation.isError && (
            <p className="mt-2 text-xs text-red-400">
              {(inviteMutation.error as Error).message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── General ───────────────────────────────────────────────────

function GeneralSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const [form, setForm] = useState<Partial<UserSettings>>({});
  const [saved, setSaved] = useState(false);

  const currency = form.currency ?? settings?.currency ?? "CAD";
  const dateFormat = form.date_format ?? settings?.date_format ?? "YYYY-MM-DD";
  const locale = form.locale ?? settings?.locale ?? "en-CA";

  const dirty =
    form.currency !== undefined ||
    form.date_format !== undefined ||
    form.locale !== undefined;

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setForm({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">General</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Display preferences for currency, dates, and number formatting.
      </p>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Currency</label>
          <select
            value={currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className={`${selectClass} w-full`}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Date Format</label>
          <select
            value={dateFormat}
            onChange={(e) => setForm({ ...form, date_format: e.target.value })}
            className={`${selectClass} w-full`}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Locale</label>
          <select
            value={locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value })}
            className={`${selectClass} w-full`}
          >
            {LOCALES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      {(dirty || saved) && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && (
            <span className="text-xs text-green-400">Settings saved</span>
          )}
          {dirty && (
            <SaveButton
              loading={mutation.isPending}
              onClick={() => mutation.mutate(form)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sync Schedule ─────────────────────────────────────────────

function SyncSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const [form, setForm] = useState<Partial<UserSettings>>({});
  const [saved, setSaved] = useState(false);

  const enabled = form.sync_enabled ?? settings?.sync_enabled ?? true;
  const hour = form.sync_hour ?? settings?.sync_hour ?? 0;
  const minute = form.sync_minute ?? settings?.sync_minute ?? 0;
  const timezone = form.sync_timezone ?? settings?.sync_timezone ?? "America/Toronto";

  const dirty =
    form.sync_enabled !== undefined ||
    form.sync_hour !== undefined ||
    form.sync_minute !== undefined ||
    form.sync_timezone !== undefined;

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setForm({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Sync Schedule</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Automatically sync transactions from all connected accounts.
          </p>
        </div>
        <button
          onClick={() => setForm({ ...form, sync_enabled: !enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-accent" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {enabled && (
        <div className="mt-5 grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Hour</label>
            <select
              value={hour}
              onChange={(e) =>
                setForm({ ...form, sync_hour: parseInt(e.target.value) })
              }
              className={`${selectClass} w-full`}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Minute</label>
            <select
              value={minute}
              onChange={(e) =>
                setForm({ ...form, sync_minute: parseInt(e.target.value) })
              }
              className={`${selectClass} w-full`}
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  :{String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <select
              value={timezone}
              onChange={(e) =>
                setForm({ ...form, sync_timezone: e.target.value })
              }
              className={`${selectClass} w-full`}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      {(dirty || saved) && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && (
            <span className="text-xs text-green-400">Schedule saved</span>
          )}
          {dirty && (
            <SaveButton
              loading={mutation.isPending}
              onClick={() => mutation.mutate(form)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Category Rules ────────────────────────────────────────────

function CategoryRulesSection() {
  const queryClient = useQueryClient();
  const { data: rules } = useQuery({
    queryKey: ["rules"],
    queryFn: api.getRules,
  });

  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newCaseSensitive, setNewCaseSensitive] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CategoryRule>>({});

  const createMutation = useMutation({
    mutationFn: api.createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setNewKeyword("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Partial<CategoryRule> & { id: number }) =>
      api.updateRule(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setEditingId(null);
      setEditForm({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
  });

  function startEdit(rule: CategoryRule) {
    setEditingId(rule.id);
    setEditForm({
      keyword: rule.keyword,
      category: rule.category,
      case_sensitive: rule.case_sensitive,
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Category Rules</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Keyword rules for automatic categorization. Matched before the AI
        fallback.
      </p>

      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2.5">Keyword</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Case Sensitive</th>
              <th className="px-4 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {rules?.map((rule) =>
              editingId === rule.id ? (
                <tr key={rule.id} className="border-b border-border">
                  <td className="px-4 py-2">
                    <input
                      value={editForm.keyword ?? ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, keyword: e.target.value })
                      }
                      className={`${inputClass} w-full`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={editForm.category ?? ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, category: e.target.value })
                      }
                      className={`${selectClass} w-full`}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={editForm.case_sensitive ?? false}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          case_sensitive: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded accent-accent"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          updateMutation.mutate({
                            id: rule.id,
                            ...editForm,
                          })
                        }
                        className="rounded p-1 text-success hover:bg-success/15"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditForm({});
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={rule.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {rule.keyword}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {rule.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {rule.case_sensitive ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(rule)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(rule.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {(!rules || rules.length === 0) && editingId === null && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-xs text-muted-foreground"
                >
                  No rules yet. Add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add new rule */}
      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <label className={labelClass}>Keyword</label>
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="e.g. Starbucks"
            className={`${inputClass} w-full`}
          />
        </div>
        <div className="flex-1">
          <label className={labelClass}>Category</label>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className={`${selectClass} w-full`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={newCaseSensitive}
            onChange={(e) => setNewCaseSensitive(e.target.checked)}
            className="h-4 w-4 rounded accent-accent"
          />
          Case
        </label>
        <button
          onClick={() =>
            newKeyword.trim() &&
            createMutation.mutate({
              keyword: newKeyword.trim(),
              category: newCategory,
              case_sensitive: newCaseSensitive,
            })
          }
          disabled={!newKeyword.trim() || createMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add Rule
        </button>
      </div>
    </div>
  );
}

// ── AI Categorization ─────────────────────────────────────────

function AiSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const [form, setForm] = useState<Partial<UserSettings>>({});
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const baseUrl = form.llm_base_url ?? settings?.llm_base_url ?? "";
  const model = form.llm_model ?? settings?.llm_model ?? "";
  const keyIsSet = settings?.llm_api_key_set ?? false;

  const dirty =
    form.llm_base_url !== undefined ||
    form.llm_model !== undefined ||
    apiKey.length > 0;

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setForm({});
      setApiKey("");
    },
  });

  function handleSave() {
    const payload: Partial<UserSettings> & { llm_api_key?: string } = {
      ...form,
    };
    if (apiKey) {
      payload.llm_api_key = apiKey;
    }
    mutation.mutate(payload);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">AI Categorization</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Configure the LLM provider used as a fallback when no keyword rules
        match. Works with OpenAI, Ollama, Azure, and any OpenAI-compatible API.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelClass}>Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) =>
              setForm({ ...form, llm_base_url: e.target.value })
            }
            placeholder="https://api.openai.com/v1"
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className={labelClass}>Model</label>
          <input
            value={model}
            onChange={(e) => setForm({ ...form, llm_model: e.target.value })}
            placeholder="gpt-4o-mini"
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className={labelClass}>API Key</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyIsSet ? "••••••••  (key is set)" : "sk-..."}
              className={`${inputClass} w-full pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
      {dirty && (
        <div className="mt-4 flex justify-end">
          <SaveButton
            loading={mutation.isPending}
            onClick={handleSave}
          />
        </div>
      )}
    </div>
  );
}

// ── Data Management ───────────────────────────────────────────

function DataSection() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  async function handleClear() {
    setClearing(true);
    try {
      await api.clearTransactions();
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  }

  async function handleFactoryReset() {
    setResetting(true);
    try {
      await api.factoryReset();
      queryClient.invalidateQueries();
      setConfirmResetOpen(false);
    } finally {
      setResetting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    let objectUrl = "";
    try {
      objectUrl = await api.exportTransactions();
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "transactions.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setExporting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Data Management</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Export your data or clear transaction history.
      </p>

      <div className="mt-5 flex items-center gap-4">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? "Exporting..." : "Export Transactions (CSV)"}
        </button>
        <button
          onClick={() => setBulkImportOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          <Upload className="h-4 w-4" />
          Import Transactions (CSV)
        </button>
      </div>
      {bulkImportOpen && (
        <BulkCsvImportDialog onClose={() => setBulkImportOpen(false)} />
      )}
      {exportError && (
        <p className="mt-2 text-xs text-red-400">{exportError}</p>
      )}

      <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">
              Permanently delete all transaction records. Accounts and rules will remain.
            </p>
            <button
              onClick={() => setConfirmOpen(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Clear All Transactions
            </button>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Delete all financial data: accounts, transactions, budgets, goals, categories, rules, tags, and net worth history. Your login and household membership will be preserved.
            </p>
            <button
              onClick={() => setConfirmResetOpen(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <RotateCcw className="h-4 w-4" />
              Factory Reset
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear all transactions?"
        description="This will permanently delete every transaction record. Connected accounts and category rules will remain. This action cannot be undone."
        confirmLabel="Delete Everything"
        destructive
        loading={clearing}
        onConfirm={handleClear}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={confirmResetOpen}
        title="Factory reset?"
        description="This will permanently delete ALL your financial data — accounts, transactions, budgets, goals, categories, rules, tags, and net worth history. Your login and household membership will be preserved. This action cannot be undone."
        confirmLabel="Reset Everything"
        destructive
        loading={resetting}
        onConfirm={handleFactoryReset}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────

function SaveButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {loading ? "Saving..." : "Save"}
    </button>
  );
}
