// Doude API types — must match docs/api-contract.md and contracts/*.json.

export type LonLat = [number, number]; // GeoJSON order: [lon, lat]

export interface Reading {
  timestamp: string;
  p_in_bar: number;
  p_out_bar: number;
  q_in_m3s: number;
  q_out_m3s: number;
}

export interface ReadingsResponse {
  pipeline_id: string;
  step: number;
  readings: Reading[];
}

export interface Baseline {
  q_in_m3s: number;
  q_out_m3s: number;
  p_in_bar: number;
  p_out_bar: number;
  window_start: string;
  window_end: string;
}

export interface Leak {
  detected_at: string;
  estimated_start: string;
  shut_in_at: string | null; // null if still leaking
  duration_hours: number;
  location_m: number;
  location_lonlat: LonLat;
  location_uncertainty_m: number;
  pipeline_type: "trunk_line" | "flow_line";
  terrain: "water" | "land";
}

export interface Quantification {
  leak_rate_m3s: number;
  leak_rate_orifice_m3s: number;
  volume_m3: number;
  volume_bbl: number;
  uncertainty_pct: number;
  method: "mass_balance";
  cross_check: "orifice";
}

export interface Impact {
  type: "water" | "land";
  model: string;
  hours_modelled: number;
  slick_area_m2: number;
  polygon_lonlat: LonLat[]; // closed ring
}

export interface Report {
  method_version: string;
  generated_at: string;
  input_hash: string;
  report_hash: string;
}

export interface AnalyzeResponse {
  detected: boolean;
  pipeline_id: string;
  baseline: Baseline;
  leak: Leak | null;
  quantification: Quantification | null;
  impact: Impact | null;
  report: Report;
}

export const API_URL = process.env.NEXT_PUBLIC_DOUDE_API ?? "http://localhost:8000";
