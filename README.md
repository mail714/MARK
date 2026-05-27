# MARK — Signet Marketing System

Multi-brand marketing dashboard for Signet Signs, Honours Boards, and Signet Play.

See [`docs/project-overview.md`](docs/project-overview.md) for the full vision,
[`docs/case-study-producer-spec.md`](docs/case-study-producer-spec.md) for the
detailed spec of the first module, and [`docs/getting-started.md`](docs/getting-started.md)
for the operating principles.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Supabase (Postgres, Storage, Auth)
- Anthropic SDK — AI generation
- `googleapis` — Drive integration
- `sharp` — image resize
- `unpdf` / `pdf-parse` — PDF extraction
- Wix MCP connector + Wix Data API — CMS pushes
- Vercel — hosting

## Local development

```bash
cp .env.local.example .env.local
# Fill in Supabase credentials, then:
npm install
npm run dev
```

## Database

Migrations live in [`supabase/migrations`](supabase/migrations). Run them via
the Supabase SQL editor or the Supabase CLI:

```bash
supabase db push
```

## Repo layout

```
/app                       Next.js routes
  /(dashboard)             Dashboard route group
    /case-studies          Pending queue + review UI
  /api                     Server routes
/components                React components
/lib
  /supabase                Server + browser + admin clients
  /ai                      Anthropic + prompts
  /drive                   Google Drive client
  /wix                     Wix CMS + Media clients
  /pdf                     Sales-order + proof extractors
  /images                  sharp wrapper
/docs                      Design docs (source of truth)
/supabase/migrations       SQL migrations
```

## Principles

1. Human approval before publishing — every brand, every module.
2. Multi-brand awareness — every record carries `brand_id`.
3. Voice grounding over generic AI output.
4. Real integrations, not mocks.
