"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAnalysis } from "@/components/AnalysisProvider";
import { OfflineCard } from "@/components/OfflineCard";
import { Skeleton } from "@/components/Skeleton";
import { LeakRateChart } from "@/components/LeakRateChart";
import { SpillSnapshot } from "@/components/SpillSnapshot";
import { RegulatoryTimeline } from "@/components/RegulatoryTimeline";
import { ResponseIntegrity } from "@/components/ResponseIntegrity";
import { getSpill } from "@/lib/api";
import type { SpillDetail } from "@/lib/types";

const HeroMap = dynamic(
  () => import("@/components/HeroMap").then((mod) => mod.HeroMap),
  { ssr: false },
);

const GRID =
  "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]";

export default function Dashboard() {
  const { analysis, scenario, readings, loading, error, runAnalysis } = useAnalysis();
  const [spill, setSpill] = useState<SpillDetail | null>(null);

  const spillId = analysis?.spill_id ?? null;

  useEffect(() => {
    if (!spillId) return;
    let cancelled = false;
    getSpill(spillId)
      .then((d) => {
        if (!cancelled) setSpill(d);
      })
      .catch(() => {
        if (!cancelled) setSpill(null);
      });
    return () => {
      cancelled = true;
    };
  }, [spillId]);

  if (error) {
    return (
      <div className="card">
        <OfflineCard message={error} />
      </div>
    );
  }

  if (loading || !analysis || !scenario) {
    return (
      <div className={GRID}>
        <div className="min-h-0 md:col-span-2 xl:col-span-5 xl:row-span-2">
          <Skeleton className="h-full" />
        </div>
        <div className="min-h-0 xl:col-span-4">
          <Skeleton className="h-full" />
        </div>
        <div className="min-h-0 xl:col-span-3">
          <Skeleton className="h-full" />
        </div>
        <div className="min-h-0 xl:col-span-4">
          <Skeleton className="h-full" />
        </div>
        <div className="min-h-0 xl:col-span-3">
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  const status = spill?.status ?? "detected";
  const evidence = spill?.evidence ?? [];
  const auditCount = spill?.audit.length ?? 0;
  const id = spillId ?? "SPL-0001";

  return (
    <div className={GRID}>
      <div className="min-h-0 md:col-span-2 xl:col-span-5 xl:row-span-2">
        <div data-card className="card h-full overflow-hidden p-0">
          <HeroMap
            analysis={analysis}
            scenario={scenario}
            spillId={spillId}
            onRunAnalysis={runAnalysis}
          />
        </div>
      </div>

      <div className="min-h-0 xl:col-span-4">
        <LeakRateChart analysis={analysis} readings={readings} />
      </div>

      <div className="min-h-0 xl:col-span-3">
        <SpillSnapshot
          analysis={analysis}
          scenario={scenario}
          spillId={id}
          evidence={evidence}
        />
      </div>

      <div className="min-h-0 xl:col-span-4">
        <RegulatoryTimeline analysis={analysis} spillId={id} status={status} />
      </div>

      <div className="min-h-0 xl:col-span-3">
        <ResponseIntegrity
          analysis={analysis}
          spillId={id}
          auditCount={auditCount}
          evidenceCount={evidence.length}
        />
      </div>
    </div>
  );
}