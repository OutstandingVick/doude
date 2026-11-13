import type { LonLat } from "./types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** 28880 -> "28,880" */
export function formatBbl(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** 4591.6 -> "4,591.6" */
export function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 13390.2 -> "KM 13.39" */
export function formatKm(meters: number): string {
  return `KM ${(meters / 1000).toFixed(2)}`;
}

/** 6.22226 -> "6.22226" */
export function formatCoord(value: number): string {
  return value.toFixed(5);
}

/** "2026-11-03T14:05:00Z" -> "03 Nov, 14:05 UTC" */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = MONTHS[date.getUTCMonth()];
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mm = date.getUTCMinutes().toString().padStart(2, "0");
  return `${day} ${month}, ${hh}:${mm} UTC`;
}

/** "2026-11-04T14:05:00Z" -> "04 Nov 2026, 14:05 UTC" */
export function formatUtcFull(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mm = date.getUTCMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm} UTC`;
}

/** "sha256:c3c0…ab959b" -> "c3c0…ab959b" */
export function shortHash(hash: string): string {
  const hex = hash.startsWith("sha256:") ? hash.slice("sha256:".length) : hash;
  if (hex.length <= 16) return hex;
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}

/** [lon, lat] -> [lat, lon] for Leaflet */
export function toLatLng(lonlat: LonLat): [number, number] {
  return [lonlat[1], lonlat[0]];
}

/** 807237 -> "807,237" */
export function formatInt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}