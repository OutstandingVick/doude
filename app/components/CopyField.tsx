"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; ignore.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface2 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
        <div className="truncate font-mono text-xs text-text">{value}</div>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-text"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}