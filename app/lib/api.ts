import { API_URL } from "./types";
import { getActor } from "./settings";
import { enqueueUpload } from "./offlineQueue";
import type {
  AnalyzeResponse,
  AuditEntry,
  AuditVerification,
  Contact,
  EvidenceRecord,
  FieldValues,
  FormAData,
  FormSchema,
  ReportSection,
  ReportTemplate,
  WrittenKind,
  WrittenReport,
  PipelineRecord,
  ReportHistoryItem,
  ReportParams,
  ReportType,
  ReportTypeId,
  HealthResponse,
  Notification,
  ReadingsResponse,
  ScenarioResponse,
  SpillDetail,
  SpillStatus,
  SpillSummary,
  SessionUser,
  VerifyResponse,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Feasibility3D-Actor": getActor(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      (body && (body as { message?: string }).message) ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export function getMe(): Promise<{ user: SessionUser }> {
  return request<{ user: SessionUser }>("/me");
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error((body && (body as { message?: string }).message) || `Login failed (${response.status})`);
  }
  const data = (await response.json()) as { user: SessionUser };
  return data.user;
}

export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/logout", { method: "POST" });
}

export function getScenario(): Promise<ScenarioResponse> {
  return request<ScenarioResponse>("/scenario");
}

export function getReadings(step = 10): Promise<ReadingsResponse> {
  return request<ReadingsResponse>(`/readings?step=${step}`);
}

export function runAnalysis(): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("/analyze", { method: "POST" });
}

export function verify(): Promise<VerifyResponse> {
  return request<VerifyResponse>("/verify");
}

export function getFormA(): Promise<FormAData> {
  return request<FormAData>("/forms/a");
}

export function getSpills(pipelineId?: string): Promise<SpillSummary[]> {
  const q = pipelineId ? `?pipeline_id=${encodeURIComponent(pipelineId)}` : "";
  return request<SpillSummary[]>(`/spills${q}`);
}

export function getSpill(id: string): Promise<SpillDetail> {
  return request<SpillDetail>(`/spills/${encodeURIComponent(id)}`);
}

