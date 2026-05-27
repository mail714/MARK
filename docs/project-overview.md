# Signet Marketing System — Project Overview

## Purpose

A centralised, multi-brand marketing dashboard for Signet's three businesses. Replaces ad-hoc manual work with a system that ingests prospects, plans content, drafts copy, builds campaigns and landing pages, produces case studies, and pushes content to social — with a human approving everything before it goes live.

The goal is twofold: save substantial time, and lift the quality and consistency of marketing output.

## The Three Brands

| Brand | URL | Focus |
|-------|-----|-------|
| Signet Signs | https://www.signetsigns.co.uk | General signage — all sectors |
| Honours Boards | https://www.honours-boards.co.uk | Honours boards for sports clubs, schools, masonic lodges, etc. |
| Signet Play | https://www.signet-play.co.uk | Playground equipment for schools |

Each brand has its own website (all Wix Studio), its own social accounts (separate, not yet all set up — see Connectors section), and its own brand voice. The system is multi-brand from day one — every piece of content, every campaign, every CMS push must know which brand it's operating on.

## Sectors Served

- Schools / education
- Businesses / companies / organisations
- Government (electoral services)
- Sports clubs (golf, cricket, bowls, tennis, football, rugby, etc.)
- Healthcare (doctors, dentists, etc.)

The marketing planner module will eventually generate sector-aware content calendars that feed the other modules.

## The Seven Modules

In the order they'll be built (case study producer first, dashboard skeleton alongside it):

1. **Case Study Producer** — turns sales orders + design proofs + install photos into published Wix CMS case studies and social variants. **Building first, for Honours Boards.**
2. **Chimera Ingest** — Chimera is an existing program that scrapes web prospects. This module surfaces and manages the Excel sheet + Mailchimp sync.
3. **Email Campaign Builder** — drafts and sends campaigns through Mailchimp. ~15,000 emails/week growing.
4. **Landing Page Builder** — generates Wix Studio dynamic CMS landing pages, one per email campaign.
5. **Content Creator** — drafts social posts for the three brands' channels.
6. **Marketing Planner** — sector-aware content calendar that feeds the content creator and email modules.
7. **Dashboard** — the shell tying it all together. Built up incrementally alongside the modules.

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js (TypeScript, App Router) | Full-stack, single language |
| Styling | Tailwind CSS | |
| Database | Supabase (Postgres) | Already have an account |
| Storage | Supabase Storage | For cached files and processed images |
| Auth | Supabase Auth | Single user to start, multi-user later if needed |
| Hosting | Vercel | Pairs natively with Next.js + Supabase |
| AI orchestration | Anthropic SDK | Claude for the agent / structured generation logic |
| AI text (optional) | Google Gemini SDK | If preferred for final copywriting passes |
| PDF parsing | `unpdf` or `pdf-parse` | For sales orders and proofs |
| Image processing | `sharp` | Resize to 1200×900, crop, format |
| Google Drive | `googleapis` (official Node client) | File source for case studies |
| Wix integration | Wix MCP connector + Wix Data API | CMS pushes, image uploads |
| Mailchimp | `@mailchimp/mailchimp_marketing` | When email module is built |

## Key Constraints and Gotchas

- **ShopVox API is outbound-only** for incoming data into ShopVox. We cannot read sales orders, customers, or jobs from it. The case study producer relies on manual file drops to Drive instead.
- **Wix API is workable but fiddly.** Use the Wix MCP connector where possible. Webhooks not in scope.
- **TikTok Content Posting API is heavily gated.** Parked. Not building TikTok integration in the first phase.
- **Mailchimp at 15k+ emails/week** needs the right tier and proper sender authentication (SPF, DKIM, DMARC) per sending domain. Address before turning the email module on.
- **Old Adobe versions only.** Canva can be purchased if needed for the design pieces.

## Principles

These are not preferences — they're hard rules:

1. **Human approval before publishing.** Every brand, every module, every channel. No autonomous posting.
2. **Multi-brand awareness.** Every record knows which brand it belongs to. Never bolt on later.
3. **Quality over speed.** Generic AI output damages the brand. Voice grounding and real examples matter more than throughput.
4. **Real integrations, not mocks.** Test against real data (Thorpe Willoughby files, real Drive folders, real Wix CMS) from day one.
5. **Iterate on real use.** Ship the smallest working version, use it, learn, then expand.

## Connectors and Accounts Required

| Service | Status | Purpose |
|---------|--------|---------|
| Supabase | ✅ Have account | DB, storage, auth |
| Anthropic API | Need key | AI generation |
| Google Cloud | Need to set up | Drive API + Gemini (if used) |
| Wix | ✅ Three sites exist | CMS pushes |
| Mailchimp | ✅ Have account, one address book per brand | Email campaigns |
| Vercel | Likely needed | Hosting |
| Facebook / Instagram (Signet Signs, Signet Play) | ✅ Exist | Social publishing |
| Facebook / Instagram / Pinterest (Honours Boards) | ❌ To set up | Social publishing |
| TikTok | Parked | — |
| YouTube | Parked until video workflow defined | — |

## Out of Scope (For Now)

- Customer-facing portals
- Quoting or order entry (ShopVox does this)
- Production/job management (ShopVox)
- Multi-user permissions (single operator initially)
- A second human reviewer / approval chains
