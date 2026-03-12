"use client";

import { useAuth } from "@/components/auth-provider";
import { GoogleLogin } from "@react-oauth/google";
import { Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15">
            <Wallet className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Personal Finance
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your finances
          </p>
        </div>

        <div className="flex justify-center">
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
          />
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
