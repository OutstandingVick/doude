"use client";

import { useEffect, useRef, useState } from "react";
import { ExpandButton } from "@/components/ExpandButton";
import { ExpandModal } from "@/components/ExpandModal";
import { formatInt, formatNumber } from "@/lib/format";
import type { AnalyzeResponse, ReadingsResponse } from "@/lib/types";

export interface LeakRateChartProps {
  analysis: AnalyzeResponse;
  readings: ReadingsResponse | null;
}

interface HourBin {
  time: number;
  rate: number;
  leaking: boolean;
}

function LeakRateChartBody({
  analysis,
  readings,
  className,
  chartHeight,
}: {
  analysis: AnalyzeResponse;
  readings: ReadingsResponse | null;
  className?: string;
  chartHeight?: number;
}) {
  const q = analysis.quantification;
  const [low, high] = q?.volume_range_m3 ?? [0, 0];
  const leak = analysis.leak;

  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bin readings into hourly buckets (mean leak rate per hour).
  const buckets = new Map<number, number[]>();
  for (const r of readings?.readings ?? []) {
    const t = Date.parse(r.timestamp);
    const hour = Math.floor(t / 3_600_000);
    const arr = buckets.get(hour) ?? [];
    arr.push(r.q_in_m3s - r.q_out_m3s);
    buckets.set(hour, arr);
  }
  const startMs = leak ? Date.parse(leak.estimated_start) : 0;
  const endMs = leak && leak.shut_in_at ? Date.parse(leak.shut_in_at) : 0;

  const bins: HourBin[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, vals]) => ({
      time: hour * 3_600_000,
      rate: vals.reduce((s, v) => s + v, 0) / vals.length,
      leaking: startMs !== 0 && endMs !== 0 && hour * 3_600_000 >= startMs && hour * 3_600_000 < endMs,
    }));

  const maxRate = Math.max(0.0001, ...bins.map((b) => b.rate));
  const yMax = maxRate * 1.15;

  let peakIdx = -1;
  let peakRate = 0;
  bins.forEach((b, i) => {
    if (b.leaking && b.rate > peakRate) {
      peakRate = b.rate;
      peakIdx = i;
    }
  });

  const padL = 12;
  const padR = 12;
  const padT = 46;
  const padB = 24;
  const W = Math.max(0, size.w);
  const H = Math.max(0, size.h);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = bins.length;
  const barSlot = n > 0 ? plotW / n : 0;
  const barW = Math.max(1, Math.min(3, barSlot - 2));

  // Daily tick positions (first hour of each day).
  const dayTicks: { x: number; label: string; bold: boolean }[] = [];
  let prevDay = -1;
  bins.forEach((b, i) => {
    const day = new Date(b.time).getUTCDate();
    if (day !== prevDay) {
      dayTicks.push({ x: padL + i * barSlot + barSlot / 2, label: String(day).padStart(2, "0"), bold: day === 3 });
      prevDay = day;
    }
  });

  const peakX = peakIdx >= 0 ? padL + peakIdx * barSlot + barSlot / 2 : 0;
  const tooltipLabel = "Peak hourly leak rate";
  const tooltipValue = `${formatNumber(peakRate, 4)} m³/s`;
  const tooltipW = 150;
  const tooltipX = Math.min(Math.max(peakX - tooltipW / 2, padL), W - padR - tooltipW);

  return (
    <div className={className}>
      <div className="space-y-1 text-sm">
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

      <div ref={ref} className="mt-3 min-h-0 flex-1" style={chartHeight ? { height: chartHeight } : undefined}>
        {W > 0 && H > 0 && n > 0 && (
          <svg width={W} height={H} role="img" aria-label="Leak rate per hour">
            <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#E7E7E2" strokeWidth={1} />

            {bins.map((b, i) => {
              const h = (b.rate / yMax) * plotH;
              const x = padL + i * barSlot + (barSlot - barW) / 2;
              const y = padT + plotH - h;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, 1)}
                  rx={1.5}
                  fill={b.leaking ? "#D7F26B" : "#D9D9D4"}
                />
              );
            })}

            {dayTicks.map((t) => (
              <text
                key={t.x}
                x={t.x}
                y={H - padB + 12}
                textAnchor="middle"
                fontSize={11}
                fontWeight={t.bold ? 700 : 400}
                fill="#9A9A94"
              >
                {t.label}
              </text>
            ))}

            {peakIdx >= 0 && (
              <g>
                <line x1={peakX} y1={padT} x2={peakX} y2={padT + plotH - (peakRate / yMax) * plotH} stroke="#111111" strokeWidth={1} />
                <circle cx={peakX} cy={padT + plotH - (peakRate / yMax) * plotH} r={2.5} fill="#E5484D" />
                <rect x={tooltipX} y={4} width={tooltipW} height={40} rx={6} fill="#FFFFFF" stroke="#E7E7E2" />
                <text x={tooltipX + 8} y={20} fontSize={10} fill="#9A9A94">
                  {tooltipLabel}
                </text>
                <text x={tooltipX + 8} y={36} fontSize={12} fontWeight={600} fill="#111111">
                  {tooltipValue}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

export function LeakRateChart({ analysis, readings }: LeakRateChartProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div data-card className="card flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Leak rate</h2>
          <ExpandButton onClick={() => setExpanded(true)} />
        </div>
        <LeakRateChartBody
          analysis={analysis}
          readings={readings}
          className="mt-3 flex min-h-0 flex-1 flex-col"
        />
      </div>
      <ExpandModal open={expanded} onClose={() => setExpanded(false)} title="Leak rate">
        <LeakRateChartBody
          analysis={analysis}
          readings={readings}
          className="flex flex-col"
          chartHeight={460}
        />
      </ExpandModal>
    </>
  );
}
