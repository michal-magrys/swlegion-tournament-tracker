"use client";

import { memo, useState, useEffect, useRef } from "react";
import type { Tournament, ArmyList, UnitFrequency } from "@/lib/types";

interface FrequencyState {
  frequencies: UnitFrequency[];
  listsChecked: number;
  listsTotal: number;
  loading: boolean;
}

const IDLE_STATE: FrequencyState = {
  frequencies: [],
  listsChecked: 0,
  listsTotal: 0,
  loading: false,
};

interface UnitFrequencyPanelProps {
  results: Tournament[];
  factionName: string;
  searchLoading: boolean;
}

export const UnitFrequencyPanel = memo(function UnitFrequencyPanel({
  results,
  factionName,
  searchLoading,
}: UnitFrequencyPanelProps) {
  const [state, setState] = useState<FrequencyState>(IDLE_STATE);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();

    if (searchLoading || results.length === 0) return;

    const placements = results.flatMap((tournament) =>
      tournament.topThree.filter(
        (placement) => placement.faction.toLowerCase() === factionName.toLowerCase()
      )
    );

    if (placements.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setState({
        frequencies: [],
        listsChecked: 0,
        listsTotal: placements.length,
        loading: true,
      });

      const unitTotals = new Map<string, number>();
      const unitListCount = new Map<string, number>();
      let checked = 0;

      for (const placement of placements) {
        if (controller.signal.aborted) break;
        try {
          const res = await fetch(
            `/api/list?player=${placement.playerId}&event=${placement.eventId}`,
            { signal: controller.signal }
          );
          if (res.ok) {
            const armyList: ArmyList = await res.json();
            for (const unit of armyList.units) {
              unitTotals.set(unit.name, (unitTotals.get(unit.name) ?? 0) + unit.count);
              unitListCount.set(unit.name, (unitListCount.get(unit.name) ?? 0) + 1);
            }
          }
        } catch {
          if (controller.signal.aborted) break;
        }
        checked++;
        setState((prev) => ({ ...prev, listsChecked: checked }));
      }

      if (!controller.signal.aborted) {
        const sorted: UnitFrequency[] = [...unitTotals.entries()]
          .map(([name, totalCount]) => ({
            name,
            totalCount,
            listsAppearing: unitListCount.get(name) ?? 0,
          }))
          .sort(
            (a, b) => b.listsAppearing - a.listsAppearing || b.totalCount - a.totalCount
          );
        setState({
          frequencies: sorted,
          listsChecked: placements.length,
          listsTotal: placements.length,
          loading: false,
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [results, factionName, searchLoading]);

  if (searchLoading || results.length === 0) return null;

  const { frequencies, loading, listsChecked, listsTotal } = state;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-8">
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
        Unit frequency — {factionName}
      </h2>

      {loading && (
        <div className="rounded bg-gray-900/50 border border-gray-800 px-4 py-3 text-sm text-gray-400">
          Fetching army lists... {listsChecked} / {listsTotal}
        </div>
      )}

      {!loading && frequencies.length > 0 && (
        <div className="rounded border border-gray-800 overflow-hidden text-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900 text-gray-400 text-left">
                <th className="px-4 py-2 font-medium w-full">Unit</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Lists</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {frequencies.map((unit, index) => (
                <tr
                  key={unit.name}
                  className={index % 2 === 0 ? "bg-gray-900/30" : "bg-transparent"}
                >
                  <td className="px-4 py-2 text-gray-200">{unit.name}</td>
                  <td className="px-4 py-2 text-right text-gray-400">{unit.listsAppearing}</td>
                  <td className="px-4 py-2 text-right text-gray-400">{unit.totalCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && frequencies.length === 0 && listsChecked > 0 && (
        <p className="text-sm text-gray-500">No army lists found for {factionName}.</p>
      )}
    </div>
  );
});
