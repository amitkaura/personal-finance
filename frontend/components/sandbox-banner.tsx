import { FlaskConical } from "lucide-react";

export default function SandboxBanner() {
  return (
    <div
      data-testid="sandbox-banner"
      className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
    >
      <FlaskConical className="h-5 w-5 shrink-0" />
      <p>
        Plaid is in test mode &mdash; you can explore with demo accounts but
        cannot connect real bank accounts yet.
      </p>
    </div>
  );
}
