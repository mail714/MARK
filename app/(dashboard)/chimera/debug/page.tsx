'use client';

import Link from 'next/link';
import { useState } from 'react';

type DebugFetchResult = {
  url: string;
  finalUrl: string | null;
  status: number | null;
  contentType: string | null;
  htmlBytes: number | null;
  htmlSnippet: string;
  emailsFound: string[];
  postcodeFound: string | null;
  expectedEmailInHtml: boolean | null;
  expectedEmailObfuscatedInHtml: boolean | null;
  error: string | null;
};

type DebugScrapeResult = {
  websiteUrl: string;
  expectedEmail: string | null;
  homepage: DebugFetchResult;
  contactCandidates: string[];
  contactPagesTried: DebugFetchResult[];
  finalEmails: string[];
  finalPostcode: string | null;
};

export default function ChimeraDebugPage() {
  const [url, setUrl] = useState('https://www.emersonsgreenprimary.co.uk');
  const [expected, setExpected] = useState('admin@egps.org.uk');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DebugScrapeResult | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/chimera/debug/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, expected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/chimera" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Chimera
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Scraper diagnostics</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Runs the scraper against a single URL and shows exactly what it saw — raw response,
          discovered contact links, emails extracted from each page, whether the expected email
          appears in the source at all (so you can tell &quot;not there&quot; from &quot;JavaScript-rendered&quot;).
        </p>
      </header>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
            Website URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.example.com"
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
            Expected email (so we can check the raw source for it)
          </label>
          <input
            type="text"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="admin@example.com"
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy || !url.trim()}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? 'Running…' : 'Run diagnostic'}
        </button>
        {error ? <div className="text-xs text-red-600">{error}</div> : null}
      </div>

      {result ? (
        <div className="space-y-4">
          <DiagSummary result={result} />
          <DiagPageCard label="Homepage" page={result.homepage} expected={result.expectedEmail} />
          <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
            <div className="text-sm font-semibold">Contact candidates from nav</div>
            <p className="text-xs text-neutral-500">
              {result.contactCandidates.length === 0
                ? 'No contact-y links found in homepage navigation.'
                : `Top ${result.contactCandidates.length} links found in homepage nav (ordered by score):`}
            </p>
            {result.contactCandidates.length > 0 ? (
              <ol className="space-y-0.5 text-xs">
                {result.contactCandidates.map((u, i) => (
                  <li key={u} className="break-all text-neutral-700">
                    {i + 1}. {u}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
          {result.contactPagesTried.map((p, i) => (
            <DiagPageCard
              key={`${p.url}-${i}`}
              label={`Contact page ${i + 1}`}
              page={p}
              expected={result.expectedEmail}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DiagSummary({ result }: { result: DebugScrapeResult }) {
  const homepageVerdict = result.expectedEmail
    ? result.homepage.expectedEmailInHtml
      ? '✓ Present in homepage raw source'
      : result.homepage.expectedEmailObfuscatedInHtml
        ? '↩ Present obfuscated in homepage source'
        : '✗ NOT in homepage raw source (likely JavaScript-rendered)'
    : null;
  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="text-sm font-semibold">Summary</div>
      <ul className="space-y-1 text-xs text-neutral-700">
        <li>
          <strong>Final emails found:</strong>{' '}
          {result.finalEmails.length === 0 ? '(none)' : result.finalEmails.join(', ')}
        </li>
        <li>
          <strong>Final postcode:</strong> {result.finalPostcode ?? '(none)'}
        </li>
        {result.expectedEmail ? (
          <li>
            <strong>Expected email diagnosis:</strong>{' '}
            <span
              className={
                homepageVerdict?.startsWith('✓')
                  ? 'text-emerald-700'
                  : homepageVerdict?.startsWith('↩')
                    ? 'text-amber-700'
                    : 'text-red-700'
              }
            >
              {homepageVerdict}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function DiagPageCard({
  label,
  page,
  expected,
}: {
  label: string;
  page: DebugFetchResult;
  expected: string | null;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[10px] text-neutral-500">
          HTTP {page.status ?? '—'} · {page.htmlBytes?.toLocaleString('en-GB') ?? '—'} bytes
          {page.contentType ? ` · ${page.contentType.split(';')[0]}` : ''}
        </div>
      </div>
      <div className="break-all text-[10px] text-neutral-500">
        {page.url}
        {page.finalUrl && page.finalUrl !== page.url ? (
          <> → <span className="text-neutral-700">{page.finalUrl}</span></>
        ) : null}
      </div>
      {page.error ? <div className="text-red-700">Error: {page.error}</div> : null}
      <div>
        <strong>Emails found:</strong>{' '}
        {page.emailsFound.length === 0 ? '(none)' : page.emailsFound.join(', ')}
      </div>
      <div>
        <strong>Postcode:</strong> {page.postcodeFound ?? '(none)'}
      </div>
      {expected ? (
        <div>
          <strong>Expected email in raw HTML:</strong>{' '}
          <span
            className={
              page.expectedEmailInHtml
                ? 'text-emerald-700'
                : page.expectedEmailObfuscatedInHtml
                  ? 'text-amber-700'
                  : 'text-red-700'
            }
          >
            {page.expectedEmailInHtml
              ? 'yes (plain text)'
              : page.expectedEmailObfuscatedInHtml
                ? 'yes (obfuscated)'
                : 'no'}
          </span>
        </div>
      ) : null}
      {page.htmlSnippet ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-neutral-500">
            First 500 bytes of HTML
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 p-2 text-[10px] text-neutral-700">
            {page.htmlSnippet}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
