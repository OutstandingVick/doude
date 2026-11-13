import { API_URL } from "./types";
import type {
  AnalyzeResponse,
  FormAData,
  HealthResponse,
  ReadingsResponse,
  ScenarioResponse,
  VerifyResponse,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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