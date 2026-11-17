"use client";

import { ExpandButton } from "@/components/ExpandButton";
import { evidenceUrl } from "@/lib/api";
import type { AnalyzeResponse, EvidenceRecord, ScenarioResponse } from "@/lib/types";

export interface SpillSnapshotProps {
  analysis: AnalyzeResponse;
  scenario: ScenarioResponse;
  spillId: string;
  evidence: EvidenceRecord[];
}

const REGION = "Bayelsa";

function satelliteTileUrl(lon: number, lat: number): string {
  const z = 15;
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

export function SpillSnapshot({ analysis, scenario, spillId, evidence }: SpillSnapshotProps) {
  const leak = analysis.leak;
  const images = evidence.filter((e) => e.content_type.startsWith("image/"));
  const hasEvidence = images.length > 0;
  const centerSrc = hasEvidence
    ? evidenceUrl(spillId, images[0].id)
    : leak
      ? satelliteTileUrl(leak.location_lonlat[0], leak.location_lonlat[1])
      : null;
  const leftSrc = images[1] ? evidenceUrl(spillId, images[1].id) : null;
  const rightSrc = images[2] ? evidenceUrl(spillId, images[2].id) : null;

  const terrain = leak?.terrain === "water" ? "Water" : "Land";

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h2 className="card-title">Spill snapshot</h2>
        <ExpandButton />
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 overflow-hidden py-1">
        <Tile src={leftSrc} placeholder={!hasEvidence} className="h-24 w-20" />
        <Tile src={centerSrc} className="h-[120px] w-[140px]" />
        <Tile src={rightSrc} placeholder={!hasEvidence} className="h-24 w-20" />
      </div>

      <div className="mt-4 text-[15px] font-medium text-text">
        {spillId} · {REGION}
      </div>
      <div className="mt-0.5 text-[11px] text-faint">
        {scenario.pipeline.type === "trunk_line" ? "Trunk line" : "Flow line"} · {terrain} ·{" "}
        {leak ? "Detected" : "—"}
      </div>
    </div>
  );
}

function Tile({
  src,
  placeholder,
  className,
}: {
  src: string | null;
  placeholder?: boolean;
  className: string;
}) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-[14px] ${className}`}>
      {src ? (
        <img src={src} alt="Spill" className="h-full w-full object-cover" />
      ) : placeholder ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface2 to-primary/40 text-center text-[11px] leading-tight text-faint">
          Upload JIV photo
        </div>
      ) : (
        <div className="h-full w-full bg-surface2" />
      )}
    </div>
  );
}