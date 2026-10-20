# Content Desk

A multi-client content operations workspace: shared campaign briefs, channel-specific
deliverables, version-aware approvals, an editorial calendar, a media library,
performance reporting, retainer capacity, and AI-assisted writing.

Originally built on Replit; this repo is a straight port of that project's working
tree (Replit-specific scaffolding under `.agents/`, `.replit`, and `replit.md` is kept
for reference but isn't required to run elsewhere).

## Product

- Shared campaign briefs with reusable channel-specific deliverables
- Production and publishing workflows with version-aware approvals
- Editorial calendar, repurposing, media library, performance reporting, and retainer capacity
- AI-assisted rewriting, adaptation, proofreading, hooks, CTAs, and repurposing

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval, generated from `lib/api-spec/openapi.yaml`
- Build: esbuild (CJS bundle)

## Layout

- `artifacts/content-desk` — the React/Vite frontend
- `artifacts/api-server` — the Express API
- `artifacts/mockup-sandbox` — component/design preview sandbox
- `lib/db` — Drizzle schema and Postgres access (`pnpm --filter db run push` to sync)
- `lib/api-spec` — OpenAPI spec + Orval codegen config
- `lib/api-client-react`, `lib/api-zod` — generated API client hooks and Zod schemas
- `lib/integrations-anthropic-ai-server` — Claude-backed client used by the AI writing tools
- `scripts` — workspace maintenance scripts

## Run & operate

```
pnpm install
pnpm --filter @workspace/api-server run dev   # API server
pnpm --filter @workspace/content-desk run dev # frontend
pnpm run typecheck                            # full typecheck across all packages
pnpm run build                                # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen # regenerate API hooks/schemas from the OpenAPI spec
pnpm --filter db run push                     # push DB schema changes (dev only)
```

### Environment

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Postgres connection string. Required — the process won't boot without it. |
| `ANTHROPIC_API_KEY` | AI writing features (`lib/integrations-anthropic-ai-server`), on Claude Haiku 5.5. Required at boot. Get a key at console.anthropic.com. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_STORAGE_BUCKET` | Media library storage (see "Media storage" below). Not required to boot — uploads just won't work until set. |
| `PORT` | Port the server listens on. Also serves the built frontend when `NODE_ENV=production` (see Deploying). |
| `NODE_ENV`, `LOG_LEVEL` | Standard server config |

## Deploying (off Replit)

Replit originally ran this as three separate services stitched together by
path-based routing (frontend static build, API, and a dev-only mockup
sandbox) — a model generic hosts don't understand. `artifacts/api-server/src/app.ts`
now also serves the built frontend itself (same origin, no separate static
host, which also preserves the "no CORS middleware" assumption already
baked into that file) whenever `NODE_ENV=production` and a frontend build is
present next to it on disk.

A `Dockerfile` at the repo root builds both and runs the combined server —
verified locally end to end (clean install → typecheck → both builds → a
live HTTP smoke test of `/api/healthz`, `/`, a client-side route, a static
asset, and an unmatched `/api/*` 404) from a from-scratch checkout. The
Docker image itself wasn't build-tested (no Docker daemon in the environment
this was ported from), but every step it runs was.

`render.yaml` is a ready-to-go [Render](https://render.com) Blueprint (free
tier): connect this repo, Render reads the Dockerfile and prompts you for
the `sync: false` env vars (`DATABASE_URL` etc. — never checked into the
file). The same `Dockerfile` works unmodified on Railway, Fly.io, or any
other container host if you'd rather use one of those instead.

## Media storage

`objectStorage.ts` originally talked to `http://127.0.0.1:1106` — Replit's
local credential sidecar for its Object Storage integration, which doesn't
exist off-Replit. It's now backed by **Supabase Storage** instead (bucket
`content-desk-media`, public, 200MB per-file limit), using the same Supabase
project as the database:

- Uploads go `browser -> PUT /api/storage/uploads/direct/:id -> this server
  -> Supabase Storage`, rather than a client-side PUT straight to a
  cloud-signed URL — Supabase's own signed-upload flow needs a different
  request shape than the plain PUT this app's frontend already does, so
  routing bytes through the server avoided a frontend change.
- Reads (`GET /api/storage/objects/*`) proxy through this server too,
  unchanged from how they always worked.
- Uses `SUPABASE_ANON_KEY`, not a secret service-role key: two RLS policies
  on `storage.objects`, scoped to just this bucket, let the anon role
  read/write it directly (migration `media_bucket_public_policies`). That
  matches how the rest of this app already works — single-user, no real
  auth, uploads intentionally public-by-link — so it's not a lower security
  bar, just one fewer secret to configure. The anon key is meant to be
  public; it's checked into `render.yaml` on purpose.
- Verified end-to-end against the real bucket: requested an upload URL,
  PUT a file through it, GET it back through the app, diffed the bytes.

**AI writing features** run on Claude (Haiku 5.5) via `ANTHROPIC_API_KEY` —
get one at console.anthropic.com and set it in the Render dashboard.
Voice-memo transcription runs entirely client-side on the browser's built-in
Web Speech API, so it needs no key and costs nothing; it only works in
browsers that support `SpeechRecognition` (Chrome/Edge; not Firefox, and
only partial support in Safari).

## Restoring existing data

Server-side JSON backups are a built-in feature, not something bolted on for
this port — see Settings → Data & Backups in the app itself:
`store.exportBackup()` / `importBackup()` client-side, and
`GET/POST /api/backups` server-side (`routes/state.ts`), storing full
`{clients, briefs, deliverables, events, versions, assets, tasks, notes,
metrics, templates, voiceExamples}` snapshots in the `snapshots` table. If an
existing backup file is in this shape, Settings → Import Backup is the
straightforward way to load it in — no direct database access needed.

## Known gotchas (carried over from `.agents/memory/`)

- **Review links are unauthenticated by design** (token-guessable-proof UUIDs, 14-day
  expiry, frozen snapshots) and the API has no CORS middleware — same-origin only.
  **Add real auth to the workspace endpoints before exposing any of this publicly.**
- State lives in Postgres via `/api/sync` (last-write-wins, debounced); `localStorage`
  is only an optimistic cache.
- Publication metrics use the actual publish timestamp, not the planned/scheduled date
  — see `.agents/memory/publication-tracking.md`.

See `.agents/memory/` for the fuller architecture notes this project accumulated.
