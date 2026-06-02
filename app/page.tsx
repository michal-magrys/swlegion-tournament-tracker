"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Tournament, TopPlacement, ArmyList, StreamMessage } from "@/lib/types";
import { FilterPanel } from "./components/FilterPanel";
import { TournamentCard } from "./components/TournamentCard";
import { ArmyListModal } from "./components/ArmyListModal";
import { FACTIONS, DATE_RANGES, MIN_PLAYERS_OPTIONS, getDateFrom, type FilterParams } from "./components/constants";

// Captured before any React effects run — used to initialise state from a
// shared/bookmarked URL without risking the write effect overwriting it first.
const INITIAL_SEARCH = typeof window !== "undefined" ? window.location.search : "";

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
  // Lazy initialiser reads from the URL captured at module load — safe against
  // the write effect overwriting it before this runs.
  const [params, setParams] = useState<FilterParams>(() => paramsFromSearchString(INITIAL_SEARCH));

  // Keep URL in sync with params (runs on every change, including initial render).
  useEffect(() => {
    const searchParams = new URLSearchParams({
      faction: params.faction,
      range: String(params.dateRangeIndex),
      players: String(params.minPlayers),
      format: params.pointFormat,
    });
    window.history.replaceState(null, "", `?${searchParams.toString()}`);
  }, [params]);

  const [results, setResults] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const handleParamsChange = useCallback((update: Partial<FilterParams>) => {
    setParams((prev) => ({ ...prev, ...update }));
  }, []);

  const handleSearch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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
                setResults((prev) => [...prev, msg.tournament]);
                setProgress((prev) => ({ ...prev, checked: msg.checked }));
                break;
              case "progress":
                setProgress((prev) => ({ ...prev, checked: msg.checked }));
                break;
              case "done":
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
    if (INITIAL_SEARCH && !autoSearchedRef.current) {
      autoSearchedRef.current = true;
      handleSearch();
    }
  }, [handleSearch]);

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

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#0d0d14]">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-yellow-400">
            Legion Tournament Crawler
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Find Star Wars: Legion tournaments where a faction placed in the top 3
          </p>
        </div>
      </div>

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
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
              {results.length} tournament{results.length !== 1 ? "s" : ""} with{" "}
              {factionName} in top 3
            </h2>
            <div className="space-y-3">
              {results.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  highlightFaction={factionName}
                  onPlacementClick={handlePlacementClick}
                />
              ))}
            </div>
          </>
        )}
      </div>

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
