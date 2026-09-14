---
name: Content Desk architecture decisions
description: Key non-obvious decisions and environment quirks for the Content Desk app (server sync, review links, verification quirks)
---

# Content Desk architecture

- State lives in Postgres via /api/sync (last-write-wins, debounced); localStorage is only an optimistic cache. Migration heuristic `hasServerData` checks ONLY clients/deliverables — a stray note must not mark the server as populated (this bug once blocked migration).
- **Why:** single-user app, no accounts; review links and cross-device capture need server persistence.
- **How to apply:** new entity types need: Drizzle table, SYNC_KEYS entry, normalize() defaults, and seed handling.

- Review links are intentionally unauthenticated (token-guessable-proof UUIDs, 14-day expiry, frozen snapshots). Entire API has no CORS middleware on purpose — same-origin proxy only. **Before any public publishing, add Replit Auth to the workspace endpoints** (user deferred this; recorded as a discussion item).
- **Why:** user explicitly deferred accounts/permissions; review links must work for clients without logins.

- Environment quirk: the headless Screenshot tool browser closes before the app's hydrate() push completes, so local→server migration cannot be verified via screenshots. Verify /api/sync with curl instead; the user's real preview browser migrates on load.