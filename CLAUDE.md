# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Next.js app that scrapes [legion.longshanks.org](https://legion.longshanks.org) for completed Star Wars: Legion tournaments and shows which ones had a chosen faction finish in the top 3. Designed for Vercel free tier deployment.

## Commands

- `npm run dev` — Start development server (Turbopack)
- `npm run build` — Production build (also runs TypeScript)
- `npm run start` — Start production server
- `npm run lint` — Run ESLint

Always run `npm run lint && npm run build` before committing.

## File Map

```
app/
  page.tsx                    — Client root: tab state, filter state, streaming fetch, modal state
  layout.tsx                  — Root layout (Geist font, dark background)
  components/
    constants.ts              — Filter constants, FilterParams interface, getDateFrom()
    FilterPanel.tsx           — Faction/date/players/format selects (React.memo)
    TournamentCard.tsx        — Single tournament row with clickable placement cells
    ArmyListModal.tsx         — Army list overlay (accessible dialog)
    FactionTrendsChart.tsx    — SVG line chart of weekly top-3 placements (last 6 months)
    UnitFrequencyPanel.tsx    — Unit frequency breakdown for current search results
  api/
    search/route.ts           — POST: streaming NDJSON search endpoint (DB-first)
    list/route.ts             — GET: fetch a single army list by playerId + eventId
    trends/route.ts           — GET: weekly faction top-3 counts for the trends chart
    cron/crawl/route.ts       — GET: hourly cron handler — pre-warms all DB caches
lib/
  types.ts                    — All shared TypeScript types
  factions.ts                 — Faction code ↔ name mapping + PRIMARY_FACTIONS list
  scraper.ts                  — All Longshanks scraping logic
  db.ts                       — Neon Postgres caching layer (optional)
vercel.json                   — Vercel cron schedule (0 * * * *)
```

## Key Dependencies

- **Next.js** (App Router, TypeScript strict mode, Tailwind CSS)
- **Cheerio** — server-side HTML parsing for scraping
- **@neondatabase/serverless** — Postgres caching (gracefully skipped if `DATABASE_URL` not set)

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | No | Neon Postgres connection string. App works without it — caching is silently disabled. |
| `CRON_SECRET` | No* | Secret used to authenticate cron requests. Required for `/api/cron/crawl` to accept calls. Vercel auto-generates and injects it for scheduled invocations. |

\* Without `CRON_SECRET` the cron route returns 401 on every call — set it if you want the pre-warming to work.

## Architecture Notes

### Streaming protocol
`/api/search` emits newline-delimited JSON (`StreamMessage` discriminated union from `lib/types.ts`). Each line is one of: `status`, `result`, `progress`, `done`, `error`. The client in `page.tsx` reads these with a `ReadableStream` reader and updates state incrementally.

### Faction naming
`lib/factions.ts` owns two things: the exhaustive `FACTIONS` record (code → display name for all Longshanks faction codes) and `PRIMARY_FACTIONS` (the 5 playable factions shown in the UI dropdown). `app/components/constants.ts` re-exports `PRIMARY_FACTIONS` as `FACTIONS` and derives `SORTED_FACTIONS` from it — so `factions.ts` is the single source of truth. Do not duplicate faction data in `constants.ts`.

### `checkTournament` receives factionName, not factionCode
The scraper normalises faction codes to display names before storing them in `TopPlacement.faction`. `checkTournament` compares against display names (e.g. `"Galactic Empire"`), not codes (e.g. `"galactic_empire"`). The search route converts the incoming `faction` code via `factionCodeToName()` before passing it through.

