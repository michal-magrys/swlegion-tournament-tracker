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
