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
- `lib/integrations-openai-ai-server` — OpenAI-backed client used by the AI writing tools
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
| `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL` | AI writing features (`lib/integrations-openai-ai-server`). `BASE_URL` is required at boot. Set on Replit via its AI Integrations gateway — off-Replit, point these at your own OpenAI-compatible endpoint/key. |
| `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` | Media library storage. Not required to boot, but see "Known gaps" below — as shipped this doesn't work off-Replit at all, regardless of what these are set to. |
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

## Known gaps after leaving Replit

- **Media library uploads are broken as shipped.** `objectStorage.ts` talks
  to a hardcoded `http://127.0.0.1:1106` — Replit's local credential sidecar
  for its Object Storage integration. That endpoint doesn't exist off-Replit,
  so uploads will fail regardless of what `PUBLIC_OBJECT_SEARCH_PATHS` /
  `PRIVATE_OBJECT_DIR` are set to. Everything else works fine without it;
  fixing uploads means swapping this for a real storage backend (S3-compatible,
  Supabase Storage, GCS with real service-account credentials, etc.).
- **AI writing features** need `AI_INTEGRATIONS_OPENAI_BASE_URL`/`_API_KEY`
  pointed at a real OpenAI-compatible endpoint instead of Replit's gateway.

## Known gotchas (carried over from `.agents/memory/`)

- **Review links are unauthenticated by design** (token-guessable-proof UUIDs, 14-day
  expiry, frozen snapshots) and the API has no CORS middleware — same-origin only.
  **Add real auth to the workspace endpoints before exposing any of this publicly.**
- State lives in Postgres via `/api/sync` (last-write-wins, debounced); `localStorage`
  is only an optimistic cache.
- Publication metrics use the actual publish timestamp, not the planned/scheduled date
  — see `.agents/memory/publication-tracking.md`.

See `.agents/memory/` for the fuller architecture notes this project accumulated.
