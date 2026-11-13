"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Clock, Download, Loader2 } from "lucide-react";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Topbar } from "@/components/Topbar";
import { Tabs } from "@/components/Tabs";
import { StatusPill } from "@/components/StatusPill";
import { CopyField } from "@/components/CopyField";
import { Skeleton } from "@/components/Skeleton";
import { OfflineCard } from "@/components/OfflineCard";
import { getFormA, verify } from "@/lib/api";
import {
  formatBbl,
  formatCoord,
  formatKm,
  formatNumber,
  formatUtc,
  formatUtcFull,
} from "@/lib/format";
import { API_URL } from "@/lib/types";
import type {
  AnalyzeResponse,
  Quantification,
  ScenarioResponse,
} from "@/lib/types";

const SpillMap = dynamic(
  () => import("@/components/SpillMap").then((mod) => mod.SpillMap),
  { ssr: false },
);

const TAB_ITEMS = [
  "Overview",
  "Quantification",
  "Impact",
  "Evidence & hashes",
  "Regulatory forms",
];

export default function SpillDetailPage() {
  const { analysis, scenario, loading, error } = useAnalysis();
  const [tab, setTab] = useState(TAB_ITEMS[0]);

  if (error) {
    return (
      <div>
        <Topbar
          title="Spill details"
          breadcrumb={[{ label: "Spill register", href: "/spills" }, { label: "SPL-0001" }]}
        />
        <OfflineCard message={error} />
      </div>
    );
  }

  if (loading || !analysis) {
    return (
      <div>
        <Topbar
          title="Spill details"
          breadcrumb={[{ label: "Spill register", href: "/spills" }, { label: "SPL-0001" }]}
        />
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title="Spill details"
        breadcrumb={[
          { label: "Spill register", href: "/spills" },
          { label: "SPL-0001" },
        ]}
      />

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text">
          SPL-0001 · {analysis.pipeline_id}
        </h2>
        <button
          type="button"
          onClick={() => window.open(`${API_URL}/report.pdf`, "_blank")}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text hover:bg-surface2"
        >
          <Download className="h-4 w-4" />
          Download report
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <StatusPill tone="warn" label="Contained" />
            <StatusPill tone="danger" label="Major" />
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <MetaColumn
              label="Pipeline type"
              value={analysis.leak?.pipeline_type === "trunk_line" ? "Trunk line" : "Flow line"}
            />
            <MetaColumn
              label="Detected"
              value={analysis.leak ? formatUtc(analysis.leak.detected_at) : "—"}
            />
            <MetaColumn
              label="Shut in"
              value={analysis.leak?.shut_in_at ? formatUtc(analysis.leak.shut_in_at) : "—"}
            />
            <MetaColumn label="Last analysis" value={formatUtc(analysis.report.generated_at)} />
          </div>
        </div>
      </div>

      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === "Overview" && (
          <OverviewTab analysis={analysis} scenario={scenario} />
        )}
        {tab === "Quantification" && <QuantificationTab analysis={analysis} />}
        {tab === "Impact" && <ImpactTab analysis={analysis} />}
        {tab === "Evidence & hashes" && <EvidenceTab analysis={analysis} />}
        {tab === "Regulatory forms" && <RegulatoryTab />}
      </div>
    </div>
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
        <InfoRow
          label="Pipeline type"
          value={leak?.pipeline_type === "trunk_line" ? "Trunk line" : "Flow line"}
        />
        <InfoRow label="Terrain" value={leak?.terrain === "water" ? "Water" : "Land"} />
        <InfoRow label="Location" value={leak ? formatKm(leak.location_m) : "—"} />
        <InfoRow
          label="Coordinates"
          value={
            lon !== undefined && lat !== undefined
              ? `${formatCoord(lon)}, ${formatCoord(lat)}`
              : "—"
          }
        />
        <InfoRow
          label="Hole size (equivalent)"
          value={quantification ? `${quantification.equivalent_hole_mm} mm` : "—"}
        />
        <InfoRow
          label="Pressure at leak"
          value={quantification ? `${quantification.pressure_at_leak_bar} bar` : "—"}
        />
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
            <div
              className="absolute top-1/2 h-3.5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-primary"
              style={{ left: `${estimateFrac * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>{formatNumber(low)} m³</span>
            <span>{formatNumber(high)} m³</span>
          </div>
        </div>

        <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Mass balance</span>
            <span className="tabular-nums text-text">
              {formatNumber(quantification?.volume_m3 ?? 0, 1)} m³
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Steady cross-check</span>
            <span className="tabular-nums text-text">
              {formatNumber(quantification?.volume_steady_m3 ?? 0, 1)} m³ (
              {quantification?.methods_agree_pct ?? 0}%)
            </span>
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
  if (!q) {
    return <p className="text-sm text-muted">No quantification available.</p>;
  }

  const quant = q;

  function renderValue(key: keyof Quantification): string {
    if (key === "volume_range_m3") {
      return `${formatNumber(quant.volume_range_m3[0])} – ${formatNumber(quant.volume_range_m3[1])}`;
    }
    const value = quant[key];
    if (key === "method" || key === "cross_check") {
      return String(value);
    }
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
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
            {stat.label}
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-text">
            {stat.value}
          </div>
        </div>
      ))}

      <div className="col-span-1 rounded-xl border border-border bg-surface p-5 sm:col-span-2 lg:col-span-5">
        <div className="text-sm text-muted">
          Snapshot {impact.hours_modelled} h after leak start. Full-duration
          spreading is not modelled in v0.1.
        </div>
      </div>
    </div>
  );
}

function RegulatoryTab() {
  const [deadline, setDeadline] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFormA()
      .then((data) => {
        if (!cancelled) setDeadline(data.incident.deadline_utc);
      })
      .catch(() => {
        /* deadline unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-sm font-medium text-text">EGASPIN Form A</div>
        <div className="mt-0.5 text-xs text-muted">Notification · within 24 h</div>
        {deadline && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-warn">
            <Clock className="h-3.5 w-3.5" />
            File by {formatUtcFull(deadline)}
          </div>
        )}
        <div className="mt-4">
          <StatusPill tone="success" label="Draft ready" />
        </div>
        <button
          type="button"
          onClick={() => window.open(`${API_URL}/forms/a.pdf`, "_blank")}
          className="mt-4 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-bg transition-colors hover:bg-primary/90"
        >
          Generate draft
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-sm font-medium text-text">EGASPIN Form B</div>
        <div className="mt-0.5 text-xs text-muted">Spill response · within 2 weeks</div>
        <div className="mt-4">
          <StatusPill tone="warn" label="Pending JIV" />
        </div>
        <button
          type="button"
          disabled
          title="Requires JIV findings"
          className="mt-4 w-full cursor-not-allowed rounded-lg border border-border px-3 py-2 text-sm text-muted opacity-50"
        >
          Generate
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-sm font-medium text-text">EGASPIN Form C</div>
        <div className="mt-0.5 text-xs text-muted">Clean-up report</div>
        <div className="mt-4">
          <StatusPill tone="neutral" label="Pending clean-up" />
        </div>
        <button
          type="button"
          disabled
          title="Requires clean-up completion"
          className="mt-4 w-full cursor-not-allowed rounded-lg border border-border px-3 py-2 text-sm text-muted opacity-50"
        >
          Generate
        </button>
      </div>
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
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-primary/90 disabled:opacity-60"
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