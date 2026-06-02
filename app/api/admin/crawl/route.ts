import { fetchEvents, fetchTopThree, fetchArmyList } from "@/lib/scraper";
import { initDb, upsertCachedEvents, getCachedTopPlacements } from "@/lib/db";

export const maxDuration = 60;

export async function POST() {
  await initDb();

  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  const dateFrom = date.toISOString().slice(0, 10);

  const events = await fetchEvents(dateFrom, 1);
  await upsertCachedEvents(events);

  let crawled = 0;
  let skipped = 0;

  for (const event of events) {
    const existing = await getCachedTopPlacements(event.id);
    if (existing !== null) {
      skipped++;
      continue;
    }

    const topThree = await fetchTopThree(event.id);
    for (const placement of topThree) {
      await fetchArmyList(placement.playerId, placement.eventId);
    }
    crawled++;

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return Response.json({ total: events.length, crawled, skipped });
}
