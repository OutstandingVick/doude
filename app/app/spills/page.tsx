"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Siren } from "lucide-react";
import { Topbar } from "@/components/Topbar";
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

export default function SpillsPage() {
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
    return (
      <div>
        <Topbar title="Spill register" breadcrumb={[{ label: "Spill register" }]} />
        <OfflineCard message={error} />
      </div>
    );
  }

  if (spills === null) {
    return (
      <div>
        <Topbar title="Spill register" breadcrumb={[{ label: "Spill register" }]} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      <Topbar title="Spill register" breadcrumb={[{ label: "Spill register" }]} />

      {spills.length === 0 ? (
        <EmptyState
          icon={<Siren className="h-6 w-6" />}
          title="No spills recorded yet"
          description="Run an analysis from the sidebar to record the first spill."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted">
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
              {spills.map((spill) => {
                const st = STATUS[spill.status] ?? { label: spill.status, tone: "neutral" as PulseTone };
                return (
                  <tr
                    key={spill.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-surface2/50"
                  >
                    <td className="px-5 py-4">
                      <Link href={`/spills/${spill.id}`} className="text-primary">
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
                    <td className="px-5 py-4 tabular-nums text-muted">
                      {spill.evidence_count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}