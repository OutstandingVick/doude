"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Siren } from "lucide-react";
import { StatusPill, type PulseTone } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { OfflineCard } from "@/components/OfflineCard";
import { getSpills } from "@/lib/api";
import { formatBbl, formatKm, formatUtc } from "@/lib/format";
import type { SpillStatus, SpillSummary } from "@/lib/types";

const STATUS: Record<SpillStatus, { label: string; tone: PulseTone }> = {
  detected: { label: "Detected", tone: "danger" },
  jiv: { label: "JIV", tone: "warn" },
  cleanup: { label: "Clean-up", tone: "info" },
  closed: { label: "Closed", tone: "success" },
};

function FilterChip({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-text text-white" : "bg-surface3 text-muted hover:text-text"
      }`}
    >
      {label}
    </Link>
  );
}

function SpillsTable() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").toLowerCase();
  const status = searchParams.get("status") ?? "";
  const [spills, setSpills] = useState<SpillSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSpills()
      .then((data) => {
        if (!cancelled) setSpills(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load spills");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <OfflineCard message={error} />;
  }

  if (spills === null) {
    return <Skeleton className="h-64" />;
  }

  const filtered = spills.filter((s) => {
    if (status && s.status !== status) return false;
    if (!q) return true;
    const km = s.location_m != null ? formatKm(s.location_m) : "";
    return (
      s.id.toLowerCase().includes(q) ||
      s.pipeline_id.toLowerCase().includes(q) ||
      km.toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<Siren className="h-6 w-6" />}
          title={q || status ? "No spills match your filters" : "No spills recorded yet"}
          description={
            q || status
              ? "Try clearing the search or status filter."
              : "Run an analysis from the map to record the first spill."
          }
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Status</span>
        <FilterChip label="All" active={status === ""} href="/spills" />
        {(Object.keys(STATUS) as SpillStatus[]).map((s) => (
          <FilterChip
            key={s}
            label={STATUS[s].label}
            active={status === s}
            href={`/spills?status=${s}`}
          />
        ))}
      </div>
      <div className="card overflow-hidden p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border-soft bg-surface2 text-[11px] uppercase tracking-[0.08em] text-faint">
          <tr>
            <th className="px-5 py-3 font-medium">ID</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Pipeline</th>
            <th className="px-5 py-3 font-medium">Volume (bbl)</th>
            <th className="px-5 py-3 font-medium">Location</th>
            <th className="px-5 py-3 font-medium">Detected</th>
            <th className="px-5 py-3 font-medium">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((spill) => {
            const st = STATUS[spill.status] ?? { label: spill.status, tone: "neutral" as PulseTone };
            return (
              <tr
                key={spill.id}
                className="border-b border-border-soft transition-colors last:border-0 hover:bg-surface2/60"
              >
                <td className="px-5 py-4">
                  <Link href={`/spills/${spill.id}`} className="font-medium text-text hover:text-primary-dark">
                    {spill.id}
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <StatusPill tone={st.tone} label={st.label} />
                </td>
                <td className="px-5 py-4 text-text">{spill.pipeline_id}</td>
                <td className="px-5 py-4 tabular-nums text-text">
                  {spill.volume_bbl != null ? formatBbl(spill.volume_bbl) : "—"}
                </td>
                <td className="px-5 py-4 tabular-nums text-text">
                  {spill.location_m != null ? formatKm(spill.location_m) : "—"}
                </td>
                <td className="px-5 py-4 text-muted">
                  {spill.detected_at ? formatUtc(spill.detected_at) : "—"}
                </td>
                <td className="px-5 py-4 tabular-nums text-muted">{spill.evidence_count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default function SpillsPage() {
  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold text-text">Spills</h1>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <SpillsTable />
      </Suspense>
    </div>
  );
}