"use client";

import { useState } from "react";
import { Download, MapPin } from "lucide-react";import { useAnalysis } from "@/components/AnalysisProvider";
import { Topbar } from "@/components/Topbar";
import { Tabs } from "@/components/Tabs";
import { StatusPill } from "@/components/StatusPill";
import { formatUtc } from "@/lib/format";

const TAB_ITEMS = [
  "Overview",
  "Quantification",
  "Impact",
  "Evidence & hashes",
  "Regulatory forms",
];

function downloadReport(data: unknown, pipelineId: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `doude-report-${pipelineId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SpillDetailPage() {
  const { analysis } = useAnalysis();
  const [tab, setTab] = useState(TAB_ITEMS[0]);

  if (!analysis) {
    return (
      <div>
        <Topbar
          title="Spill details"
          breadcrumb={[{ label: "Spill register", href: "/spills" }, { label: "SPL-0001" }]}
        />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const leak = analysis.leak;

  return (
    <div>
      <Topbar
        title="Spill details"
        breadcrumb={[
          { label: "Spill register", href: "/spills" },
          { label: "SPL-0001" },
        ]}
      />

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text">
          SPL-0001 · {analysis.pipeline_id}
        </h2>
        <button
          type="button"
          onClick={() => downloadReport(analysis, analysis.pipeline_id)}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text hover:bg-surface2"
        >
          <Download className="h-4 w-4" />
          Download report
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <StatusPill tone="warn" label="Contained" />
            <StatusPill tone="danger" label="Major" />
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
                Pipeline type
              </div>
              <div className="mt-1 text-sm text-text">
                {leak?.pipeline_type === "trunk_line" ? "Trunk line" : "Flow line"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
                Detected
              </div>
              <div className="mt-1 text-sm text-text">
                {leak ? formatUtc(leak.detected_at) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
                Shut in
              </div>
              <div className="mt-1 text-sm text-text">
                {leak?.shut_in_at ? formatUtc(leak.shut_in_at) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
                Last analysis
              </div>
              <div className="mt-1 text-sm text-text">
                {formatUtc(analysis.report.generated_at)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === "Overview" && <OverviewTab />}
        {tab === "Quantification" && <Placeholder text="Quantification" />}
        {tab === "Impact" && <Placeholder text="Impact" />}
        {tab === "Evidence & hashes" && <Placeholder text="Evidence & hashes" />}
        {tab === "Regulatory forms" && <Placeholder text="Regulatory forms" />}
      </div>
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="text-sm text-muted">
      Overview content is built in the next step.
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <MapPin className="h-4 w-4" />
      {text} content is built in a later step.
    </div>
  );
}