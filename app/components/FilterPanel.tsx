"use client";

import { memo } from "react";
import {
  SORTED_FACTIONS,
  DATE_RANGES,
  MIN_PLAYERS_OPTIONS,
  POINT_FORMATS,
  SELECT_CLS,
  type FilterParams,
} from "./constants";

interface FilterPanelProps {
  params: FilterParams;
  loading: boolean;
  onChange: (update: Partial<FilterParams>) => void;
  onSearch: () => void;
  onCancel: () => void;
}

export const FilterPanel = memo(function FilterPanel({
  params,
  loading,
  onChange,
  onSearch,
  onCancel,
}: FilterPanelProps) {
  return (
    <div className="border-b border-gray-800 bg-[#0d0d14]/50">
      <div className="mx-auto max-w-4xl px-4 py-4">
        <div className="flex flex-wrap items-end gap-4">

          <div className="flex flex-col gap-1">
            <label
              htmlFor="faction-select"
              className="text-xs font-medium text-gray-400 uppercase tracking-wider"
            >
              Faction
            </label>
            <select
              id="faction-select"
              value={params.faction}
              onChange={(e) => onChange({ faction: e.target.value })}
              className={SELECT_CLS}
            >
              {SORTED_FACTIONS.map((faction) => (
                <option key={faction.code} value={faction.code}>
                  {faction.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="date-range-select"
              className="text-xs font-medium text-gray-400 uppercase tracking-wider"
            >
              Date range
            </label>
            <select
              id="date-range-select"
              value={params.dateRangeIndex}
              onChange={(e) => onChange({ dateRangeIndex: Number(e.target.value) })}
              className={SELECT_CLS}
            >
              {DATE_RANGES.map((range, index) => (
                <option key={index} value={index}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="min-players-select"
              className="text-xs font-medium text-gray-400 uppercase tracking-wider"
            >
              Min players
            </label>
            <select
              id="min-players-select"
              value={params.minPlayers}
              onChange={(e) => onChange({ minPlayers: Number(e.target.value) })}
              className={SELECT_CLS}
            >
              {MIN_PLAYERS_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}+
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="point-format-select"
              className="text-xs font-medium text-gray-400 uppercase tracking-wider"
            >
              Points
            </label>
            <select
              id="point-format-select"
              value={params.pointFormat}
              onChange={(e) =>
                onChange({ pointFormat: e.target.value as FilterParams["pointFormat"] })
              }
              className={SELECT_CLS}
            >
              {POINT_FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onSearch}
            disabled={loading}
            className="rounded bg-yellow-500 px-5 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Searching..." : "Search"}
          </button>
          {loading && (
            <button
              onClick={onCancel}
              className="rounded bg-gray-700 px-5 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          )}

        </div>
      </div>
    </div>
  );
});
