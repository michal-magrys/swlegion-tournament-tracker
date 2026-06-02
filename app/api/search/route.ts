import { fetchEvents, checkTournament } from "@/lib/scraper";
import { factionCodeToName } from "@/lib/factions";
import { initDb } from "@/lib/db";
import type { SearchParams } from "@/lib/types";

export const maxDuration = 60;

const VALID_POINT_FORMATS = ["1000", "600", "all"] as const;

export async function POST(request: Request) {
  await initDb();

  const body = (await request.json()) as Partial<SearchParams>;
  const { dateFrom, minPlayers, faction, pointFormat = "1000" } = body;

  if (!dateFrom || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom))
    return new Response("Invalid dateFrom", { status: 400 });
  if (!Number.isInteger(minPlayers) || (minPlayers as number) < 1)
    return new Response("Invalid minPlayers", { status: 400 });
  if (!faction)
    return new Response("Invalid faction", { status: 400 });
  if (!VALID_POINT_FORMATS.includes(pointFormat as typeof VALID_POINT_FORMATS[number]))
    return new Response("Invalid pointFormat", { status: 400 });

  const validatedParams = { dateFrom, minPlayers, faction, pointFormat } as SearchParams;
  const factionName = factionCodeToName(validatedParams.faction);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "status", message: "Fetching tournament list..." }) + "\n"
          )
        );

        const events = await fetchEvents(validatedParams.dateFrom, validatedParams.minPlayers);

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "status",
              message: `Found ${events.length} tournaments. Checking standings...`,
              total: events.length,
            }) + "\n"
          )
        );

        let checked = 0;
        for (const event of events) {
          const result = await checkTournament(event, factionName, validatedParams.pointFormat);
          checked++;

          if (result) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "result", tournament: result, checked }) + "\n"
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "progress", checked }) + "\n"
              )
            );
          }

          // Small delay to be respectful to Longshanks
          if (checked < events.length) {
            await new Promise((r) => setTimeout(r, 200));
          }
        }

        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "done", checked }) + "\n"
          )
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              message: err instanceof Error ? err.message : "Unknown error",
            }) + "\n"
          )
        );
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
