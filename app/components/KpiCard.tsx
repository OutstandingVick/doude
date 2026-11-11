import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  sub,
  badge,
  visual,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  badge?: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between">
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
          {label}
        </span>
        {badge}
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[32px] font-semibold leading-none tabular-nums text-text">
            {value}
          </div>
          <div className="mt-2 text-sm text-muted">{sub}</div>
        </div>
        {visual && <div className="shrink-0">{visual}</div>}
      </div>
    </div>
  );
}