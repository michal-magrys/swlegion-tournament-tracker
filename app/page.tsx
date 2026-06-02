"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Tournament, TopPlacement, ArmyList, StreamMessage } from "@/lib/types";
import { FilterPanel } from "./components/FilterPanel";
import { TournamentCard } from "./components/TournamentCard";
import { ArmyListModal } from "./components/ArmyListModal";
import { UnitFrequencyPanel } from "./components/UnitFrequencyPanel";
import { FactionTrendsChart } from "./components/FactionTrendsChart";
import { FACTIONS, DATE_RANGES, MIN_PLAYERS_OPTIONS, getDateFrom, type FilterParams } from "./components/constants";

function seenStorageKey(filterParams: FilterParams): string {
  return `legion_seen_${filterParams.faction}_${filterParams.dateRangeIndex}_${filterParams.minPlayers}_${filterParams.pointFormat}`;
}

function loadSeenIds(filterParams: FilterParams): Set<number> {
  try {
    const raw = localStorage.getItem(seenStorageKey(filterParams));
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(filterParams: FilterParams, ids: Set<number>): void {
  try {
    localStorage.setItem(seenStorageKey(filterParams), JSON.stringify([...ids]));
  } catch { /* quota exceeded or private browsing */ }
}

type Tab = "search" | "trends";

function tabFromSearchString(search: string): Tab {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "trends" ? "trends" : "search";
}

const DEFAULT_PARAMS: FilterParams = {
  faction: "galactic_empire",
  dateRangeIndex: 0,
  minPlayers: 8,
  pointFormat: "1000",
};

function paramsFromSearchString(search: string): FilterParams {
  const searchParams = new URLSearchParams(search);
  const result = { ...DEFAULT_PARAMS };

  const faction = searchParams.get("faction");
  if (faction && FACTIONS.some((factionOption) => factionOption.code === faction)) result.faction = faction;

  const rangeRaw = searchParams.get("range");
  if (rangeRaw !== null) {
    const rangeIndex = Number(rangeRaw);
    if (Number.isInteger(rangeIndex) && rangeIndex >= 0 && rangeIndex < DATE_RANGES.length) result.dateRangeIndex = rangeIndex;
  }

  const playersRaw = searchParams.get("players");
  if (playersRaw !== null) {
    const playerCount = Number(playersRaw);
    if ((MIN_PLAYERS_OPTIONS as readonly number[]).includes(playerCount)) result.minPlayers = playerCount;
  }

  const format = searchParams.get("format");
  if (format === "1000" || format === "600" || format === "all") result.pointFormat = format;

  return result;
}

export default function Home() {
  const [params, setParams] = useState<FilterParams>(DEFAULT_PARAMS);
  const [tab, setTab] = useState<Tab>("search");
  const [urlLoaded, setUrlLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Initialise tab, params, and admin flag from URL on first client render.
  useEffect(() => {
    const search = window.location.search;
    if (search) {
      setTab(tabFromSearchString(search));
      setParams(paramsFromSearchString(search));
      if (new URLSearchParams(search).get("admin") === "1") setIsAdmin(true);
    }
    setUrlLoaded(true);
  }, []);

  // Keep URL in sync with params and tab (skip until URL has been read to avoid overwrite).
  // Preserves admin=1 so the button survives tab/filter changes.
  useEffect(() => {
    if (!urlLoaded) return;
    const searchParams = new URLSearchParams({
      tab,
      faction: params.faction,
      range: String(params.dateRangeIndex),
      players: String(params.minPlayers),
      format: params.pointFormat,
    });
    if (isAdmin) searchParams.set("admin", "1");
    window.history.replaceState(null, "", `?${searchParams.toString()}`);
  }, [params, tab, urlLoaded, isAdmin]);

  const [results, setResults] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const previousSeenIdsRef = useRef<Set<number>>(new Set());

  const handleParamsChange = useCallback((update: Partial<FilterParams>) => {
    setParams((prev) => ({ ...prev, ...update }));
  }, []);

  const handleSearch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    previousSeenIdsRef.current = loadSeenIds(params);
    const collectedIds = new Set<number>();

    setLoading(true);
    setResults([]);
    setStatus("Starting search...");
    setProgress({ checked: 0, total: 0 });

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: getDateFrom(params.dateRangeIndex),
          minPlayers: params.minPlayers,
          faction: params.faction,
          pointFormat: params.pointFormat,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setStatus("Failed to fetch results.");
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as StreamMessage;
            switch (msg.type) {
              case "status":
                setStatus(msg.message);
                if (msg.total != null)
                  setProgress((prev) => ({ ...prev, total: msg.total! }));
                break;
              case "result":
                collectedIds.add(msg.tournament.id);
                setResults((prev) => [...prev, msg.tournament]);
                setProgress((prev) => ({ ...prev, checked: msg.checked }));
                break;
              case "progress":
                setProgress((prev) => ({ ...prev, checked: msg.checked }));
                break;
              case "done":
                saveSeenIds(params, collectedIds);
                setStatus("");
                break;
              case "error":
                setStatus(`Error: ${msg.message}`);
                break;
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("");
        return;
      }
      setStatus("Network error.");
    } finally {
      setLoading(false);
    }
  }, [params]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const autoSearchedRef = useRef(false);
  useEffect(() => {
    if (!urlLoaded || autoSearchedRef.current) return;
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.delete("admin");
    if (searchParams.toString() && tabFromSearchString(window.location.search) === "search") {
      autoSearchedRef.current = true;
      handleSearch();
    }
  }, [urlLoaded, handleSearch]);

  const [listModal, setListModal] = useState<{
    placement: TopPlacement;
    list: ArmyList | null;
    loading: boolean;
    error: string;
  } | null>(null);

  const handleCloseModal = useCallback(() => setListModal(null), []);

  const handlePlacementClick = useCallback(async (placement: TopPlacement) => {
    if (!placement.hasList) return;

    setListModal({ placement, list: null, loading: true, error: "" });

    try {
      const res = await fetch(
        `/api/list?player=${placement.playerId}&event=${placement.eventId}`
      );
      if (!res.ok) {
        setListModal((prev) =>
          prev ? { ...prev, loading: false, error: "Failed to load army list." } : null
        );
        return;
      }
      const data: ArmyList = await res.json();
      setListModal((prev) =>
        prev ? { ...prev, list: data, loading: false } : null
      );
    } catch {
      setListModal((prev) =>
        prev ? { ...prev, loading: false, error: "Network error." } : null
      );
    }
  }, []);

  const factionName =
    FACTIONS.find((faction) => faction.code === params.faction)?.name ?? params.faction;

  const [crawlStatus, setCrawlStatus] = useState<{ running: boolean; result: string }>({
    running: false,
    result: "",
  });

  const handleCrawl = useCallback(async () => {
    setCrawlStatus({ running: true, result: "" });
    try {
      const res = await fetch("/api/admin/crawl", { method: "POST" });
      const json = await res.json() as { total: number; crawled: number; skipped: number };
      setCrawlStatus({ running: false, result: `Done — ${json.crawled} crawled, ${json.skipped} skipped (${json.total} total)` });
    } catch {
      setCrawlStatus({ running: false, result: "Error triggering crawl." });
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#0d0d14]">
        <div className="mx-auto max-w-4xl px-4 py-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-yellow-400">
              Legion Tournament Crawler
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Find Star Wars: Legion tournaments where a faction placed in the top 3
            </p>
          </div>
          {isAdmin && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                onClick={handleCrawl}
                disabled={crawlStatus.running}
                className="px-3 py-1.5 text-xs font-medium rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {crawlStatus.running ? "Crawling…" : "Run crawl"}
              </button>
              {crawlStatus.result && (
                <span className="text-xs text-gray-500">{crawlStatus.result}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-800 bg-[#0d0d14]">
        <div className="mx-auto max-w-4xl px-4 flex">
          {(["search", "trends"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-yellow-400 text-yellow-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "search" ? "Search" : "Trends"}
            </button>
          ))}
        </div>
      </div>

      {tab === "search" && (
        <>
          <FilterPanel
            params={params}
            loading={loading}
            onChange={handleParamsChange}
            onSearch={handleSearch}
            onCancel={handleCancel}
          />

          {/* Progress */}
          {(loading || status) && (
            <div className="mx-auto max-w-4xl px-4 pt-4">
              <div className="rounded bg-gray-900/50 border border-gray-800 px-4 py-3 text-sm text-gray-300">
                {status && <p>{status}</p>}
                {loading && progress.total > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Checking tournaments...</span>
                      <span>
                        {progress.checked} / {progress.total}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        role="progressbar"
                        aria-valuenow={progress.checked}
                        aria-valuemin={0}
                        aria-valuemax={progress.total}
                        className="h-full rounded-full bg-yellow-500 transition-all duration-300"
                        style={{
                          width: `${(progress.checked / progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results */}
          <div className="mx-auto max-w-4xl px-4 py-6">
            {!loading && results.length === 0 && progress.checked > 0 && (
              <p className="text-center text-gray-500 py-12">
                No tournaments found with {factionName} in the top 3.
              </p>
            )}

            {results.length > 0 && (
              <>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">
                  {results.length} tournament{results.length !== 1 ? "s" : ""} with{" "}
                  {factionName} in top 3
                  {(() => {
                    const newCount = results.filter(
                      (tournament) => !previousSeenIdsRef.current.has(tournament.id)
                    ).length;
                    return newCount > 0 ? (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 normal-case tracking-normal align-middle">
                        {newCount} new
                      </span>
                    ) : null;
                  })()}
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  {(() => {
                    const counts: Record<number, number> = {};
                    for (const tournament of results) {
                      for (const placement of tournament.topThree) {
                        if (placement.faction.toLowerCase() === factionName.toLowerCase()) {
                          counts[placement.place] = (counts[placement.place] ?? 0) + 1;
                        }
                      }
                    }
                    return [1, 2, 3]
                      .filter((place) => counts[place])
                      .map((place) => `${place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}: ${counts[place]}`)
                      .join(" · ");
                  })()}
                </p>
                <div className="space-y-3">
                  {results.map((tournament) => (
                    <TournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      highlightFaction={factionName}
                      onPlacementClick={handlePlacementClick}
                      isNew={!previousSeenIdsRef.current.has(tournament.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <UnitFrequencyPanel
            results={results}
            factionName={factionName}
            searchLoading={loading}
          />
        </>
      )}

      {tab === "trends" && <FactionTrendsChart />}

      {/* Army List Modal */}
      {listModal && (
        <ArmyListModal
          placement={listModal.placement}
          list={listModal.list}
          loading={listModal.loading}
          error={listModal.error}
          onClose={handleCloseModal}
        />
      )}
    </main>
  );
}
