"use client";

import Image from "next/image";
import { Users, Heart } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import type { ViewScope } from "@/lib/types";

const SCOPES: { value: ViewScope; icon: typeof Users }[] = [
  { value: "personal", icon: Users },
  { value: "partner", icon: Heart },
  { value: "household", icon: Users },
];

export default function ViewSwitcher() {
  const { user } = useAuth();
  const { household, partner, scope, setScope } = useHousehold();

  if (!household) return null;

  const firstName = (name: string) => name.split(" ")[0];

  function labelFor(value: ViewScope): string {
    if (value === "personal") return user ? firstName(user.name) : "Mine";
    if (value === "partner") return partner ? firstName(partner.name) : "Yours";
    return household?.name ?? "Ours";
  }

  function pictureFor(value: ViewScope): string | null {
    if (value === "personal") return user?.picture ?? null;
    if (value === "partner") return partner?.picture ?? null;
    return null;
  }

  return (
    <div className="px-3 pb-2">
      <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
        {SCOPES.map(({ value, icon: Icon }) => {
          const active = scope === value;
          const pic = pictureFor(value);
          const label = labelFor(value);

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
                value !== "household"
                  ? `${label}'s data`
                  : "Combined household data"
              }
            >
              {pic ? (
                <Image
                  src={pic}
                  alt={label}
                  width={14}
                  height={14}
                  className="rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
