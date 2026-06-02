import type { PointFormat } from '@/lib/types';
import { PRIMARY_FACTIONS } from '@/lib/factions';

export { PRIMARY_FACTIONS as FACTIONS } from '@/lib/factions';

export const SORTED_FACTIONS = [...PRIMARY_FACTIONS].sort((factionA, factionB) => factionA.name.localeCompare(factionB.name));

export const DATE_RANGES = [
  { label: 'Last week',     days:   7 },
  { label: 'Last month',    months: 1 },
  { label: 'Last 3 months', months: 3 },
  { label: 'Last 6 months', months: 6 },
] as const;

export const MIN_PLAYERS_OPTIONS = [8, 10, 16, 20, 32] as const;

export const POINT_FORMATS: { value: PointFormat; label: string }[] = [
  { value: '1000', label: '1000 pts' },
  { value: '600',  label: '600 pts' },
  { value: 'all',  label: 'All formats' },
];

export const SELECT_CLS =
  'rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-yellow-500 focus:outline-none';

export interface FilterParams {
  faction: string;
  dateRangeIndex: number;
  minPlayers: number;
  pointFormat: PointFormat;
}

export function getDateFrom(rangeIndex: number): string {
  const range = DATE_RANGES[rangeIndex];
  const date = new Date();
  if ('days' in range) {
    date.setDate(date.getDate() - range.days);
    return date.toISOString().slice(0, 10);
  }
  date.setMonth(date.getMonth() - range.months);
  return date.toISOString().slice(0, 10);
}
