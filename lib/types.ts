export type PointFormat = '1000' | '600' | 'all';

export interface TopPlacement {
  place: number;
  player: string;
  faction: string;
  playerId: number;
  eventId: number;
  hasList: boolean;
}

export interface Tournament {
  id: number;
  name: string;
  date: string;
  playerCount: number;
  url: string;
  topThree: TopPlacement[];
}

export interface SearchParams {
  dateFrom: string;
  minPlayers: number;
  faction: string;
  pointFormat: PointFormat;
}

export interface Unit {
  name: string;
  count: number;
  upgrades: string[];
}

export interface ArmyList {
  points: number;
  numActivations: number;
  armyFaction: string;
  commandCards: string[];
  units: Unit[];
  battlefieldDeck: {
    conditions: string[];
    deployment: string[];
    objective: string[];
  };
  listlink: string;
}

export type StreamMessage =
  | { type: 'status';   message: string; total?: number }
  | { type: 'result';   tournament: Tournament; checked: number }
  | { type: 'progress'; checked: number }
  | { type: 'done';     checked: number }
  | { type: 'error';    message: string };
