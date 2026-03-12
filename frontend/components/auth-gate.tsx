"use client";

import { type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import Sidebar from "@/components/sidebar";
import LoginPage from "@/app/login/page";
import { Loader2 } from "lucide-react";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

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
      <Sidebar />
      <main className="ml-60 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </>
  );
}
