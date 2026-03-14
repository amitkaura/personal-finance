"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, Heart } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import LinkAccount from "@/components/link-account";
import AddPartnerDialog from "@/components/add-partner-dialog";

export default function DashboardActions() {
  const router = useRouter();
  const { partner } = useHousehold();
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {partner ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
            <Heart className="h-3.5 w-3.5" />
            Sharing with {partner.name}
          </span>
        ) : (
          <button
            onClick={() => setShowPartnerDialog(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
          >
            <UserPlus className="h-4 w-4" />
            Add Partner
          </button>
        )}
        <button
          onClick={() => router.push("/accounts?add=true")}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
        >
          <Plus className="h-4 w-4" />
          Add Account
        </button>
        <LinkAccount />
      </div>
      <AddPartnerDialog
        open={showPartnerDialog}
        onClose={() => setShowPartnerDialog(false)}
      />
    </>
  );
}
