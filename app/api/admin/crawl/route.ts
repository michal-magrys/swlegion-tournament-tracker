import { fetchEvents, fetchTopThree, fetchArmyList } from "@/lib/scraper";
import { initDb, upsertCachedEvents, getEventIdsWithCachedPlacements } from "@/lib/db";

export const maxDuration = 60;

export async function POST() {
  await initDb();

  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  const dateFrom = date.toISOString().slice(0, 10);

  const events = await fetchEvents(dateFrom, 1);
  await upsertCachedEvents(events);

  const cachedIds = await getEventIdsWithCachedPlacements(events.map((e) => e.id));

  let crawled = 0;
  let skipped = 0;
  const start = Date.now();

  for (const event of events) {
    if (Date.now() - start > 50_000) break;
    if (cachedIds.has(event.id)) {
      skipped++;
      continue;
    }

    const topThree = await fetchTopThree(event.id);
    for (const placement of topThree) {
      await fetchArmyList(placement.playerId, placement.eventId);
    }
    crawled++;
  }

  return Response.json({ total: events.length, crawled, skipped });
}
