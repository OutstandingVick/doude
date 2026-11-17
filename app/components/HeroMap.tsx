"use client";

import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toLatLng } from "@/lib/format";
import type { ScenarioResponse } from "@/lib/types";

// Keyless Esri World Imagery (satellite) basemap.
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics";

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
      </MapContainer>
    </div>
  );
}