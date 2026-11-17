"use client";

import { MapContainer, Circle, CircleMarker, Marker, Polyline, Polygon, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { Clock, Crosshair, Droplets, Maximize2, Waves } from "lucide-react";
import { formatBbl, formatKm, formatNumber, roundHalfUp, toLatLng } from "@/lib/format";
import type { AnalyzeResponse, ScenarioResponse } from "@/lib/types";

// Keyless Esri World Imagery (satellite) basemap.
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics";

const ROUTE_COLOR = "#ffffff";
const RING = "#111111";

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

export interface HeroMapProps {
  analysis: AnalyzeResponse;
  scenario: ScenarioResponse;
  spillId?: string | null;
  height?: number;
}

export function HeroMap({ analysis, scenario, spillId, height = 560 }: HeroMapProps) {
  const routeLatLng = scenario.pipeline.route_lonlat.map(toLatLng);
  const center = routeLatLng[0] ?? [4.8, 6.2];

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

  // Interior route vertices get circular nodes; the ends get flow markers.
  const interior: [number, number][] = routeLatLng.slice(1, -1);

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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapContainer
        center={center}
        zoom={11}
        zoomControl={false}
        style={{ height, width: "100%" }}
        className="z-0"
      >
        <TileLayer attribution={SATELLITE_ATTRIBUTION} url={SATELLITE_TILES} />
        <FitBounds points={routeLatLng} />

        {routeLatLng.length > 1 && (
          <Polyline
            positions={routeLatLng}
            pathOptions={{ color: ROUTE_COLOR, weight: 3, opacity: 0.95 }}
          />
        )}

        {interior.map((pt, i) => (
          <CircleMarker
            key={i}
            center={pt}
            radius={7}
            pathOptions={{
              color: RING,
              opacity: 0.4,
              weight: 3,
              fillColor: ROUTE_COLOR,
              fillOpacity: 1,
            }}
          />
        ))}

        {routeLatLng.length > 0 && (
          <>
            <Marker position={routeLatLng[0]} icon={inletIcon} />
            <Marker position={routeLatLng[routeLatLng.length - 1]} icon={outletIcon} />
          </>
        )}

        {leak && (
          <>
            {typeof uncertaintyM === "number" && uncertaintyM > 0 && (
              <Circle
                center={leak}
                radius={uncertaintyM}
                pathOptions={{
                  color: "#F5A524",
                  dashArray: "6 4",
                  fill: false,
                  weight: 2,
                }}
              />
            )}
            <Marker position={leak} icon={leakIcon} />
          </>
        )}

        {slickPolygon && (
          <Polygon
            positions={slickPolygon}
            pathOptions={{
              color: "#E5484D",
              weight: 1,
              fillColor: "#E5484D",
              fillOpacity: 0.3,
            }}
          />
        )}
      </MapContainer>

      {analysis.leak && analysis.quantification && (
        <GlassInfoCard
          analysis={analysis}
          spillId={spillId}
        />
      )}
    </div>
  );
}

function GlassInfoCard({
  analysis,
  spillId,
}: {
  analysis: AnalyzeResponse;
  spillId?: string | null;
}) {
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