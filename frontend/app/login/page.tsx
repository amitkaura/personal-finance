"use client";

import { useAuth } from "@/components/auth-provider";
import { GoogleLogin } from "@react-oauth/google";
import {
  PiggyBank,
  Users,
  Cable,
  TrendingUp,
  Target,
  RotateCw,
  Lock,
  Server,
  Shield,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const FEATURES = [
  {
    icon: PiggyBank,
    title: "Smart Budgets",
    desc: "Set it, track it, crush it.",
  },
  {
    icon: Users,
    title: "Household Sharing",
    desc: "Manage money with your partner.",
  },
  {
    icon: Cable,
    title: "Bank Connections",
    desc: "All your accounts in one place.",
  },
  {
    icon: TrendingUp,
    title: "Cash Flow Insights",
    desc: "See where every dollar goes.",
  },
  {
    icon: Target,
    title: "Goal Tracking",
    desc: "Save smarter, reach milestones.",
  },
  {
    icon: RotateCw,
    title: "Recurring Detection",
    desc: "Subscriptions, auto-spotted.",
  },
];

const TRUST = [
  { icon: Server, label: "Self-hosted" },
  { icon: Lock, label: "Private" },
  { icon: Shield, label: "Yours" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen">
      {/* Animated mesh background */}
      <div className="landing-mesh">
        <div className="landing-mesh-extra" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Hero */}
        <section className="flex min-h-screen flex-col items-center justify-center px-6">
          {/* Wordmark */}
          <div className="mb-10 flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-12 w-12 sm:h-14 sm:w-14" />
            <h2 className="text-5xl font-extrabold tracking-tight gradient-text-warm sm:text-6xl">
              fino
            </h2>
          </div>

          {/* Headline */}
          <h1 className="max-w-3xl text-center text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-7xl">
            <span className="gradient-text">Take control</span>{" "}
            <span className="text-foreground">of every dollar.</span>
          </h1>

          <p className="mt-6 max-w-xl text-center text-lg text-muted-foreground sm:text-xl">
            Track spending, set budgets, plan goals&mdash;together or solo.
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-6">
            <p className="text-sm text-muted-foreground">
              Sign in or create an account instantly
            </p>
            <div className="glow-wrapper rounded-xl">
              <div className="rounded-xl bg-card/80 backdrop-blur-sm p-4">
                <GoogleLogin
                  onSuccess={async (response) => {
                    if (!response.credential) {
                      setError("No credential received from Google");
                      return;
                    }
                    try {
                      await login(response.credential);
                      router.push("/");
                    } catch {
                      setError("Authentication failed. Please try again.");
                    }
                  }}
                  onError={() => setError("Google sign-in failed")}
                  theme="filled_black"
                  size="large"
                  width="320"
                  text="continue_with"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <p className="text-xs text-muted-foreground/60">
              No separate sign-up needed — one click and you&apos;re in.
            </p>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex items-center gap-8">
            {TRUST.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Icon className="h-4 w-4 text-accent" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* Scroll hint */}
          <div className="mt-16 animate-bounce text-muted-foreground/50">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="mb-4 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
            Everything you need.{" "}
            <span className="gradient-text">Nothing you don&apos;t.</span>
          </h2>
          <p className="mx-auto mb-16 max-w-lg text-center text-muted-foreground">
            A complete financial toolkit that lives on your server, under your
            control.
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="feature-card group rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 transition-colors group-hover:bg-accent/25">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mb-1 text-base font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/50 py-8">
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <img src="/logo.png" alt="" className="h-4 w-4" />
            <span className="gradient-text-warm font-semibold">fino</span>
            &mdash; Self-hosted personal finance
          </p>
        </footer>
      </div>
    </div>
  );
}
