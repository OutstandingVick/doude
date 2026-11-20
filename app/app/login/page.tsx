"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { useSession } from "@/components/SessionProvider";

export default function LoginPage() {
  const { login, authEnabled } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-[24px] border border-border bg-container p-8 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-green text-lg font-semibold text-white">
            F
          </span>
          <div>
            <div className="text-lg font-semibold text-text">Feasibility3D</div>
            <div className="text-xs text-muted">Spill intelligence</div>
          </div>
        </div>

        {!authEnabled && (
          <div className="mb-4 rounded-[10px] bg-info/10 px-3 py-2 text-xs text-info">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
            Authentication is not enabled on this engine.
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 w-full rounded-[12px] bg-surface3 px-3 text-sm text-text outline-none placeholder:text-faint focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-[12px] bg-surface3 px-3 text-sm text-text outline-none placeholder:text-faint focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy || !authEnabled}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-primary text-sm font-medium text-text transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
