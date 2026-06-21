'use client';

import { useState } from 'react';

type Brand = { id: string; slug: string; name: string };
type AddressBook = { dotdigital_id: number; name: string; contact_count: number | null };

type Props = {
  campaignId: string;
  brands: Brand[];
  addressBooks: AddressBook[];
  initial: {
    internal_name: string | null;
    brand_id: string | null;
    sector: string | null;
    campaign_type: 'newsletter' | 'promotional' | 'announcement' | null;
    intent: string | null;
    address_book_ids: number[];
    template_key: string;
  };
};

const TEMPLATES: { value: string; label: string; hint: string }[] = [
  { value: 'plain-text', label: 'Plain text', hint: 'Image-free letter style.' },
  { value: 'simple-hero', label: 'Simple hero', hint: 'Single hero image + body + CTA.' },
  { value: 'multi-section', label: 'Multi-section newsletter', hint: 'Hero + 2-4 themed sections + CTA.' },
];

const CAMPAIGN_TYPES: { value: 'newsletter' | 'promotional' | 'announcement'; label: string }[] = [
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'promotional', label: 'Promotional' },
  { value: 'announcement', label: 'Announcement' },
];

export function CampaignBriefForm({ campaignId, brands, addressBooks, initial }: Props) {
  const [internalName, setInternalName] = useState(initial.internal_name ?? '');
  const [brandId, setBrandId] = useState(initial.brand_id ?? '');
  const [sector, setSector] = useState(initial.sector ?? '');
  const [campaignType, setCampaignType] = useState(initial.campaign_type ?? '');
  const [templateKey, setTemplateKey] = useState(initial.template_key ?? 'simple-hero');
  const [intent, setIntent] = useState(initial.intent ?? '');
  const [bookIds, setBookIds] = useState<number[]>(initial.address_book_ids);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);

  async function save(field: string, value: unknown) {
    setSavingField(field);
    setError(null);
    try {
      const res = await fetch(`/api/emails/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingField(null);
    }
  }

  function toggleBook(id: number) {
    const next = bookIds.includes(id) ? bookIds.filter((x) => x !== id) : [...bookIds, id];
    setBookIds(next);
    save('address_book_ids', next);
  }

  const totalContacts = bookIds.reduce((n, id) => {
    const b = addressBooks.find((x) => x.dotdigital_id === id);
    return n + (b?.contact_count ?? 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Internal name" savingField={savingField} thisField="internal_name">
          <input
            type="text"
            value={internalName}
            onChange={(e) => setInternalName(e.target.value)}
            onBlur={() => internalName !== (initial.internal_name ?? '') && save('internal_name', internalName)}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          />
        </Field>
        <Field label="Brand" savingField={savingField} thisField="brand_id">
          <select
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              save('brand_id', e.target.value || null);
            }}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          >
            <option value="">— not set —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Sector" savingField={savingField} thisField="sector">
          <input
            type="text"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            onBlur={() => sector !== (initial.sector ?? '') && save('sector', sector || null)}
            placeholder="e.g. Schools, Cricket clubs"
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          />
        </Field>
        <Field label="Campaign type" savingField={savingField} thisField="campaign_type">
          <select
            value={campaignType}
            onChange={(e) => {
              setCampaignType(e.target.value as typeof campaignType);
              save('campaign_type', e.target.value || null);
            }}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          >
            <option value="">— not set —</option>
            {CAMPAIGN_TYPES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Template" savingField={savingField} thisField="template_key">
          <select
            value={templateKey}
            onChange={(e) => {
              setTemplateKey(e.target.value);
              save('template_key', e.target.value);
            }}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-neutral-500">
            {TEMPLATES.find((t) => t.value === templateKey)?.hint}
          </p>
        </Field>
      </div>

      <Field label="Intent / brief" savingField={savingField} thisField="intent">
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onBlur={() => intent !== (initial.intent ?? '') && save('intent', intent || null)}
          rows={3}
          placeholder="What's the email about? e.g. Announce new 1200×1500mm acrylic boards for school sports honours"
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
      </Field>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Audience books
          </label>
          {bookIds.length > 0 ? (
            <span className="text-xs text-neutral-500">
              {bookIds.length} selected · {totalContacts.toLocaleString('en-GB')} contacts
            </span>
          ) : (
            <span className="text-xs text-neutral-400">None selected</span>
          )}
        </div>
        <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-neutral-200 bg-white">
          {addressBooks.length === 0 ? (
            <div className="p-3 text-xs text-neutral-500">
              No address books synced yet. Sync them on the Emails page.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {addressBooks.map((b) => (
                <li key={b.dotdigital_id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={bookIds.includes(b.dotdigital_id)}
                      onChange={() => toggleBook(b.dotdigital_id)}
                    />
                    <span>{b.name}</span>
                  </label>
                  <span className="text-neutral-500">{b.contact_count?.toLocaleString('en-GB') ?? '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}

function Field({
  label,
  savingField,
  thisField,
  children,
}: {
  label: string;
  savingField: string | null;
  thisField: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      <div className="mt-0.5 h-3 text-[10px] text-neutral-400">
        {savingField === thisField ? 'Saving…' : ''}
      </div>
    </div>
  );
}
