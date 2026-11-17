"use client";

import { ExpandButton } from "@/components/ExpandButton";
import { formatInt, formatNumber } from "@/lib/format";
import type { AnalyzeResponse, ReadingsResponse } from "@/lib/types";

export interface LeakRateChartProps {
  analysis: AnalyzeResponse;
  readings: ReadingsResponse | null;
}

export function LeakRateChart({ analysis }: LeakRateChartProps) {
  const q = analysis.quantification;
  const [low, high] = q?.volume_range_m3 ?? [0, 0];

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h2 className="card-title">Leak rate</h2>
        <ExpandButton />
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <div>
          <span className="text-faint">Released: </span>
          <span className="font-medium tabular-nums text-text">
            {formatNumber(q?.volume_m3 ?? 0, 1)} m³
          </span>
        </div>
        <div>
          <span className="text-faint">Range: </span>
          <span className="font-medium tabular-nums text-text">
            {formatInt(low)}–{formatInt(high)} m³
          </span>
        </div>
      </div>

      <div className="mt-4 flex-1">
        {/* chart rendered in a later step */}
      </div>
    </div>
  );
}