import {
  Activity,
  ArrowUpRight,
  Database,
  FileCheck2,
  FlaskConical,
  MapPin,
  Power,
  Siren,
} from "lucide-react";
import { formatBbl, formatKm, formatUtc, shortHash } from "@/lib/format";
import type { AnalyzeResponse } from "@/lib/types";

interface Event {
  icon: typeof Activity;
  title: string;
  sub: string;
  tone: "danger" | "success" | "neutral";
}

const TONE_BG: Record<Event["tone"], string> = {
  danger: "bg-danger/12 text-danger",
  success: "bg-success/12 text-success",
  neutral: "bg-surface2 text-muted",
};

export function EventTimeline({ analysis }: { analysis: AnalyzeResponse }) {
  const { leak, quantification, report, baseline } = analysis;

  const events: Event[] = [
    {
      icon: FileCheck2,
      title: "Report sealed",
      sub: `${shortHash(report.report_hash)} · ${formatUtc(report.generated_at)}`,
      tone: "success",
    },
    {
      icon: Power,
      title: "Line shut in after JIV",
      sub: leak ? formatUtc(leak.shut_in_at ?? "") : "—",
      tone: "neutral",
    },
    {
      icon: FlaskConical,
      title: "Volume quantified",
      sub: quantification
        ? `${formatBbl(quantification.volume_bbl)} bbl · mass balance, cross-checked ${quantification.methods_agree_pct}%`
        : "—",
      tone: "neutral",
    },
    {
      icon: MapPin,
      title: "Leak located",
      sub: leak
        ? `${formatKm(leak.location_m)} ±${leak.location_uncertainty_m} m`
        : "—",
      tone: "neutral",
    },
    {
      icon: Siren,
      title: "Leak detected",
      sub: leak ? formatUtc(leak.detected_at) : "—",
      tone: "danger",
    },
    {
      icon: Activity,
      title: "Deviation began",
      sub: leak ? formatUtc(leak.estimated_start) : "—",
      tone: "neutral",
    },
    {
      icon: Database,
      title: "Baseline learned",
      sub: `${formatUtc(baseline.window_start)} → ${formatUtc(baseline.window_end)}`,
      tone: "neutral",
    },
  ];

  return (
    <div className="space-y-1">
      {events.map((event) => {
        const Icon = event.icon;
        return (
          <div
            key={event.title}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface2/60"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_BG[event.tone]}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-text">{event.title}</div>
              <div className="truncate text-xs text-muted">{event.sub}</div>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" />
          </div>
        );
      })}
    </div>
  );
}