"use client";

import { useEffect, useMemo } from "react";
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
import { toLatLng } from "@/lib/format";
import type { LonLat } from "@/lib/types";

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    }
  }, [map, points]);
  return null;
}

export interface SpillMapProps {
  route: LonLat[];
  leakLonLat?: LonLat | null;
  uncertaintyM?: number | null;
  polygon?: LonLat[] | null;
  center?: LonLat | null;
  height?: number;
}

export function SpillMap({
  route,
  leakLonLat,
  uncertaintyM,
  polygon,
  center,
  height = 420,
}: SpillMapProps) {
  const routeLatLng = route.map(toLatLng);
  const leak = leakLonLat ? toLatLng(leakLonLat) : null;
  const slickPolygon = polygon && polygon.length ? polygon.map(toLatLng) : null;
  const slickCenter = center ? toLatLng(center) : null;

  const fallbackCenter: [number, number] = [4.8, 6.2];
  const initialCenter = leak ?? routeLatLng[0] ?? fallbackCenter;

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

  const bounds: [number, number][] = [...routeLatLng];
  if (leak) bounds.push(leak);
  if (slickPolygon) bounds.push(...slickPolygon);

  return (
    <MapContainer
      center={initialCenter}
      zoom={11}
      style={{ height, width: "100%" }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={bounds} />

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
                weight: 1.5,
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
            fillOpacity: 0.2,
          }}
        />
      )}
    </MapContainer>
  );
}