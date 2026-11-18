"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarRange,
  Plus,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileWarning,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { CreateReportDialog } from "@/components/CreateReportDialog";
import { Skeleton } from "@/components/Skeleton";
import {
  generateReport,
  getPipelines,
  getReportHistory,
  getReportTypes,
  getSpills,
  reportHistoryPdfUrl,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type {
  PipelineRecord,
  ReportHistoryItem,
  ReportParams,
  ReportScope,
  ReportType,
  ReportTypeId,
  SpillSummary,
} from "@/lib/types";

const ICONS: Record<ReportTypeId, ReactNode> = {
  spill: <FileText className="h-5 w-5" />,
  "form-a": <FileWarning className="h-5 w-5" />,
  compliance: <ClipboardCheck className="h-5 w-5" />,
  audit: <ShieldCheck className="h-5 w-5" />,
  period: <CalendarRange className="h-5 w-5" />,
};

const SCOPE_LABEL: Record<ReportScope, string> = {
  spill: "Per spill",
  pipeline: "Per pipeline",
  period: "Date range",
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const WRITTEN_LABEL: Record<string, string> = {
  "written-form-a": "Form A (written)",
  "written-form-b": "Form B (written)",
  "written-form-c": "Form C (written)",
  "written-custom": "Custom report",
};

function reportLabel(type: string, typeById: Record<string, ReportType>): string {
  return typeById[type]?.name ?? WRITTEN_LABEL[type] ?? type;
}

function scopeText(item: ReportHistoryItem): string {
  const p = item.params ?? {};
  if (p.spill_id) return p.spill_id;
  if (p.from || p.to) return `${p.from ?? "…"} → ${p.to ?? "…"}`;
  if (p.pipeline_id) return p.pipeline_id;
  return "All pipelines";
}

export default function ReportsPage() {
  const [types, setTypes] = useState<ReportType[] | null>(null);
  const [spills, setSpills] = useState<SpillSummary[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRecord[]>([]);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReportTypeId | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshHistory = useCallback(() => {
    getReportHistory().then(setHistory).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getReportTypes(), getSpills(), getPipelines(), getReportHistory()])
      .then(([t, s, p, h]) => {
        if (cancelled) return;
        setTypes(t);
        setSpills(s);
        setPipelines(p);
        setHistory(h);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not reach the engine");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const typeById = useMemo(
    () => Object.fromEntries((types ?? []).map((t) => [t.id, t])) as Record<string, ReportType>,
    [types],
  );
  const selectedType = selected ? typeById[selected] : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-text">Reports</h1>
          <p className="text-sm text-muted">
            Every generated report is fingerprinted (SHA-256) and recorded in the audit chain.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-create-report-button
          className="flex h-10 items-center gap-2 rounded-[12px] bg-primary px-4 text-sm font-medium text-text transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> Create report
        </button>
      </div>

      {error && (
        <div className="card mb-5 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {!types && !error ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {(types ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              data-report-type={t.id}
              onClick={() => setSelected(t.id === selected ? null : t.id)}
              aria-pressed={t.id === selected}
              className={`card flex flex-col items-start gap-3 text-left transition-shadow hover:shadow-md ${
                t.id === selected ? "ring-2 ring-primary-dark" : ""
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-text">
                {ICONS[t.id] ?? <FileText className="h-5 w-5" />}
              </span>
              <span className="text-[15px] font-medium text-text">{t.name}</span>
              <span className="text-[13px] leading-snug text-muted">{t.description}</span>
              <span className="pill mt-auto text-[11px]">{SCOPE_LABEL[t.scope]}</span>
            </button>
          ))}
        </div>
      )}

      {selectedType && (
        <ReportPanel
          key={selectedType.id}
          type={selectedType}
          spills={spills}
          pipelines={pipelines}
          onClose={() => setSelected(null)}
          onGenerated={refreshHistory}
        />
      )}

      {creating && (
        <CreateReportDialog
          spills={spills}
          onClose={() => setCreating(false)}
          onCreated={refreshHistory}
        />
      )}

      <h2 className="card-title mb-3 mt-8">Recent reports</h2>
      <RecentReports history={history} typeById={typeById} />
    </div>
  );
}

function ReportPanel({
  type,
  spills,
  pipelines,
  onClose,
  onGenerated,
}: {
  type: ReportType;
  spills: SpillSummary[];
  pipelines: PipelineRecord[];
  onClose: () => void;
  onGenerated: () => void;
}) {
  const today = new Date();
  const [spillId, setSpillId] = useState(spills[0]?.id ?? "");
  const [pipelineId, setPipelineId] = useState("");
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 30 * 86400000)));
  const [to, setTo] = useState(isoDay(today));
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSha, setLastSha] = useState<string | null>(null);

  const params: ReportParams =
    type.scope === "spill"
      ? { spill_id: spillId }
      : type.scope === "pipeline"
        ? { pipeline_id: pipelineId || null }
        : { from, to };

  const missing =
    (type.scope === "spill" && !spillId) ||
    (type.scope === "period" && (!from || !to || from > to));

  async function run(mode: "preview" | "download") {
    setError(null);
    setBusy(mode);
    // Open the tab synchronously so popup blockers allow it.
    const tab = mode === "preview" ? window.open("", "_blank") : null;
    try {
      const { blob, sha256, filename } = await generateReport(type.id, params);
      const url = URL.createObjectURL(blob);
      if (tab) {
        tab.location.href = url;
      } else {
        // Download, or preview when the pre-opened tab was blocked.
        const a = document.createElement("a");
        a.href = url;
        if (mode === "download") a.download = filename;
        else a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setLastSha(sha256);
      onGenerated();
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Report failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-card className="card mt-4" data-report-panel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="card-title">{type.name}</h2>
          <p className="mt-1 text-sm text-muted">{type.description}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="expand-btn shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        {type.scope === "spill" && (
          <Field label="Spill">
            {spills.length ? (
              <select value={spillId} onChange={(e) => setSpillId(e.target.value)} className="h-10 min-w-[200px] rounded-[10px] bg-surface3 px-3 text-sm text-text outline-none focus:ring-2 focus:ring-primary">
                {spills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.pipeline_id}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-muted">No spills recorded yet — run an analysis first.</span>
            )}
          </Field>
        )}
        {type.scope === "pipeline" && (
          <Field label="Pipeline">
            <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="h-10 min-w-[200px] rounded-[10px] bg-surface3 px-3 text-sm text-text outline-none focus:ring-2 focus:ring-primary">
              <option value="">All pipelines</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {type.scope === "period" && (
          <>
            <Field label="From">
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10 min-w-[200px] rounded-[10px] bg-surface3 px-3 text-sm text-text outline-none focus:ring-2 focus:ring-primary" />
            </Field>
            <Field label="To">
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10 min-w-[200px] rounded-[10px] bg-surface3 px-3 text-sm text-text outline-none focus:ring-2 focus:ring-primary" />
            </Field>
          </>
        )}

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={missing || busy !== null}
            onClick={() => void run("preview")}
            className="flex h-10 items-center gap-2 rounded-[12px] border border-border bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50"
          >
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Preview
          </button>
          <button
            type="button"
            disabled={missing || busy !== null}
            onClick={() => void run("download")}
            className="flex h-10 items-center gap-2 rounded-[12px] bg-primary px-4 text-sm font-medium text-text transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {lastSha && !error && (
        <p className="mt-3 text-xs text-muted">
          Generated and logged · <span className="font-mono">{lastSha.replace("sha256:", "").slice(0, 16)}…</span>
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.08em] text-faint">{label}</span>
      {children}
    </label>
  );
}

function RecentReports({
  history,
  typeById,
}: {
  history: ReportHistoryItem[];
  typeById: Record<string, ReportType>;
}) {
  if (!history.length) {
    return (
      <div className="card">
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No reports generated yet"
          description="Pick a report above and preview or download it."
        />
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-left text-sm" data-report-history>
        <thead className="border-b border-border-soft bg-surface2 text-[11px] uppercase tracking-[0.08em] text-faint">
          <tr>
            <th className="px-5 py-3 font-medium">Report</th>
            <th className="px-5 py-3 font-medium">Scope</th>
            <th className="px-5 py-3 font-medium">Generated by</th>
            <th className="px-5 py-3 font-medium">Time</th>
            <th className="px-5 py-3 font-medium">PDF fingerprint</th>
            <th className="px-5 py-3 font-medium">
              <span className="sr-only">Download</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => (
            <tr key={item.id} className="border-b border-border-soft last:border-0 hover:bg-surface2/60">
              <td className="px-5 py-3.5 font-medium text-text">{reportLabel(item.type, typeById)}</td>
              <td className="px-5 py-3.5 text-text">{scopeText(item)}</td>
              <td className="px-5 py-3.5 text-muted">{item.actor}</td>
              <td className="px-5 py-3.5 tabular-nums text-muted">{formatDateTime(item.at)}</td>
              <td className="px-5 py-3.5">
                <Fingerprint value={item.sha256} />
              </td>
              <td className="px-5 py-3.5 text-right">
                <a
                  href={reportHistoryPdfUrl(item.id)}
                  aria-label={`Re-download ${reportLabel(item.type, typeById)}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface3 hover:text-text"
                >
                  <Download className="h-4 w-4" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fingerprint({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const hex = value.replace("sha256:", "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; ignore.
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs text-text" title={value}>
        {hex.slice(0, 12)}…
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy PDF fingerprint"
        className="rounded-md p-1 text-muted transition-colors hover:bg-surface3 hover:text-text"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
