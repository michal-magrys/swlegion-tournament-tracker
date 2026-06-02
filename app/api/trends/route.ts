import { initDb, getPlacementsWithDates } from "@/lib/db";
import { PRIMARY_FACTIONS } from "@/lib/factions";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

function getMondayOf(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export async function GET(request: NextRequest) {
  await initDb();

  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  if (!dateFrom || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    return Response.json({ error: "Invalid dateFrom" }, { status: 400 });
  }

  const currentMonday = getMondayOf(new Date());
  const currentMondayStr = currentMonday.toISOString().slice(0, 10);

  const pastWeeks: string[] = [];
  const cursor = new Date(getMondayOf(new Date(dateFrom + "T00:00:00")));
  while (cursor < currentMonday) {
    pastWeeks.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 7);
  }

  const placements = await getPlacementsWithDates(dateFrom);

  const weekFactionCounts = new Map<string, Map<string, number>>();
  for (const { eventDate, faction } of placements) {
    const weekKey = getMondayOf(new Date(eventDate + "T00:00:00")).toISOString().slice(0, 10);
    if (!weekFactionCounts.has(weekKey)) weekFactionCounts.set(weekKey, new Map());
    const factionMap = weekFactionCounts.get(weekKey)!;
    factionMap.set(faction, (factionMap.get(faction) ?? 0) + 1);
  }

  let weeks = [...pastWeeks, currentMondayStr];
  const factions = PRIMARY_FACTIONS.map((faction) => ({
    name: faction.name,
    counts: weeks.map((week) => weekFactionCounts.get(week)?.get(faction.name) ?? 0),
  }));

  while (weeks.length > 0 && factions.every((faction) => faction.counts[weeks.length - 1] === 0)) {
    weeks = weeks.slice(0, -1);
    for (const faction of factions) faction.counts.pop();
  }

  return Response.json({ weeks, factions });
}
