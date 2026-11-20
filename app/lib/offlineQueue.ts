/**
 * Offline evidence-upload queue (IndexedDB).
 *
 * Uploads made while offline are stored here and sent when the browser comes
 * back online (see PwaProvider). Works on every browser with IndexedDB,
 * including iOS Safari, which has no Background Sync.
 */
import type { EvidenceRecord } from "./types";

export interface QueuedUpload {
  id?: number;
  spillId: string;
  file: Blob;
  filename: string;
  note?: string;
  actor: string;
  queuedAt: string;
}

const DB_NAME = "feasibility3d";
const STORE = "evidence-queue";
export const QUEUE_EVENT = "feasibility3d:evidence-queue";
export const SYNCED_EVENT = "feasibility3d:evidence-synced";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function enqueueUpload(item: Omit<QueuedUpload, "id" | "queuedAt">): Promise<void> {
  await tx("readwrite", (s) => s.add({ ...item, queuedAt: new Date().toISOString() }));
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function listQueued(): Promise<QueuedUpload[]> {
  return tx("readonly", (s) => s.getAll() as IDBRequest<QueuedUpload[]>);
}

function remove(id: number): Promise<undefined> {
  return tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

let flushing: Promise<number> | null = null;

/** Send every queued upload. Returns how many were sent. */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const item of await listQueued()) {
      const form = new FormData();
      form.append("file", item.file, item.filename);
      if (item.note) form.append("note", item.note);
      let response: Response;
      try {
        response = await fetch(`/api/spills/${encodeURIComponent(item.spillId)}/evidence`, {
          method: "POST",
          body: form,
          credentials: "include",
          headers: { "X-Feasibility3D-Actor": item.actor },
        });
      } catch {
        break; // still offline; try again later
      }
      if (response.status === 503 || response.status === 401) break; // offline or logged out: keep it
      if (item.id !== undefined) await remove(item.id);
      if (response.ok) {
        sent++;
        const record = (await response.json()) as EvidenceRecord;
        window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: record }));
      }
    }
    window.dispatchEvent(new Event(QUEUE_EVENT));
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
