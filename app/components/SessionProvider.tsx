"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getHealth, getMe, login as apiLogin, logout as apiLogout } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

interface SessionValue {
  /** Whether the engine enforces authentication (COOKIE_SECRET set). */
  authEnabled: boolean;
  /** The logged-in user, or null when not authenticated. */
  user: SessionUser | null;
  /** True when access is allowed (open mode, or a valid session). */
  authenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await getHealth();
        if (cancelled) return;
        setAuthEnabled(health.auth_enabled);
        if (health.auth_enabled) {
          try {
            const me = await getMe();
            if (!cancelled) setUser(me.user);
          } catch {
            if (!cancelled) setUser(null);
          }
        }
      } catch {
        if (!cancelled) {
          setAuthEnabled(false);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiLogin(email, password);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const authenticated = !authEnabled || user !== null;

  return (
    <Ctx.Provider value={{ authEnabled, user, authenticated, loading, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
