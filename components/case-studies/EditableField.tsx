'use client';

import { useState } from 'react';

type Props = {
  caseStudyId: string;
  field: string;
  label: string;
  initialValue: string | null;
  multiline?: boolean;
  placeholder?: string;
};

export function EditableField({
  caseStudyId,
  field,
  label,
  initialValue,
  multiline = false,
  placeholder,
}: Props) {
  const [value, setValue] = useState(initialValue ?? '');
  const [saved, setSaved] = useState<string | null>(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = (value ?? '') !== (saved ?? '');

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/case-studies/${caseStudyId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      setSaved(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none';

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder={placeholder}
          rows={3}
          className={inputClass}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : error ? '' : 'Saved'}
        </span>
        {error ? <span className="text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
