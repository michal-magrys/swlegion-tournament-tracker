"use client";

import { useState, useCallback, useRef } from "react";
import type { Tournament } from "@/lib/types";

const FACTIONS = [
  { code: "rebellion", name: "Rebel Alliance" },
  { code: "galactic_empire", name: "Galactic Empire" },
  { code: "grand_army_republic", name: "Grand Army of the Republic" },
  { code: "confederacy", name: "Confederacy of Independent Systems" },
  { code: "shadow_collective", name: "Shadow Collective" },
];

const DATE_RANGES = [
  { label: "Last month", months: 1 },
  { label: "Last 3 months", months: 3 },
  { label: "Last 6 months", months: 6 },
  { label: "Last year", months: 12 },
];

const MIN_PLAYERS_OPTIONS = [8, 10, 16, 20, 32];

function getDateFrom(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
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
  const [dateRange, setDateRange] = useState(1);
  const [minPlayers, setMinPlayers] = useState(10);
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
        return;
      }
      setStatus("Network error.");
    } finally {
      setLoading(false);
    }
  }, [faction, dateRange, minPlayers]);

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
                {FACTIONS.map((f) => (
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
                {DATE_RANGES.map((d) => (
                  <option key={d.months} value={d.months}>
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

            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded bg-yellow-500 px-5 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
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
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function TournamentCard({
  tournament,
  highlightFaction,
}: {
  tournament: Tournament;
  highlightFaction: string;
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
          return (
            <div
              key={p.place}
              className={`rounded px-3 py-2 text-xs ${
                isHighlight
                  ? "bg-yellow-500/10 border border-yellow-500/30"
                  : "bg-gray-800/50 border border-gray-800"
              }`}
            >
              <div className="text-gray-500 mb-0.5">
                {p.place === 1 ? "1st" : p.place === 2 ? "2nd" : "3rd"}
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
