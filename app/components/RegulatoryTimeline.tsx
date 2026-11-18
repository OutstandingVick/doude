"use client";

import { useState } from "react";
import { Calendar, Eye } from "lucide-react";
import { ExpandButton } from "@/components/ExpandButton";
import { formAPdfUrl } from "@/lib/api";
import type { AnalyzeResponse, SpillStatus } from "@/lib/types";

export interface RegulatoryTimelineProps {
  analysis: AnalyzeResponse;
  spillId: string;
  status: SpillStatus;
}

const STATUS_INDEX: Record<SpillStatus, number> = {
  detected: 0,
  jiv: 1,
  cleanup: 2,
  closed: 3,
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayInfo(iso: string) {
  const d = new Date(iso);
  return { weekday: WEEKDAYS[d.getUTCDay()], day: d.getUTCDate() };
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

interface Row {
  date: string;
  title: string;
  subtitle: string;
  pill: string;
  current?: boolean;
  done?: boolean;
  href?: string;
}

export function RegulatoryTimeline({ analysis, spillId, status }: RegulatoryTimelineProps) {
  const [now] = useState(() => Date.now());
  const leak = analysis.leak;
  if (!leak) return null;

  const detected = leak.detected_at;
  const shutIn = leak.shut_in_at ?? detected;
  const statusIndex = STATUS_INDEX[status];

  const rows: Row[] = [
    { date: detected, title: "Leak detected", subtitle: `${spillId} · auto-recorded`, pill: "Done", done: true },
    { date: addDays(detected, 1), title: "Form A due (24 h)", subtitle: "Notification to NOSDRA", pill: "Draft ready", current: true, href: formAPdfUrl(spillId) },
    { date: shutIn, title: "Line shut in", subtitle: "After JIV · trunk line", pill: "Done", done: true },
    { date: addDays(shutIn, 1), title: "JIV inspection", subtitle: "Joint inspection of the breach", pill: statusIndex >= 1 ? "Done" : "Upcoming", done: statusIndex >= 1 },
    { date: addDays(detected, 14), title: "Form B (2 weeks)", subtitle: "Spill response report", pill: "Upcoming" },
    { date: addDays(detected, 30), title: "Form C (clean-up)", subtitle: "Clean-up completion", pill: "Upcoming" },
  ];

  const month = new Date(rows[0].date).getUTCMonth();
  const MONTH_NAMES = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="card-title">Regulatory timeline</h2>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Calendar" className="icon-btn h-8 w-8">
            <Calendar className="h-4 w-4" />
          </button>
          <ExpandButton />
        </div>
      </div>

      <div className="mt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
        {MONTH_NAMES[month]}
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        {rows.map((row, i) => {
          const { weekday, day } = dayInfo(row.date);
          const overdue = !row.done && new Date(row.date).getTime() < now;
          return (
            <div
              key={i}
              className="flex h-16 items-center gap-3 rounded-[14px] bg-surface2 px-3"
            >
              <div className="w-11 shrink-0 text-center">
                <div className="text-xs text-faint">{weekday}</div>
                <div
                  className={`text-[22px] font-medium leading-none ${
                    overdue ? "text-danger" : "text-text"
                  }`}
                >
                  {day}
                </div>
              </div>

              <div className="flex shrink-0 -space-x-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green text-[9px] font-semibold text-white ring-2 ring-surface2">
                  NO
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-info/80 text-[9px] font-semibold text-white ring-2 ring-surface2">
                  OP
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface3 text-[9px] font-semibold text-muted ring-2 ring-surface2">
                  +1
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text">{row.title}</div>
                <div className="truncate text-[11px] text-faint">{row.subtitle}</div>
              </div>

              <span
                className={`pill h-7 shrink-0 px-2.5 text-xs ${row.current ? "pill-active" : "bg-surface3"}`}
              >
                {row.pill}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                {row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open form"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-surface3 hover:text-text"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <button type="button" aria-label="View" className="flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-surface3 hover:text-text">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}