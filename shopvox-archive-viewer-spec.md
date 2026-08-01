# ShopVox Archive Viewer — Spec

A read-only lookup tool for the historical ShopVox data now sitting in Supabase. When Signet moves to a new system, this is how the team looks up any past customer, quote, sales order, or invoice and sees exactly what it was for.

This is deliberately **not** a CRM. No editing, no new quotes, no workflow. It's a fast, searchable archive.

## What It Must Do

1. **Search** — one search box that finds records across the whole archive:
   - Customer name (fuzzy — "thorpe" finds "Thorpe Willoughby Sports Association")
   - Company name, contact name, email, phone
   - Document number (quote #, sales order #, invoice #)
   - Free text in job descriptions / line items ("cricket board", "shop fascia")
2. **Customer view** — one page per customer showing their details, contacts, addresses, and a chronological list of every quote, order, and invoice they ever had, with totals and statuses.
3. **Document view** — one page per quote / sales order / invoice showing:
   - Header: number, date, status, customer, totals, tax
   - **Line items** — the actual products/services, descriptions, quantities, prices. This is the part that answers "what was this job?"
   - Links to related documents (the quote this order came from, the invoice it became)
4. **Browse lists** — filterable, paginated lists of customers, quotes, orders, invoices (filter by date range, status, sort by date/value).
5. **Auth** — this is the whole company's transaction history, so it must sit behind a login (Supabase Auth, single shared or per-person account). Never publicly accessible.

## What's Out of Scope

- Editing or creating records
- Syncing back to ShopVox (API is outbound-only anyway)
- Reporting/analytics dashboards (can come later — the data will support it)
- Migrating the data *into* the new system (separate exercise; this viewer de-risks it)

## Tech Stack

Same stack as the rest of the Signet system (see `project-overview.md`) — this doubles as the plumbing proof for the marketing dashboard:

| Layer | Choice |
|-------|--------|
| Framework | Next.js (TypeScript, App Router) |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres) — where the export already lives |
| Auth | Supabase Auth |
| Hosting | Vercel |

No AI needed for v1. This is pure read-and-display.

## Prerequisites (Blockers Before Building)

1. **Supabase project URL + anon key + service role key** — in `.env.local`, gitignored.
2. **Schema audit** — we need to know exactly what the export produced before writing a line of UI:
   - Which tables exist (customers, contacts, quotes, sales orders, invoices, line items, payments…)?
   - Are line items in their own table(s) or embedded (JSON / one-row-per-line CSVs)?
   - What links documents together — customer IDs on every document? Quote → SO → invoice references?
   - Date/number/currency columns imported as proper types, or all text?
3. **Any files?** — did the export include PDFs/artwork/proofs, or just tabular data? If PDFs exist they should go in Supabase Storage and be linked from document pages.

The first working session should be: connect to Supabase, introspect the schema, and write the findings into `shopvox-schema-notes.md` in this repo.

## Database Preparation (Before UI)

Done as SQL migrations kept in the repo:

1. **Type cleanup** — cast text dates to `date`/`timestamptz`, money to `numeric`. CSV imports usually land as all-text; sorting and range filters need real types.
2. **Indexes for search**:
   - `pg_trgm` extension + GIN trigram indexes on customer name, company name, document numbers → fast fuzzy search.
   - Optional: a `tsvector` full-text index over line item descriptions for "what jobs mentioned X" searches.
3. **Views** — e.g. `document_summary` (one row per quote/SO/invoice with customer name and total joined in) so list pages are one simple query.
4. **RLS** — enable row-level security with an "authenticated users can read" policy on every archive table; no write policies at all. The archive is physically read-only for the app.

## App Structure

```
/app
  login/                      -- Supabase Auth
  (archive)/
    layout.tsx                -- nav + global search box
    page.tsx                  -- search home / recent lookups
    search/page.tsx           -- cross-entity results, grouped by type
    customers/page.tsx        -- browse/filter customers
    customers/[id]/page.tsx   -- customer detail + full transaction history
    quotes/page.tsx
    quotes/[id]/page.tsx      -- header + line items + related docs
    orders/page.tsx
    orders/[id]/page.tsx
    invoices/page.tsx
    invoices/[id]/page.tsx
/lib/supabase/                -- server + browser clients
/supabase/migrations/         -- type fixes, indexes, views, RLS
```

Server components querying Supabase directly; no client-side state library. Read-only means almost no API routes — just pages.

## Build Order

Each step ends with something visible and testable against the real data:

1. **Schema audit** — connect, introspect, document what's actually there. Decide on cleanup migrations.
2. **Migrations** — types, indexes, views, RLS.
3. **Scaffold** — Next.js + Tailwind + Supabase client + login gate.
4. **Customers list + detail** — browse and open a customer, see their document history.
5. **Document detail pages** — quote/order/invoice with line items and related-document links.
6. **Global search** — the single box across everything.
7. **Browse lists with filters** — date range, status, value sort for each document type.
8. **Deploy to Vercel** — env vars set, auth confirmed working, team starts using it.

## Acceptance Test

Pick a real job everyone remembers (e.g. the Thorpe Willoughby honours boards, SO 60111). The viewer passes when someone can:

1. Type part of the customer's name into search.
2. Land on the customer page and see the job in their history.
3. Open the sales order and read the line items well enough to know exactly what was made, at what price.
4. Follow the link to the matching invoice.

…in under 30 seconds, from a phone or the workshop PC.
