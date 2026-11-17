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

export function SpillSnapshot({ analysis, scenario, spillId, evidence }: SpillSnapshotProps) {
  const leak = analysis.leak;
  const images = evidence.filter((e) => e.content_type.startsWith("image/"));
  const centerSrc = images[0] ? evidenceUrl(spillId, images[0].id) : null;
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
        <Tile src={leftSrc} className="h-24 w-20" />
        <Tile src={centerSrc} className="h-[120px] w-[140px]" />
        <Tile src={rightSrc} className="h-24 w-20" />
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

function Tile({ src, className }: { src: string | null; className: string }) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-[14px] bg-surface2 ${className}`}>
      {src ? (
        <img src={src} alt="Spill evidence" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full" />
      )}
    </div>
  );
}