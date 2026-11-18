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
  volume_m3: number;
  volume_bbl: number;
  volume_steady_m3: number;
  methods_agree_pct: number;
  equivalent_hole_mm: number;
  pressure_at_leak_bar: number;
  uncertainty_pct: number;
  volume_range_m3: [number, number];
  method: "mass_balance";
  cross_check: "steady_state_average";
}

export interface Impact {
  type: "water" | "land";
  model: string;
  hours_modelled: number;
  slick_area_m2: number;
  polygon_lonlat: LonLat[]; // closed ring; empty for land
  volume_spread_m3?: number; // water only
  slick_radius_m?: number; // water only
  center_lonlat?: LonLat; // water only
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
  spill_id?: string | null;
}

export type SpillStatus = "detected" | "jiv" | "cleanup" | "closed";

export interface PipelineRecord {
  id: string;
  name: string;
  type: string;
  length_m: number;
  inner_diameter_m: number;
  terrain_at_leak: string;
  created_at: string;
}

export interface SpillHeader {
  id: string;
  pipeline_id: string;
  status: SpillStatus;
  detected_at: string | null;
  estimated_start: string | null;
  shut_in_at: string | null;
  location_m: number | null;
  location_lon: number | null;
  location_lat: number | null;
  volume_m3: number | null;
  volume_bbl: number | null;
  uncertainty_pct: number | null;
  input_hash: string | null;
  report_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpillSummary extends SpillHeader {
  evidence_count: number;
}

export interface EvidenceRecord {
  id: number;
  spill_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  stored_path: string;
  note: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface AuditEntry {
  id: number;
  spill_id: string | null;
  action: string;
  actor: string;
  detail_json: string;
  at: string;
  prev_hash: string;
  entry_hash: string;
}

export interface AuditVerification {
  ok: boolean;
  entries: number;
  broken_at: number | null;
}

export type Actor = "regulator" | "operator" | "community";

export interface Notification {
  id: string;
  kind: "audit" | "deadline";
  title: string;
  detail: string;
  at: string;
  actor: string | null;
  spill_id: string | null;
  link: string;
  overdue?: boolean;
}

export interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface FormAStatus {
  filed: boolean;
  late: boolean;
  reference: string | null;
  filed_at: string | null;
}

export interface SpillDetail extends SpillHeader {
  analysis: AnalyzeResponse | null;
  evidence: EvidenceRecord[];
  audit: AuditEntry[];
  form_a: FormAStatus | null;
}

export interface HealthResponse {
  status: string;
  method_version: string;
}

export interface VerifyResponse {
  repeatable: boolean;
  report_hash: string;
}

export interface FormAData {
  draft: boolean;
  reference: string;
  spill_id: string;
  pipeline: {
    id: string;
    type: string;
    fluid: string;
    length_m: number | null;
    diameter_m: number | null;
  };
  incident: {
    spill_began_utc: string;
    detected_utc: string;
    shut_in_utc: string | null;
    deadline_utc: string;
  };
  location: {
    distance_m: number;
    latitude: number;
    longitude: number;
    terrain: string;
    uncertainty_m: number;
  };
  quantity: {
    volume_bbl: number;
    volume_m3: number;
    volume_range_m3: [number, number];
    method: string;
    uncertainty_pct: number;
  };
  cause: string;
  immediate_actions: string;
  integrity: {
    report_hash: string;
    input_hash: string;
  };
}

export interface ScenarioResponse {
  name: string;
  method_version: string;
  pipeline: {
    id: string;
    type: "trunk_line" | "flow_line";
    length_m: number;
    inner_diameter_m: number;
    roughness_m: number;
    terrain_at_leak: "water" | "land";
    route_lonlat: LonLat[];
  };
  fluid: {
    name: string;
    density_kg_m3: number;
    viscosity_pa_s: number;
  };
  sensors: {
    sample_interval_s: number;
  };
  normal_operation: {
    flow_m3s: number;
    p_in_bar: number;
    p_out_bar: number;
  };
  timeline: {
    data_start: string;
    data_end: string;
  };
}

export const API_URL = process.env.NEXT_PUBLIC_DOUDE_API ?? "http://localhost:8000";

export type ReportScope = "spill" | "pipeline" | "period";
export type ReportTypeId = "spill" | "form-a" | "compliance" | "audit" | "period";

export interface ReportType {
  id: ReportTypeId;
  name: string;
  description: string;
  scope: ReportScope;
  /** Parameter names; a trailing "?" marks an optional one. */
  params: string[];
}

export interface ReportParams {
  spill_id?: string | null;
  pipeline_id?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface ReportHistoryItem {
  id: number;
  type: ReportTypeId;
  params: ReportParams;
  sha256: string;
  actor: string;
  at: string;
  spill_id: string | null;
}
