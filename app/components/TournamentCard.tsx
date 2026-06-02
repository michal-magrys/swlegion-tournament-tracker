"use client";

import type { Tournament, TopPlacement } from "@/lib/types";

interface TournamentCardProps {
  tournament: Tournament;
  highlightFaction: string;
  onPlacementClick: (placement: TopPlacement) => void;
}

function ordinal(place: number): string {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  return "3rd";
}

export function TournamentCard({
  tournament,
  highlightFaction,
  onPlacementClick,
}: TournamentCardProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <a
            href={tournament.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-400 hover:text-yellow-300 font-medium"
            aria-label={`${tournament.name} (opens in new tab)`}
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
        {tournament.topThree.map((placement) => {
          const isHighlight =
            placement.faction.toLowerCase() === highlightFaction.toLowerCase();
          const clickable = placement.hasList;
          return (
            <div
              key={placement.place}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onPlacementClick(placement) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPlacementClick(placement);
                      }
                    }
                  : undefined
              }
              className={`rounded px-3 py-2 text-xs transition-colors ${
                isHighlight
                  ? "bg-yellow-500/10 border border-yellow-500/30"
                  : "bg-gray-800/50 border border-gray-800"
              } ${
                clickable
                  ? "cursor-pointer hover:bg-gray-700/50 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{ordinal(placement.place)}</span>
                {placement.hasList && (
                  <span className="text-[10px] text-gray-500" title="Has army list">
                    LIST
                  </span>
                )}
              </div>
              <div
                className="font-medium text-gray-200 truncate"
                title={placement.player || undefined}
              >
                {placement.player || "Unknown"}
              </div>
              <div
                className={`mt-0.5 truncate ${
                  isHighlight ? "text-yellow-400" : "text-gray-400"
                }`}
              >
                {placement.faction}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
