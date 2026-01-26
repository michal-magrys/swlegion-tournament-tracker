export interface TopPlacement {
  place: number;
  player: string;
  faction: string;
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
}
