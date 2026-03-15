"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function OnboardingRedirect() {
  const router = useRouter();

  const { data: plaidMode } = useQuery({
    queryKey: ["plaid-mode"],
    queryFn: api.getPlaidMode,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (plaidMode && plaidMode.mode === null) {
      router.push("/onboarding");
    }
  }, [plaidMode, router]);

  return null;
}
