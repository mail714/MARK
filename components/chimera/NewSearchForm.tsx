'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PLACE_CATEGORIES, type ChimeraCategory } from './place-categories';

export function NewSearchForm() {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [categoryKey, setCategoryKey] = useState<string>('restaurant');
  const [customCategory, setCustomCategory] = useState('');
  const [radiusValue, setRadiusValue] = useState(1500);
  const [radiusUnit, setRadiusUnit] = useState<'m' | 'mi'>('m');
  const [overlap, setOverlap] = useState(40);
  const [maxResults, setMaxResults] = useState(500);
  const [chainFilterOverride, setChainFilterOverride] = useState<boolean | null>(null);
  const [pullCompaniesHouse, setPullCompaniesHouse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const METRES_PER_MILE = 1609.344;
  const radiusInMetres =
    radiusUnit === 'mi' ? Math.round(radiusValue * METRES_PER_MILE) : Math.round(radiusValue);

  function switchUnit(next: 'm' | 'mi') {
    if (next === radiusUnit) return;
    if (next === 'mi') {
      setRadiusValue(Math.round((radiusValue / METRES_PER_MILE) * 100) / 100);
    } else {
      setRadiusValue(Math.round(radiusValue * METRES_PER_MILE));
    }
    setRadiusUnit(next);
  }

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
        grid_radius_m: radiusInMetres,
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
        pull_companies_house: pullCompaniesHouse,
      };
    } else if (category && category.mode === 'grid') {
      const cat = category.type ?? category.keyword ?? category.label;
      payload = {
        location: location.trim(),
        search_mode: 'grid',
        category: cat,
        category_label: category.label,
        grid_radius_m: radiusInMetres,
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
      <Field
        label="Location"
        hint="A town, city or postcode area to search around. Google geocodes it into a bounding box, and the grid covers everything inside that box. You can be vague (Bristol) or specific (BS34 area). UK locations work best — the search defaults to GB."
      >
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Bristol, Manchester, Nailsea"
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
      </Field>

      <Field
        label="Category"
        hint="Standard = a strict Google place type (restaurant, school, etc.). Estate sweep = two-stage search: first finds every business park / office building / retail park, then enumerates every business inside each. Property services = keyword search for managing agents / facilities firms. Custom = free-text keyword for anything else."
      >
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
        <Field
          label="Custom keyword"
          hint="A free-text business type sent as Google's keyword parameter. Less strict than a place type — Google fuzzy-matches the phrase against business names and types. Good for niches not in the dropdown (plumber, florist, dental practice, etc.)."
        >
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
          <Field
            label="Grid radius"
            hint="The size of each circular search area in the grid. Google caps Nearby Search at 60 results per circle, so a city is covered by many overlapping circles. Smaller radius = more circles, more API calls, but better coverage in dense areas. 1500m (~0.9mi) is the safe default for UK towns; drop to 800-1000m for city centres."
          >
            <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm focus-within:border-neutral-500">
              <input
                type="number"
                min={radiusUnit === 'mi' ? 0.3 : 500}
                max={radiusUnit === 'mi' ? 12 : 20000}
                step={radiusUnit === 'mi' ? 0.1 : 100}
                value={radiusValue}
                onChange={(e) => setRadiusValue(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm focus:outline-none"
              />
              <div className="flex shrink-0 border-l border-neutral-200 text-[10px] font-medium uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => switchUnit('m')}
                  className={`px-2 ${radiusUnit === 'm' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-100'}`}
                >
                  m
                </button>
                <button
                  type="button"
                  onClick={() => switchUnit('mi')}
                  className={`px-2 ${radiusUnit === 'mi' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-100'}`}
                >
                  mi
                </button>
              </div>
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-500">
              {radiusUnit === 'mi'
                ? `≈ ${radiusInMetres.toLocaleString('en-GB')} m per circle`
                : `≈ ${(radiusInMetres / METRES_PER_MILE).toFixed(2)} miles per circle`}
              . Smaller = more cells, more coverage.
            </p>
          </Field>
          <Field
            label="Overlap %"
            hint="How much adjacent search circles overlap. 0% leaves gaps at the seams where businesses get missed. 40% is the safe default — fully covers boundaries without much redundancy. Higher than 60% wastes API calls re-searching the same area."
          >
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
          <Field
            label="Max results"
            hint="Hard cap on how many unique businesses the grid will collect before stopping. Useful for test runs (set to 50) or when you want to limit Google API spend on a big city. The grid still runs to find the cap quickly — it doesn't enumerate every cell."
          >
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
        <Field
          label="Max results"
          hint="Hard cap on tenants enumerated across all found sites. The sweep finds every park / building first then visits them one at a time; once this many tenants have been collected the sweep stops."
        >
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
        <InfoIcon hint="Drops businesses whose name or website domain matches a curated list of UK chains (McDonald's, Pizza Hut, Greggs, Premier Inn etc.), with a reviews-count threshold so independent restaurants don't get caught. Defaults to on for hospitality categories where chains dominate, off for schools / business parks where you'd want the chains too." />
      </label>

      {mode === 'estate-sweep' ? (
        <label className="flex items-start gap-2 text-xs text-neutral-700">
          <input
            type="checkbox"
            checked={pullCompaniesHouse}
            onChange={(e) => setPullCompaniesHouse(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Also pull Companies House — for every postcode found, look up every
            registered active company. Catches businesses too small to have a Google
            listing. Adds SIC industry codes. No emails (Companies House doesn&apos;t expose
            contact details), but reveals who&apos;s on the estate.
          </span>
          <InfoIcon hint="After the Google sweep finishes, every confirmed postcode is sent to the Companies House API to fetch every active registered business at that exact postcode. Matches against existing prospects by name + postcode (so duplicates enrich rather than insert). Requires COMPANIES_HOUSE_API_KEY in env. Rate-limited to 600 requests per 5 minutes — well within typical sweep volume." />
        </label>
      ) : null}

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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
          {label}
        </label>
        {hint ? <InfoIcon hint={hint} /> : null}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function InfoIcon({ hint }: { hint: string }) {
  return (
    <span
      title={hint}
      role="img"
      aria-label={hint}
      className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-neutral-200 text-[9px] font-bold text-neutral-600 hover:bg-neutral-300"
    >
      i
    </span>
  );
}
