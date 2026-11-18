"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, CircleHelp, Settings } from "lucide-react";
import { setSettings, useSettings } from "@/lib/settings";
import type { Actor } from "@/lib/types";
import { useOutsideClose } from "@/lib/useOutsideClose";

const USER_NAME = "Victor Ogbonna";
const USER_HANDLE = "Regulator view";

const ACTORS: { id: Actor; label: string; note: string }[] = [
  { id: "regulator", label: "Regulator", note: "Full access" },
  { id: "operator", label: "Operator", note: "Operational access" },
  { id: "community", label: "Community", note: "Read-only" },
];

export function AvatarMenu() {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose<HTMLDivElement>(useCallback(() => setOpen(false), []));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-topbar-action
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center gap-1 rounded-full bg-green text-sm font-semibold text-white"
      >
        VO
        <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[260px] overflow-hidden rounded-[14px] border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium text-text">{USER_NAME}</div>
            <div className="text-xs text-muted">{USER_HANDLE}</div>
          </div>

          <div className="px-2 py-2">
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              View as
            </div>
            {ACTORS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  if (settings.actor !== a.id) setSettings({ actor: a.id });
                }}
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left hover:bg-surface2"
              >
                <span className="flex-1">
                  <span className="block text-sm text-text">{a.label}</span>
                  <span className="block text-[11px] text-muted">{a.note}</span>
                </span>
                {settings.actor === a.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>

          <div className="border-t border-border px-2 py-2">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm text-text hover:bg-surface2"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <Link
              href="/docs"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm text-text hover:bg-surface2"
            >
              <CircleHelp className="h-4 w-4" />
              Help
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
