"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Copy, Check, ChevronRight, Clock, Download, ExternalLink, Loader2, Upload, X } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Tabs } from "@/components/Tabs";
import { CreateReportDialog } from "@/components/CreateReportDialog";
import { StatusPill, type PulseTone } from "@/components/StatusPill";
import { CopyField } from "@/components/CopyField";
import { Skeleton } from "@/components/Skeleton";
import { OfflineCard } from "@/components/OfflineCard";
import { auditVerify, evidenceUrl, formAPdfUrl, getSpill, reportPdfUrl, setSpillStatus, uploadEvidence, verify } from "@/lib/api";
import {
  formatBbl,
  formatCoord,
  formatKm,
  formatNumber,
  formatUtc,
  formatUtcFull,
  shortHash,
} from "@/lib/format";
import type {
  AnalyzeResponse,
  AuditEntry,
  AuditVerification,
  EvidenceRecord,
  Quantification,
  ScenarioResponse,
  SpillDetail,
  SpillStatus,
  SpillSummary,
} from "@/lib/types";

const SpillMap = dynamic(
  () => import("@/components/SpillMap").then((mod) => mod.SpillMap),
  { ssr: false },
);

const TAB_ITEMS = [
  "Overview",
  "Quantification",
  "Impact",
  "Integrity",
  "Regulatory forms",
  "Evidence",
  "Audit log",
];

const STATUS: Record<SpillStatus, { label: string; tone: PulseTone }> = {
  detected: { label: "Detected", tone: "danger" },
  jiv: { label: "JIV", tone: "warn" },
  cleanup: { label: "Clean-up", tone: "info" },
  closed: { label: "Closed", tone: "success" },
};

const FLOW: SpillStatus[] = ["detected", "jiv", "cleanup", "closed"];
const NEXT: Record<SpillStatus, SpillStatus | null> = {
  detected: "jiv",
  jiv: "cleanup",
  cleanup: "closed",
  closed: null,
};

const TAB_ALIASES: Record<string, string> = {
  audit: "Audit log",
  overview: "Overview",
  quantification: "Quantification",
  impact: "Impact",
  integrity: "Integrity",
  forms: "Regulatory forms",
  evidence: "Evidence",
};

