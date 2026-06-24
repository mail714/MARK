'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PLACE_CATEGORIES, type ChimeraCategory } from './place-categories';

export function NewSearchForm() {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [categoryKey, setCategoryKey] = useState<string>('restaurant');
  const [customCategory, setCustomCategory] = useState('');
  const [radius, setRadius] = useState(1500);
  const [overlap, setOverlap] = useState(40);
  const [maxResults, setMaxResults] = useState(500);
  const [chainFilterOverride, setChainFilterOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = categoryKey === 'custom';
  const category: ChimeraCategory | null = useMemo(() => {
    if (isCustom) return null;
    return PLACE_CATEGORIES.find((c) => c.key === categoryKey) ?? null;
  }, [categoryKey, isCustom]);

  const mode = category?.mode ?? 'grid';
  const showGridKnobs = mode === 'grid';
  const defaultChainFilter = category?.defaultChainFilter ?? true;
  const applyChainFilter = chainFilterOverride ?? defaultChainFilter;

  async function submit() {
    if (!location.trim()) {
      setError('Location is required.');
      return;
    }
    setBusy(true);
    setError(null);

    let payload: Record<string, unknown>;
    if (isCustom) {
      const c = customCategory.trim();
      if (!c) {
        setError('Enter a custom keyword.');
        setBusy(false);
        return;
      }
      payload = {
        location: location.trim(),
        search_mode: 'grid',
        category: c,
        category_label: c,
        grid_radius_m: radius,
        grid_overlap_pct: overlap,
        max_results: maxResults,
        apply_chain_filter: applyChainFilter,
      };
    } else if (category && category.mode === 'estate-sweep') {
      payload = {
        location: location.trim(),
        search_mode: 'estate-sweep',
        category_label: category.label,
        sweep_seeds: category.sweepSeeds,
        sweep_radius_m: category.sweepRadiusM,
        max_results: maxResults,
        apply_chain_filter: applyChainFilter,
      };
    } else if (category && category.mode === 'grid') {
      const cat = category.type ?? category.keyword ?? category.label;
      payload = {
        location: location.trim(),
        search_mode: 'grid',
        category: cat,
        category_label: category.label,
        grid_radius_m: radius,
        grid_overlap_pct: overlap,
        max_results: maxResults,
        apply_chain_filter: applyChainFilter,
      };
    } else {
      setError('Pick a category.');
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/api/chimera/searches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Start failed (${res.status})`);
      router.push(`/chimera/searches/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <Field label="Location">
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Bristol, Manchester, Nailsea"
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
      </Field>

      <Field label="Category">
        <select
          value={categoryKey}
          onChange={(e) => {
            setCategoryKey(e.target.value);
            setChainFilterOverride(null);
          }}
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        >
          <optgroup label="Standard">
            {PLACE_CATEGORIES.filter((c) => c.mode === 'grid' && c.type !== null).map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </optgroup>
          <optgroup label="Estate sweep (two-stage)">
            {PLACE_CATEGORIES.filter((c) => c.mode === 'estate-sweep').map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </optgroup>
          <optgroup label="Property services">
            {PLACE_CATEGORIES.filter((c) => c.mode === 'grid' && c.type === null).map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </optgroup>
          <option value="custom">Custom keyword</option>
        </select>
        {mode === 'estate-sweep' && category && category.mode === 'estate-sweep' ? (
          <p className="mt-1 text-[10px] text-neutral-500">
            Two-stage search: finds every <em>{category.sweepSeeds.join(' / ')}</em> in the
            location, then enumerates every business inside (radius {category.sweepRadiusM}m).
          </p>
        ) : null}
      </Field>

      {isCustom ? (
        <Field label="Custom keyword">
          <input
            type="text"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="e.g. plumber, florist, solicitor"
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          />
        </Field>
      ) : null}

      {showGridKnobs ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Grid radius (m)">
            <input
              type="number"
              min={500}
              max={20000}
              step={100}
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value, 10) || 1500)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
            />
            <p className="mt-0.5 text-[10px] text-neutral-500">Smaller = more cells, more coverage.</p>
          </Field>
          <Field label="Overlap %">
            <input
              type="number"
              min={0}
              max={80}
              step={5}
              value={overlap}
              onChange={(e) => setOverlap(parseInt(e.target.value, 10) || 40)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
            />
            <p className="mt-0.5 text-[10px] text-neutral-500">40% avoids gaps at edges.</p>
          </Field>
          <Field label="Max results">
            <input
              type="number"
              min={10}
              max={5000}
              step={10}
              value={maxResults}
              onChange={(e) => setMaxResults(parseInt(e.target.value, 10) || 500)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
            />
          </Field>
        </div>
      ) : (
        <Field label="Max results">
          <input
            type="number"
            min={10}
            max={5000}
            step={10}
            value={maxResults}
            onChange={(e) => setMaxResults(parseInt(e.target.value, 10) || 500)}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          />
        </Field>
      )}

      <label className="flex items-center gap-2 text-xs text-neutral-700">
        <input
          type="checkbox"
          checked={applyChainFilter}
          onChange={(e) => setChainFilterOverride(e.target.checked)}
        />
        Skip large chains (restaurants, pubs, hotels). Default for this category:{' '}
        <strong>{defaultChainFilter ? 'on' : 'off'}</strong>.
      </label>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        {error ? <div className="text-xs text-red-600">{error}</div> : <div />}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Start search'}
        </button>
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
