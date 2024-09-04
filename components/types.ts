export type CardType = {
    id: number;
    emoji: string;
    isFlipped: boolean;
    isMatched: boolean;
  };
  
  export type LeaderboardEntry = {
    name: string;
    time: number;
    moves: number;
    country: string;
    date: string;
  };