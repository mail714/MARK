# Getting Started — For the Claude Code Session

Read this file first when starting work in Claude Code. It tells you what to do before writing any code.

## Step 1: Read the Other Docs

In order:

1. `docs/project-overview.md` — the whole vision, three brands, seven modules, tech stack, principles
2. `docs/case-study-producer-spec.md` — the detailed spec for the module being built first

These were produced from a long design conversation. Trust them — but flag anything that seems contradictory, incomplete, or that you'd genuinely improve with a different approach. Push back when warranted.

## Step 2: Confirm Understanding

Before writing anything, summarise back to the user:

- Your one-paragraph understanding of the full system
- Your one-paragraph understanding of the case study producer specifically
- Anything in the docs that's unclear or that you'd flag as risky
- Your proposed first concrete step

Do **not** start scaffolding until the user confirms.

## Step 3: Gather Credentials and Access

Don't try to do this all at once. Ask for credentials as each step needs them. Suggested order:

1. **Supabase project URL + anon key + service role key** — needed for Step 1 of the build order
2. **Anthropic API key** — needed for Step 7
3. **Google Cloud credentials** for Drive API access — needed for Step 3 of the build order. A service account JSON is simpler than OAuth for a single-user system.
4. **Wix API credentials** — needed for Step 10. Wix MCP connector may avoid this; check first.
5. **dotdigital API user credentials** — needed much later, when the email module is in scope.

Never log credentials. Use `.env.local`. Confirm with the user that `.env.local` is in `.gitignore` before adding any secrets.

## Step 4: Propose the Initial Scaffolding

Before generating files, share the proposed structure for confirmation:

```
/app
  /(dashboard)
    layout.tsx               -- nav, brand switcher
    page.tsx                 -- home / overview
    /case-studies
      page.tsx               -- pending queue
      /[id]
        page.tsx             -- review / edit single case study
    /campaigns               -- (future) email campaigns
    /content                 -- (future) social content
  /api
    /case-studies
      route.ts
      /[id]
        /generate/route.ts   -- kick off generation
        /approve/route.ts    -- approve + push to Wix
    /drive
      /folders/route.ts      -- list pending folders
    /wix
      /push/route.ts
/components
  /case-studies              -- review UI, photo picker, etc.
  /ui                        -- generic UI primitives
/lib
  /supabase
    server.ts
    client.ts
  /ai
    anthropic.ts
    prompts/
      case-study-draft.ts
  /drive
    client.ts
    folders.ts
  /wix
    client.ts
    cms.ts
    media.ts
  /pdf
    sales-order.ts
    proof.ts
  /images
    process.ts               -- sharp wrapper
/docs                        -- these documents, kept in repo
/supabase
  /migrations
    0001_initial.sql
    0002_seed_brands.sql
.env.local.example
.env.local                   -- gitignored
.gitignore
README.md
```

## Step 5: First Milestone

The first thing that should work end-to-end is small:

> The dashboard shows a list of folders found in the Honours Boards `1-Pending` directory on Google Drive. Each row shows folder name and detected files (sales order, proof, photo count). Clicking a row navigates to a detail page that lists the files. Nothing else yet.

This forces the plumbing to be right — Supabase connected, Next.js working, Drive auth working, deployed (or runnable locally) — before any of the AI or Wix complexity is added.

## Step 6: Build Incrementally, in Order

Follow the build order in `case-study-producer-spec.md`. Each step should:

1. Be small enough to test in isolation.
2. End with something the user can see working.
3. Use the **Thorpe Willoughby** test fixture wherever possible. Real data exposes problems that synthetic data hides.

## Principles to Hold To

- **Real integrations over mocks.** Always test against the actual Drive folder, the actual Wix CMS (in a draft/sandbox state), the actual dotdigital account. Mocks lie.
- **Human approval is a hard gate.** Nothing publishes without an explicit operator action in the UI.
- **Multi-brand awareness from day one.** Even though we're building Honours Boards first, every record carries a `brand_id`. Don't bake "honours-boards" assumptions into table names, slug logic, or routing.
- **Voice grounding matters.** AI text generation must be prompted with real existing case studies as exemplars. Generic prose damages the brand. Ground the prompt with at least 3 full existing case studies pulled from the live site.
- **Bias toward fewer dependencies.** A new npm package needs a real justification. The stack in `project-overview.md` covers most needs.
- **Stop and ask, don't guess.** When the user's intent on a design decision is ambiguous, ask. They'd rather answer a question than rewrite a feature.

## What to Avoid

- Writing code before the user confirms scaffolding
- Bringing in heavy frameworks for problems that don't need them (e.g. tRPC, Redux, Zustand) — start with React state and Supabase
- Premature generalisation. "What if we want to support N brands and M social platforms" comes later. Build for Honours Boards + FB/IG/Pinterest first; the multi-brand structure carries that forward when needed.
- Skipping the PDF extraction quality check. If the extractor isn't reliable on real sales orders, every downstream step is built on sand.
- Auto-publishing anything. Ever.

## What "Done" Looks Like for Phase 1

The user can:

1. Drop sales order + proof + photos into a new `(SO-XXXXX) Customer Name` folder under `1-Pending`.
2. Open the dashboard, see the folder appear in the queue.
3. Click **Generate**, wait ~30–60 seconds.
4. See a draft case study with all CMS fields filled, photos selected and resized, club type suggested.
5. Edit any field inline, regenerate any section, swap photos.
6. Click **Approve**.
7. Land on the Wix CMS, find a draft item with all fields populated and images uploaded.
8. Final-review in Wix, hit Publish.
9. Confirm the case study appears live on `honours-boards.co.uk`.

Phase 2 (social variants) starts only after Phase 1 is reliably delivering case studies in production.
