"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { getNotifications } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useOutsideClose } from "@/lib/useOutsideClose";
import type { Notification } from "@/lib/types";

const LAST_SEEN_KEY = "doude-notifications-last-seen";

function readLastSeen(): number {
  try {
    return Number(window.localStorage.getItem(LAST_SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastSeen(ts: number) {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [lastSeen, setLastSeen] = useState(0);
  const ref = useOutsideClose<HTMLDivElement>(useCallback(() => setOpen(false), []));

  useEffect(() => {
    setLastSeen(readLastSeen());
    let cancelled = false;
    getNotifications()
      .then((n) => !cancelled && setItems(n))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = items.filter((n) => Date.parse(n.at) > lastSeen).length;

  function openPanel() {
    setOpen(true);
    const now = Date.now();
    writeLastSeen(now);
    setLastSeen(now);
  }

  function markAllRead() {
    const now = Date.now();
    writeLastSeen(now);
    setLastSeen(now);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-topbar-action
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="icon-btn relative"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span
            aria-label="Unread notifications"
            className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-danger"
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-[14px] border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium text-text">Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted hover:text-text"
            >
              <Check className="h-3.5 w-3.5" />
              Mark all as read
            </button>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No notifications.</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-surface2"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.kind === "deadline" ? "bg-warn" : "bg-info"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text">
                      {n.title}
                      {n.overdue && (
                        <span className="ml-1.5 text-xs font-normal text-danger">overdue</span>
                      )}
                    </div>
                    {n.detail && (
                      <div className="truncate text-xs text-muted">{n.detail}</div>
                    )}
                    <div className="mt-0.5 text-[11px] text-faint">
                      {formatDateTime(n.at)}
                      {n.actor ? ` · ${n.actor}` : ""}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
