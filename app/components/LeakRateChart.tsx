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
  const leak = analysis.leak;

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

  const startMs = leak ? Date.parse(leak.estimated_start) : null;
  const endMs = leak && leak.shut_in_at ? Date.parse(leak.shut_in_at) : null;
  const inWindow = (i: number) =>
    startMs !== null && endMs !== null &&
    Date.parse(data[i].timestamp) >= startMs &&
    Date.parse(data[i].timestamp) < endMs;

  // Peak leak rate inside the window, for the pinned tooltip.
  let peakIndex = -1;
  let peakValue = 0;
  if (startMs !== null && endMs !== null) {
    for (let i = 0; i < data.length; i++) {
      if (inWindow(i) && values[i] > peakValue) {
        peakValue = values[i];
        peakIndex = i;
      }
    }
  }
  const peakX = peakIndex >= 0 ? peakIndex * barSlot + barSlot / 2 : 0;

  // Day labels (01–05 Nov); the leak day (03 Nov) is bold.
  const dayLabels = [1, 2, 3, 4, 5]
    .map((day) => {
      const idx = data.findIndex(
        (r) => new Date(r.timestamp).getUTCDate() === day && new Date(r.timestamp).getUTCMonth() === 10,
      );
      if (idx < 0) return null;
      return { x: idx * barSlot + barSlot / 2, label: `${String(day).padStart(2, "0")} Nov`, bold: day === 3 };
    })
    .filter((d): d is { x: number; label: string; bold: boolean } => d !== null);

  const tooltipW = 96;
  const tooltipX = Math.min(Math.max(peakX - tooltipW / 2, 4), W - tooltipW - 4);

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
            <line x1={0} y1={plotBottom} x2={W} y2={plotBottom} stroke="#E7E7E2" strokeWidth={1} />

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
                  fill={inWindow(i) ? "#D7F26B" : "#D9D9D4"}
                />
              );
            })}

            {dayLabels.map((d) => (
              <text
                key={d.label}
                x={d.x}
                y={178}
                textAnchor="middle"
                fontSize={11}
                fontWeight={d.bold ? 700 : 400}
                fill={d.bold ? "#111111" : "#9A9A94"}
              >
                {d.label}
              </text>
            ))}

            {peakIndex >= 0 && (
              <g>
                <line
                  x1={peakX}
                  y1={plotTop + 34}
                  x2={peakX}
                  y2={plotBottom - (peakValue / maxValue) * plotH}
                  stroke="#111111"
                  strokeWidth={1}
                />
                <circle cx={peakX} cy={plotBottom - (peakValue / maxValue) * plotH} r={2.5} fill="#E5484D" />
                <rect x={tooltipX} y={plotTop} width={tooltipW} height={34} rx={6} fill="#FFFFFF" stroke="#E7E7E2" />
                <text x={tooltipX + 8} y={plotTop + 14} fontSize={9} fill="#9A9A94">
                  Peak leak rate
                </text>
                <text x={tooltipX + 8} y={plotTop + 28} fontSize={11} fontWeight={600} fill="#111111">
                  {formatNumber(peakValue, 4)} m³/s
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}