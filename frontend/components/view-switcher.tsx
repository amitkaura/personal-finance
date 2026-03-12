"use client";

import Image from "next/image";
import { User, Users, Heart } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import type { ViewScope } from "@/lib/types";

const SCOPES: { value: ViewScope; label: string; icon: typeof User }[] = [
  { value: "personal", label: "Mine", icon: User },
  { value: "partner", label: "Yours", icon: Heart },
  { value: "household", label: "Ours", icon: Users },
];

export default function ViewSwitcher() {
  const { household, partner, scope, setScope } = useHousehold();

  if (!household) return null;

  return (
    <div className="px-3 pb-2">
      <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
        {SCOPES.map(({ value, label, icon: Icon }) => {
          const active = scope === value;
          const isPartner = value === "partner";

          return (
            <button
              key={value}
              onClick={() => setScope(value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={
                isPartner && partner
                  ? `${partner.name}'s data`
                  : undefined
              }
            >
              {isPartner && partner?.picture ? (
                <Image
                  src={partner.picture}
                  alt={partner.name}
                  width={14}
                  height={14}
                  className="rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              <span>{isPartner && partner ? partner.name.split(" ")[0] : label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
