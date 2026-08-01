# ShopVox Archive — Supabase Schema Notes

**Status: PRELIMINARY — blocked on secret API key.** Findings below are from
external probing with the publishable (anon) key on 2026-08-01. That key
cannot list tables (Supabase only serves the OpenAPI introspection endpoint
to secret keys) and RLS/permissions hide all row data from it, so this is
reconstructed from PostgREST error hints. A full pass with the secret key is
needed to confirm columns, types, row counts, and anything not yet discovered.

## Headline finding: no ShopVox export tables found

**None of the expected ShopVox archive tables exist under any obvious name.**
Probed and confirmed absent from the exposed `public` schema: `customers`,
`contacts`, `quotes`, `sales_orders`, `orders`, `invoices`, `line_items`
(and singular/`shopvox_`-prefixed/`sv_`-prefixed variants of all of these).

The API exposes only the `public` and `graphql_public` schemas. If the
ShopVox export was loaded into a different Postgres schema, it is invisible
to the API and to this audit — but the more likely reading is that **the
export has not been imported into this Supabase project yet** (or went into
a different project).

**Open question for the project owner:** where did the ShopVox CSV export
actually land? This blocks the entire archive-viewer build order
(spec: `shopvox-archive-viewer-spec.md`).

## What IS in the database

The project already contains an application schema — none of it mentioned in
the repo docs (`project-overview.md` etc.). Two groups, discovered via
PostgREST fuzzy-match hints (list may be incomplete):

### CRM-ish core tables

| Table | Guessed purpose |
|---|---|
| `company` | Companies/customers |
| `company_people` | Company ↔ person link |
| `person` | Individual contacts |
| `person_email` | Emails per person (1:N) |
| `person_phone` | Phones per person (1:N) |
| `address` | Addresses |
| `quote_attachment` | Files attached to quotes (note: no `quote` table found — parent table name unknown) |
| `queue_item` | Some processing queue |
| `send_log` | Outbound email/message log |
| `usage_log` | Usage/audit log |

### `jasper_*` family (looks like a quoting/product app)

`jasper_document`, `jasper_industry`, `jasper_material`,
`jasper_org_settings`, `jasper_payment`, `jasper_product`,
`jasper_quote_view` (a view), `jasper_role`, `jasper_service`,
`jasper_tax_rate`, `jasper_terms`.

"Jasper" appears nowhere in this repo's docs. Likely a separate/earlier
project sharing the same Supabase instance.

## Access behaviour observed (relevant to the viewer's auth design)

- Publishable key + `public` schema: every table returns HTTP 200 with
  **0 rows** — RLS (or grants) already deny anonymous reads. Good for the
  spec's "never publicly accessible" requirement; means the viewer must use
  authenticated sessions or server-side secret key.
- `/rest/v1/` OpenAPI introspection: rejected for publishable keys
  ("Secret API key required").
- `pg_graphql` extension: not enabled.

## Next steps

1. Obtain the **secret key** (`sb_secret_…`, dashboard → Project Settings →
   API keys) and re-run `scripts/shopvox-schema-audit.py` for the definitive
   table list, column types, row counts, and samples.
2. Confirm with the owner where the ShopVox export lives. If it was never
   imported, importing it (CSV → Supabase) becomes step 0 of the build order.
3. Decide whether the archive tables should live in this project alongside
   the existing `jasper_*`/CRM schema (e.g. under a dedicated `shopvox`
   schema) or in a separate Supabase project.
