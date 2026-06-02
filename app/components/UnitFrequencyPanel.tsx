"use client";

import { memo, useState, useEffect, useRef } from "react";
import type { Tournament, ArmyList, UnitFrequency } from "@/lib/types";

interface FrequencyState {
  frequencies: UnitFrequency[];
  upgradeFrequencies: UnitFrequency[];
  listsChecked: number;
  listsTotal: number;
  loading: boolean;
}

const IDLE_STATE: FrequencyState = {
  frequencies: [],
  upgradeFrequencies: [],
  listsChecked: 0,
  listsTotal: 0,
  loading: false,
};

function toSortedFrequencies(
  totals: Map<string, number>,
  listCount: Map<string, number>
): UnitFrequency[] {
  return [...totals.entries()]
    .map(([name, totalCount]) => ({
      name,
      totalCount,
      listsAppearing: listCount.get(name) ?? 0,
    }))
    .sort((a, b) => b.listsAppearing - a.listsAppearing || b.totalCount - a.totalCount);
}

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
        upgradeFrequencies: [],
        listsChecked: 0,
        listsTotal: placements.length,
        loading: true,
      });

      const unitTotals = new Map<string, number>();
      const unitListCount = new Map<string, number>();
      const upgradeTotals = new Map<string, number>();
      const upgradeListCount = new Map<string, number>();
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
              for (const upgrade of unit.upgrades) {
                upgradeTotals.set(upgrade, (upgradeTotals.get(upgrade) ?? 0) + unit.count);
                upgradeListCount.set(upgrade, (upgradeListCount.get(upgrade) ?? 0) + 1);
              }
            }
          }
        } catch {
          if (controller.signal.aborted) break;
        }
        checked++;
        setState((prev) => ({ ...prev, listsChecked: checked }));
      }

      if (!controller.signal.aborted) {
        setState({
          frequencies: toSortedFrequencies(unitTotals, unitListCount),
          upgradeFrequencies: toSortedFrequencies(upgradeTotals, upgradeListCount),
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

  const { frequencies, upgradeFrequencies, loading, listsChecked, listsTotal } = state;

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
        <>
          <FrequencyTable rows={frequencies} />

          {upgradeFrequencies.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mt-6 mb-4">
                Upgrade frequency — {factionName}
              </h3>
              <FrequencyTable rows={upgradeFrequencies} />
            </>
          )}
        </>
      )}

      {!loading && frequencies.length === 0 && listsChecked > 0 && (
        <p className="text-sm text-gray-500">No army lists found for {factionName}.</p>
      )}
    </div>
  );
});

function FrequencyTable({ rows }: { rows: UnitFrequency[] }) {
  return (
    <div className="rounded border border-gray-800 overflow-hidden text-sm">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-900 text-gray-400 text-left">
            <th className="px-4 py-2 font-medium w-full">Name</th>
            <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Lists</th>
            <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.name}
              className={index % 2 === 0 ? "bg-gray-900/30" : "bg-transparent"}
            >
              <td className="px-4 py-2 text-gray-200">{row.name}</td>
              <td className="px-4 py-2 text-right text-gray-400">{row.listsAppearing}</td>
              <td className="px-4 py-2 text-right text-gray-400">{row.totalCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
