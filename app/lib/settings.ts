"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Actor } from "./types";

export type Unit = "bbl" | "m3";
export type Timezone = "utc" | "wat";

export interface Settings {
  unit: Unit;
  timezone: Timezone;
  actor: Actor;
}

const KEY = "feasibility3d-settings";
const WAT_OFFSET_HOURS = 1;

const DEFAULTS: Settings = { unit: "bbl", timezone: "utc", actor: "regulator" };

function read(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      unit: parsed.unit === "m3" ? "m3" : "bbl",
      timezone: parsed.timezone === "wat" ? "wat" : "utc",
      actor:
        parsed.actor === "operator" || parsed.actor === "community"
          ? parsed.actor
          : "regulator",
    };
  } catch {
    return DEFAULTS;
  }
}

let state: Settings = DEFAULTS;
const listeners = new Set<() => void>();

function persist(next: Settings) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return state;
}

export function setSettings(patch: Partial<Settings>) {
  persist({ ...state, ...patch });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): Settings {
  const s = useSyncExternalStore(subscribe, getSettings, () => DEFAULTS);
  // Hydrate from localStorage after mount so SSR (DEFAULTS) and client agree.
  useEffect(() => {
    state = read();
    listeners.forEach((l) => l());
  }, []);
  return s;
}

/** Current actor for the API layer (reads storage directly so the first
 *  request after load carries the right header, independent of hydration). */
export function getActor(): Actor {
  if (typeof window === "undefined") return DEFAULTS.actor;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS.actor;
    const a = (JSON.parse(raw) as Partial<Settings>).actor;
    return a === "operator" || a === "community" ? a : "regulator";
  } catch {
    return DEFAULTS.actor;
  }
}

export function isReadOnly(actor: Actor): boolean {
  return actor === "community";
}

/** Timestamp in the selected zone (WAT = UTC+1). */
export function zoneDate(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const offsetMs = state.timezone === "wat" ? WAT_OFFSET_HOURS * 3600 * 1000 : 0;
  return new Date(d.getTime() + offsetMs);
}

export function zoneSuffix(): string {
  return state.timezone === "wat" ? "WAT" : "UTC";
}
