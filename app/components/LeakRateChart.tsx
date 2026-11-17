"use client";

import { ExpandButton } from "@/components/ExpandButton";
import { formatInt, formatNumber } from "@/lib/format";
import type { AnalyzeResponse, ReadingsResponse } from "@/lib/types";

export interface LeakRateChartProps {
  analysis: AnalyzeResponse;
  readings: ReadingsResponse | null;
}

export function LeakRateChart({ analysis, readings }: LeakRateChartProps) {
  const q = analysis.quantification;
  const [low, high] = q?.volume_range_m3 ?? [0, 0];

  const data = readings?.readings ?? [];
  const values = data.map((r) => r.q_in_m3s - r.q_out_m3s);
  const maxValue = Math.max(0.0001, ...values);

  const W = 400;
  const H = 190;
  const plotTop = 12;
  const plotBottom = 155;
  const plotH = plotBottom - plotTop;
  const barSlot = data.length > 0 ? W / data.length : 0;
  const barWidth = barSlot * 0.65;

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
        {data.length > 0 && (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
            {values.map((v, i) => {
              const h = (v / maxValue) * plotH;
              const x = i * barSlot + (barSlot - barWidth) / 2;
              const y = plotBottom - h;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(h, 0.5)}
                  rx={1}
                  fill="#D9D9D4"
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}