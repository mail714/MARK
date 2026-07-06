'use client';

import { useEffect, useRef, useState } from 'react';
import type { CalendarEntry, CalendarEntryStatus } from '@/lib/calendar/manual';

type Brand = { id: string; slug: string; name: string };

// One form for both creating and editing a manual calendar entry. Editing
// also offers Delete (with a confirm step handled by the browser).
export type ManualModalState =
  | { mode: 'create'; date: string } // YYYY-MM-DD to prefill
  | { mode: 'edit'; entry: CalendarEntry };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ManualEntryModal({
  state,
  brands,
  onClose,
  onSaved,
}: {
  state: ManualModalState | null;
  brands: Brand[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (state && !d.open) d.showModal();
    if (!state && d.open) d.close();
  }, [state]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handle = () => onClose();
    d.addEventListener('close', handle);
    return () => d.removeEventListener('close', handle);
  }, [onClose]);

  // Keying the form by target means React remounts it with fresh state for
  // each entry / create-date — no state-syncing effects required.
  const formKey =
    state === null
      ? 'closed'
      : state.mode === 'edit'
        ? `edit-${state.entry.id}`
        : `create-${state.date}`;

  return (
    <dialog
      ref={ref}
      className="w-full max-w-md rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
    >
      {state ? (
        <EntryForm
          key={formKey}
          state={state}
          brands={brands}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </dialog>
  );
}

function EntryForm({
  state,
  brands,
  onClose,
  onSaved,
}: {
  state: ManualModalState;
  brands: Brand[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const entry = state.mode === 'edit' ? state.entry : null;

  const [title, setTitle] = useState(entry?.title ?? '');
  const [date, setDate] = useState(
    entry ? toDateInput(entry.event_date) : state.mode === 'create' ? state.date : '',
  );
  const [time, setTime] = useState(entry ? toTimeInput(entry.event_date) : '09:00');
  const [brandId, setBrandId] = useState(entry?.brand_id ?? '');
  const [sector, setSector] = useState(entry?.sector ?? '');
  const [status, setStatus] = useState<CalendarEntryStatus>(entry?.status ?? 'planned');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      brand_id: brandId || null,
      sector: sector.trim() || null,
      event_date: new Date(`${date}T${time || '09:00'}`).toISOString(),
      status,
    };
    try {
      const res = await fetch(
        entry ? `/api/calendar/entries/${entry.id}` : '/api/calendar/entries',
        {
          method: entry ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry) return;
    if (!window.confirm(`Delete "${entry.title}" from the calendar?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/entries/${entry.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Delete failed (${res.status})`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {isEdit ? 'Edit entry' : 'Add calendar entry'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"
        >
          ✕
        </button>
      </header>

      <Field label="Title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Sign & Digital UK trade show"
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          autoFocus
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand (optional)">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CalendarEntryStatus)}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="planned">Planned</option>
            <option value="confirmed">Confirmed</option>
            <option value="done">Done</option>
          </select>
        </Field>
      </div>

      <Field label="Sector (optional)">
        <input
          type="text"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="e.g. Cricket clubs"
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything future-you needs to know"
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
        />
      </Field>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      <div className="flex items-center justify-between gap-2 pt-2">
        {isEdit ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
