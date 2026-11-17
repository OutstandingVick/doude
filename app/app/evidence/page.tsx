"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { OfflineCard } from "@/components/OfflineCard";
import { getSpill, getSpills } from "@/lib/api";
import { formatUtc, shortHash } from "@/lib/format";
import type { EvidenceRecord } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EvidencePage() {
  const [items, setItems] = useState<EvidenceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const spills = await getSpills();
        const withEvidence = spills.filter((s) => s.evidence_count > 0);
        const details = await Promise.all(withEvidence.map((s) => getSpill(s.id)));
        const all = details.flatMap((d) => d.evidence);
        if (!cancelled) setItems(all);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load evidence");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="card">
        <OfflineCard message={error} />
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="card">
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="card-title mb-4">Evidence</h1>
      {items.length === 0 ? (
        <EmptyState
          icon={<Paperclip className="h-6 w-6" />}
          title="No evidence uploaded yet"
          description="Evidence files uploaded to a spill will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border-soft">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border-soft bg-surface2 text-[11px] uppercase tracking-[0.08em] text-faint">
              <tr>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Spill</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">SHA-256</th>
                <th className="px-4 py-3 font-medium">Uploaded</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.spill_id}-${item.id}`} className="border-b border-border-soft last:border-0 hover:bg-surface2/50">
                  <td className="px-4 py-3 text-text">{item.filename}</td>
                  <td className="px-4 py-3 text-muted">{item.spill_id}</td>
                  <td className="px-4 py-3 text-muted">{item.content_type.split("/")[1]}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{formatBytes(item.size_bytes)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{shortHash(item.sha256)}</td>
                  <td className="px-4 py-3 text-muted">{formatUtc(item.uploaded_at)}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`/spills/${item.spill_id}`}
                      className="text-primary hover:underline"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}