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

  const { data: llmMode } = useQuery({
    queryKey: ["llm-mode"],
    queryFn: api.getLLMMode,
    staleTime: 60_000,
  });

  useEffect(() => {
    const needsPlaid = plaidMode && plaidMode.mode === null;
    const needsLLM = llmMode && llmMode.mode === null;

    if (needsPlaid || needsLLM) {
      router.push("/onboarding");
    }
  }, [plaidMode, llmMode, router]);

  return null;
}
