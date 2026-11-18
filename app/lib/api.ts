import { API_URL } from "./types";
import { getActor } from "./settings";
import type {
  AnalyzeResponse,
  AuditEntry,
  AuditVerification,
  Contact,
  EvidenceRecord,
  FormAData,
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
  VerifyResponse,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Doude-Actor": getActor(),
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

export async function uploadEvidence(
  id: string,
  file: File,
  note?: string,
): Promise<EvidenceRecord> {
  const form = new FormData();
  form.append("file", file);
  if (note) form.append("note", note);
    const response = await fetch(`${API_URL}/spills/${encodeURIComponent(id)}/evidence`, {
      method: "POST",
      body: form,
      headers: { "X-Doude-Actor": getActor() },
    });
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
    headers: { "X-Doude-Actor": getActor() },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      (body && (body as { message?: string }).message) ||
        `Report failed (${response.status})`,
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `doude-${type}.pdf`;
  return {
    blob: await response.blob(),
    sha256: response.headers.get("x-report-sha256") ?? "",
    filename,
  };
}

export function reportHistoryPdfUrl(entryId: number): string {
  return `${API_URL}/reports/history/${entryId}.pdf`;
}
