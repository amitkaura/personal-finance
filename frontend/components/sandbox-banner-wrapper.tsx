"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import SandboxBanner from "@/components/sandbox-banner";

export default function SandboxBannerWrapper() {
  const { data: plaidConfig } = useQuery({
    queryKey: ["plaid-config"],
    queryFn: api.getPlaidConfig,
    staleTime: 30_000,
  });

  if (plaidConfig?.plaid_env !== "sandbox") return null;

  return <SandboxBanner />;
}
