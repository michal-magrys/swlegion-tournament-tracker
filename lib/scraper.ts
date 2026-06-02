import * as cheerio from "cheerio";
import { factionCodeToName } from "./factions";
import type { Tournament, TopPlacement, ArmyList, PointFormat } from "./types";
import {
  getCachedTopPlacements,
  setCachedTopPlacements,
  getCachedArmyList,
  setCachedArmyList,
} from "./db";

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
    let res: Response;
    try { res = await fetch(url); } catch (err) { console.error("fetchEvents network error:", err); break; }
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
function normalizeFactionName(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "Unknown";
  if (/mercenaries?/i.test(normalized)) return "Mercenary";
  return normalized;
}

export async function fetchTopThree(
  eventId: number
): Promise<TopPlacement[]> {
  const cached = await getCachedTopPlacements(eventId);
  if (cached !== null) return cached;

  const url = `${BASE_URL}/events/detail/panel_standings.php?event=${eventId}&section=player`;
  let res: Response;
  try { res = await fetch(url); } catch (err) { console.error(`fetchTopThree network error (event ${eventId}):`, err); return []; }
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
    const idMatch = divId.match(/^player_c?(\d+)$/);
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
    } else {
      const awardLogo = $div.find('.factions .logo.award').first();
      const awardTitle = awardLogo.attr("title")?.trim();
      if (awardTitle) {
        faction = normalizeFactionName(awardTitle);
      } else if (awardLogo.length > 0) {
        const awardText = awardLogo.text().trim();
        if (awardText) faction = normalizeFactionName(awardText);
      }
    }

    // Detect if the player has uploaded an army list
    const hasList = $div.find('img[src*="list_code.png"]').length > 0;

    placements.push({ place: i + 1, player, faction, playerId, eventId, hasList });
  }

  await setCachedTopPlacements(eventId, placements);
  return placements;
}

/**
 * Check a single tournament and return it as a Tournament if the faction
 * appears in the top 3, or null otherwise.
 */
export async function checkTournament(
  event: RawEvent,
  faction: string,
  pointFormat: PointFormat = 'all'
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
 * Tries three approaches in order:
 *   1. New HTML format: parse the `table.legion_list` rendered server-side
 *   2. Old textarea format: JSON embedded in `<textarea id="list_{playerId}">`
 *   3. Old bracket-count format: JSON containing "armyFaction" extracted from raw HTML
 */
export async function fetchArmyList(
  playerId: number,
  eventId: number
): Promise<ArmyList | null> {
  const cached = await getCachedArmyList(playerId, eventId);
  if (cached !== undefined) return cached;

  const result = await scrapeArmyList(playerId, eventId);
  await setCachedArmyList(playerId, eventId, result);
  return result;
}

async function scrapeArmyList(
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

  // Method 1: New HTML table format (current Longshanks format)
  if ($("table.legion_list").length > 0) {
    const tableEl = $("table.legion_list").first();

    // Faction: row[1] of the table holds it as plain text in this format.
    // Fall back to a global faction image only if the text row is absent.
    let armyFaction = tableEl.find("tr").eq(1).find("td, th").first().text().trim();
    if (!armyFaction) {
      armyFaction = tableEl.find('img[src*="/factions/"]').first().attr("title") ?? "";
      if (!armyFaction) {
        const src = tableEl.find('img[src*="/factions/"]').first().attr("src") ?? "";
        const codeMatch = src.match(/\/factions\/([^/.]+)\.png/);
        if (codeMatch) armyFaction = factionCodeToName(codeMatch[1]);
      }
    }

    // Points and activations — scope to the table to avoid matching unrelated page text.
    let points = 0;
    let numActivations = 0;
    const tableText = tableEl.text();
    const pointsMatch = tableText.match(/(\d+)\s+points/i);
    if (pointsMatch) points = parseInt(pointsMatch[1], 10);
    const activationsMatch = tableText.match(/(\d+)\s+activations/i);
    if (activationsMatch) numActivations = parseInt(activationsMatch[1], 10);

    // If points not found in table text, fall back to the textarea JSON ("point" singular)
    if (points === 0) {
      const textarea = $(`textarea#list_${playerId}`);
      if (textarea.length > 0) {
        try {
          const raw = textarea.text().replace(/\s*\|\|\s*/g, " ").trim();
          const parsed = JSON.parse(raw);
          if (parsed.point !== undefined) points = parsed.point;
          else if (parsed.points !== undefined) points = parsed.points;
        } catch { /* ignore */ }
      }
    }

    // Units: td[0] contains the name as a direct text node and upgrades in a <ul><li>
    // td[1] contains the quantity, e.g. "x2"
    const units: { name: string; count: number; upgrades: string[] }[] = [];
    $("tr.unit").each((_, row) => {
      const $cell = $(row).find("td").eq(0);
      if ($cell.length === 0) return;

      // Name = direct text nodes only (strip <ul> child content)
      const name = $cell.clone().children().remove().end().text().trim();
      // Upgrades = <li> items inside the cell
      const upgrades = $cell.find("li").toArray().map((li) => $(li).text().trim()).filter(Boolean);
      // Count = td[1] text, e.g. "x2"
      const countText = $(row).find("td").eq(1).text().trim();
      const count = parseInt(countText.replace(/^x/i, ""), 10) || 1;

      if (name) {
        units.push({ name, count, upgrades });
      } else if (units.length > 0) {
        units[units.length - 1].upgrades.push(...upgrades);
      }
    });

    // Command cards — may be hidden or listed as <li> items
    const commandCards = $("tr.command")
      .toArray()
      .flatMap((row) => {
        const $td = $(row).find("td").eq(0);
        const liItems = $td.find("li").toArray().map((li) => $(li).text().trim()).filter(Boolean);
        if (liItems.length > 0) return liItems;
        const text = $td.text().trim();
        return text ? [text] : [];
      });

    // Battlefield deck — cards are listed as <li> items
    const conditions = $("tr.condition")
      .toArray()
      .flatMap((row) => $(row).find("td").eq(0).find("li").toArray().map((li) => $(li).text().trim()))
      .filter(Boolean);
    const deployment = $("tr.deployment")
      .toArray()
      .flatMap((row) => $(row).find("td").eq(0).find("li").toArray().map((li) => $(li).text().trim()))
      .filter(Boolean);
    const objective = $("tr.objective")
      .toArray()
      .flatMap((row) => $(row).find("td").eq(0).find("li").toArray().map((li) => $(li).text().trim()))
      .filter(Boolean);

    const listlink = $('a[href*="tabletopadmiral"]').first().attr("href") ?? "";

    return {
      points,
      numActivations,
      armyFaction,
      commandCards,
      units,
      battlefieldDeck: { conditions, deployment, objective },
      listlink,
    };
  }

  // Method 2: Old textarea format
  const textarea = $(`textarea#list_${playerId}`);
  if (textarea.length > 0) {
    const raw = textarea.text().replace(/\s*\|\|\s*/g, " ").trim();
    if (raw) {
      try { return normalise(JSON.parse(raw)); } catch { /* fall through */ }
    }
  }

  // Method 3: Fallback — extract JSON from raw HTML via bracket-counting.
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
