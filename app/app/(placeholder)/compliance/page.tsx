"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Download, Loader2 } from "lucide-react";
import { OfflineCard } from "@/components/OfflineCard";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { getSpill, getSpills, generateReport } from "@/lib/api";
import { formatUtc } from "@/lib/format";
import type { SpillDetail, SpillSummary } from "@/lib/types";

type FormStatus = "filed" | "filed-late" | "overdue" | "draft" | "ready" | "upcoming";

const FORM_TONE: Record<FormStatus, { label: string; cls: string }> = {
  filed: { label: "Filed", cls: "bg-success/12 text-success" },
  "filed-late": { label: "Filed late", cls: "bg-warn/15 text-warn" },
  overdue: { label: "Overdue", cls: "bg-danger/12 text-danger" },
  draft: { label: "Draft", cls: "bg-surface3 text-text" },
  ready: { label: "Ready", cls: "bg-info/12 text-info" },
  upcoming: { label: "Upcoming", cls: "bg-surface3 text-muted" },
};

function addHours(iso: string, h: number) {
  return new Date(Date.parse(iso) + h * 3600 * 1000);
}

interface FormRow {
  name: string;
  due: Date;
  status: FormStatus;
}

function buildForms(spill: SpillDetail): FormRow[] {
  const detected = spill.detected_at ? new Date(spill.detected_at) : null;
  if (!detected) return [];
  const now = new Date();
  const statusIdx = { detected: 0, jiv: 1, cleanup: 2, closed: 3 }[spill.status] ?? 0;

  const aDue = addHours(spill.detected_at!, 24);
  let aStatus: FormStatus;
  if (spill.form_a?.filed) aStatus = spill.form_a.late ? "filed-late" : "filed";
  else if (now > aDue) aStatus = "overdue";
  else aStatus = "draft";

  const bDue = addHours(spill.detected_at!, 24 * 14);
  const bStatus: FormStatus = statusIdx >= 1 ? "ready" : now > bDue ? "overdue" : "upcoming";

  const cDue = addHours(spill.detected_at!, 24 * 30);
  const cStatus: FormStatus = statusIdx >= 2 ? "ready" : now > cDue ? "overdue" : "upcoming";

  return [
    { name: "Form A", due: aDue, status: aStatus },
    { name: "Form B", due: bDue, status: bStatus },
    { name: "Form C", due: cDue, status: cStatus },
  ];
}

export default function CompliancePage() {
  const [spills, setSpills] = useState<SpillSummary[] | null>(null);
  const [details, setDetails] = useState<Record<string, SpillDetail>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSha, setLastSha] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getSpills();
        if (cancelled) return;
        setSpills(list);
        const ds = await Promise.all(list.map((s) => getSpill(s.id).catch(() => null)));
        if (cancelled) return;
        setDetails(Object.fromEntries(ds.filter(Boolean).map((d) => [d!.id, d!])));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not reach the engine");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => (spills ?? []).map((s) => ({ spill: s, detail: details[s.id] })),
    [spills, details],
  );

  async function handleReport(spillId: string) {
    setBusy(spillId);
    setLastSha(null);
    try {
      const { sha256 } = await generateReport("compliance", { spill_id: spillId });
      setLastSha(sha256);
    } catch {
      /* report opened or failed silently */
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="card">
        <OfflineCard message={error} />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-text">Compliance</h1>
        <p className="mt-1 text-sm text-muted">
          Regulatory form deadlines and status for every recorded spill, from the live data.
        </p>
      </div>

      {spills === null ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title="No spills to report on yet"
            description="Record a spill from the dashboard, then its regulatory forms will appear here."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(({ spill, detail }) => {
            const forms = detail ? buildForms(detail) : [];
            return (
              <div key={spill.id} data-card className="card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/spills/${spill.id}`}
                      className="text-[15px] font-medium text-text hover:text-primary-dark"
                    >
                      {spill.id}
                    </Link>
                    <span className="text-sm text-muted">{spill.pipeline_id}</span>
                    <span className="pill bg-surface3 text-xs capitalize">{spill.status}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReport(spill.id)}
                    disabled={busy === spill.id}
                    className="flex h-9 items-center gap-2 rounded-[10px] bg-primary px-3 text-sm font-medium text-text transition-colors hover:bg-primary-dark disabled:opacity-50"
                  >
                    {busy === spill.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Compliance report
                  </button>
                </div>

                {forms.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-[12px] border border-border-soft">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border-soft bg-surface2 text-[11px] uppercase tracking-[0.08em] text-faint">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Form</th>
                          <th className="px-4 py-2.5 font-medium">Due</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                          <th className="px-4 py-2.5 text-right font-medium">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forms.map((f) => (
                          <tr key={f.name} className="border-b border-border-soft last:border-0">
                            <td className="px-4 py-2.5 text-text">{f.name}</td>
                            <td className="px-4 py-2.5 text-muted">{formatUtc(f.due.toISOString())}</td>
                            <td className="px-4 py-2.5">
                              <span className={`pill text-xs ${FORM_TONE[f.status].cls}`}>
                                {FORM_TONE[f.status].label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Link
                                href={`/spills/${spill.id}?tab=forms`}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Forms →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {lastSha && busy === null && (
                  <p className="mt-2 text-xs text-muted">
                    Compliance report generated ·{" "}
                    <span className="font-mono">{lastSha.replace("sha256:", "").slice(0, 16)}…</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