export default function SpillDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const spillId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);
  const { scenario } = useAnalysis();
  const [spill, setSpill] = useState<SpillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(() => {
    const q = searchParams.get("tab");
    if (!q) return TAB_ITEMS[0];
    const mapped = TAB_ALIASES[q.toLowerCase()] ?? (TAB_ITEMS.includes(q) ? q : TAB_ITEMS[0]);
    return mapped;
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [reportKind, setReportKind] = useState<"form-b" | "form-c" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSpill(spillId)
      .then((data) => {
        if (!cancelled) setSpill(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load spill");
      });
    return () => {
      cancelled = true;
    };
  }, [spillId]);

  function refreshSpill() {
    getSpill(spillId).then(setSpill).catch(() => undefined);
  }

  async function handleAdvance(next: SpillStatus) {
    setAdvancing(true);
    try {
      await setSpillStatus(spillId, next, note || undefined);
      setSpill({ ...spill!, status: next });
      setNote("");
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setAdvancing(false);
    }
  }

  if (error) {
    return (
      <div>
        <h1 className="mb-5 text-2xl font-semibold text-text">Spill details</h1>
        <div className="card">
          <OfflineCard message={error} />
        </div>
      </div>
    );
  }

  if (!spill) {
    return (
      <div>
        <h1 className="mb-5 text-2xl font-semibold text-text">Spill details</h1>
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const analysis = spill.analysis;
  const st = STATUS[spill.status] ?? { label: spill.status, tone: "neutral" as PulseTone };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">
          {spill.id} · {spill.pipeline_id}
        </h1>
        <a
          href={reportPdfUrl(spill.id)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-text hover:bg-surface2"
        >
          <Download className="h-4 w-4" />
          Download report
        </a>
      </div>

      <div className="mb-5 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <StatusPill tone={st.tone} label={st.label} />
            <StatusPill tone="danger" label="Major" />
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <MetaColumn label="Pipeline" value={spill.pipeline_id} />
            <MetaColumn label="Detected" value={spill.detected_at ? formatUtc(spill.detected_at) : "—"} />
            <MetaColumn label="Shut in" value={spill.shut_in_at ? formatUtc(spill.shut_in_at) : "—"} />
            <MetaColumn label="Terrain" value={analysis?.leak?.terrain === "water" ? "Water" : analysis?.leak?.terrain ? "Land" : "—"} />
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {FLOW.map((step, i) => {
              const idx = FLOW.indexOf(spill.status);
              const done = i < idx;
              const current = i === idx;
              return (
                <div key={step} className="flex items-center gap-2">
                  {i > 0 && <div className={`h-px w-6 ${i <= idx ? "bg-primary" : "bg-border"}`} />}
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                      current
                        ? "bg-primary/15 text-primary"
                        : done
                        ? "bg-success/10 text-success"
                        : "text-muted"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                    {STATUS[step].label}
                  </div>
                </div>
              );
            })}
          </div>
          {NEXT[spill.status] && (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-primary/90"
            >
              Advance to {STATUS[NEXT[spill.status]!].label}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {dialogOpen && NEXT[spill.status] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-text">
                Advance to {STATUS[NEXT[spill.status]!].label}
              </h3>
              <button type="button" onClick={() => setDialogOpen(false)} aria-label="Close">
                <X className="h-4 w-4 text-muted" />
              </button>
            </div>
            <label className="mt-4 block text-xs text-muted">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
              placeholder="e.g. JIV completed on site"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-text hover:bg-surface2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAdvance(NEXT[spill.status]!)}
                disabled={advancing}
                className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-text hover:bg-primary/90 disabled:opacity-60"
              >
                {advancing && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} />

      <div className="mt-5">
        {analysis && (
          <>
            {tab === "Overview" && <OverviewTab analysis={analysis} scenario={scenario} />}
            {tab === "Quantification" && <QuantificationTab analysis={analysis} />}
            {tab === "Impact" && <ImpactTab analysis={analysis} />}
            {tab === "Integrity" && <EvidenceTab analysis={analysis} />}
          </>
        )}
        {tab === "Regulatory forms" && (
          <RegulatoryTab
            spillId={spill.id}
            analysis={analysis}
            status={spill.status}
            formA={spill.form_a}
            onGenerateForm={(kind) => setReportKind(kind)}
          />
        )}
        {tab === "Evidence" && (
          <EvidenceUploadTab spillId={spill.id} evidence={spill.evidence} />
        )}
        {tab === "Audit log" && <AuditLogTab audit={spill.audit} />}
      </div>

      {reportKind && (
        <FormDialog
          kind={reportKind}
          spill={spill}
          onClose={() => setReportKind(null)}
          onCreated={refreshSpill}
        />
      )}
    </div>
  );
}

function FormDialog({
  kind,
  spill,
  onClose,
  onCreated,
}: {
  kind: "form-b" | "form-c";
  spill: SpillDetail;
  onClose: () => void;
  onCreated: () => void;
}) {
  const summary: SpillSummary = {
    id: spill.id,
    pipeline_id: spill.pipeline_id,
    status: spill.status,
    detected_at: spill.detected_at,
    estimated_start: spill.estimated_start,
    shut_in_at: spill.shut_in_at,
    location_m: spill.location_m,
    location_lon: spill.location_lon,
    location_lat: spill.location_lat,
    volume_m3: spill.volume_m3,
    volume_bbl: spill.volume_bbl,
    uncertainty_pct: spill.uncertainty_pct,
    input_hash: spill.input_hash,
    report_hash: spill.report_hash,
    created_at: spill.created_at,
    updated_at: spill.updated_at,
    evidence_count: spill.evidence.length,
  };
  return (
    <CreateReportDialog
      initialKind={kind}
      spills={[summary]}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function MetaColumn({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 text-sm text-text">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm tabular-nums text-text">{value}</span>
    </div>
  );
}

function OverviewTab({
  analysis,
  scenario,
}: {
  analysis: AnalyzeResponse;
  scenario: ScenarioResponse | null;
}) {
  const { leak, quantification } = analysis;
  const lon = leak?.location_lonlat[0];
  const lat = leak?.location_lonlat[1];
  const [low, high] = quantification?.volume_range_m3 ?? [0, 0];
  const estimateFrac =
    quantification && high > low
      ? (quantification.volume_m3 - low) / (high - low)
      : 0.5;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-medium text-muted">Information</h3>
        <InfoRow label="Pipeline type" value={leak?.pipeline_type === "trunk_line" ? "Trunk line" : "Flow line"} />
        <InfoRow label="Terrain" value={leak?.terrain === "water" ? "Water" : "Land"} />
        <InfoRow label="Location" value={leak ? formatKm(leak.location_m) : "—"} />
        <InfoRow label="Coordinates" value={lon !== undefined && lat !== undefined ? `${formatCoord(lon)}, ${formatCoord(lat)}` : "—"} />
        <InfoRow label="Hole size (equivalent)" value={quantification ? `${quantification.equivalent_hole_mm} mm` : "—"} />
        <InfoRow label="Pressure at leak" value={quantification ? `${quantification.pressure_at_leak_bar} bar` : "—"} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-medium text-muted">Volume</h3>
        <div className="text-[32px] font-semibold leading-none tabular-nums text-text">
          {formatBbl(quantification?.volume_bbl ?? 0)}
        </div>
        <div className="mt-1 text-sm text-muted">bbl released</div>
        <div className="mt-6">
          <div className="relative h-1.5 w-full rounded-full bg-surface2">
            <div className="absolute h-full rounded-full bg-warn/30" style={{ left: "0%", width: "100%" }} />
            <div className="absolute top-1/2 h-3.5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-primary" style={{ left: `${estimateFrac * 100}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>{formatNumber(low)} m³</span>
            <span>{formatNumber(high)} m³</span>
          </div>
        </div>
        <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Mass balance</span>
            <span className="tabular-nums text-text">{formatNumber(quantification?.volume_m3 ?? 0, 1)} m³</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Steady cross-check</span>
            <span className="tabular-nums text-text">{formatNumber(quantification?.volume_steady_m3 ?? 0, 1)} m³ ({quantification?.methods_agree_pct}%)</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-medium text-muted">Map</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <SpillMap
            route={scenario?.pipeline.route_lonlat ?? []}
            leakLonLat={leak?.location_lonlat}
            uncertaintyM={leak?.location_uncertainty_m}
            polygon={analysis.impact?.polygon_lonlat}
            center={analysis.impact?.center_lonlat}
            height={300}
            defaultView="leak"
          />
        </div>
      </div>
    </div>
  );
}

const QUANT_ROWS: { key: keyof Quantification; label: string; unit: string; note: string }[] = [
  { key: "leak_rate_m3s", label: "Mean leak rate", unit: "m³/s", note: "Average inflow minus outflow over the leak window." },
  { key: "volume_m3", label: "Volume released", unit: "m³", note: "Total released from deviation start to shut-in (mass balance)." },
  { key: "volume_bbl", label: "Volume released", unit: "bbl", note: "Same volume in barrels (6.28981 bbl/m³)." },
  { key: "volume_steady_m3", label: "Steady cross-check", unit: "m³", note: "Mean leak rate times duration, for cross-checking." },
  { key: "methods_agree_pct", label: "Method agreement", unit: "%", note: "Agreement between mass balance and steady-state methods." },
  { key: "equivalent_hole_mm", label: "Equivalent hole", unit: "mm", note: "Diameter of a round hole that would leak at this rate." },
  { key: "pressure_at_leak_bar", label: "Pressure at leak", unit: "bar", note: "Pressure at the breach point, from the inlet gradient." },
  { key: "uncertainty_pct", label: "Uncertainty", unit: "%", note: "Meter noise plus baseline bias plus a model allowance." },
  { key: "volume_range_m3", label: "Volume range", unit: "m³", note: "Low and high bound of the uncertainty band." },
  { key: "method", label: "Primary method", unit: "", note: "Method used for the headline volume." },
  { key: "cross_check", label: "Cross-check method", unit: "", note: "Independent method used to validate the estimate." },
];

function QuantificationTab({ analysis }: { analysis: AnalyzeResponse }) {
  const q = analysis.quantification;
  if (!q) return <p className="text-sm text-muted">No quantification available.</p>;
  const quant = q;

  function renderValue(key: keyof Quantification): string {
    if (key === "volume_range_m3") {
      return `${formatNumber(quant.volume_range_m3[0])} – ${formatNumber(quant.volume_range_m3[1])}`;
    }
    const value = quant[key];
    if (key === "method" || key === "cross_check") return String(value);
    return typeof value === "number" ? formatNumber(value, key === "leak_rate_m3s" ? 5 : 2) : String(value);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted">
          <tr>
            <th className="px-5 py-3 font-medium">Field</th>
            <th className="px-5 py-3 font-medium">Value</th>
            <th className="px-5 py-3 font-medium">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {QUANT_ROWS.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-0">
              <td className="px-5 py-3.5 text-text">{row.label}</td>
              <td className="px-5 py-3.5 tabular-nums text-text">
                {renderValue(row.key)}
                {row.unit && <span className="ml-1 text-muted">{row.unit}</span>}
              </td>
              <td className="px-5 py-3.5 text-muted">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImpactTab({ analysis }: { analysis: AnalyzeResponse }) {
  const impact = analysis.impact;
  if (!impact || impact.polygon_lonlat.length === 0) {
    return <p className="text-sm text-muted">Impact was not modelled for this terrain.</p>;
  }
  const areaKm2 = (impact.slick_area_m2 ?? 0) / 1e6;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {[
        { label: "Slick area", value: `${formatNumber(areaKm2, 2)} km²` },
        { label: "Slick radius", value: `${impact.slick_radius_m} m` },
        { label: "Volume spread", value: `${formatNumber(impact.volume_spread_m3 ?? 0, 1)} m³` },
        { label: "Hours modelled", value: `${impact.hours_modelled} h` },
        { label: "Model", value: "Fay + drift" },
      ].map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border bg-surface p-5">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{stat.label}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-text">{stat.value}</div>
        </div>
      ))}
      <div className="col-span-1 rounded-xl border border-border bg-surface p-5 sm:col-span-2 lg:col-span-5">
        <div className="text-sm text-muted">
          Snapshot {impact.hours_modelled} h after leak start. Full-duration spreading is not modelled in v0.1.
        </div>
      </div>
    </div>
  );
}

function RegulatoryTab({
  spillId,
  analysis,
  status,
  formA,
  onGenerateForm,
}: {
  spillId: string;
  analysis: AnalyzeResponse | null;
  status: SpillStatus;
  formA: { filed: boolean; late: boolean } | null;
  onGenerateForm: (kind: "form-b" | "form-c") => void;
}) {
  const detectedAt = analysis?.leak?.detected_at;
  const deadline = detectedAt ? new Date(Date.parse(detectedAt) + 24 * 3600 * 1000) : null;
  const idx = FLOW.indexOf(status);

  const formAStatus = formA?.filed ? (formA.late ? "Filed late" : "Filed") : "Draft ready";
  const formATone = formA?.filed ? (formA.late ? ("warn" as PulseTone) : ("success" as PulseTone)) : ("success" as PulseTone);

  const forms: { kind: "form-b" | "form-c"; name: string; desc: string; ready: boolean; status: string; tone: PulseTone }[] = [
    { kind: "form-b", name: "EGASPIN Form B", desc: "Spill response · within 2 weeks", ready: idx >= 1, status: idx >= 1 ? "Ready" : "Pending JIV", tone: idx >= 1 ? "info" : "warn" },
    { kind: "form-c", name: "EGASPIN Form C", desc: "Clean-up report", ready: idx >= 2, status: idx >= 2 ? "Ready" : "Pending clean-up", tone: idx >= 2 ? "info" : "neutral" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-sm font-medium text-text">EGASPIN Form A</div>
        <div className="mt-0.5 text-xs text-muted">Notification · within 24 h</div>
        {deadline && !formA?.filed && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-warn">
            <Clock className="h-3.5 w-3.5" />
            File by {formatUtcFull(deadline.toISOString())}
          </div>
        )}
        <div className="mt-4">
          <StatusPill tone={formATone} label={formAStatus} />
        </div>
        <a
          href={formAPdfUrl(spillId)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block w-full rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-text transition-colors hover:bg-primary/90"
        >
          {formA?.filed ? "View filed form" : "Generate draft"}
        </a>
      </div>

      {forms.map((form) => (
        <div key={form.kind} className="rounded-xl border border-border bg-surface p-5">
          <div className="text-sm font-medium text-text">{form.name}</div>
          <div className="mt-0.5 text-xs text-muted">{form.desc}</div>
          <div className="mt-4">
            <StatusPill tone={form.tone} label={form.status} />
          </div>
          <button
            type="button"
            onClick={() => onGenerateForm(form.kind)}
            className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2"
          >
            Generate
          </button>
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_EXT = ["jpeg", "jpg", "png", "pdf", "csv"];

function EvidenceUploadTab({ spillId, evidence }: { spillId: string; evidence: EvidenceRecord[] }) {
  const [items, setItems] = useState<EvidenceRecord[]>(evidence);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploadError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext)) {
      setUploadError("Only JPEG, PNG, PDF or CSV files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File exceeds 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const record = await uploadEvidence(spillId, file);
      setItems((prev) => [record, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(hash);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-surface"
        }`}
      >
        <Upload className="h-6 w-6 text-muted" />
        <p className="mt-2 text-sm text-text">Drag and drop evidence here</p>
        <p className="mt-1 text-xs text-muted">JPEG, PNG, PDF or CSV · up to 10 MB</p>
        <label className="mt-4 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text hover:bg-primary/90">
          {uploading ? "Uploading…" : "Choose file"}
          <input
            type="file"
            accept=".jpeg,.jpg,.png,.pdf,.csv"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {uploadError && <p className="mt-3 text-xs text-danger">{uploadError}</p>}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">No evidence uploaded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">SHA-256</th>
                <th className="px-4 py-3 font-medium">Uploaded by</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                  <td className="px-4 py-3 text-text">{item.filename}</td>
                  <td className="px-4 py-3 text-muted">{item.content_type.split("/")[1]}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{formatBytes(item.size_bytes)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => copyHash(item.sha256)}
                      className="flex items-center gap-1 font-mono text-xs text-muted hover:text-text"
                      title="Copy hash"
                    >
                      {copied === item.sha256 ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                      {shortHash(item.sha256)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted">{item.uploaded_by ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{formatUtc(item.uploaded_at)}</td>
                  <td className="px-4 py-3 text-muted">{item.note ?? "—"}</td>
                  <td className="px-4 py-3">
                    <a
                      href={evidenceUrl(spillId, item.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EvidenceTab({ analysis }: { analysis: AnalyzeResponse }) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setResult(null);
    try {
      const v = await verify();
      setResult(v.repeatable);
    } catch {
      setResult(false);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <CopyField label="Method version" value={analysis.report.method_version} />
      <CopyField label="Input hash" value={analysis.report.input_hash} />
      <CopyField label="Report hash" value={analysis.report.report_hash} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify now
        </button>
        {result === true && <StatusPill tone="success" label="Verified — repeatable" />}
        {result === false && <StatusPill tone="danger" label="Mismatch" />}
      </div>
    </div>
  );
}
const ACTION_LABELS: Record<string, string> = {
  spill_recorded: "Spill recorded",
  analysis_rerun_identical: "Analysis re-run (identical)",
  analysis_no_spill: "Analysis (no spill)",
  status_changed: "Status changed",
  evidence_added: "Evidence added",
  form_a_filed: "Form A filed",
  contact_added: "Contact added",
  contact_removed: "Contact removed",
};

function summarizeDetail(entry: AuditEntry): string {
  try {
    const d = JSON.parse(entry.detail_json ?? "{}");
    if (entry.action === "status_changed") return `${d.from ?? ""} → ${d.to ?? ""}${d.note ? ` · ${d.note}` : ""}`;
    if (entry.action === "evidence_added") return `${d.filename ?? ""} · ${shortHash(d.sha256 ?? "")}`;
    if (entry.action === "analysis_rerun_identical") return shortHash(d.report_hash ?? "");
    if (entry.action === "form_a_filed") return `${d.reference ?? ""}${d.late ? " · late" : ""}`;
    if (entry.action === "contact_added") return d.name ?? "";
    if (entry.action === "contact_removed") return d.name ?? "";
    return d.pipeline_id ?? "";
  } catch {
    return entry.detail_json ?? "";
  }
}

function AuditLogTab({ audit }: { audit: AuditEntry[] }) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<AuditVerification | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setResult(null);
    try {
      setResult(await auditVerify());
    } catch {
      setResult({ ok: false, entries: 0, broken_at: null });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify chain
        </button>
        {result && (
          result.ok ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-success">
              <Check className="h-4 w-4" />
              Audit chain intact ({result.entries} entries)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-danger">
              <X className="h-4 w-4" />
              Broken at entry #{result.broken_at}
            </span>
          )
        )}
      </div>

      {audit.length === 0 ? (
        <p className="text-sm text-muted">No audit entries for this spill.</p>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-4">
          {[...audit].reverse().map((entry) => (
            <div key={entry.id} className="flex gap-3 border-b border-border py-3 last:border-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-semibold text-text">
                {entry.id}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatUtc(entry.at)}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {entry.actor || "demo-regulator"}
                </div>
                <div className="mt-1 text-xs text-muted">{summarizeDetail(entry)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
