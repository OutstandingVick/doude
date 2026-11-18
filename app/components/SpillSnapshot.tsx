"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { ExpandButton } from "@/components/ExpandButton";
import { evidenceUrl, verify } from "@/lib/api";
import { formatKm, roundHalfUp, toLatLng } from "@/lib/format";
import type { AnalyzeResponse, EvidenceRecord, LonLat, ScenarioResponse } from "@/lib/types";

export interface SpillSnapshotProps {
  analysis: AnalyzeResponse;
  scenario: ScenarioResponse;
  spillId: string;
  evidence: EvidenceRecord[];
}

const REGION = "Bayelsa";
const TILE_ZOOM = 13;

function tilePosition(lon: number, lat: number) {
  const n = 2 ** TILE_ZOOM;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { tx: Math.floor(x), ty: Math.floor(y), fx: x - Math.floor(x), fy: y - Math.floor(y) };
}

function satelliteTileUrl(lon: number, lat: number): string {
  const { tx, ty } = tilePosition(lon, lat);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_ZOOM}/${ty}/${tx}`;
}

export function SpillSnapshot({ analysis, scenario, spillId, evidence }: SpillSnapshotProps) {
  const leak = analysis.leak;
  const images = evidence.filter((e) => e.content_type.startsWith("image/"));
  const hasEvidence = images.length > 0;

  const dot = !hasEvidence && leak
    ? (() => {
        const { fx, fy } = tilePosition(leak.location_lonlat[0], leak.location_lonlat[1]);
        return { x: fx * 100, y: fy * 100 };
      })()
    : null;

  const centerSrc = hasEvidence
    ? evidenceUrl(spillId, images[0].id)
    : leak
      ? satelliteTileUrl(leak.location_lonlat[0], leak.location_lonlat[1])
      : null;

  const terrain = leak?.terrain === "water" ? "Water" : "Land";

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="card-title">Spill snapshot</h2>
        <ExpandButton />
      </div>

      <div className="mt-3 -mx-5 flex items-center justify-center gap-3 overflow-hidden py-1">
        <div className="h-24 w-24 shrink-0 rounded-[14px] bg-gradient-to-br from-surface2 to-primary/25 opacity-60" />
        <div className="relative h-[120px] w-[140px] shrink-0 overflow-hidden rounded-[14px]">
          {centerSrc ? (
            <img src={centerSrc} alt="Spill" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-surface2" />
          )}
          {dot && (
            <span
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger ring-2 ring-white"
              style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
            />
          )}
        </div>
        <div className="h-24 w-24 shrink-0 rounded-[14px] bg-gradient-to-br from-surface2 to-primary/25 opacity-60" />
      </div>

      <div className="mt-3 text-[15px] font-medium text-text">
        {spillId} · {REGION}
      </div>
      <div className="mt-0.5 text-[11px] text-faint">
        {scenario.pipeline.type === "trunk_line" ? "Trunk line" : "Flow line"} · {terrain} ·{" "}
        {leak ? "Detected" : "—"}
      </div>

      {leak && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat value={formatKm(leak.location_m)} label="Location" />
          <Stat value={`±${leak.location_uncertainty_m} m`} label="Uncertainty" />
          <Stat value={`${roundHalfUp(leak.duration_hours, 1)} h`} label="Duration" />
        </div>
      )}

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <VerifyPill />
          <button type="button" aria-label="More info" className="icon-btn h-8 w-8">
            <Info className="h-4 w-4" />
          </button>
        </div>
        <MiniMap route={scenario.pipeline.route_lonlat} leak={leak?.location_lonlat} />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-nowrap text-[15px] font-medium tabular-nums text-text">{value}</div>
      <div className="whitespace-nowrap text-[11px] text-faint">{label}</div>
    </div>
  );
}

function VerifyPill() {
  const [state, setState] = useState<"idle" | "ok" | "bad">("idle");

  async function handleVerify() {
    try {
      const v = await verify();
      setState(v.repeatable ? "ok" : "bad");
    } catch {
      setState("bad");
    }
  }

  if (state === "ok") {
    return <span className="pill bg-primary font-medium text-text">Verified ✓</span>;
  }
  if (state === "bad") {
    return <span className="pill bg-danger/15 font-medium text-danger">Mismatch</span>;
  }
  return (
    <button
      type="button"
      onClick={handleVerify}
      className="pill bg-primary font-medium text-text transition-colors hover:bg-primary-dark"
    >
      Verify
    </button>
  );
}

function MiniMap({ route, leak }: { route: LonLat[]; leak?: LonLat | null }) {
  const pts = route.map(toLatLng);
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const W = 110;
  const H = 70;
  const pad = 10;
  const project = (lat: number, lon: number): [number, number] => {
    const x = ((lon - minLon) / (maxLon - minLon || 1)) * (W - 2 * pad) + pad;
    const y = H - pad - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * pad);
    return [x, y];
  };
  const line = pts.map((p) => project(p[0], p[1]).join(",")).join(" ");
  const [lx, ly] = leak ? project(leak[1], leak[0]) : [0, 0];

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0 overflow-hidden rounded-[12px] border border-border-soft"
      role="img"
      aria-label="Pipeline mini-map"
    >
      <rect x={0} y={0} width={W} height={H} fill="#F1F4EC" />
      <rect x={0} y={0} width={W} height={H} fill="url(#mm)" opacity={0.5} />
      <defs>
        <linearGradient id="mm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DDEBE0" />
          <stop offset="100%" stopColor="#EAF3D8" />
        </linearGradient>
      </defs>
      <polyline points={line} fill="none" stroke="#111111" strokeWidth={2} opacity={0.7} />
      {pts.length > 0 && (
        <>
          <circle cx={project(pts[0][0], pts[0][1])[0]} cy={project(pts[0][0], pts[0][1])[1]} r={2.5} fill="#111111" />
          <circle cx={project(pts[pts.length - 1][0], pts[pts.length - 1][1])[0]} cy={project(pts[pts.length - 1][0], pts[pts.length - 1][1])[1]} r={2.5} fill="#111111" />
        </>
      )}
      {leak && <circle cx={lx} cy={ly} r={3.5} fill="#E5484D" stroke="#fff" strokeWidth={1} />}
    </svg>
  );
}