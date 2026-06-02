import { fetchEvents, checkTournament } from "@/lib/scraper";
import { factionCodeToName } from "@/lib/factions";
import { initDb, upsertCachedEvents, getEventsByDateAndMinPlayers } from "@/lib/db";
import type { SearchParams, StreamMessage, PointFormat } from "@/lib/types";

export const maxDuration = 60;

const VALID_POINT_FORMATS = ["1000", "600", "all"] as const;

export async function POST(request: Request) {
  await initDb();

  const body = (await request.json()) as Partial<SearchParams>;
  const { dateFrom, minPlayers, faction, pointFormat = "1000" } = body;

  if (!dateFrom || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom))
    return new Response("Invalid dateFrom", { status: 400 });
  if (minPlayers === undefined || !Number.isInteger(minPlayers) || minPlayers < 1)
    return new Response("Invalid minPlayers", { status: 400 });
  if (!faction)
    return new Response("Invalid faction", { status: 400 });
  if (!VALID_POINT_FORMATS.includes(pointFormat as PointFormat))
    return new Response("Invalid pointFormat", { status: 400 });

  const factionName = factionCodeToName(faction);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));

      try {
        emit({ type: "status", message: "Fetching tournament list..." });

        const cachedEvents = await getEventsByDateAndMinPlayers(dateFrom, minPlayers);
        let events: { id: number; name: string; date: string; playerCount: number }[];
        if (cachedEvents.length > 0) {
          events = cachedEvents;
        } else {
          const liveEvents = await fetchEvents(dateFrom, minPlayers);
          void upsertCachedEvents(liveEvents);
          events = liveEvents;
        }

        emit({
          type: "status",
          message: `Found ${events.length} tournaments. Checking standings...`,
          total: events.length,
        });

        let checked = 0;
        for (const event of events) {
          const result = await checkTournament(event, factionName, pointFormat as PointFormat);
          checked++;

          if (result) {
            emit({ type: "result", tournament: result, checked });
          } else {
            emit({ type: "progress", checked });
          }

          // Small delay to be respectful to Longshanks
          if (checked < events.length) {
            await new Promise((r) => setTimeout(r, 200));
          }
        }

        emit({ type: "done", checked });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
