import Link from "next/link";
import { CircleHelp, FileText, Gauge, Locate, ShieldCheck, Workflow } from "lucide-react";

const FUNCTIONS = [
  {
    icon: Gauge,
    title: "Detect",
    body: "Learns a baseline from the first 48 h of normal operation, then flags a leak when the inflow/outflow imbalance exceeds the baseline mean by 5× the noise for 5 consecutive minutes.",
  },
  {
    icon: Locate,
    title: "Locate",
    body: "Averages pressure and flow over the steady leak period and rewinds the pressure drop from both ends (gradient intersection) to estimate the breach distance and an uncertainty band.",
  },
  {
    icon: FileText,
    title: "Quantify",
    body: "Integrates the minute-by-minute mass balance over the leak window, cross-checks it against a steady-state average, and back-calculates the equivalent hole size with an uncertainty range.",
  },
  {
    icon: ShieldCheck,
    title: "Impact & sealed report",
    body: "Models the water-surface slick (Fay spreading plus current/wind drift) and seals everything as a signed report whose SHA-256 hash only depends on the inputs — so it is repeatable.",
  },
  {
    icon: Workflow,
    title: "Data management",
    body: "Persists each analysis as a spill record with a strict status workflow, evidence uploads, and an append-only audit log chained with SHA-256 so tampering is detectable.",
  },
];

const STATUS_FLOW = [
  { id: "detected", label: "Detected", desc: "Leak found and recorded. Form A is due within 24 h." },
  { id: "jiv", label: "JIV", desc: "Joint inspection of the breach completed." },
  { id: "cleanup", label: "Clean-up", desc: "Remediation underway; Form B is due." },
  { id: "closed", label: "Closed", desc: "Clean-up verified; Form C filed." },
];

const FORMS = [
  { name: "Form A", due: "within 24 h of detection", desc: "Notification to NOSDRA." },
  { name: "Form B", due: "within 2 weeks", desc: "Spill response report." },
  { name: "Form C", due: "within 30 days", desc: "Clean-up completion report." },
];

const FAQ = [
  {
    q: "Where do the numbers come from?",
    a: "Pressure and flow at the pipeline ends only. No operator-reported volume is required — that is the point: an independent, repeatable measurement.",
  },
  {
    q: "Is the report tamper-evident?",
    a: "Yes. Every report is sealed with a SHA-256 hash that depends only on the inputs and results, and every action is written to an append-only, hash-chained audit log.",
  },
  {
    q: "What does “verified” mean?",
    a: "Re-running the analysis on the same data reproduces the identical report hash, confirming the result is repeatable and the chain is intact.",
  },
  {
    q: "Can I switch between regulator, operator and community views?",
    a: "Yes — use the account menu (top right) → “View as”. Community is read-only.",
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-primary text-text">
          <CircleHelp className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-text">Help &amp; docs</h1>
          <p className="text-sm text-muted">How Feasibility3D detects, measures and records spills.</p>
        </div>
      </div>

      <section className="card mb-5">
        <h2 className="card-title">The five functions</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FUNCTIONS.map((f) => (
            <div key={f.title} className="rounded-[14px] border border-border-soft bg-surface2 p-4">
              <div className="flex items-center gap-2">
                <f.icon className="h-5 w-5 text-primary-dark" />
                <span className="text-sm font-medium text-text">{f.title}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title">Spill status workflow</h2>
          <ol className="mt-4 space-y-3">
            {STATUS_FLOW.map((s, i) => (
              <li key={s.id} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-text text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium text-text">{s.label}</div>
                  <div className="text-[13px] text-muted">{s.desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <h2 className="card-title">Regulatory forms</h2>
          <div className="mt-4 space-y-3">
            {FORMS.map((f) => (
              <div key={f.name} className="rounded-[14px] border border-border-soft bg-surface2 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text">{f.name}</span>
                  <span className="pill bg-surface3 text-[11px]">{f.due}</span>
                </div>
                <p className="mt-1 text-[13px] text-muted">{f.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-muted">
            Generate and file them from a spill’s{" "}
            <Link href="/spills" className="text-primary hover:underline">
              Regulatory forms
            </Link>{" "}
            tab.
          </p>
        </section>
      </div>

      <section className="card mt-5">
        <h2 className="card-title">Frequently asked</h2>
        <div className="mt-4 space-y-4">
          {FAQ.map((item) => (
            <div key={item.q}>
              <div className="text-sm font-medium text-text">{item.q}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
