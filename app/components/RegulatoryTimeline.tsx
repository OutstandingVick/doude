"use client";

import { useEffect, useState } from "react";
import { Calendar, Check, Eye, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { ExpandButton } from "@/components/ExpandButton";
import { ExpandModal } from "@/components/ExpandModal";
import { fileFormA, formAPdfUrl, getSpill } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isReadOnly, useSettings } from "@/lib/settings";
import type { AnalyzeResponse, AuditEntry, SpillStatus } from "@/lib/types";

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

type Kind = "done" | "draft" | "upcoming";

interface Row {
  date: string;
  title: string;
  subtitle: string;
  kind: Kind;
  done?: boolean;
  auditAction?: string;
  unlock?: string;
}

export function RegulatoryTimeline({ analysis, spillId, status }: RegulatoryTimelineProps) {
  const [now] = useState(() => Date.now());
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [formA, setFormA] = useState<{ filed: boolean; late: boolean; reference: string | null; filed_at: string | null } | null>(null);
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const settings = useSettings();
  const readOnly = isReadOnly(settings.actor);

  const leak = analysis.leak;
  useEffect(() => {
    let cancelled = false;
    getSpill(spillId)
      .then((d) => {
        if (cancelled) return;
        setAudit(d.audit);
        setFormA(d.form_a);
      })
      .catch(() => {
        if (!cancelled) setAudit([]);
      });
    return () => {
      cancelled = true;
    };
  }, [spillId]);

  if (!leak) return null;

  const detected = leak.detected_at;
  const shutIn = leak.shut_in_at ?? detected;
  const statusIndex = STATUS_INDEX[status];

  const rows: Row[] = [
    { date: detected, title: "Leak detected", subtitle: `${spillId} · auto-recorded`, kind: "done", done: true, auditAction: "spill_recorded" },
    { date: addDays(detected, 1), title: "Form A due (24 h)", subtitle: "Notification to NOSDRA", kind: "draft" },
    { date: shutIn, title: "Line shut in", subtitle: "After JIV · trunk line", kind: "done", done: true },
    { date: addDays(shutIn, 1), title: "JIV inspection", subtitle: "Joint inspection of the breach", kind: statusIndex >= 1 ? "done" : "upcoming", done: statusIndex >= 1, unlock: "Unlocks once the spill status is advanced to JIV." },
    { date: addDays(detected, 14), title: "Form B (2 weeks)", subtitle: "Spill response report", kind: "upcoming", unlock: "Unlocks 2 weeks after detection, once the response is documented." },
    { date: addDays(detected, 30), title: "Form C (clean-up)", subtitle: "Clean-up completion", kind: "upcoming", unlock: "Unlocks after clean-up is completed and verified." },
  ];

  const month = new Date(rows[0].date).getUTCMonth();
  const MONTH_NAMES = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTEMBER", "NOVEMBER", "DECEMBER"];

  async function handleFile() {
    setFiling(true);
    setFileError(null);
    try {
      const result = await fileFormA(spillId, `${spillId}-A`, new Date().toISOString());
      setFormA({ filed: true, late: result.late, reference: result.reference, filed_at: result.filed_at });
      setOpenRow(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to file Form A");
    } finally {
      setFiling(false);
    }
  }

  function pillLabel(row: Row): string {
    if (row.kind === "done") return "Done";
    if (row.kind === "upcoming") return "Upcoming";
    if (row.title === "Form A due (24 h)") {
      if (formA?.filed) return formA.late ? "Filed late" : "Filed";
      return "Draft";
    }
    return "Draft";
  }

  function actorFor(action: string | undefined): string {
    const entry = audit?.find((a) => a.action === action);
    return entry?.actor ?? "auto";
  }

  const body = (
    <>
      <div className="mt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
        {MONTH_NAMES[month]}
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        {rows.map((row, i) => {
          const { weekday, day } = dayInfo(row.date);
          const overdue = !row.done && new Date(row.date).getTime() < now;
          const open = openRow === i;
          return (
            <div key={i} className="relative">
              <div className="flex min-h-16 items-center gap-3 rounded-[14px] bg-surface2 px-3 py-2">
                <div className="w-9 shrink-0 text-center">
                  <div className="text-xs text-faint">{weekday}</div>
                  <div className={`text-[22px] font-medium leading-none ${overdue ? "text-danger" : "text-text"}`}>
                    {day}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div data-timeline-title className="text-sm font-medium leading-snug text-text">{row.title}</div>
                  <div className="truncate text-[11px] text-faint">{row.subtitle}</div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenRow(open ? null : i)}
                  aria-expanded={open}
                  className={`pill h-7 shrink-0 px-2.5 text-xs ${
                    row.kind === "done"
                      ? "bg-success/12 text-success"
                      : row.kind === "draft"
                      ? "pill-active"
                      : "bg-surface3"
                  }`}
                >
                  {pillLabel(row)}
                </button>

                <button
                  type="button"
                  aria-label="View"
                  onClick={() => setOpenRow(open ? null : i)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface3 hover:text-text"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>

              {open && (
                <div className="mt-2 rounded-[12px] border border-border bg-surface p-3">
                  <PopoverContent
                    row={row}
                    spillId={spillId}
                    formA={formA}
                    actor={actorFor(row.auditAction)}
                    readOnly={readOnly}
                    filing={filing}
                    fileError={fileError}
                    onViewPdf={() => setOpenRow(null)}
                    onFile={handleFile}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <div data-card className="card flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Regulatory timeline</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/spills/${spillId}?tab=forms`}
              aria-label="Open regulatory forms"
              className="icon-btn h-8 w-8"
            >
              <Calendar className="h-4 w-4" />
            </Link>
            <ExpandButton onClick={() => setExpanded(true)} />
          </div>
        </div>
        {body}
      </div>
      <ExpandModal open={expanded} onClose={() => setExpanded(false)} title="Regulatory timeline">
        {body}
      </ExpandModal>
    </>
  );
}

function PopoverContent({
  row,
  spillId,
  formA,
  actor,
  readOnly,
  filing,
  fileError,
  onViewPdf,
  onFile,
}: {
  row: Row;
  spillId: string;
  formA: { filed: boolean; late: boolean; reference: string | null; filed_at: string | null } | null;
  actor: string;
  readOnly: boolean;
  filing: boolean;
  fileError: string | null;
  onViewPdf: () => void;
  onFile: () => void;
}) {
  const auditLink = `/spills/${spillId}?tab=audit`;

  if (row.kind === "done") {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-text">{row.title}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Check className="h-3.5 w-3.5 text-success" />
          {formatDateTime(row.date)} · {actor}
        </div>
        <Link href={auditLink} className="flex items-center gap-1 text-xs text-primary hover:underline">
          View audit log
        </Link>
      </div>
    );
  }

  if (row.kind === "upcoming") {
    return (
      <div className="space-y-1.5">
        <div className="text-sm font-medium text-text">{row.title}</div>
        <p className="text-xs text-muted">{row.unlock}</p>
      </div>
    );
  }

  // draft (Form A)
  const filed = formA?.filed ?? false;
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-text">{row.title}</div>
      {filed ? (
        <>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Check className="h-3.5 w-3.5 text-success" />
            {formA!.late ? "Filed late" : "Filed"} · {formA!.filed_at ? formatDateTime(formA!.filed_at) : ""}
          </div>
          <Link href={formAPdfUrl(spillId)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
            <FileText className="h-3.5 w-3.5" />
            View PDF
          </Link>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            Draft ready. File it to record the 24 h notification.
          </p>
          <div className="flex items-center gap-2">
            <a
              href={formAPdfUrl(spillId)}
              target="_blank"
              rel="noreferrer"
              onClick={onViewPdf}
              className="flex items-center gap-1 rounded-[8px] border border-border px-2.5 py-1.5 text-xs text-text hover:bg-surface2"
            >
              <FileText className="h-3.5 w-3.5" />
              View PDF
            </a>
            <button
              type="button"
              onClick={onFile}
              disabled={readOnly || filing}
              className="flex items-center gap-1 rounded-[8px] bg-primary px-2.5 py-1.5 text-xs font-medium text-text hover:bg-primary-dark disabled:opacity-50"
            >
              {filing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {readOnly ? "Read-only" : "Mark as filed"}
            </button>
          </div>
          {fileError && <p className="text-xs text-danger">{fileError}</p>}
        </>
      )}
    </div>
  );
}
