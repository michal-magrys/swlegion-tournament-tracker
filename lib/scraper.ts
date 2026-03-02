import * as cheerio from "cheerio";
import { factionCodeToName } from "./factions";
import type { Tournament, TopPlacement, ArmyList, SearchParams } from "./types";

const BASE_URL = "https://legion.longshanks.org";

interface RawEvent {
  id: number;
  name: string;
  date: string;
  playerCount: number;
}

/**
 * Fetch completed tournaments from the Longshanks events history page.
 * Paginates through pages until we pass the dateFrom cutoff.
 *
 * HTML structure (actual Longshanks markup):
 *   div.event_display.finished
 *     div.event_name > a[href="/event/{ID}/"]
 *     div.details > table > tr
 *       td > img[alt="Date"]  → sibling td contains "2026-01-25"
 *       td > img[alt="Event size"] → sibling td contains "8 players" or "10 of 12 players"
 */
export async function fetchEvents(
  dateFrom: string,
  minPlayers: number
): Promise<RawEvent[]> {
  const cutoff = new Date(dateFrom);
  const events: RawEvent[] = [];
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    const url = `${BASE_URL}/events/history/?type=tournament&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;

    const html = await res.text();
    const $ = cheerio.load(html);

    const entries = $(".event_display");
    if (entries.length === 0) break;

    let foundAnyAfterCutoff = false;

    entries.each((_, el) => {
      const $el = $(el);

      // Extract event ID from link
      const link =
        $el.find(".event_name a[href*='/event/']").first().attr("href") ?? "";
      const idMatch = link.match(/\/event\/(\d+)\//);
      if (!idMatch) return;
      const id = parseInt(idMatch[1], 10);

      // Extract name
      const name = $el.find(".event_name a").first().text().trim();

      // Extract date: find the row with the date glyph
      let date = "";
      $el.find('img[alt="Date"]').each((_, img) => {
        const text = $(img).closest("tr").find("td").last().text().trim();
        const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) date = dateMatch[1];
      });

      if (date && new Date(date) < cutoff) {
        return; // skip this event, continue checking the rest of the page
      }

      foundAnyAfterCutoff = true;

      // Extract player count: find the row with the event size glyph
      let playerCount = 0;
      $el.find('img[alt="Event size"]').each((_, img) => {
        const text = $(img).closest("tr").find("td").last().text().trim();
        // "8 players" or "10 of 12 players"
        const sizeMatch = text.match(/(\d+)(?:\s+of\s+\d+)?\s+players/i);
        if (sizeMatch) playerCount = parseInt(sizeMatch[1], 10);
      });

      if (playerCount >= minPlayers && date) {
        events.push({ id, name, date, playerCount });
      }
    });

    if (!foundAnyAfterCutoff) break; // stop only when the whole page is before cutoff
    page++;
  }

  return events;
}

/**
 * Fetch the top 3 placements from a tournament's standings page.
 *
 * HTML structure (actual Longshanks markup):
 *   div.ranking.event
 *     div.player#player_{USER_ID}    ← standing entry (NOT div.player.accordion)
 *       div.data
 *         div.name .player_disp .player_link  ← player name
 *         div.factions img.logo[src*="/factions/"] ← faction image
 */
export async function fetchTopThree(
  eventId: number
): Promise<TopPlacement[]> {
  const url = `${BASE_URL}/events/detail/panel_standings.php?event=${eventId}&section=player`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);

  const placements: TopPlacement[] = [];

  // Select only standing entries (have id="player_XXX"), skip accordion rows
  const playerDivs = $('div.player[id^="player_"]').toArray();

  for (let i = 0; i < Math.min(3, playerDivs.length); i++) {
    const $div = $(playerDivs[i]);

    // Extract player ID from div id attribute: id="player_37964" → 37964
    const divId = $div.attr("id") ?? "";
    const idMatch = divId.match(/^player_(\d+)$/);
    const playerId = idMatch ? parseInt(idMatch[1], 10) : 0;

    // Player name from the first .player_link inside .name
    const playerLink = $div.find(".name .player_link").first();
    const player = playerLink.text().trim();

    // Faction from the faction image in .factions
    let faction = "Unknown";
    const factionImg = $div.find('.factions img[src*="/factions/"]').first();
    if (factionImg.length > 0) {
      const src = factionImg.attr("src") ?? "";
      const codeMatch = src.match(/\/factions\/([^/.]+)\.png/);
      if (codeMatch) {
        faction = factionCodeToName(codeMatch[1]);
      }
    }

    // Detect if the player has uploaded an army list
    const hasList = $div.find('img[src*="list_code.png"]').length > 0;

    placements.push({ place: i + 1, player, faction, playerId, eventId, hasList });
  }

  return placements;
}

/**
 * Check a single tournament and return it as a Tournament if the faction
 * appears in the top 3, or null otherwise.
 */
export async function checkTournament(
  event: RawEvent,
  faction: string,
  pointFormat: SearchParams['pointFormat'] = 'all'
): Promise<Tournament | null> {
  const topThree = await fetchTopThree(event.id);
  if (topThree.length === 0) return null;

  // Step 1: is the faction in the top 3 at all?
  const factionPlacements = topThree.filter(
    (p) => p.faction.toLowerCase() === faction.toLowerCase()
  );
  if (factionPlacements.length === 0) return null;

  // Step 2: point format check — try all top-3 players to find a usable list.
  // hasList detection is unreliable, so attempt fetchArmyList for each player
  // and use the first one that returns a valid list.
  if (pointFormat !== 'all') {
    // Prefer faction placements first, then the rest.
    const candidates = [
      ...factionPlacements,
      ...topThree.filter((p) => p.faction.toLowerCase() !== faction.toLowerCase()),
    ];
    for (const candidate of candidates) {
      const armyList = await fetchArmyList(candidate.playerId, candidate.eventId);
      if (armyList !== null) {
        const is1000pt = armyList.points >= 800;
        if (pointFormat === '1000' && !is1000pt) return null;
        if (pointFormat === '600' && is1000pt) return null;
        break; // format determined, tournament passes
      }
    }
    // no list found from any top-3 player → fall through and include
  }

  return {
    id: event.id,
    name: event.name,
    date: event.date,
    playerCount: event.playerCount,
    url: `${BASE_URL}/event/${event.id}/`,
    topThree,
  };
}

/**
 * Fetch a player's army list from Longshanks.
 *
 * The pop_info.php endpoint returns a page with a hidden textarea containing
 * the list JSON. Longshanks uses "||" as line separators inside the textarea
 * instead of real newlines, so we must strip them before JSON.parse.
 */
export async function fetchArmyList(
  playerId: number,
  eventId: number
): Promise<ArmyList | null> {
  const url = `${BASE_URL}/admin/players/pop_info.php?player=${playerId}&event=${eventId}&tab=list`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  // Longshanks JSON uses "point" (singular); normalise to "points" for ArmyList.
  const normalise = (parsed: ReturnType<typeof JSON.parse>): ArmyList => {
    if (parsed.points === undefined && parsed.point !== undefined) {
      parsed.points = parsed.point;
    }
    return parsed as ArmyList;
  };

  // Method 1: Extract from the hidden textarea
  const textarea = $(`textarea#list_${playerId}`);
  if (textarea.length > 0) {
    // Longshanks embeds "||" as line separators in the JSON text — strip them
    const raw = textarea.text().replace(/\s*\|\|\s*/g, " ").trim();
    if (raw) {
      try { return normalise(JSON.parse(raw)); } catch { /* fall through */ }
    }
  }

  // Method 2: Fallback — extract JSON from raw HTML via bracket-counting.
  // Find the JSON object containing "armyFaction" and walk forward,
  // counting braces to locate the matching closing brace.
  const marker = '"armyFaction"';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  let startIdx = -1;
  for (let i = markerIdx - 1; i >= 0; i--) {
    if (html[i] === "{") {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return null;

  try {
    const jsonStr = html.substring(startIdx, endIdx + 1).replace(/\s*\|\|\s*/g, " ");
    return normalise(JSON.parse(jsonStr));
  } catch {
    return null;
  }
}
