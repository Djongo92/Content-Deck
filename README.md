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
| `DATABASE_URL` | Postgres connection string |
| `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL` | AI writing features (`lib/integrations-openai-ai-server`). Set on Replit via its AI Integrations gateway — off-Replit, point these at your own OpenAI-compatible endpoint/key. |
| `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` | Media library storage (`artifacts/api-server/src/lib/objectStorage.ts`), wired for Replit Object Storage — swap for equivalent config if hosting elsewhere. |
| `NODE_ENV`, `LOG_LEVEL` | Standard server config |

## Known gotchas (carried over from `.agents/memory/`)

- **Review links are unauthenticated by design** (token-guessable-proof UUIDs, 14-day
  expiry, frozen snapshots) and the API has no CORS middleware — same-origin only.
  **Add real auth to the workspace endpoints before exposing any of this publicly.**
- State lives in Postgres via `/api/sync` (last-write-wins, debounced); `localStorage`
  is only an optimistic cache.
- Publication metrics use the actual publish timestamp, not the planned/scheduled date
  — see `.agents/memory/publication-tracking.md`.

See `.agents/memory/` for the fuller architecture notes this project accumulated.
