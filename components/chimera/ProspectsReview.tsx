'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Prospect,
  ProspectAssignmentStatus,
  ProspectBrandAssignment,
} from '@/lib/chimera/types';
import { normaliseWebsiteUrl } from '@/lib/chimera/website-scrape';
import { rankPushableEmails } from '@/lib/chimera/email-priority';
import { BulkJobProgress } from './BulkJobProgress';
import { UpdateWebsiteButton } from './UpdateWebsiteButton';

type Brand = { id: string; slug: string; name: string };
type AddressBook = { dotdigital_id: number; name: string; contact_count: number | null };
type Row = Prospect & { assignments: ProspectBrandAssignment[] };

export function ProspectsReview({
  prospects,
  brands,
  addressBooks,
  searchTotal,
  searchId,
  searchWithEmail,
}: {
  prospects: Row[];
  brands: Brand[];
  addressBooks: AddressBook[];
  // Total prospects across the whole search — larger than prospects.length
  // when the parent page is paginating. Shown so '200 with email' can't be
  // mistaken for the search-wide figure in the header tiles.
  searchTotal?: number;
  // When set, enables the search-wide push (every with-email prospect in
  // the search, across all pages, as a background job).
  searchId?: string;
  searchWithEmail?: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [brandId, setBrandId] = useState<string>(brands[0]?.id ?? '');
  const [sector, setSector] = useState<string>('');
  const [status, setStatus] = useState<ProspectAssignmentStatus>('approved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [pushBookId, setPushBookId] = useState<number | null>(addressBooks[0]?.dotdigital_id ?? null);
  const [pushLimit, setPushLimit] = useState<number>(1);
  const [filter, setFilter] = useState<
    'all' | 'with-email' | 'no-email' | 'pushable' | 'blocked' | 'unverified'
  >('all');

  // Statuses that push-to-dotdigital treats as safe to send. Anything
  // else (invalid, spamtrap, abuse, do_not_mail) gets filtered out at
  // push time — the operator can find them here to swap emails or skip.
  const PUSHABLE = useMemo(() => new Set(['valid', 'catch-all', 'unknown']), []);

  const filtered = useMemo(() => {
    if (filter === 'with-email') return prospects.filter((p) => p.emails.length > 0);
    if (filter === 'no-email') return prospects.filter((p) => p.emails.length === 0);
    if (filter === 'pushable') {
      return prospects.filter((p) => {
        if (p.emails.length === 0) return false;
        const statuses = p.email_statuses ?? {};
        return p.emails.some((e) => {
          const s = statuses[e.trim().toLowerCase()];
          // Unverified emails count as pushable — the push-side filter
          // lets them through when no verification has been run.
          return !s || PUSHABLE.has(s);
        });
      });
    }
    if (filter === 'blocked') {
      return prospects.filter((p) => {
        if (p.emails.length === 0) return false;
        const statuses = p.email_statuses ?? {};
        return p.emails.every((e) => {
          const s = statuses[e.trim().toLowerCase()];
          return s && !PUSHABLE.has(s);
        });
      });
    }
    if (filter === 'unverified') {
      return prospects.filter((p) => {
        if (p.emails.length === 0) return false;
        const statuses = p.email_statuses ?? {};
        return p.emails.some((e) => !statuses[e.trim().toLowerCase()]);
      });
    }
    return prospects;
  }, [prospects, filter, PUSHABLE]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  // Operates on membership of the *currently filtered* rows only — a
  // selection carried over from another filter must not be silently
  // cleared (or worse, silently kept and acted on invisibly).
  function toggleAll() {
    const next = new Set(selected);
    const allIn = filtered.length > 0 && filtered.every((p) => next.has(p.id));
    if (allIn) {
      for (const p of filtered) next.delete(p.id);
    } else {
      for (const p of filtered) next.add(p.id);
    }
    setSelected(next);
  }

  // 'Select all' on a paginated search: the header checkbox selects the
  // visible page, then this pulls every matching id in the whole search
  // from the server (same filter logic) so bulk actions reach past the
  // 500-row page.
  const [expandingSelection, setExpandingSelection] = useState(false);
  const pageAllSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const selectionBeyondPage = selected.size > filtered.length;
  const canExpandSelection =
    !!searchId && !!searchTotal && searchTotal > prospects.length;

  async function selectWholeSearch() {
    if (!searchId) return;
    setExpandingSelection(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/chimera/searches/${searchId}/prospect-ids?filter=${filter}`,
        { cache: 'no-store' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setSelected(new Set(data.ids as string[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExpandingSelection(false);
    }
  }

  async function bulkAssign() {
    if (selected.size === 0 || !brandId) {
      setError('Select prospects and pick a brand.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/chimera/prospects/bulk-assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: [...selected],
          brand_id: brandId,
          sector: sector || null,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Assign failed (${res.status})`);
      setMessage(`Assigned ${data.count} prospect${data.count === 1 ? '' : 's'} to ${brands.find((b) => b.id === brandId)?.name}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function repairWebsites() {
    if (selected.size === 0) {
      setError('Select prospects to repair first.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/chimera/prospects/repair-websites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prospect_ids: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Repair failed (${res.status})`);
      if (data.job_id) {
        setCurrentJobId(data.job_id as string);
      } else {
        setMessage('Repair started.');
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function verifyEmails() {
    if (selected.size === 0) {
      setError('Select prospects to verify first.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/chimera/prospects/verify-emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prospect_ids: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Verify failed (${res.status})`);
      if (data.job_id) {
        setCurrentJobId(data.job_id as string);
      } else {
        setMessage('Verification started.');
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  // One endpoint, three explicit modes — each button spells out what it
  // does and what it costs. The server auto-filters the selection to the
  // prospects each mode can actually help.
  async function rescanWebsites(mode: 'scrape' | 'deep-scan' | 'google') {
    if (selected.size === 0) {
      setError('Select prospects first.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/chimera/prospects/rescan-website', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prospect_ids: [...selected], mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Job failed to start (${res.status})`);
      // Background job — flip the UI into 'show progress' mode and the
      // BulkJobProgress card takes over from here, polling status.
      if (data.job_id) {
        // Keep `busy` true — the BulkJobProgress card handles its own flip
        // back to idle via onDone, which the parent listens to below.
        setCurrentJobId(data.job_id as string);
      } else {
        setMessage('Job started.');
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function pushToBook() {
    if (selected.size === 0 || !brandId || !pushBookId) {
      setError('Select prospects, a brand and a dotdigital book.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/chimera/prospects/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: [...selected],
          brand_id: brandId,
          address_book_id: pushBookId,
          max_emails_per_prospect: pushLimit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Push failed (${res.status})`);
      // Large selections run as a background job — hand over to the
      // progress card (which keeps `busy` until onDone) instead of
      // expecting an instant summary.
      if (data.job_id) {
        setCurrentJobId(data.job_id as string);
        return;
      }
      const contactsNote =
        typeof data.contactsPushed === 'number' && data.contactsPushed > data.pushed
          ? ` (${data.contactsPushed} contacts)`
          : '';
      setMessage(
        `Pushed ${data.pushed}${contactsNote} · failed ${data.failed} · skipped ${data.skipped}.`,
      );
      const errs = (data.errors ?? []) as Array<{ prospectId: string; reason: string }>;
      if ((data.failed ?? 0) > 0 && errs[0]?.reason) {
        setError(`First failure: ${errs[0].reason}`);
      }
      router.refresh();
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function pushWholeSearch() {
    if (!searchId || !brandId || !pushBookId) {
      setError('Pick a brand and a dotdigital book first.');
      return;
    }
    const bookName =
      addressBooks.find((b) => b.dotdigital_id === pushBookId)?.name ?? 'the selected book';
    const approx = searchWithEmail ? `~${searchWithEmail.toLocaleString('en-GB')} ` : '';
    if (
      !window.confirm(
        `Bulk-import ${approx}with-email prospects from this ENTIRE search (all pages) to "${bookName}"? This uploads them to dotdigital in batches (rate-limit-proof). Companies already pushed to this book are skipped, and only verified-pushable emails are sent.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/chimera/searches/${searchId}/bulk-import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          address_book_id: pushBookId,
          sector: sector || null,
          max_emails_per_prospect: pushLimit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Push failed (${res.status})`);
      if (typeof data.already_pushed === 'number' && data.already_pushed > 0) {
        setMessage(`${data.already_pushed} already in this book — importing the remaining ${data.to_import}.`);
      }
      setCurrentJobId(data.job_id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const counts = {
    withEmail: prospects.filter((p) => p.emails.length > 0).length,
    total: prospects.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-xs">
        <div className="flex items-center gap-3 text-neutral-600">
          <span>
            <strong className="text-neutral-900">{counts.withEmail}</strong> with email
            <span className="text-neutral-400">
              {' '}/ {counts.total}
              {searchTotal && searchTotal > counts.total
                ? ` on this page (${searchTotal.toLocaleString('en-GB')} in search)`
                : ' total'}
            </span>
          </span>
          <span className="text-neutral-300">·</span>
          <span>
            <strong className="text-neutral-900">{selected.size}</strong> selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider text-neutral-500">Filter</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
          >
            <option value="all">All</option>
            <option value="with-email">With email (any)</option>
            <option value="no-email">No email</option>
            <option value="pushable">Pushable (would reach dotdigital)</option>
            <option value="blocked">Blocked by verification</option>
            <option value="unverified">Has unverified emails</option>
          </select>
        </div>
      </div>

      {canExpandSelection && pageAllSelected && !selectionBeyondPage ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <span>
            All {filtered.length} on this page are selected — the search has more prospects on
            other pages.
          </span>
          <button
            type="button"
            onClick={selectWholeSearch}
            disabled={expandingSelection}
            className="rounded-md border border-blue-400 bg-white px-2.5 py-1 font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            {expandingSelection ? 'Selecting…' : `Select all matching in the whole search`}
          </button>
        </div>
      ) : null}
      {selectionBeyondPage ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <span>
            <strong>{selected.size.toLocaleString('en-GB')}</strong> prospects selected across the
            whole search — bulk actions will cover all of them, not just this page.
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-md border border-blue-400 bg-white px-2.5 py-1 font-medium text-blue-800 hover:bg-blue-100"
          >
            Clear selection
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Brand">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Sector (optional)">
          <input
            type="text"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="e.g. Cricket clubs"
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProspectAssignmentStatus)}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="new">New (queue)</option>
            <option value="approved">Approved</option>
            <option value="skipped">Skip</option>
          </select>
        </Field>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={bulkAssign}
            disabled={busy || selected.size === 0}
            className="flex-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Assign
          </button>
        </div>
        <Field label="dotdigital book">
          <select
            value={pushBookId ?? ''}
            onChange={(e) => setPushBookId(parseInt(e.target.value, 10) || null)}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">— pick book —</option>
            {addressBooks.map((b) => (
              <option key={b.dotdigital_id} value={b.dotdigital_id}>
                {b.name} ({b.contact_count ?? '—'})
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-3 flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => rescanWebsites('scrape')}
            disabled={busy || selected.size === 0}
            className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            title="FREE — re-visit each selected prospect's website with plain fetches (homepage + its contact page) and extract emails. Skips prospects without a website."
          >
            Rescan websites ({selected.size})
          </button>
          <button
            type="button"
            onClick={() => rescanWebsites('deep-scan')}
            disabled={busy || selected.size === 0}
            className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            title="PAID (ScrapingBee credits) — re-scrape via residential IPs with JavaScript rendering, for sites that block us or only show their email client-side. Only runs on selected prospects that have a website but no email yet."
          >
            Deep scan ({selected.size})
          </button>
          <button
            type="button"
            onClick={() => rescanWebsites('google')}
            disabled={busy || selected.size === 0}
            className="rounded-md border border-teal-300 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
            title="PAID (ScrapingBee credits, 1–2 searches per business) — Google '&quot;Business Name&quot; postcode email' and extract the email from the results. For prospects with no website, it also identifies and saves the company's own site, then scrapes it for free. Only runs on selected prospects with no email at all."
          >
            Google email hunt ({selected.size})
          </button>
          <button
            type="button"
            onClick={repairWebsites}
            disabled={busy || selected.size === 0}
            className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            title="Look each prospect up on Google Places by name + postcode and auto-update the website URL when phone or postcode matches. Lower-confidence matches are left for the operator to review via Update Website."
          >
            Repair websites ({selected.size})
          </button>
          <button
            type="button"
            onClick={verifyEmails}
            disabled={busy || selected.size === 0}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            title="Run each selected prospect's emails through ZeroBounce. Invalid / spam-trap / abuse addresses get flagged and excluded from future dotdigital pushes. ~1 credit per unique email, deduped across selected prospects."
          >
            Verify emails ({selected.size})
          </button>
          <select
            value={pushLimit}
            onChange={(e) => setPushLimit(parseInt(e.target.value, 10))}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700"
            title="How many of each company's emails become separate dotdigital contacts. 'Every email' maximises the chance of reaching whoever handles signage, but the same campaign lands in several inboxes at one company — only addresses verification has flagged as invalid/spam-trap/do-not-mail are ever excluded."
          >
            <option value={1}>1 email / company (safest)</option>
            <option value={2}>Top 2 emails / company</option>
            <option value={99}>Every email / company (max reach)</option>
          </select>
          <button
            type="button"
            onClick={pushToBook}
            disabled={busy || selected.size === 0 || !pushBookId}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            Push selected → dotdigital
          </button>
          {searchId ? (
            <button
              type="button"
              onClick={pushWholeSearch}
              disabled={busy || !pushBookId}
              title="Bulk-import every with-email prospect in this search — all pages, not just the ones shown or selected. Uploads to dotdigital in batches so it can't hit the rate limit; already-pushed companies are skipped. Best for large lists."
              className="rounded-md border border-neutral-900 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-50"
            >
              Push whole search{searchWithEmail ? ` (${searchWithEmail.toLocaleString('en-GB')})` : ''}
            </button>
          ) : null}
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
          {message ? <div className="text-xs text-emerald-700">{message}</div> : null}
        </div>
      </div>

      {currentJobId ? (
        <BulkJobProgress
          jobId={currentJobId}
          onDone={(job) => {
            setBusy(false);
            setCurrentJobId(null);
            // Clear the selection so the action-bar counter ('156 selected')
            // doesn't stick around as stale state. The user can re-tick
            // whatever they want after seeing the fresh post-rescan view.
            setSelected(new Set());
            const kindLabel =
              job.kind === 'rescan-website'
                ? 'Website rescan'
                : job.kind === 'deep-scan-website'
                  ? 'Deep scan'
                  : job.kind === 'google-email-hunt'
                    ? 'Google email hunt'
                    : job.kind === 'apollo-enrich'
                      ? 'Apollo enrich'
                      : job.kind === 'repair-websites'
                        ? 'Website repair'
                        : job.kind === 'verify-emails'
                          ? 'Email verification'
                          : job.kind === 'bulk-import-dotdigital'
                            ? 'dotdigital bulk import'
                            : 'dotdigital push';
            const meta = job.metadata as
              | {
                  suggestions?: number;
                  no_match?: number;
                  valid?: number;
                  invalid?: number;
                  unknown?: number;
                  websites_found?: number;
                  skipped?: number;
                }
              | null
              | undefined;
            const extra =
              job.kind === 'repair-websites'
                ? `${meta?.suggestions ? `, ${meta.suggestions} lower-confidence suggestions to review` : ''}${meta?.no_match ? `, ${meta.no_match} no match` : ''}`
                : job.kind === 'verify-emails'
                  ? ` — ${meta?.valid ?? 0} valid, ${meta?.invalid ?? 0} invalid, ${meta?.unknown ?? 0} unknown`
                  : job.kind === 'google-email-hunt' && meta?.websites_found
                    ? `, ${meta.websites_found} websites found`
                    : job.kind === 'push-to-dotdigital' && meta?.skipped
                      ? `, ${meta.skipped} skipped (no pushable email)`
                      : '';
            const succeededLabel =
              job.kind === 'repair-websites'
                ? 'auto-updated'
                : job.kind === 'verify-emails'
                  ? 'prospects updated'
                  : 'succeeded';
            setMessage(
              `${kindLabel} ${job.status} — ${job.succeeded} ${succeededLabel}${job.emails_added ? `, +${job.emails_added} emails` : ''}${job.contacts_added ? `, +${job.contacts_added} contacts` : ''}${extra}${job.failed ? `, ${job.failed} failed` : ''}.`,
            );
            // Surface the real rejection reason (push jobs now put the most
            // common dotdigital failure here, not a skip message).
            if (job.failed > 0 && job.last_error) {
              setError(`Reason: ${job.last_error}`);
            }
          }}
        />
      ) : null}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={pageAllSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email(s)</th>
              <th className="px-3 py-2">Assigned</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100 align-top hover:bg-neutral-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs font-medium text-neutral-800">{p.business_name}</div>
                  {p.website ? (
                    <a
                      href={normaliseWebsiteUrl(p.website) ?? p.website}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-w-xs truncate text-[10px] text-neutral-500 hover:underline"
                    >
                      {p.website}
                    </a>
                  ) : null}
                  <div className="mt-0.5">
                    <UpdateWebsiteButton
                      prospectId={p.id}
                      currentUrl={p.website}
                      businessName={p.business_name}
                    />
                  </div>
                  {p.company_number || (p.sic_codes && p.sic_codes.length > 0) ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
                      {p.company_number ? (
                        <a
                          href={`https://find-and-update.company-information.service.gov.uk/company/${p.company_number}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-neutral-500 hover:underline"
                        >
                          CH #{p.company_number}
                        </a>
                      ) : null}
                      {(p.sic_codes ?? []).slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-neutral-100 px-1.5 py-0 font-mono text-neutral-700 ring-1 ring-neutral-200"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  <div className="max-w-xs">{p.address ?? '—'}</div>
                  {p.address_note ? (
                    <div className="mt-0.5 text-[10px] text-neutral-400">{p.address_note}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">{p.phone ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-neutral-700">
                  {p.emails.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : null}
                  {p.emails.map((e) => {
                    const statuses = p.email_statuses ?? {};
                    const status = statuses[e.trim().toLowerCase()];
                    // Mirror the push-side selection exactly — same ranking
                    // module, same location hint, same per-company limit as
                    // the push dropdown — so the badges never lie.
                    const willPush = new Set(
                      rankPushableEmails(
                        p.emails,
                        statuses,
                        `${p.address ?? ''} ${p.google_address ?? ''}`,
                      ).slice(0, pushLimit),
                    );
                    const blocked = !!status && !PUSHABLE.has(status);
                    const tone =
                      status === 'valid' || status === 'catch-all'
                        ? 'text-emerald-700'
                        : status === 'unknown'
                          ? 'text-amber-700'
                          : status
                            ? 'text-red-700'
                            : 'text-neutral-400';
                    return (
                      <div key={e} className="flex items-center gap-1 leading-tight">
                        <span
                          className={`truncate font-mono text-[11px] ${
                            blocked ? 'text-neutral-400 line-through' : ''
                          }`}
                          title={blocked ? 'Will NOT be pushed to dotdigital' : undefined}
                        >
                          {e}
                        </span>
                        {status ? (
                          <span
                            className={`text-[9px] uppercase tracking-wider ${tone}`}
                            title={
                              status === 'suppressed'
                                ? 'On the dotdigital suppression list (previously unsubscribed or bounced)'
                                : `ZeroBounce: ${status}`
                            }
                          >
                            {blocked ? '✕' : '✓'} {status}
                          </span>
                        ) : null}
                        {p.emails.length > 1 && willPush.has(e) ? (
                          <span
                            className="rounded bg-emerald-50 px-1 text-[9px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                            title="This address will be pushed to dotdigital at the current per-company setting"
                          >
                            pushes
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.assignments.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : (
                    <div className="space-y-0.5">
                      {p.assignments.map((a) => {
                        const brand = brands.find((b) => b.id === a.brand_id);
                        return (
                          <div key={a.id} className="flex items-center gap-1">
                            <span className="rounded-full bg-neutral-100 px-1.5 py-0 text-[10px] ring-1 ring-neutral-200">
                              {brand?.name ?? a.brand_id.slice(0, 6)}
                            </span>
                            <span className="text-[10px] text-neutral-500">{a.status}</span>
                            {a.sector ? (
                              <span className="text-[10px] text-neutral-400">· {a.sector}</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="border-t border-neutral-100 p-6 text-center text-xs text-neutral-500">
            No prospects matching this filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
