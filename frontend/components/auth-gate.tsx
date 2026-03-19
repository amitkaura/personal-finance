"use client";

import { type ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import Sidebar from "@/components/sidebar";
import InvitationBanner from "@/components/invitation-banner";
import StatementReminderBanner from "@/components/statement-reminder-banner";
import CategorizationDrawer from "@/components/categorization-drawer";
import OnboardingRedirect from "@/components/onboarding-redirect";
import LoginPage from "@/app/login/page";
import { Loader2, Menu } from "lucide-react";

const AUTH_BYPASS_PATHS = ["/staging-login", "/privacy"];
const SIDEBAR_SKIP_PATHS = ["/onboarding"];

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  if (AUTH_BYPASS_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const isOnboarding = SIDEBAR_SKIP_PATHS.includes(pathname);

  if (isOnboarding) {
    return (
      <div className="min-h-screen">
        <header className="flex items-center px-6 py-4">
          <span className="text-xl font-bold tracking-tight">fino</span>
        </header>
        {children}
      </div>
    );
  }

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="fixed left-4 top-4 z-40 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg bg-card p-2 shadow-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <main className="lg:ml-60 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-8 pt-16 lg:pt-8">
          <OnboardingRedirect />
          <InvitationBanner />
          <StatementReminderBanner />
          {children}
        </div>
      </main>

      <CategorizationDrawer />
    </>
  );
}
