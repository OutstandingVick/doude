"use client";

import { MapContainer, CircleMarker, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toLatLng } from "@/lib/format";
import type { ScenarioResponse } from "@/lib/types";

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
  scenario: ScenarioResponse;
  height?: number;
}

export function HeroMap({ scenario, height = 560 }: HeroMapProps) {
  const routeLatLng = scenario.pipeline.route_lonlat.map(toLatLng);
  const center = routeLatLng[0] ?? [4.8, 6.2];

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
      </MapContainer>
    </div>
  );
}