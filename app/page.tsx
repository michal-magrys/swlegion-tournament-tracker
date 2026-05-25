"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Tournament, TopPlacement, ArmyList } from "@/lib/types";

const FACTIONS = [
  { code: "rebellion", name: "Rebel Alliance" },
  { code: "galactic_empire", name: "Galactic Empire" },
  { code: "grand_army_republic", name: "Grand Army of the Republic" },
  { code: "confederacy", name: "Confederacy of Independent Systems" },
  { code: "shadow_collective", name: "Shadow Collective" },
];

const SORTED_FACTIONS = [...FACTIONS].sort((a, b) => a.name.localeCompare(b.name));

// Date ranges: each item may use `days` or `months` for computing the from-date.
const DATE_RANGES = [
  { label: "Last week", days: 7 },
  { label: "Last month", months: 1 },
  { label: "Last 3 months", months: 3 },
  { label: "Last 6 months", months: 6 },
  { label: "Last year", months: 12 },
];

const MIN_PLAYERS_OPTIONS = [8, 10, 16, 20, 32];

const POINT_FORMATS = [
  { value: '1000', label: '1000 pts' },
  { value: '600', label: '600 pts' },
  { value: 'all', label: 'All formats' },
];

function getDateFrom(rangeIndex: number): string {
  const opts = DATE_RANGES[rangeIndex];
  const d = new Date();
  if (opts.days) {
    d.setDate(d.getDate() - opts.days);
    return d.toISOString().slice(0, 10);
  }
  // default to months
  d.setMonth(d.getMonth() - (opts.months ?? 0));
  return d.toISOString().slice(0, 10);
}

interface StreamMessage {
  type: "status" | "result" | "progress" | "done" | "error";
  message?: string;
  total?: number;
  tournament?: Tournament;
  checked?: number;
}

