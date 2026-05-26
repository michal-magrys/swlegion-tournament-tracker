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
    _initialized = true;
  } catch {
    // DB unreachable — app continues without caching
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
