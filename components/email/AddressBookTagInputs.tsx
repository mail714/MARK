'use client';

import { useState } from 'react';

type Brand = { id: string; slug: string; name: string };

type Props = {
  addressBookId: string;
  brands: Brand[];
  initialBrandId: string | null;
  initialSector: string | null;
};

export function AddressBookTagInputs({
  addressBookId,
  brands,
  initialBrandId,
  initialSector,
}: Props) {
  const [brandId, setBrandId] = useState(initialBrandId ?? '');
  const [savedBrandId, setSavedBrandId] = useState(initialBrandId ?? '');
  const [sector, setSector] = useState(initialSector ?? '');
  const [savedSector, setSavedSector] = useState(initialSector ?? '');
  const [error, setError] = useState<string | null>(null);

  async function saveField(field: 'brand_id' | 'sector', value: string) {
    setError(null);
    try {
      const res = await fetch(`/api/emails/address-books/${addressBookId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      if (field === 'brand_id') setSavedBrandId(value);
      else setSavedSector(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <td className="px-4 py-3">
        <select
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value);
            saveField('brand_id', e.target.value);
          }}
          className={`rounded border bg-white px-2 py-1 text-xs ${
            brandId !== savedBrandId ? 'border-amber-300' : 'border-neutral-200'
          }`}
        >
          <option value="">— not set —</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          onBlur={() => sector !== savedSector && saveField('sector', sector)}
          placeholder="e.g. Schools"
          className={`w-32 rounded border bg-white px-2 py-1 text-xs ${
            sector !== savedSector ? 'border-amber-300' : 'border-neutral-200'
          }`}
        />
        {error ? (
          <div className="mt-1 text-[10px] text-red-600">{error}</div>
        ) : null}
      </td>
    </>
  );
}
