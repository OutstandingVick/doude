"use client";

import { MapContainer, Circle, CircleMarker, Marker, Polyline, Polygon, TileLayer, useMap } from "react-leaflet";
import { useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { getSpills } from "@/lib/api";
import {
  Clock,
  Crosshair,
  Droplets,
  Gauge,
  Layers,
  Maximize2,
  Play,
  Route,
  Target,
  Waves,
  X,
} from "lucide-react";
import { formatBbl, formatKm, formatNumber, roundHalfUp, toLatLng } from "@/lib/format";
import type { AnalyzeResponse, ScenarioResponse } from "@/lib/types";

// Keyless Esri basemaps (no API key required).
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DARK_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIBUTION = "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics";
const DARK_ATTRIBUTION = "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors";

const ROUTE_COLOR = "#ffffff";
const RING = "#111111";
type Basemap = "satellite" | "dark";

interface LayerState {
  pipeline: boolean;
  leak: boolean;
  slick: boolean;
  sensors: boolean;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

function MapRefCapture({ onMap }: { onMap: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
  return null;
}

function MapLayers({
  analysis,
  scenario,
  basemap,
  layers,
}: {
  analysis: AnalyzeResponse;
  scenario: ScenarioResponse;
  basemap: Basemap;
  layers: LayerState;
}) {
  const routeLatLng = scenario.pipeline.route_lonlat.map(toLatLng);
  const leak = analysis.leak ? toLatLng(analysis.leak.location_lonlat) : null;
  const uncertaintyM = analysis.leak?.location_uncertainty_m;
  const slickPolygon =
    analysis.impact?.polygon_lonlat?.length
      ? analysis.impact.polygon_lonlat.map(toLatLng)
      : null;

  const inletIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,2 14,14 2,14" fill="${ROUTE_COLOR}" stroke="${RING}" stroke-opacity="0.4" stroke-width="2"/></svg>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    [],
  );
  const outletIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<svg width="18" height="18" viewBox="0 0 18 18"><polygon points="3,3 15,9 3,15 6,9" fill="${ROUTE_COLOR}" stroke="${RING}" stroke-opacity="0.4" stroke-width="2"/></svg>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    [],
  );
  const leakIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: '<div class="leak-pulse"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    [],
  );

  const interior = routeLatLng.slice(1, -1);

  return (
    <>
      <TileLayer
        url={basemap === "dark" ? DARK_TILES : SATELLITE_TILES}
        attribution={basemap === "dark" ? DARK_ATTRIBUTION : SATELLITE_ATTRIBUTION}
      />
      <FitBounds points={routeLatLng} />

      {layers.pipeline && routeLatLng.length > 1 && (
        <Polyline positions={routeLatLng} pathOptions={{ color: ROUTE_COLOR, weight: 3, opacity: 0.95 }} />
      )}

      {layers.pipeline &&
        interior.map((pt, i) => (
          <CircleMarker
            key={i}
            center={pt}
            radius={7}
            pathOptions={{ color: RING, opacity: 0.4, weight: 3, fillColor: ROUTE_COLOR, fillOpacity: 1 }}
          />
        ))}

      {layers.sensors && routeLatLng.length > 0 && (
        <>
          <Marker position={routeLatLng[0]} icon={inletIcon} />
          <Marker position={routeLatLng[routeLatLng.length - 1]} icon={outletIcon} />
        </>
      )}

      {layers.leak && leak && (
        <>
          {typeof uncertaintyM === "number" && uncertaintyM > 0 && (
            <Circle
              center={leak}
              radius={uncertaintyM}
              pathOptions={{ color: "#F5A524", dashArray: "6 4", fill: false, weight: 2 }}
            />
          )}
          <Marker position={leak} icon={leakIcon} />
        </>
      )}

      {layers.slick && slickPolygon && (
        <Polygon
          positions={slickPolygon}
          pathOptions={{ color: "#E5484D", weight: 1, fillColor: "#E5484D", fillOpacity: 0.3 }}
        />
      )}
    </>
  );
}

