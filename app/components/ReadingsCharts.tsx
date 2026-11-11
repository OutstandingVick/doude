"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyzeResponse, ReadingsResponse } from "@/lib/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function tickFormat(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function labelFormat(value: unknown): string {
  const ms = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(ms)) return String(value);
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )} UTC`;
}

const tooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #1F2A37",
  borderRadius: "8px",
  color: "#E5E7EB",
  fontSize: "12px",
};

export function ReadingsCharts({
  readings,
  analysis,
}: {
  readings: ReadingsResponse;
  analysis: AnalyzeResponse;
}) {
  const data = readings.readings.map((r) => ({
    time: Date.parse(r.timestamp),
    q_in: r.q_in_m3s,
    q_out: r.q_out_m3s,
    p_in: r.p_in_bar,
    p_out: r.p_out_bar,
  }));

  const detectedMs = analysis.leak ? Date.parse(analysis.leak.detected_at) : null;
  const shutInMs = analysis.leak ? Date.parse(analysis.leak.shut_in_at ?? "") : null;
  const windowStart = Date.parse(analysis.baseline.window_start);
  const windowEnd = Date.parse(analysis.baseline.window_end);

  const gridStroke = "#1F2A37";
  const tickColor = "#8B95A5";

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
          Flow — m³/s
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 18, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickFormat}
              stroke={tickColor}
              tick={{ fill: tickColor, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: gridStroke }}
            />
            <YAxis
              stroke={tickColor}
              tick={{ fill: tickColor, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={labelFormat}
              formatter={(value) => [
                typeof value === "number" ? value.toFixed(4) : String(value),
                "",
              ]}
            />
            {typeof windowStart === "number" && (
              <ReferenceArea
                x1={windowStart}
                x2={windowEnd}
                fill="#161E2B"
                fillOpacity={1}
              />
            )}
            {detectedMs && (
              <ReferenceLine
                x={detectedMs}
                stroke="#EF4444"
                strokeDasharray="4 4"
                label={{
                  value: "Detected",
                  fill: "#EF4444",
                  fontSize: 11,
                  position: "insideTopLeft",
                }}
              />
            )}
            {shutInMs && (
              <ReferenceLine
                x={shutInMs}
                stroke="#F59E0B"
                strokeDasharray="4 4"
                label={{
                  value: "Shut-in",
                  fill: "#F59E0B",
                  fontSize: 11,
                  position: "insideTopRight",
                }}
              />
            )}
            <Line type="monotone" dataKey="q_in" stroke="#14B8A6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            <Line type="monotone" dataKey="q_out" stroke="#38BDF8" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
          Pressure — bar
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 18, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickFormat}
              stroke={tickColor}
              tick={{ fill: tickColor, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: gridStroke }}
            />
            <YAxis
              stroke={tickColor}
              tick={{ fill: tickColor, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={labelFormat}
              formatter={(value) => [
                typeof value === "number" ? value.toFixed(2) : String(value),
                "",
              ]}
            />
            {typeof windowStart === "number" && (
              <ReferenceArea
                x1={windowStart}
                x2={windowEnd}
                fill="#161E2B"
                fillOpacity={1}
              />
            )}
            {detectedMs && (
              <ReferenceLine
                x={detectedMs}
                stroke="#EF4444"
                strokeDasharray="4 4"
                label={{
                  value: "Detected",
                  fill: "#EF4444",
                  fontSize: 11,
                  position: "insideTopLeft",
                }}
              />
            )}
            {shutInMs && (
              <ReferenceLine
                x={shutInMs}
                stroke="#F59E0B"
                strokeDasharray="4 4"
                label={{
                  value: "Shut-in",
                  fill: "#F59E0B",
                  fontSize: 11,
                  position: "insideTopRight",
                }}
              />
            )}
            <Line type="monotone" dataKey="p_in" stroke="#14B8A6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            <Line type="monotone" dataKey="p_out" stroke="#38BDF8" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}