export type PulseTone = "success" | "warn" | "danger" | "info" | "neutral";

const TONES: Record<PulseTone, { text: string; bg: string; dot: string }> = {
  success: { text: "text-success", bg: "bg-success/12", dot: "bg-success" },
  warn: { text: "text-warn", bg: "bg-warn/12", dot: "bg-warn" },
  danger: { text: "text-danger", bg: "bg-danger/12", dot: "bg-danger" },
  info: { text: "text-info", bg: "bg-info/12", dot: "bg-info" },
  neutral: { text: "text-muted", bg: "bg-surface2", dot: "bg-muted" },
};

export function StatusPill({
  tone,
  label,
}: {
  tone: PulseTone;
  label: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${t.bg} ${t.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {label}
    </span>
  );
}