import { neon } from '@neondatabase/serverless';
import type { TopPlacement, ArmyList } from './types';

type SqlFn = ReturnType<typeof neon>;
type Row = Record<string, unknown>;

let _sql: SqlFn | null = null;
let _initialized = false;

function getDb(): SqlFn | null {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  _sql = neon(url);
  return _sql;
}

export async function initDb(): Promise<void> {
  if (_initialized) return;
  const sql = getDb();
  if (!sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS cached_top_placements (
        event_id   INTEGER NOT NULL,
        place      INTEGER NOT NULL,
        player     TEXT    NOT NULL,
        faction    TEXT    NOT NULL,
        player_id  INTEGER NOT NULL,
        has_list   BOOLEAN NOT NULL,
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (event_id, place)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS cached_army_lists (
        player_id  INTEGER NOT NULL,
        event_id   INTEGER NOT NULL,
        data       JSONB,
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (player_id, event_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS faction_week_counts (
        week_start   DATE    NOT NULL,
        faction_name TEXT    NOT NULL,
        count        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY  (week_start, faction_name)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS cached_events (
        event_id     INTEGER PRIMARY KEY,
        event_date   DATE    NOT NULL,
        player_count INTEGER NOT NULL,
        name         TEXT    NOT NULL
      )
    `;
    _initialized = true;
  } catch {
    // DB unreachable — app continues without caching
  }
}

export async function getEventIdsWithCachedPlacements(
  eventIds: number[]
): Promise<Set<number>> {
  const sql = getDb();
  if (!sql || eventIds.length === 0) return new Set();
  try {
    const rows = (await sql`
      SELECT DISTINCT event_id
      FROM cached_top_placements
      WHERE event_id = ANY(${eventIds})
    `) as Row[];
    return new Set(rows.map((r) => r.event_id as number));
  } catch {
    return new Set();
  }
}

// Returns null when not cached or stale (> 7 days old).
export async function getCachedTopPlacements(eventId: number): Promise<TopPlacement[] | null> {
  const sql = getDb();
  if (!sql) return null;
  try {
    const rows = (await sql`
      SELECT place, player, faction, player_id, has_list
      FROM cached_top_placements
      WHERE event_id = ${eventId}
        AND fetched_at > NOW() - INTERVAL '7 days'
      ORDER BY place ASC
    `) as Row[];
    if (rows.length === 0) return null;
    return rows.map(row => ({
      place: row.place as number,
      player: row.player as string,
      faction: row.faction as string,
      playerId: row.player_id as number,
      eventId,
      hasList: row.has_list as boolean,
    }));
  } catch {
    return null;
  }
}

export async function setCachedTopPlacements(eventId: number, placements: TopPlacement[]): Promise<void> {
  const sql = getDb();
  if (!sql || placements.length === 0) return;
  try {
    for (const p of placements) {
      await sql`
        INSERT INTO cached_top_placements (event_id, place, player, faction, player_id, has_list)
        VALUES (${eventId}, ${p.place}, ${p.player}, ${p.faction}, ${p.playerId}, ${p.hasList})
        ON CONFLICT (event_id, place) DO UPDATE SET
          player     = EXCLUDED.player,
          faction    = EXCLUDED.faction,
          player_id  = EXCLUDED.player_id,
          has_list   = EXCLUDED.has_list,
          fetched_at = NOW()
      `;
    }
  } catch { /* ignore — scraping already succeeded */ }
}

// Returns undefined when not in cache; null when cached as "no list"; ArmyList on hit.
export async function getCachedArmyList(
  playerId: number,
  eventId: number
): Promise<ArmyList | null | undefined> {
  const sql = getDb();
  if (!sql) return undefined;
  try {
    const rows = (await sql`
      SELECT data FROM cached_army_lists
      WHERE player_id = ${playerId} AND event_id = ${eventId}
    `) as Row[];
    if (rows.length === 0) return undefined;
    return rows[0].data as ArmyList | null;
  } catch {
    return undefined;
  }
}

export async function upsertCachedEvents(
  events: { id: number; name: string; date: string; playerCount: number }[]
): Promise<void> {
  const sql = getDb();
  if (!sql || events.length === 0) return;
  try {
    for (const event of events) {
      await sql`
        INSERT INTO cached_events (event_id, event_date, player_count, name)
        VALUES (${event.id}, ${event.date}, ${event.playerCount}, ${event.name})
        ON CONFLICT (event_id) DO NOTHING
      `;
    }
  } catch { /* ignore */ }
}

export async function getEventsByDateAndMinPlayers(
  dateFrom: string,
  minPlayers: number
): Promise<{ id: number; name: string; date: string; playerCount: number }[]> {
  const sql = getDb();
  if (!sql) return [];
  try {
    const rows = (await sql`
      SELECT event_id, name, event_date::text AS date, player_count
      FROM cached_events
      WHERE event_date >= ${dateFrom}
        AND player_count >= ${minPlayers}
      ORDER BY event_date DESC
    `) as Row[];
    return rows.map((row) => ({
      id: row.event_id as number,
      name: row.name as string,
      date: row.date as string,
      playerCount: row.player_count as number,
    }));
  } catch {
    return [];
  }
}

export async function getPlacementsWithDates(
  dateFrom: string
): Promise<{ eventDate: string; faction: string }[]> {
  const sql = getDb();
  if (!sql) return [];
  try {
    const rows = (await sql`
      SELECT e.event_date::text AS event_date, p.faction
      FROM cached_events e
      JOIN cached_top_placements p ON p.event_id = e.event_id
      WHERE e.event_date >= ${dateFrom}
    `) as Row[];
    return rows.map((row) => ({
      eventDate: row.event_date as string,
      faction: row.faction as string,
    }));
  } catch {
    return [];
  }
}

export interface FactionWeekRow {
  weekStart: string;
  factionName: string;
  count: number;
}

export async function getCachedFactionWeekCounts(dateFrom: string): Promise<FactionWeekRow[]> {
  const sql = getDb();
  if (!sql) return [];
  try {
    const rows = (await sql`
      SELECT week_start::text AS week_start, faction_name, count
      FROM faction_week_counts
      WHERE week_start >= ${dateFrom}
    `) as Row[];
    return rows.map((row) => ({
      weekStart: row.week_start as string,
      factionName: row.faction_name as string,
      count: row.count as number,
    }));
  } catch {
    return [];
  }
}

export async function setCachedFactionWeekCounts(entries: FactionWeekRow[]): Promise<void> {
  const sql = getDb();
  if (!sql || entries.length === 0) return;
  try {
    for (const entry of entries) {
      await sql`
        INSERT INTO faction_week_counts (week_start, faction_name, count)
        VALUES (${entry.weekStart}, ${entry.factionName}, ${entry.count})
        ON CONFLICT (week_start, faction_name) DO NOTHING
      `;
    }
  } catch { /* ignore */ }
}

export async function setCachedArmyList(
  playerId: number,
  eventId: number,
  list: ArmyList | null
): Promise<void> {
  const sql = getDb();
  if (!sql) return;
  const data = list !== null ? JSON.stringify(list) : null;
  try {
    await sql`
      INSERT INTO cached_army_lists (player_id, event_id, data)
      VALUES (${playerId}, ${eventId}, ${data})
      ON CONFLICT (player_id, event_id) DO UPDATE SET
        data       = EXCLUDED.data,
        fetched_at = NOW()
    `;
  } catch { /* ignore — scraping already succeeded */ }
}
