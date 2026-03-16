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
  pointFormat: '1000' | '600' | 'all';
}

export interface ArmyList {
  points: number;
  numActivations: number;
  armyFaction: string;
  commandCards: string[];
  units: { name: string; count: number; upgrades: string[] }[];
  battlefieldDeck: {
    conditions: string[];
    deployment: string[];
    objective: string[];
  };
  listlink: string;
}
