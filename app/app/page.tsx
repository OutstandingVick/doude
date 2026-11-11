"use client";

import dynamic from "next/dynamic";
import { ChevronDown } from "lucide-react";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Topbar } from "@/components/Topbar";
import { KpiCard } from "@/components/KpiCard";
import { StatusPill } from "@/components/StatusPill";
import { Sparkline } from "@/components/Sparkline";
import { RingProgress } from "@/components/RingProgress";
import { Gauge } from "@/components/Gauge";
import { PipelineBar } from "@/components/PipelineBar";
import { EventTimeline } from "@/components/EventTimeline";
import { ReadingsCharts } from "@/components/ReadingsCharts";
import {
  formatBbl,
  formatCoord,
  formatInt,
  formatKm,
  formatNumber,
  formatUtc,
} from "@/lib/format";

const SpillMap = dynamic(
  () => import("@/components/SpillMap").then((mod) => mod.SpillMap),
  { ssr: false },
);

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { analysis, scenario, readings } = useAnalysis();

  if (!analysis || !scenario) {
    return (
      <div>
        <Topbar title="Dashboard" breadcrumb={[{ label: "Dashboard" }]} />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const { leak, quantification, impact } = analysis;
  const leakRateSeries = readings
    ? readings.readings.map((r) => r.q_in_m3s - r.q_out_m3s)
    : [];

  const detectMinutes = leak
    ? Math.round(
        (Date.parse(leak.detected_at) - Date.parse(leak.estimated_start)) / 60000,
      )
    : 0;

  const lengthM = scenario.pipeline.length_m;
  const inletToLeak = leak ? leak.location_m : 0;
  const leakToOutlet = lengthM - inletToLeak;

  return (
    <div>
      <Topbar title="Dashboard" breadcrumb={[{ label: "Dashboard" }]} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Volume released"
          value={formatBbl(quantification?.volume_bbl ?? 0)}
          sub={`${formatNumber(quantification?.volume_m3 ?? 0, 1)} m³ · ±${
            quantification?.uncertainty_pct ?? 0
          }%`}
          badge={
            <StatusPill
              tone="warn"
              label={`Range ${formatInt(quantification?.volume_range_m3[0] ?? 0)}–${formatInt(
                quantification?.volume_range_m3[1] ?? 0,
              )} m³`}
            />
          }
          visual={<Sparkline data={leakRateSeries} />}
        />

        <KpiCard
          label="Leak location"
          value={leak ? formatKm(leak.location_m) : "—"}
          sub={
            leak
              ? `±${leak.location_uncertainty_m} m · ${formatCoord(
                  leak.location_lonlat[0],
                )}, ${formatCoord(leak.location_lonlat[1])}`
              : "—"
          }
          visual={
            leak ? (
              <PipelineBar
                locationM={leak.location_m}
                uncertaintyM={leak.location_uncertainty_m}
                lengthM={lengthM}
              />
            ) : undefined
          }
        />

        <KpiCard
          label="Time to detect"
          value={`${detectMinutes} min`}
          sub={leak ? `Detected ${formatUtc(leak.detected_at)}` : "—"}
          visual={
            <RingProgress value={detectMinutes} max={15} label={`${detectMinutes}m`} />
          }
        />

        <KpiCard
          label="Release duration"
          value={leak ? `${leak.duration_hours.toFixed(1)} h` : "—"}
          sub={leak ? `Shut in after JIV · ${formatUtc(leak.shut_in_at ?? "")}` : "—"}
          visual={
            <Gauge
              value={leak?.duration_hours ?? 0}
              max={48}
              label={leak ? `${leak.duration_hours.toFixed(1)}h` : "—"}
            />
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">Spill map</h2>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted"
            >
              Last analysis
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <SpillMap
              route={scenario.pipeline.route_lonlat}
              leakLonLat={leak?.location_lonlat}
              uncertaintyM={leak?.location_uncertainty_m}
              polygon={impact?.polygon_lonlat}
              center={impact?.center_lonlat}
              height={420}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <LegendChip color="#14B8A6" label="Pipeline" />
            <LegendChip color="#EF4444" label="Leak" />
            <LegendChip color="#F59E0B" label="Uncertainty" />
            <LegendChip color="#EF4444" label={`Slick (${impact?.hours_modelled ?? 6} h)`} />
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-3 text-[11px] uppercase tracking-[0.08em] text-muted">
              Pipeline profile
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-muted">Inlet → leak</span>
                <div className="h-2 flex-1 rounded-full bg-surface2">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${(inletToLeak / lengthM) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text">
                  {(inletToLeak / 1000).toFixed(1)} km
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-muted">Leak → outlet</span>
                <div className="h-2 flex-1 rounded-full bg-surface2">
                  <div
                    className="h-2 rounded-full bg-muted"
                    style={{ width: `${(leakToOutlet / lengthM) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text">
                  {(leakToOutlet / 1000).toFixed(1)} km
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-medium text-muted">Event timeline</h2>
          <EventTimeline analysis={analysis} />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-medium text-muted">Sensor readings</h2>
        {readings ? (
          <ReadingsCharts readings={readings} analysis={analysis} />
        ) : (
          <p className="text-muted">No readings available.</p>
        )}
      </div>
    </div>
  );
}