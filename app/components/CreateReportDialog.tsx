"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Check, Download, Loader2, Trash2, X } from "lucide-react";
import {
  ApiError,
  createWrittenReport,
  deleteReportTemplate,
  getFormPrefill,
  getReportForms,
  getReportTemplates,
  reportHistoryPdfUrl,
  saveReportTemplate,
} from "@/lib/api";
import type {
  FieldValues,
  FormField,
  FormSchema,
  ReportSection,
  ReportTemplate,
  SpillSummary,
  WrittenKind,
  WrittenReport,
} from "@/lib/types";

const TAB_LABEL: Record<WrittenKind, string> = {
  "form-a": "Form A",
  "form-b": "Form B",
  "form-c": "Form C",
  custom: "Custom",
};

const INPUT =
  "h-10 w-full rounded-[10px] bg-surface3 px-3 text-sm text-text outline-none placeholder:text-faint focus:ring-2 focus:ring-primary";

/** ISO timestamp → value for <input type="datetime-local"> (UTC). */
function toLocalInput(value: string | number | null | undefined): string {
  if (!value) return "";
  const s = String(value);
  return s.length >= 16 ? s.slice(0, 16) : s;
}

export function CreateReportDialog({
  spills,
  initialKind = "form-a",
  onClose,
  onCreated,
}: {
  spills: SpillSummary[];
  initialKind?: WrittenKind;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [forms, setForms] = useState<FormSchema[] | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [kind, setKind] = useState<WrittenKind>(initialKind);
  const [spillId, setSpillId] = useState(spills[0]?.id ?? "");
  const [values, setValues] = useState<FieldValues>({});
  // Values Doude filled from the spill record; not saved into templates.
  const [prefilled, setPrefilled] = useState<FieldValues>({});
  const [chosenSections, setChosenSections] = useState<string[]>(["summary", "timeline", "quantification"]);
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [created, setCreated] = useState<WrittenReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([getReportForms(), getReportTemplates()])
      .then(([f, t]) => {
        setForms(f.forms);
        setSections(f.sections);
        setTemplates(t);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load forms"));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pre-fill from the spill record whenever the form type or spill changes.
  useEffect(() => {
    if (!spillId) return;
    let cancelled = false;
    getFormPrefill(kind, spillId)
      .then((v) => {
        // Keep anything the user typed or a template applied while loading.
        if (cancelled) return;
        setPrefilled(v);
        setValues((cur) => ({ ...v, ...cur }));
      })
      .catch(() => {
        if (!cancelled) setValues({});
      });
    return () => {
      cancelled = true;
    };
  }, [kind, spillId]);

  function resetFor(nextKind: WrittenKind, nextSpill: string) {
    setKind(nextKind);
    setSpillId(nextSpill);
    setValues({});
    setPrefilled({});
    setCreated(null);
    setBadFields([]);
    setError(null);
    setTemplateId(null);
  }

  const form = useMemo(() => forms?.find((f) => f.id === kind) ?? null, [forms, kind]);
  const kindTemplates = templates.filter((t) => t.kind === kind);

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setBadFields((b) => b.filter((k) => k !== key));
  }

  function applyTemplate(id: number | null) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setValues((v) => ({ ...v, ...tpl.fields }));
    if (tpl.sections.length) setChosenSections(tpl.sections);
    setNotice(`Applied template “${tpl.name}”`);
    window.setTimeout(() => setNotice(null), 2500);
  }

  async function submit() {
    if (!form || !spillId) return;
    const missing = form.fields
      .filter((f) => f.required && (values[f.key] === undefined || values[f.key] === null || String(values[f.key]).trim() === ""))
      .map((f) => f.key);
    if (missing.length) {
      setBadFields(missing);
      setError("Fill in the required fields.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const report = await createWrittenReport({
        kind,
        spill_id: spillId,
        title: title || undefined,
        fields: values,
        sections: kind === "custom" ? chosenSections : [],
        template_id: templateId,
      });
      setCreated(report);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setBadFields(err.fields);
      setError(err instanceof Error ? err.message : "Could not create the report");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) return;
    try {
      // Templates keep only what the user typed, not spill-specific prefill.
      const own = Object.fromEntries(
        Object.entries(values).filter(([k, v]) => v !== prefilled[k] && v !== "" && v !== null),
      );
      const tpl = await saveReportTemplate({
        name: templateName.trim(),
        kind,
        fields: own,
        sections: kind === "custom" ? chosenSections : [],
      });
      setTemplates((t) => [...t, tpl].sort((a, b) => a.name.localeCompare(b.name)));
      setTemplateId(tpl.id);
      setTemplateName("");
      setSavingTemplate(false);
      setNotice(`Saved template “${tpl.name}”`);
      window.setTimeout(() => setNotice(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template");
    }
  }

  async function removeTemplate() {
    if (templateId === null) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl || !window.confirm(`Delete template “${tpl.name}”?`)) return;
    try {
      await deleteReportTemplate(templateId);
      setTemplates((t) => t.filter((x) => x.id !== templateId));
      setTemplateId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the template");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-stretch justify-end bg-black/25"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-report-title"
        tabIndex={-1}
        data-create-report
        className="m-3 flex w-full max-w-[720px] flex-col overflow-hidden rounded-[24px] border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.15)] outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 id="create-report-title" className="text-lg font-semibold text-text">
              Create report
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Write a Form A, B or C for a spill, or build a custom report from its record.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="expand-btn shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border-soft bg-surface2 px-6 py-2" role="tablist">
          {(Object.keys(TAB_LABEL) as WrittenKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === kind}
              onClick={() => resetFor(k, spillId)}
              className={`flex-1 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors ${
                k === kind ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              {TAB_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {form && (
            <p className="mb-4 text-sm text-muted">
              {form.description}
              {form.due ? <span className="text-faint"> · Due {form.due}</span> : null}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Labeled label="Spill" required>
              {spills.length ? (
                <select value={spillId} onChange={(e) => resetFor(kind, e.target.value)} className={INPUT}>
                  {spills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.pipeline_id}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted">No spills recorded yet — run an analysis first.</p>
              )}
            </Labeled>
            <Labeled label="Template">
              <div className="flex gap-2">
                <select
                  value={templateId ?? ""}
                  onChange={(e) => applyTemplate(e.target.value ? Number(e.target.value) : null)}
                  className={INPUT}
                  aria-label="Apply a saved template"
                >
                  <option value="">{kindTemplates.length ? "None" : "No saved templates"}</option>
                  {kindTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {templateId !== null && (
                  <button
                    type="button"
                    onClick={removeTemplate}
                    aria-label="Delete template"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-surface3 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Labeled>
            <div className="sm:col-span-2">
              <Labeled label="Title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={form ? `${form.name} · ${spillId || "spill"}` : ""}
                  className={INPUT}
                />
              </Labeled>
            </div>
          </div>

          {kind === "custom" && sections.length > 0 && (
            <fieldset className="mt-5">
              <legend className="mb-2 text-xs text-muted">Sections from the spill record</legend>
              <div className="flex flex-wrap gap-2">
                {sections.map((s) => {
                  const on = chosenSections.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setChosenSections((c) => (on ? c.filter((x) => x !== s.id) : [...c, s.id]))
                      }
                      className={`pill gap-1.5 text-xs ${on ? "bg-primary" : ""}`}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {form?.fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                <Labeled label={f.type === "datetime" ? `${f.label} (UTC)` : f.label} required={f.required} hint={f.hint}>
                  <FieldInput
                    field={f}
                    value={values[f.key]}
                    invalid={badFields.includes(f.key)}
                    onChange={(v) => setField(f.key, v)}
                  />
                </Labeled>
              </div>
            ))}
          </div>
          {!form && !error && <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-muted" />}
        </div>

        <div className="border-t border-border-soft px-6 py-4">
          {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
          {notice && <p className="mb-3 text-sm text-muted">{notice}</p>}
          {created && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[12px] bg-surface2 px-4 py-3 text-sm">
              <span className="text-text">
                <Check className="mr-1 inline h-4 w-4 text-success" />
                Saved and logged ·{" "}
                <span className="font-mono text-xs text-muted">
                  {created.sha256.replace("sha256:", "").slice(0, 16)}…
                </span>
              </span>
              {created.history_id !== undefined && (
                <a
                  href={reportHistoryPdfUrl(created.history_id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-text hover:underline"
                >
                  <Download className="h-4 w-4" /> Open PDF
                </a>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {savingTemplate ? (
              <div className="flex flex-1 gap-2">
                <input
                  autoFocus
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveTemplate();
                  }}
                  placeholder="Template name"
                  className={INPUT}
                  aria-label="Template name"
                />
                <button
                  type="button"
                  onClick={() => void saveTemplate()}
                  disabled={!templateName.trim()}
                  className="h-10 shrink-0 rounded-[12px] border border-border px-3 text-sm font-medium text-text hover:bg-surface2 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setSavingTemplate(false)}
                  className="h-10 shrink-0 rounded-[12px] px-3 text-sm text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSavingTemplate(true)}
                disabled={!form}
                className="flex h-10 items-center gap-2 rounded-[12px] border border-border px-4 text-sm font-medium text-text hover:bg-surface2 disabled:opacity-50"
              >
                <BookmarkPlus className="h-4 w-4" /> Save as template
              </button>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !form || !spillId}
              className="ml-auto flex h-10 items-center gap-2 rounded-[12px] bg-primary px-5 text-sm font-medium text-text transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Labeled({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

function FieldInput({
  field,
  value,
  invalid,
  onChange,
}: {
  field: FormField;
  value: string | number | null | undefined;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const cls = `${INPUT} ${invalid ? "ring-2 ring-danger" : ""}`;
  const v = value === null || value === undefined ? "" : String(value);
  if (field.type === "textarea") {
    return (
      <textarea
        value={v}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        aria-invalid={invalid}
        className={`${cls} h-auto py-2 leading-relaxed`}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select value={v} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} className={cls}>
        <option value="">Select…</option>
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "datetime") {
    return (
      <input
        type="datetime-local"
        value={toLocalInput(value)}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className={cls}
      />
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      step="any"
      value={v}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
      className={cls}
    />
  );
}
