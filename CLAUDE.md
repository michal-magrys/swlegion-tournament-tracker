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
  page.tsx                    — Client root: filter state, streaming fetch, modal state
  layout.tsx                  — Root layout (Geist font, dark background)
  components/
    constants.ts              — Filter constants, FilterParams interface, getDateFrom()
    FilterPanel.tsx           — Faction/date/players/format selects (React.memo)
    TournamentCard.tsx        — Single tournament row with clickable placement cells
    ArmyListModal.tsx         — Army list overlay (accessible dialog)
  api/
    search/route.ts           — POST: streaming NDJSON search endpoint
    list/route.ts             — GET: fetch a single army list by playerId + eventId
lib/
  types.ts                    — All shared TypeScript types
  factions.ts                 — Faction code ↔ name mapping + PRIMARY_FACTIONS list
  scraper.ts                  — All Longshanks scraping logic
  db.ts                       — Neon Postgres caching layer (optional)
```

## Key Dependencies

- **Next.js** (App Router, TypeScript strict mode, Tailwind CSS)
- **Cheerio** — server-side HTML parsing for scraping
- **@neondatabase/serverless** — Postgres caching (gracefully skipped if `DATABASE_URL` not set)

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | No | Neon Postgres connection string. App works without it — caching is silently disabled. |

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

### Vercel constraints
- `maxDuration = 60` is set on the search route — this is the Vercel free tier limit. Do not increase it.
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

Vercel free tier via standard Next.js deploy. Set `DATABASE_URL` in Vercel project environment variables for the caching layer to activate.

## License

MIT (Copyright 2026 Michal Magrys)
