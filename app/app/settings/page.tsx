"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Wifi, WifiOff } from "lucide-react";
import { addContact, getContacts, getHealth, removeContact } from "@/lib/api";
import { Skeleton } from "@/components/Skeleton";
import { isReadOnly, setSettings, useSettings } from "@/lib/settings";
import type { Contact, HealthResponse } from "@/lib/types";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[10px] bg-surface3 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-[8px] px-3 py-1.5 text-sm transition-colors ${
            value === o.id ? "bg-surface font-medium text-text shadow-sm" : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  const readOnly = isReadOnly(settings.actor);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((h) => !cancelled && setHealth(h))
      .catch((e) => !cancelled && setEngineError(e instanceof Error ? e.message : "offline"));
    getContacts()
      .then((c) => !cancelled && setContacts(c))
      .catch(() => !cancelled && setContacts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd() {
    if (!name.trim()) {
      setContactError("Name is required.");
      return;
    }
    setContactError(null);
    setAdding(true);
    try {
      const created = await addContact({
        name: name.trim(),
        email: email.trim() || undefined,
      });
      setContacts((prev) => [...(prev ?? []), created]);
      setName("");
      setEmail("");
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: number) {
    try {
      await removeContact(id);
      setContacts((prev) => (prev ?? []).filter((c) => c.id !== id));
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Failed to remove contact");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-text">Settings</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="card-title">Display</h2>
          <div className="mt-5 space-y-5">
            <div>
              <div className="mb-2 text-sm text-muted">Volume units</div>
              <Segmented
                value={settings.unit}
                options={[
                  { id: "bbl", label: "Barrels (bbl)" },
                  { id: "m3", label: "Cubic metres (m³)" },
                ]}
                onChange={(unit) => setSettings({ unit })}
              />
            </div>
            <div>
              <div className="mb-2 text-sm text-muted">Time zone</div>
              <Segmented
                value={settings.timezone}
                options={[
                  { id: "utc", label: "UTC" },
                  { id: "wat", label: "WAT (UTC+1)" },
                ]}
                onChange={(timezone) => setSettings({ timezone })}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Engine status</h2>
          <div className="mt-5 space-y-3">
            {engineError ? (
              <div className="flex items-center gap-2 rounded-[10px] bg-danger/10 px-3 py-2.5 text-sm text-danger">
                <WifiOff className="h-4 w-4" />
                Engine offline — {engineError}
              </div>
            ) : health ? (
              <div className="flex items-center gap-2 rounded-[10px] bg-success/10 px-3 py-2.5 text-sm text-success">
                <Wifi className="h-4 w-4" />
                Engine online
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-[10px] bg-surface2 px-3 py-2.5 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking engine…
              </div>
            )}
            {health && (
              <div className="rounded-[10px] bg-surface2 px-3 py-2.5 text-sm text-muted">
                Method version: <span className="text-text">{health.method_version}</span>
              </div>
            )}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="card-title">Notification contacts</h2>
          <p className="mt-1 text-sm text-muted">
            People notified when a spill is recorded or a form is due.
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-muted">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
                placeholder="e.g. Ada Okafor"
                className="h-10 w-full rounded-[10px] bg-surface3 px-3 text-sm text-text outline-none placeholder:text-faint focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-muted">Email (optional)</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={readOnly}
                type="email"
                placeholder="name@nigernosd.gov"
                className="h-10 w-full rounded-[10px] bg-surface3 px-3 text-sm text-text outline-none placeholder:text-faint focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={readOnly || adding}
              className="flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-medium text-text transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
          {contactError && <p className="mt-2 text-xs text-danger">{contactError}</p>}

          <div className="mt-5">
            {contacts === null ? (
              <Skeleton className="h-10" />
            ) : contacts.length === 0 ? (
              <p className="text-sm text-muted">No notification contacts yet.</p>
            ) : (
              <div className="overflow-hidden rounded-[12px] border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface2 text-[11px] uppercase tracking-[0.08em] text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="px-4 py-2.5 font-medium">Email</th>
                      <th className="px-4 py-2.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-text">{c.name}</td>
                        <td className="px-4 py-2.5 text-muted">{c.email ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            aria-label={`Remove ${c.name}`}
                            onClick={() => handleRemove(c.id)}
                            disabled={readOnly}
                            className="rounded-full p-1.5 text-muted hover:bg-surface3 hover:text-danger disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
