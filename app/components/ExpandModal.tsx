"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/** Full-screen modal that shows a card's content expanded. */
export function ExpandModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
      >
        <div className="flex items-center justify-between border-b border-border-soft px-5 py-3.5">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="expand-btn">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