### Caching return values (intentional 3-state)
`getCachedArmyList` deliberately returns three distinct values:
- `undefined` — not in cache (go scrape)
- `null` — cached as "no list exists" (don't scrape again)
- `ArmyList` — cache hit

Do not collapse `null` and `undefined` here.

### Army list scraping — three methods tried in order
`scrapeArmyList` in `lib/scraper.ts` tries three approaches because Longshanks has changed format over time:
1. **`table.legion_list`** — current HTML table format
2. **`<textarea id="list_{playerId}">`** — older JSON-in-textarea format
3. **Bracket-counting fallback** — finds `"armyFaction"` marker and extracts surrounding JSON from raw HTML

### Tab navigation
`page.tsx` has two tabs — **Search** and **Trends** — controlled by `tab` state initialised from
`?tab=` in the URL. Tab and filter params are kept in sync via a single `useEffect` calling
`window.history.replaceState`. Auto-search only fires when the initial tab is `"search"`.

### DB-first search
`/api/search` calls `getEventsByDateAndMinPlayers(dateFrom, minPlayers)` before touching
Longshanks. If the DB returns events, those are used directly; `fetchEvents` is never called.
`checkTournament` already checks `cached_top_placements` first, and `fetchArmyList` checks
`cached_army_lists` first — so a fully warm cache means zero Longshanks HTTP calls per search.
Falls back to live scraping only when the DB has no events for the requested range (e.g. fresh
deployment before the first cron run).

### Hourly cron crawl
`/api/cron/crawl` (scheduled via `vercel.json`) crawls the last 6 months of events with no
player-count floor, caching placements and army lists for every event not already in the DB.
After 4–5 hourly runs from a cold start, the full 6-month window is seeded. Subsequent runs
only process events added in the last hour (~1–3 events), completing well within the 60 s limit.
Protect with `CRON_SECRET`; Vercel injects the header automatically for scheduled invocations.

### Trends chart
`FactionTrendsChart` is hardcoded to look back 6 months (`TRENDS_RANGE_INDEX = 3`). The
`/api/trends` route computes weekly top-3 placement counts via a pure DB JOIN on
`cached_events` + `cached_top_placements` — no Longshanks calls. Trailing zero-count weeks
are trimmed before the response is sent.

### Vercel constraints
- `maxDuration = 60` is set on both the search and cron routes — this is the Vercel free tier limit. Do not increase it.
- No persistent server state — everything goes through the DB or is re-scraped.

## Design Constraints — Do Not Change

- Tailwind colours `#0a0a0f` and `#0d0d14` are the intentional dark palette. Do not replace them with approximate Tailwind utility colours.
- `React.memo` on `FilterPanel` is intentional — prevents the filter bar re-rendering when modal state changes in the parent.
- The `useRef` + `useLayoutEffect` pattern in `ArmyListModal` keeps the Escape-key handler stable without re-registering it on every render. Do not revert to assigning `ref.current` during render (React lint rule violation).

## TypeScript Notes

- Strict mode is enabled (`tsconfig.json`).
- Path alias `@/` maps to the repo root (e.g. `@/lib/types`).
- `StreamMessage` in `lib/types.ts` is a discriminated union — use it wherever stream messages are typed rather than loose `object` or `any`.
- `Unit` in `lib/types.ts` is the named type for army list units — use it instead of the inline object type.

## Coding Practices

### Where new code belongs
- New shared types → `lib/types.ts` (named interfaces/unions, not inline shapes)
- New filter constants or UI options → `app/components/constants.ts`
- New scraping logic → `lib/scraper.ts` (export a named function)
- New API endpoints → `app/api/[name]/route.ts`
- Do not hardcode faction names or codes outside `lib/factions.ts`

### TypeScript
- Prefer named interfaces/types from `lib/types.ts` over inline `{ field: type }` shapes
- Use discriminated unions for multi-variant types (see `StreamMessage`)
- Add `as const` to all literal arrays and tuple-shaped constants
- Avoid `any`; use `unknown` when the type is genuinely unknown
- Validate only at system boundaries (API route inputs, external HTML); trust internal types

### React
- Wrap `useCallback` around every handler passed as a prop to a `React.memo` component — otherwise memoisation is defeated
- Group related state into one object (see `FilterParams` pattern) rather than multiple loose `useState` calls
- Keep new components in `app/components/`; one component per file

### Naming
- **Module-level constants**: UPPER_SNAKE_CASE (`DEFAULT_PARAMS`, `INITIAL_SEARCH`)
- **State variables**: camelCase nouns or adjectives (`results`, `loading`, `listModal`)
- **Event handlers**: `handle` + PascalCase action (`handleSearch`, `handleCloseModal`)
- **Refs**: camelCase + `Ref` suffix (`abortRef`, `autoSearchedRef`)
- **Functions**: camelCase verb-noun phrase (`paramsFromSearchString`, `getDateFrom`)
- **Types / interfaces / components**: PascalCase (`FilterParams`, `Tournament`, `FilterPanel`)
- **No abbreviations or single-letter names** — write `searchParams` not `sp`, `rangeIndex` not `idx`, `format` not `fmt`, `playerCount` not `n`. Single-letter loop counters (`i`, `j`) are the only exception.

### Code style
- No comments unless the WHY is non-obvious (a hidden constraint, a workaround, a subtle invariant)
- No "this function does X" docstrings — good names do that
- No abstractions unless the same pattern appears 3+ times in the same file
- No error handling for scenarios the type system already prevents

## Scraper Selectors (current as of 2026)

If Longshanks changes its HTML and scraping breaks, update these selectors in `lib/scraper.ts`:

| Data | Selector |
|---|---|
| Event list | `.event_display` |
| Event ID | `.event_name a[href*='/event/']` |
| Event date | `img[alt="Date"]` → parent `tr` → last `td` |
| Player count | `img[alt="Event size"]` → parent `tr` → last `td` |
| Standing entries | `div.player[id^="player_"]` |
| Player name | `.name .player_link` |
| Faction image | `.factions img[src*="/factions/"]` |
| Army list indicator | `img[src*="list_code.png"]` |

## Deployment

Vercel free tier via standard Next.js deploy. Required environment variables:

- `DATABASE_URL` — Neon Postgres connection string (caching and trends disabled without it)
- `CRON_SECRET` — any random string (e.g. `openssl rand -hex 32`); required for the hourly crawl

`vercel.json` registers the cron automatically on deploy — no extra Vercel UI configuration needed.
To seed the DB immediately after first deploy without waiting an hour, call
`GET /api/cron/crawl` with `Authorization: Bearer <CRON_SECRET>`.

## License

MIT (Copyright 2026 Michal Magrys)
