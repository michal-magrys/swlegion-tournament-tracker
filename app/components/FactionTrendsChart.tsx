"use client";

import { memo, useState, useEffect, useRef } from "react";
import { getDateFrom } from "./constants";

const TRENDS_RANGE_INDEX = 3; // Last 6 months

interface FactionSeries {
  name: string;
  counts: number[];
}

interface TrendsData {
  weeks: string[];
  factions: FactionSeries[];
}

const FACTION_COLORS: Record<string, string> = {
  "Galactic Empire":                  "#94a3b8",
  "Rebel Alliance":                   "#f97316",
  "Grand Army of the Republic":       "#60a5fa",
  "Confederacy of Independent Systems": "#c084fc",
  "Mercenary":                        "#34d399",
};

function formatWeekLabel(weekStr: string): string {
  return new Date(weekStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const SVG_W = 600;
const SVG_H = 160;
const PAD = { left: 28, right: 16, top: 16, bottom: 32 };
const CHART_W = SVG_W - PAD.left - PAD.right;
const CHART_H = SVG_H - PAD.top - PAD.bottom;

export const FactionTrendsChart = memo(function FactionTrendsChart() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setData(null);
    setError("");
    setHoveredWeekIndex(null);

    (async () => {
      try {
        const dateFrom = getDateFrom(TRENDS_RANGE_INDEX);
        const res = await fetch(`/api/trends?dateFrom=${dateFrom}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load trends");
        const json: TrendsData = await res.json();
        if (!controller.signal.aborted) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  const hasData = data && data.weeks.length >= 2;

  const toX = (index: number) =>
    PAD.left + (index / (Math.max((data?.weeks.length ?? 2) - 1, 1))) * CHART_W;

  const maxY = hasData
    ? Math.max(...data.factions.flatMap((f) => f.counts), 1)
    : 1;

  const toY = (count: number) =>
    PAD.top + CHART_H - (count / maxY) * CHART_H;

  const yTicks = maxY <= 5
    ? Array.from({ length: maxY + 1 }, (_, i) => i)
    : [0, Math.round(maxY / 4), Math.round(maxY / 2), Math.round((maxY * 3) / 4), maxY];

  const labelStep = hasData ? Math.ceil(data.weeks.length / 8) : 1;

  return (
    <div className="border-b border-gray-800 bg-[#0d0d14]/30">
      <div className="mx-auto max-w-4xl px-4 py-4">
        <div className="mb-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Faction trends — last 6 months
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Weekly top-3 placements per faction across all tournaments in the database.
          </p>
        </div>

        {loading && (
          <div className="h-24 flex items-center justify-center text-sm text-gray-500">
            Loading trends...
          </div>
        )}

        {error && (
          <div className="h-24 flex items-center justify-center text-sm text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && !hasData && data && (
          <div className="h-24 flex items-center justify-center text-sm text-gray-500">
            Not enough data for this period.
          </div>
        )}

        {!loading && !error && hasData && (
          <>
            <div className="relative">
              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className="w-full"
                style={{ display: "block" }}
              >
                {/* Y-axis grid lines + labels */}
                {yTicks.map((tick) => {
                  const y = toY(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={PAD.left} y1={y}
                        x2={SVG_W - PAD.right} y2={y}
                        stroke="#1f2937" strokeWidth="1"
                      />
                      <text
                        x={PAD.left - 6} y={y}
                        textAnchor="end" dominantBaseline="middle"
                        fontSize="9" fill="#4b5563"
                      >
                        {tick}
                      </text>
                    </g>
                  );
                })}

                {/* Hover vertical line */}
                {hoveredWeekIndex !== null && (
                  <line
                    x1={toX(hoveredWeekIndex)} y1={PAD.top}
                    x2={toX(hoveredWeekIndex)} y2={PAD.top + CHART_H}
                    stroke="#374151" strokeWidth="1"
                  />
                )}

                {/* One polyline per faction */}
                {data.factions.map((faction) => {
                  const color = FACTION_COLORS[faction.name] ?? "#9ca3af";
                  const points = faction.counts
                    .map((count, i) => `${toX(i)},${toY(count)}`)
                    .join(" ");
                  return (
                    <polyline
                      key={faction.name}
                      points={points}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity="0.85"
                    />
                  );
                })}

                {/* Dots on hovered week only */}
                {hoveredWeekIndex !== null &&
                  data.factions.map((faction) => (
                    <circle
                      key={faction.name}
                      cx={toX(hoveredWeekIndex)}
                      cy={toY(faction.counts[hoveredWeekIndex])}
                      r={3.5}
                      fill={FACTION_COLORS[faction.name] ?? "#9ca3af"}
                    />
                  ))}

                {/* X-axis labels */}
                {data.weeks.map((week, i) => {
                  if (i % labelStep !== 0 && i !== data.weeks.length - 1) return null;
                  return (
                    <text
                      key={i}
                      x={toX(i)} y={SVG_H - 4}
                      textAnchor="middle" fontSize="9" fill="#4b5563"
                    >
                      {formatWeekLabel(week)}
                    </text>
                  );
                })}

                {/* Invisible hover target columns */}
                {data.weeks.map((_, i) => {
                  const weekXPositions = data.weeks.map((__, j) => toX(j));
                  const leftEdge =
                    i > 0 ? (weekXPositions[i - 1] + weekXPositions[i]) / 2 : PAD.left;
                  const rightEdge =
                    i < weekXPositions.length - 1
                      ? (weekXPositions[i] + weekXPositions[i + 1]) / 2
                      : SVG_W - PAD.right;
                  return (
                    <rect
                      key={i}
                      x={leftEdge} y={PAD.top}
                      width={rightEdge - leftEdge} height={CHART_H}
                      fill="transparent"
                      onMouseEnter={() => setHoveredWeekIndex(i)}
                      onMouseLeave={() => setHoveredWeekIndex(null)}
                      className="cursor-crosshair"
                    />
                  );
                })}
              </svg>

              {/* Tooltip */}
              {hoveredWeekIndex !== null && (() => {
                const xPct = (toX(hoveredWeekIndex) / SVG_W) * 100;
                const alignRight = xPct > 60;
                const activeFactions = data.factions
                  .filter((f) => f.counts[hoveredWeekIndex] > 0)
                  .sort((a, b) => b.counts[hoveredWeekIndex] - a.counts[hoveredWeekIndex]);
                return (
                  <div
                    className="absolute top-0 pointer-events-none text-xs bg-gray-900 border border-gray-700 rounded px-2.5 py-2 whitespace-nowrap"
                    style={{
                      left: `${xPct}%`,
                      transform: alignRight ? "translateX(-100%) translateX(-8px)" : "translateX(8px)",
                      marginTop: "4px",
                    }}
                  >
                    <div className="text-gray-400 font-medium mb-1.5">
                      {formatWeekLabel(data.weeks[hoveredWeekIndex])}
                    </div>
                    {activeFactions.length === 0 ? (
                      <div className="text-gray-600">No appearances</div>
                    ) : (
                      activeFactions.map((faction) => (
                        <div key={faction.name} className="flex items-center gap-2 leading-5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: FACTION_COLORS[faction.name] ?? "#9ca3af" }}
                          />
                          <span className="text-gray-300">{faction.name}</span>
                          <span
                            className="ml-auto pl-4 font-semibold"
                            style={{ color: FACTION_COLORS[faction.name] ?? "#9ca3af" }}
                          >
                            {faction.counts[hoveredWeekIndex]}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {data.factions.map((faction) => (
                <div key={faction.name} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span
                    className="inline-block w-3 h-1.5 rounded-full"
                    style={{ backgroundColor: FACTION_COLORS[faction.name] ?? "#9ca3af" }}
                  />
                  {faction.name}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
