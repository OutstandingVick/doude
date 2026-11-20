"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Download, WifiOff, X } from "lucide-react";
import { QUEUE_EVENT, flushQueue, listQueued } from "@/lib/offlineQueue";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaValue {
  online: boolean;
  queued: number;
  /** "prompt": browser can install (Chrome/Edge/Android); "ios": Add to Home Screen; null: not offered. */
  installMode: "prompt" | "ios" | null;
  install: () => Promise<void>;
}

const Ctx = createContext<PwaValue>({ online: true, queued: 0, installMode: null, install: async () => {} });
export const usePwa = () => useContext(Ctx);

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Tell the service worker to drop cached engine data (e.g. on logout). */
export function clearOfflineData() {
  navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_API_CACHE" });
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  // Service worker.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Cache the assets this first page load already fetched.
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin));
        reg.active?.postMessage({ type: "CACHE_URLS", urls });
      })
      .catch(() => {});
  }, []);

  // Online state + offline upload queue.
  useEffect(() => {
    const refreshCount = () => listQueued().then((q) => setQueued(q.length)).catch(() => {});
    const goOnline = () => {
      setOnline(true);
      flushQueue().catch(() => {});
    };
    const goOffline = () => setOnline(false);
    queueMicrotask(() => setOnline(navigator.onLine));
    refreshCount();
    if (navigator.onLine) flushQueue().catch(() => {});
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener(QUEUE_EVENT, refreshCount);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener(QUEUE_EVENT, refreshCount);
    };
  }, []);

  // Install.
  useEffect(() => {
    if (isStandalone()) return;
    const iosSafari = isIosSafari();
    queueMicrotask(() => setIos(iosSafari));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIos(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      setDeferred(null);
    } else if (ios) {
      setShowIosHelp(true);
    }
  }, [deferred, ios]);

  const installMode = deferred ? "prompt" : ios ? "ios" : null;

  return (
    <Ctx.Provider value={{ online, queued, installMode, install }}>
      {!online && (
        <div
          role="status"
          className="sticky top-0 z-[1000] flex items-center justify-center gap-2 bg-text px-4 py-2 text-center text-xs font-medium text-white"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            You&apos;re offline — showing saved data (read-only).
            {queued > 0 && ` ${queued} evidence upload${queued === 1 ? "" : "s"} will send when you reconnect.`}
          </span>
        </div>
      )}
      {children}
      {showIosHelp && (
        <div
          role="dialog"
          aria-label="Install Feasibility3D"
          className="fixed inset-x-4 bottom-4 z-[1001] mx-auto max-w-sm rounded-[16px] border border-border bg-surface p-4 text-sm text-text shadow-xl"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowIosHelp(false)}
            className="absolute right-3 top-3 text-faint hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="mb-1 font-medium">Install Feasibility3D</p>
          <p className="text-muted">
            Tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>.
          </p>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Renders only when the browser supports installing the app. */
export function InstallButton({ className = "" }: { className?: string }) {
  const { installMode, install } = usePwa();
  if (!installMode) return null;
  return (
    <button
      type="button"
      onClick={install}
      className={`chip gap-1.5 border border-border bg-surface text-sm font-medium text-text hover:bg-surface2 ${className}`}
    >
      <Download className="h-4 w-4" />
      Install app
    </button>
  );
}
