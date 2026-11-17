"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Route } from "lucide-react";
import { toLatLng } from "@/lib/format";
import type { LonLat } from "@/lib/types";

// Keyless Esri World Dark Gray basemap (no API key required).
// Swap these two constants to change the basemap.
const BASE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const LABEL_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTRIBUTION =
  "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors";

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
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

export interface SpillMapProps {
  route: LonLat[];
  leakLonLat?: LonLat | null;
  uncertaintyM?: number | null;
  polygon?: LonLat[] | null;
  center?: LonLat | null;
  height?: number;
  defaultView?: "full" | "leak";
}

export function SpillMap({
  route,
  leakLonLat,
  uncertaintyM,
  polygon,
  center,
  height = 420,
  defaultView = "full",
}: SpillMapProps) {
  const [map, setMap] = useState<L.Map | null>(null);

  const routeLatLng = route.map(toLatLng);
  const leak = leakLonLat ? toLatLng(leakLonLat) : null;
  const slickPolygon = polygon && polygon.length ? polygon.map(toLatLng) : null;
  const slickCenter = center ? toLatLng(center) : null;

  const fallbackCenter: [number, number] = [4.8, 6.2];
  const initialCenter = leak ?? routeLatLng[0] ?? fallbackCenter;

  const fullBounds: [number, number][] = routeLatLng;
  const leakBounds: [number, number][] = [];
  if (leak) leakBounds.push(leak);
  if (slickPolygon) leakBounds.push(...slickPolygon);

  const initialBounds =
    defaultView === "leak" && leakBounds.length > 0 ? leakBounds : fullBounds;

  const leakIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: '<div class="leak-pulse"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    [],
  );

  function flyTo(points: [number, number][]) {
    if (map && points.length > 0) {
      map.flyToBounds(L.latLngBounds(points), { padding: [30, 30], duration: 0.6 });
    }
  }

  return (
    <div className="relative" style={{ height }}>
      <MapContainer
        center={initialCenter}
        zoom={11}
        style={{ height, width: "100%" }}
        className="z-0"
      >
        <TileLayer attribution={TILE_ATTRIBUTION} url={BASE_TILES} />
        <TileLayer url={LABEL_TILES} />
        <MapRefCapture onMap={setMap} />
        <FitBounds points={initialBounds} />

        {routeLatLng.length > 1 && (
          <Polyline positions={routeLatLng} pathOptions={{ color: "#14B8A6", weight: 3 }} />
        )}

        {routeLatLng.length > 0 && (
          <>
            <CircleMarker
              center={routeLatLng[0]}
              radius={5}
              pathOptions={{ color: "#14B8A6", fillColor: "#14B8A6", fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                Inlet
              </Tooltip>
            </CircleMarker>
            <CircleMarker
              center={routeLatLng[routeLatLng.length - 1]}
              radius={5}
              pathOptions={{ color: "#14B8A6", fillColor: "#14B8A6", fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                Outlet
              </Tooltip>
            </CircleMarker>
          </>
        )}

        {leak && (
          <>
            {typeof uncertaintyM === "number" && uncertaintyM > 0 && (
              <Circle
                center={leak}
                radius={uncertaintyM}
                pathOptions={{
                  color: "#F59E0B",
                  dashArray: "6 4",
                  fill: false,
                  weight: 2,
                }}
              />
            )}
            <Marker position={leak} icon={leakIcon} />
          </>
        )}

        {slickCenter && (
          <CircleMarker
            center={slickCenter}
            radius={3}
            pathOptions={{ color: "#EF4444", fillColor: "#EF4444", fillOpacity: 1 }}
          />
        )}

        {slickPolygon && (
          <Polygon
            positions={slickPolygon}
            pathOptions={{
              color: "#EF4444",
              weight: 1,
              fillColor: "#EF4444",
              fillOpacity: 0.25,
            }}
          />
        )}
      </MapContainer>

      <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => flyTo(leakBounds)}
          disabled={!leak}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text shadow-sm transition-colors hover:bg-surface2 disabled:opacity-50"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Zoom to leak
        </button>
        <button
          type="button"
          onClick={() => flyTo(fullBounds)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text shadow-sm transition-colors hover:bg-surface2"
        >
          <Route className="h-3.5 w-3.5" />
          Full pipeline
        </button>
      </div>
    </div>
  );
}