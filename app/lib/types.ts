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
