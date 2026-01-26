import * as cheerio from "cheerio";
import { factionCodeToName } from "./factions";
import type { Tournament, TopPlacement } from "./types";

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

    let passedCutoff = false;

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
        passedCutoff = true;
        return false; // break .each()
      }

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

    if (passedCutoff) break;
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

    placements.push({ place: i + 1, player, faction });
  }

  return placements;
}

/**
 * Check a single tournament and return it as a Tournament if the faction
 * appears in the top 3, or null otherwise.
 */
export async function checkTournament(
  event: RawEvent,
  faction: string
): Promise<Tournament | null> {
  const topThree = await fetchTopThree(event.id);
  if (topThree.length === 0) return null;

  const factionInTop3 = topThree.some(
    (p) => p.faction.toLowerCase() === faction.toLowerCase()
  );

  if (!factionInTop3) return null;

  return {
    id: event.id,
    name: event.name,
    date: event.date,
    playerCount: event.playerCount,
    url: `${BASE_URL}/event/${event.id}/`,
    topThree,
  };
}
