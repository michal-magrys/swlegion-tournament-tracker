# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LegionListsCrawlationForWorldDomination is a Next.js app (App Router) that scrapes legion.longshanks.org for completed Star Wars: Legion tournaments and shows which ones had a user-selected faction in the top 3. Designed for Vercel free tier deployment.

## Commands

- `npm run dev` — Start development server (Turbopack)
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — Run ESLint

## Architecture

- **Frontend**: `app/page.tsx` — Client component with faction/date/player filters, streams results from the API
- **API route**: `app/api/search/route.ts` — Streaming endpoint that scrapes Longshanks and returns newline-delimited JSON
- **Scraper**: `lib/scraper.ts` — Cheerio-based HTML scraping of Longshanks events history and standings pages
- **Types**: `lib/types.ts` — TypeScript interfaces for Tournament, TopPlacement, SearchParams
- **Factions**: `lib/factions.ts` — Faction code-to-name mapping from Longshanks

## Key Dependencies

- Next.js (App Router, TypeScript, Tailwind CSS)
- Cheerio (server-side HTML parsing)

## License

MIT (Copyright 2026 Michal Magrys)

## Setup

- Node: Recommended `>=18.x` (tested with Node 18/20). Use `nvm` or `corepack` if needed.
- Install: run `npm install` at the repository root to fetch dependencies.
- Dev: run `npm run dev` to start the Next.js development server (Turbopack).

## Local Development Notes

- The app uses the Next.js App Router. `app/page.tsx` is the main client entry.
- API routes are located under `app/api/` and run as serverless handlers in development.
- The scraper runs server-side and uses `cheerio` to parse Longshanks HTML pages.

## File map (key files)

- `app/page.tsx` — Client UI with filters and streaming results.
- `app/api/search/route.ts` — Streaming search endpoint that scrapes Longshanks and emits newline-delimited JSON.
- `app/api/list/route.ts` — (aux) endpoint for listing available events.
- `lib/scraper.ts` — Cheerio-based HTML parsing utilities for events and standings pages.
- `lib/types.ts` — TypeScript interfaces: `Tournament`, `TopPlacement`, `SearchParams`.
- `lib/factions.ts` — Faction code ↔ name mapping used to normalize Longshanks data.

## Scraper details

- The scraper targets `legion.longshanks.org` (events history and standings pages).
- It fetches event pages and extracts top placements, player names, factions, and dates.
- Keep request rates modest; add delays or caching if running many requests to avoid rate limits.

## API contract

- The `search` route streams newline-delimited JSON objects representing `Tournament` records.
- Client expects a streaming response and parses each JSON line as an incremental update.

## Testing & Linting

- ESLint is configured — run `npm run lint`.
- There are no automated tests bundled currently; add lightweight unit tests for scraper parsing if desired.

## Deployment

- Designed for Vercel free tier. Use the standard Next.js deploy flow (`vercel` or GitHub integration).

## Troubleshooting

- If the scraper fails due to HTML changes on Longshanks, update selectors in `lib/scraper.ts`.
- If installs fail on macOS, ensure Xcode command-line tools are installed and `node` + `npm` versions are supported.

## Contact

- Repo author: Michal Magrys (see package.json for metadata).