function GlassInfoCard({ analysis, spillId }: { analysis: AnalyzeResponse; spillId?: string | null }) {
  const leak = analysis.leak!;
  const q = analysis.quantification!;
  const impact = analysis.impact;
  const detectMinutes = Math.round(
    (Date.parse(leak.detected_at) - Date.parse(leak.estimated_start)) / 60000,
  );
  const slickKm2 = impact ? (impact.slick_area_m2 ?? 0) / 1e6 : 0;

  return (
    <div className="absolute left-4 top-1/2 z-20 w-[220px] -translate-y-1/2 rounded-[12px] bg-white/78 p-3 shadow-sm backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-semibold text-text">
          {formatKm(leak.location_m)} · {analysis.pipeline_id}
        </div>
        <button type="button" aria-label="Expand map" className="text-faint hover:text-text">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Droplets className="h-3 w-3 shrink-0 text-faint" />
          {formatBbl(q.volume_bbl)} bbl released (±{q.uncertainty_pct}%)
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Clock className="h-3 w-3 shrink-0 text-faint" />
          Detected {detectMinutes} min after deviation
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Crosshair className="h-3 w-3 shrink-0 text-faint" />
          Hole ≈ {roundHalfUp(q.equivalent_hole_mm, 0)} mm · {formatNumber(q.pressure_at_leak_bar, 2)} bar at breach
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Waves className="h-3 w-3 shrink-0 text-faint" />
          Slick {formatNumber(slickKm2, 2)} km² after {impact?.hours_modelled ?? 6} h ({leak.terrain})
        </div>
      </div>

      {spillId && (
        <Link
          href={`/spills/${spillId}`}
          aria-label="Open spill detail"
          className="mt-2 flex h-7 w-7 items-center justify-center rounded-full bg-text text-sm text-white transition-colors hover:bg-text/80"
        >
          +
        </Link>
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-[10px] transition-colors ${
        active ? "bg-primary text-text" : "text-text hover:bg-surface2"
      }`}
    >
      {children}
    </button>
  );
}

export interface HeroMapProps {
  analysis: AnalyzeResponse;
  scenario: ScenarioResponse;
  spillId?: string | null;
  onRunAnalysis?: () => Promise<AnalyzeResponse | null>;
  height?: number;
}

export function HeroMap({ analysis, scenario, spillId, onRunAnalysis, height = 560 }: HeroMapProps) {
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [expanded, setExpanded] = useState(false);
  const [map, setMap] = useState<L.Map | null>(null);
  const [focusedOnLeak, setFocusedOnLeak] = useState(false);
  const [layers, setLayers] = useState<LayerState>({
    pipeline: true,
    leak: true,
    slick: true,
    sensors: true,
  });
  const routeLatLng = scenario.pipeline.route_lonlat.map(toLatLng);
  const center = routeLatLng[0] ?? [4.8, 6.2];

  const leakBounds = useMemo(() => {
    const pts: [number, number][] = [];
    if (analysis.leak) pts.push(toLatLng(analysis.leak.location_lonlat));
    if (analysis.impact?.polygon_lonlat?.length) {
      pts.push(...analysis.impact.polygon_lonlat.map(toLatLng));
    }
    return pts;
  }, [analysis]);

  function toggleLayer(key: keyof LayerState) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleZoom() {
    if (!map) return;
    const next = !focusedOnLeak;
    setFocusedOnLeak(next);
    const pts = next ? leakBounds : routeLatLng;
    if (pts.length > 0) {
      map.flyToBounds(L.latLngBounds(pts), { padding: [40, 40], duration: 0.6 });
    }
  }

  const [toast, setToast] = useState<string | null>(null);

  const handleRunAnalysis = useCallback(async () => {
    try {
      const before = new Set((await getSpills()).map((s) => s.id));
      const result = await onRunAnalysis?.();
      const id = result?.spill_id;
      if (id) {
        const isNew = !before.has(id);
        setToast(isNew ? `Saved as ${id}` : `Identical result — already recorded as ${id}`);
      }
    } catch {
      setToast("Analysis failed — is the engine running?");
    }
    window.setTimeout(() => setToast(null), 4000);
  }, [onRunAnalysis]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") handleRunAnalysis();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleRunAnalysis]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapContainer
        center={center}
        zoom={11}
        zoomControl={false}
        style={{ height, width: "100%" }}
        className="z-0"
      >
        <MapLayers analysis={analysis} scenario={scenario} basemap={basemap} layers={layers} />
        <MapRefCapture onMap={setMap} />
      </MapContainer>

      <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
        <button
          type="button"
          aria-label="Toggle basemap"
          onClick={() => setBasemap((b) => (b === "satellite" ? "dark" : "satellite"))}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-text shadow-md transition-colors hover:bg-surface2"
        >
          <Layers className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Expand map"
          onClick={() => setExpanded(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-text shadow-md transition-colors hover:bg-surface2"
        >
          <Maximize2 className="h-[18px] w-[18px]" />
        </button>
      </div>

      <button
        type="button"
        aria-label="Zoom to leak"
        onClick={toggleZoom}
        className="absolute bottom-4 left-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-white text-text shadow-md transition-colors hover:bg-surface2"
      >
        <Crosshair className="h-6 w-6" />
      </button>

      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-[14px] bg-white p-1.5 shadow-md">
        <ToolbarButton active={layers.pipeline} onClick={() => toggleLayer("pipeline")} label="Pipeline">
          <Route className="h-5 w-5" />
        </ToolbarButton>
        <ToolbarButton active={layers.leak} onClick={() => toggleLayer("leak")} label="Leak and uncertainty">
          <Target className="h-5 w-5" />
        </ToolbarButton>
        <ToolbarButton active={layers.slick} onClick={() => toggleLayer("slick")} label="Slick">
          <Droplets className="h-5 w-5" />
        </ToolbarButton>
        <ToolbarButton active={layers.sensors} onClick={() => toggleLayer("sensors")} label="Sensors">
          <Gauge className="h-5 w-5" />
        </ToolbarButton>
        <ToolbarButton active={false} onClick={handleRunAnalysis} label="Run analysis">
          <Play className="h-5 w-5" />
        </ToolbarButton>
      </div>

      {toast && (
        <div className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-[10px] bg-text px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {analysis.leak && analysis.quantification && (
        <GlassInfoCard analysis={analysis} spillId={spillId} />
      )}

      {expanded && (
        <div className="fixed inset-0 z-50 bg-bg">
          <MapContainer
            center={center}
            zoom={11}
            zoomControl={false}
            style={{ height: "100vh", width: "100vw" }}
          >
            <MapLayers analysis={analysis} scenario={scenario} basemap={basemap} layers={layers} />
          </MapContainer>
          <button
            type="button"
            aria-label="Close full screen"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-text shadow-md hover:bg-surface2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}