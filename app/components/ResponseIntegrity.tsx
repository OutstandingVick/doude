"use client";

import { useEffect, useRef, useState } from "react";
import { Droplets, ScrollText, ShieldCheck } from "lucide-react";
import { ExpandButton } from "@/components/ExpandButton";
import { ExpandModal } from "@/components/ExpandModal";
import { auditVerify, reportPdfUrl } from "@/lib/api";
import { formatBbl } from "@/lib/format";
import type { AnalyzeResponse, AuditVerification } from "@/lib/types";

export interface ResponseIntegrityProps {
  analysis: AnalyzeResponse;
  spillId: string;
  auditCount: number;
  evidenceCount: number;
}

function PipelineGlyph() {
  return (
    <svg viewBox="0 0 120 24" className="h-6 w-full" aria-hidden="true">
      <line x1="8" y1="12" x2="112" y2="12" stroke="#111111" strokeWidth={2} />
      <circle cx="8" cy="12" r="3" fill="#111111" />
      <circle cx="112" cy="12" r="3" fill="#111111" />
      <circle cx="72" cy="12" r="4.5" fill="#E5484D" stroke="#fff" strokeWidth={1} />
    </svg>
  );
}

export function ResponseIntegrity({
  analysis,
  spillId,
  auditCount,
  evidenceCount,
}: ResponseIntegrityProps) {
  const [integrity, setIntegrity] = useState<AuditVerification | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    auditVerify()
      .then((v) => {
        if (!cancelled) setIntegrity(v);
      })
      .catch(() => {
        if (!cancelled) setIntegrity({ ok: false, entries: 0, broken_at: null });
      });
    return () => {
      cancelled = true;
    };
  }, [auditCount]);

  const integrityLabel = integrity === null ? "Checking…" : integrity.ok ? "Verified" : "Broken";

  const body = (
    <IntegrityBody
      analysis={analysis}
      spillId={spillId}
      auditCount={auditCount}
      evidenceCount={evidenceCount}
      integrity={integrity}
      integrityLabel={integrityLabel}
    />
  );

  return (
    <>
      <div data-card className="card flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Response &amp; integrity</h2>
          <ExpandButton onClick={() => setExpanded(true)} />
        </div>
        {body}
      </div>
      <ExpandModal open={expanded} onClose={() => setExpanded(false)} title="Response &amp; integrity">
        {body}
      </ExpandModal>
    </>
  );
}

function IntegrityBody({
  analysis,
  spillId,
  auditCount,
  evidenceCount,
  integrity,
  integrityLabel,
}: {
  analysis: AnalyzeResponse;
  spillId: string;
  auditCount: number;
  evidenceCount: number;
  integrity: AuditVerification | null;
  integrityLabel: string;
}) {
  const hashPrefix = analysis.report.report_hash.replace("sha256:", "").slice(0, 10);
  const fanAreaRef = useRef<HTMLDivElement>(null);
  const [fanScale, setFanScale] = useState(1);

  useEffect(() => {
    const el = fanAreaRef.current;
    if (!el) return;
    const FAN_W = 300;
    const FAN_H = 190;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setFanScale(Math.max(0.4, Math.min(1, width / FAN_W, height / FAN_H)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* The document fan is drawn at 300×190 and scaled down to fit the
          space left above the stats row, so it never overlaps them. */}
      <div ref={fanAreaRef} className="relative my-3 flex min-h-0 flex-1 items-center justify-center">
        <div
          className="relative h-[190px] w-[300px] shrink-0 origin-center"
          style={{ transform: `scale(${fanScale})` }}
        >
          <div className="absolute left-4 top-4 flex h-[150px] w-[118px] -rotate-[8deg] flex-col items-center justify-center rounded-[14px] border border-border-soft bg-surface2 p-3 text-center shadow-md">
            <div className="text-sm font-medium text-text">Form A</div>
            <div className="mt-1 text-[11px] text-faint">Draft</div>
          </div>

          <div className="absolute right-4 top-4 flex h-[150px] w-[118px] rotate-[8deg] flex-col items-center justify-center rounded-[14px] border border-border-soft bg-surface2 p-3 text-center shadow-md">
            <div className="text-sm font-medium text-text">Evidence</div>
            <div className="mt-1 text-[11px] text-faint">{evidenceCount} files</div>
          </div>

          <a
            href={reportPdfUrl(spillId)}
            aria-label="Download spill report"
            className="absolute left-1/2 top-1/2 z-10 flex h-[180px] w-[150px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[16px] border border-border-soft bg-white p-4 shadow-lg transition-shadow hover:shadow-xl"
          >
            <div className="text-[13px] font-semibold text-text">Spill report</div>
            <div className="mt-0.5 text-[11px] text-faint">{spillId}</div>
            <div className="mt-4">
              <PipelineGlyph />
            </div>
            <div className="mt-auto font-mono text-[10px] text-faint">{hashPrefix}</div>
          </a>
        </div>
      </div>

      <div className="mt-auto flex items-stretch justify-between border-t border-border-soft pt-4">
        <IntegrityStat
          icon={<Droplets className="h-3.5 w-3.5" />}
          label="Volume"
          value={formatBbl(analysis.quantification?.volume_bbl ?? 0)}
        />
        <div className="my-1 w-px bg-border-soft" />
        <IntegrityStat
          icon={<ScrollText className="h-3.5 w-3.5" />}
          label="Audit entries"
          value={String(auditCount)}
        />
        <div className="my-1 w-px bg-border-soft" />
        <IntegrityStat
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Integrity"
          value={integrityLabel}
          tone={integrity === null ? undefined : integrity.ok ? "success" : "danger"}
        />
      </div>
    </>
  );
}

function IntegrityStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-2 text-center">
      <div className="flex items-center gap-1 text-faint">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div
        className={`text-[15px] font-medium tabular-nums ${
          tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-text"
        }`}
      >
        {value}
      </div>
    </div>
  );
}