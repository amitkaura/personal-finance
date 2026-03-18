"use client";

import { useState, useEffect, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Zap, Key, Brain, KeyRound, SkipForward } from "lucide-react";
import { api } from "@/lib/api";
import { PLAID_MODES, LLM_MODES } from "@/lib/types";
import SandboxBanner from "@/components/sandbox-banner";

interface StepProps {
  onComplete: () => void;
}

function PlaidModeStep({ onComplete }: StepProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: plaidMode, isLoading } = useQuery({
    queryKey: ["plaid-mode"],
    queryFn: api.getPlaidMode,
  });

  const selectMode = useMutation({
    mutationFn: (mode: string) => api.setPlaidMode(mode),
    onSuccess: (data) => {
      queryClient.setQueryData(["plaid-mode"], data);
      queryClient.invalidateQueries({ queryKey: ["plaid-config"] });
      onComplete();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const managedAvailable = plaidMode?.managed_available ?? false;
  const isSandbox = managedAvailable && plaidMode?.managed_plaid_env === "sandbox";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">How would you like to connect your bank?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose how you want to link your financial accounts.
        </p>
      </div>

      {isSandbox && <SandboxBanner />}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {managedAvailable && (
          <button
            onClick={() => selectMode.mutate(PLAID_MODES.MANAGED)}
            disabled={selectMode.isPending}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-6 text-center transition-colors hover:border-accent hover:bg-accent/10 disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
              <Zap className="h-6 w-6 text-accent" />
            </div>
            <div>
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-base font-semibold">Connect instantly</h2>
                {isSandbox && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    Demo
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Link your bank accounts right away — no setup required.
              </p>
            </div>
          </button>
        )}

        <button
          onClick={() => selectMode.mutate(PLAID_MODES.BYOK)}
          disabled={selectMode.isPending}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-border p-6 text-center transition-colors hover:border-foreground/20 hover:bg-muted/50 disabled:opacity-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Key className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Use your own Plaid keys</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Bring your own Plaid API credentials from your developer account.
            </p>
          </div>
        </button>
      </div>

      {selectMode.isPending && (
        <div className="flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}


function LLMModeStep({ onComplete }: StepProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: llmMode, isLoading } = useQuery({
    queryKey: ["llm-mode"],
    queryFn: api.getLLMMode,
  });

  const selectMode = useMutation({
    mutationFn: (mode: string) => api.setLLMMode(mode),
    onSuccess: (data) => {
      queryClient.setQueryData(["llm-mode"], data);
      onComplete();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const managedAvailable = llmMode?.managed_available ?? false;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">AI categorization</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose how you want to categorize your transactions with AI.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {managedAvailable && (
          <button
            onClick={() => selectMode.mutate(LLM_MODES.MANAGED)}
            disabled={selectMode.isPending}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-6 text-center transition-colors hover:border-accent hover:bg-accent/10 disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
              <Brain className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Use managed AI</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the built-in AI to categorize your transactions — no API key needed.
              </p>
            </div>
          </button>
        )}

        <button
          onClick={() => selectMode.mutate(LLM_MODES.BYOK)}
          disabled={selectMode.isPending}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-border p-6 text-center transition-colors hover:border-foreground/20 hover:bg-muted/50 disabled:opacity-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <KeyRound className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Bring your own API key</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Use your own OpenAI, Anthropic, or other LLM API credentials.
            </p>
          </div>
        </button>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => selectMode.mutate(LLM_MODES.NONE)}
          disabled={selectMode.isPending}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="inline-flex items-center gap-1.5">
            <SkipForward className="h-4 w-4" />
            Skip for now
          </span>
        </button>
      </div>

      {selectMode.isPending && (
        <div className="flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}


const STEP_IDS = ["plaid-mode", "llm-mode"] as const;
type StepId = (typeof STEP_IDS)[number];

const STEP_COMPONENTS: Record<StepId, ComponentType<StepProps>> = {
  "plaid-mode": PlaidModeStep,
  "llm-mode": LLMModeStep,
};

export default function OnboardingPage() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<StepId>(STEP_IDS[0]);

  const { data: plaidMode, isLoading: plaidLoading } = useQuery({
    queryKey: ["plaid-mode"],
    queryFn: api.getPlaidMode,
  });

  const { data: llmMode, isLoading: llmLoading } = useQuery({
    queryKey: ["llm-mode"],
    queryFn: api.getLLMMode,
  });

  const isStepComplete = (id: StepId): boolean => {
    if (id === "plaid-mode") return !!plaidMode && plaidMode.mode !== null;
    if (id === "llm-mode") return !!llmMode && llmMode.mode !== null;
    return false;
  };

  useEffect(() => {
    if (plaidLoading || llmLoading) return;
    const firstIncomplete = STEP_IDS.find((id) => !isStepComplete(id));
    if (!firstIncomplete) {
      router.push("/");
    } else if (firstIncomplete !== activeStep && STEP_IDS.indexOf(firstIncomplete) > STEP_IDS.indexOf(activeStep)) {
      setActiveStep(firstIncomplete);
    }
  }, [plaidMode, llmMode, plaidLoading, llmLoading]);

  if (plaidLoading || llmLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const StepComponent = STEP_COMPONENTS[activeStep];
  const currentIdx = STEP_IDS.indexOf(activeStep);

  function handleStepComplete() {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= STEP_IDS.length) {
      router.push("/");
      return;
    }
    const nextStep = STEP_IDS[nextIdx];
    if (isStepComplete(nextStep)) {
      router.push("/");
      return;
    }
    setActiveStep(nextStep);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-6">
        {STEP_IDS.length > 1 && (
          <div className="flex justify-center" data-testid="step-indicator">
            <span className="text-xs text-muted-foreground">
              Step {currentIdx + 1} of {STEP_IDS.length}
            </span>
          </div>
        )}

        <StepComponent onComplete={handleStepComplete} />
      </div>
    </div>
  );
}
