import { API_URL } from "./types";
import { getActor } from "./settings";
import type {
  AnalyzeResponse,
  AuditEntry,
  AuditVerification,
  Contact,
  EvidenceRecord,
  FormAData,
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