export default function Home() {
  const [faction, setFaction] = useState("galactic_empire");
  const [dateRange, setDateRange] = useState(0); // default: Last week
  const [minPlayers, setMinPlayers] = useState(8);
  const [pointFormat, setPointFormat] = useState<'1000' | '600' | 'all'>('1000');
  const [results, setResults] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

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
          dateFrom: getDateFrom(dateRange),
          minPlayers,
          faction,
          pointFormat,
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
            const msg: StreamMessage = JSON.parse(line);
            switch (msg.type) {
              case "status":
                setStatus(msg.message ?? "");
                if (msg.total)
                  setProgress((p) => ({ ...p, total: msg.total! }));
                break;
              case "result":
                if (msg.tournament) {
                  setResults((prev) => [...prev, msg.tournament!]);
                }
                if (msg.checked)
                  setProgress((p) => ({ ...p, checked: msg.checked! }));
                break;
              case "progress":
                if (msg.checked)
                  setProgress((p) => ({ ...p, checked: msg.checked! }));
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
  }, [faction, dateRange, minPlayers, pointFormat]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Army list modal state
  const [listModal, setListModal] = useState<{
    placement: TopPlacement;
    list: ArmyList | null;
    loading: boolean;
    error: string;
  } | null>(null);

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
    FACTIONS.find((f) => f.code === faction)?.name ?? faction;

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#0d0d14]">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-yellow-400">
            Legion Tournament Crawler
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Find Star Wars: Legion tournaments where a faction placed in the top
            3
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-gray-800 bg-[#0d0d14]/50">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Faction
              </label>
              <select
                value={faction}
                onChange={(e) => setFaction(e.target.value)}
                className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-yellow-500 focus:outline-none"
              >
                {SORTED_FACTIONS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Date range
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(Number(e.target.value))}
                className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-yellow-500 focus:outline-none"
              >
                {DATE_RANGES.map((d, i) => (
                  <option key={i} value={i}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Min players
              </label>
              <select
                value={minPlayers}
                onChange={(e) => setMinPlayers(Number(e.target.value))}
                className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-yellow-500 focus:outline-none"
              >
                {MIN_PLAYERS_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}+
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Points
              </label>
              <select
                value={pointFormat}
                onChange={(e) => setPointFormat(e.target.value as '1000' | '600' | 'all')}
                className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-yellow-500 focus:outline-none"
              >
                {POINT_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded bg-yellow-500 px-5 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
            {loading && (
              <button
                onClick={handleCancel}
                className="rounded bg-gray-700 px-5 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

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
              {results.map((t) => (
                <TournamentCard
                  key={t.id}
                  tournament={t}
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
          onClose={() => setListModal(null)}
        />
      )}
    </main>
  );
}

function TournamentCard({
  tournament,
  highlightFaction,
  onPlacementClick,
}: {
  tournament: Tournament;
  highlightFaction: string;
  onPlacementClick: (placement: TopPlacement) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <a
            href={tournament.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-400 hover:text-yellow-300 font-medium"
          >
            {tournament.name}
          </a>
          <div className="flex gap-3 mt-1 text-xs text-gray-500">
            <span>{tournament.date}</span>
            <span>{tournament.playerCount} players</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {tournament.topThree.map((p) => {
          const isHighlight =
            p.faction.toLowerCase() === highlightFaction.toLowerCase();
          const clickable = p.hasList;
          return (
            <div
              key={p.place}
              onClick={clickable ? () => onPlacementClick(p) : undefined}
              className={`rounded px-3 py-2 text-xs transition-colors ${
                isHighlight
                  ? "bg-yellow-500/10 border border-yellow-500/30"
                  : "bg-gray-800/50 border border-gray-800"
              } ${clickable ? "cursor-pointer hover:bg-gray-700/50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-500">
                  {p.place === 1 ? "1st" : p.place === 2 ? "2nd" : "3rd"}
                </span>
                {p.hasList && (
                  <span className="text-[10px] text-gray-500" title="Has army list">
                    LIST
                  </span>
                )}
              </div>
              <div className="font-medium text-gray-200 truncate">
                {p.player || "Unknown"}
              </div>
              <div
                className={`mt-0.5 truncate ${
                  isHighlight ? "text-yellow-400" : "text-gray-400"
                }`}
              >
                {p.faction}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArmyListModal({
  placement,
  list,
  loading,
  error,
  onClose,
}: {
  placement: TopPlacement;
  list: ArmyList | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-gray-700 bg-[#0d0d14] p-6 shadow-xl mx-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 text-lg leading-none"
        >
          &times;
        </button>

        <h3 className="text-yellow-400 font-semibold text-lg mb-1">
          {placement.player}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {placement.place === 1 ? "1st" : placement.place === 2 ? "2nd" : "3rd"} place &middot; {placement.faction}
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
            <svg
              className="animate-spin h-4 w-4 text-yellow-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading army list...
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm py-4 text-center">{error}</p>
        )}

        {list && (
          <div className="space-y-4 text-sm">
            {/* Summary */}
            <div className="flex gap-4 text-xs text-gray-400">
              <span>{list.points} pts</span>
              <span>{list.numActivations} activations</span>
            </div>

            {/* Units */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Units
              </h4>
              <div className="space-y-1.5">
                {list.units.map((u, i) => (
                  <div key={i} className="rounded bg-gray-800/50 px-3 py-2">
                    <div className="font-medium text-gray-200">
                      {u.count > 1 && <span className="text-gray-400">{u.count}× </span>}
                      {u.name}
                    </div>
                    {u.upgrades.length > 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {u.upgrades.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Command Cards */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Command Cards
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {list.commandCards.map((c, i) => (
                  <span
                    key={i}
                    className="rounded bg-gray-800/50 px-2 py-1 text-xs text-gray-300"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Battlefield Deck */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Battlefield Deck
              </h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-gray-500 mb-1">Objectives</div>
                  {list.battlefieldDeck.objective.map((o, i) => (
                    <div key={i} className="text-gray-300">{o}</div>
                  ))}
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Deployments</div>
                  {list.battlefieldDeck.deployment.map((d, i) => (
                    <div key={i} className="text-gray-300">{d}</div>
                  ))}
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Conditions</div>
                  {list.battlefieldDeck.conditions.map((c, i) => (
                    <div key={i} className="text-gray-300">{c}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* List Link */}
            {list.listlink && (
              <div className="pt-2 border-t border-gray-800">
                <a
                  href={list.listlink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-yellow-400 hover:text-yellow-300"
                >
                  View on Tabletop Admiral &rarr;
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
