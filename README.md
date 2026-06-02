# Legion Tournament Crawler

A Next.js app that scrapes [Longshanks](https://legion.longshanks.org) for completed Star Wars: Legion tournaments and shows which ones had a chosen faction finish in the top 3.

## What it does

Pick a faction, a date range, a minimum player count, and a points format — the app crawls recent Longshanks events, filters for tournaments where that faction placed 1st, 2nd, or 3rd, and streams results back to you as they're found. Clicking a placement that has an army list attached opens a modal with the full list: units, upgrades, command cards, and battlefield deck.

Results are cached in a Neon Postgres database to avoid hammering Longshanks on repeated queries.

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app works without a database — caching is silently skipped if `DATABASE_URL` is not set.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | No | Neon Postgres connection string for caching scraped results |

Set these in `.env.local` for local development.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com)
- [Cheerio](https://cheerio.js.org) — server-side HTML scraping
- [Neon Serverless](https://neon.tech) — optional Postgres caching layer

## Deploying

Designed for the Vercel free tier. Connect the repo in the Vercel dashboard and set `DATABASE_URL` in the project's environment variables.

## License

MIT
