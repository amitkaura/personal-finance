"use client";

import { type ReactNode, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import Sidebar from "@/components/sidebar";
import InvitationBanner from "@/components/invitation-banner";
import LoginPage from "@/app/login/page";
import { Loader2, Menu } from "lucide-react";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile hamburger */}
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
          <InvitationBanner />
          {children}
        </div>
      </main>
    </>
  );
}