export function setSpillStatus(
  id: string,
  status: SpillStatus,
  note?: string,
): Promise<{ spill_id: string; status: string }> {
  return request(`/spills/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status, note }),
  });
}

export function getSpillAudit(id: string): Promise<AuditEntry[]> {
  return request<AuditEntry[]>(`/spills/${encodeURIComponent(id)}/audit`);
}

export function auditVerify(): Promise<AuditVerification> {
  return request<AuditVerification>("/audit/verify");
}

/**
 * Upload evidence. When offline the upload is queued (IndexedDB) and sent on
 * reconnect; in that case this resolves to `null`.
 */
export async function uploadEvidence(
  id: string,
  file: File,
  note?: string,
): Promise<EvidenceRecord | null> {
  const queue = async () => {
    await enqueueUpload({ spillId: id, file, filename: file.name, note, actor: getActor() });
    return null;
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) return queue();
  const form = new FormData();
  form.append("file", file);
  if (note) form.append("note", note);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/spills/${encodeURIComponent(id)}/evidence`, {
      method: "POST",
      body: form,
      credentials: "include",
      headers: { "X-Feasibility3D-Actor": getActor() },
    });
  } catch {
    return queue(); // network error: treat as offline
  }
  if (response.status === 503) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "offline") return queue();
  }
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`);
  }
  return response.json() as Promise<EvidenceRecord>;
}

export function reportPdfUrl(spillId?: string): string {
  return spillId
    ? `${API_URL}/report.pdf?spill_id=${encodeURIComponent(spillId)}`
    : `${API_URL}/report.pdf`;
}

export function formAPdfUrl(spillId?: string): string {
  return spillId
    ? `${API_URL}/forms/a.pdf?spill_id=${encodeURIComponent(spillId)}`
    : `${API_URL}/forms/a.pdf`;
}

export function evidenceUrl(spillId: string, evidenceId: number): string {
  return `${API_URL}/spills/${encodeURIComponent(spillId)}/evidence/${evidenceId}`;
}

export function getNotifications(): Promise<Notification[]> {
  return request<Notification[]>("/notifications");
}

export function fileFormA(
  spillId: string,
  reference: string,
  filedAt: string,
): Promise<{ spill_id: string; filed: boolean; late: boolean; reference: string; filed_at: string }> {
  return request(`/spills/${encodeURIComponent(spillId)}/forms/a/filed`, {
    method: "POST",
    body: JSON.stringify({ reference, filed_at: filedAt }),
  });
}

export function getContacts(): Promise<Contact[]> {
  return request<Contact[]>("/contacts");
}

export function addContact(
  contact: { name: string; email?: string; phone?: string },
): Promise<Contact> {
  return request<Contact>("/contacts", {
    method: "POST",
    body: JSON.stringify(contact),
  });
}

export function removeContact(id: number): Promise<{ id: number; removed: boolean }> {
  return request(`/contacts/${id}`, { method: "DELETE" });
}
export function getPipelines(): Promise<PipelineRecord[]> {
  return request<PipelineRecord[]>("/pipelines");
}

export function getReportTypes(): Promise<ReportType[]> {
  return request<ReportType[]>("/reports/types");
}

export function getReportHistory(): Promise<ReportHistoryItem[]> {
  return request<ReportHistoryItem[]>("/reports/history");
}

function reportQuery(params: ReportParams): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * Generate a report (logged in the audit chain as report_generated) and
 * return the PDF with its fingerprint and suggested filename.
 */
export async function generateReport(
  type: ReportTypeId,
  params: ReportParams,
): Promise<{ blob: Blob; sha256: string; filename: string }> {
  const response = await fetch(`${API_URL}/reports/${type}.pdf${reportQuery(params)}`, {
    credentials: "include",
    headers: { "X-Feasibility3D-Actor": getActor() },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      (body && (body as { message?: string }).message) ||
        `Report failed (${response.status})`,
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `feasibility3d-${type}.pdf`;
  return {
    blob: await response.blob(),
    sha256: response.headers.get("x-report-sha256") ?? "",
    filename,
  };
}

export function reportHistoryPdfUrl(entryId: number): string {
  return `${API_URL}/reports/history/${entryId}.pdf`;
}

export class ApiError extends Error {
  fields: string[];
  constructor(message: string, fields: string[] = []) {
    super(message);
    this.fields = fields;
  }
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Feasibility3D-Actor": getActor() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { message?: string; fields?: string[] }
      | null;
    throw new ApiError(data?.message || `Request failed (${response.status})`, data?.fields ?? []);
  }
  return response.json() as Promise<T>;
}

export function getReportForms(): Promise<{ forms: FormSchema[]; sections: ReportSection[] }> {
  return request("/reports/forms");
}

export function getFormPrefill(kind: WrittenKind, spillId: string): Promise<FieldValues> {
  return request(`/reports/forms/${kind}/prefill?spill_id=${encodeURIComponent(spillId)}`);
}

export function createWrittenReport(body: {
  kind: WrittenKind;
  spill_id: string;
  title?: string;
  fields: FieldValues;
  sections: string[];
  template_id?: number | null;
}): Promise<WrittenReport> {
  return send("/reports/written", "POST", body);
}

export function getReportTemplates(): Promise<ReportTemplate[]> {
  return request("/reports/templates");
}

export function saveReportTemplate(body: {
  name: string;
  kind: WrittenKind;
  fields: FieldValues;
  sections: string[];
}): Promise<ReportTemplate> {
  return send("/reports/templates", "POST", body);
}

export function deleteReportTemplate(id: number): Promise<{ id: number; deleted: boolean }> {
  return send(`/reports/templates/${id}`, "DELETE");
}
