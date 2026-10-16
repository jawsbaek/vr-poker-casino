export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type CardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  id: string;
  suit: Suit;
  rank: CardRank;
  faceUp: boolean;
}

export type ChipDenomination = 1 | 5 | 25 | 100;

export interface Chip {
  denomination: ChipDenomination;
  color: string;
}

export type AIType = 'shark' | 'rock' | 'station' | 'maniac';

export interface PlayerState {
  id: string;
  name: string;
  avatarIndex: number;
  chips: number;
  currentBet: number;
  folded: boolean;
  allIn: boolean;
  cards: Card[];
  isHuman: boolean;
  aiType?: AIType;
  lastAction?: string;
  seatIndex: number;
  isTurn: boolean;
  color: string;
}

export type TablePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type HandRankCategory =
  | 'High Card'
  | 'One Pair'
  | 'Two Pair'
  | 'Three of a Kind'
  | 'Straight'
  | 'Flush'
  | 'Full House'
  | 'Four of a Kind'
  | 'Straight Flush'
  | 'Royal Flush';

export interface HandEvaluation {
  score: number; // Higher is better
  category: HandRankCategory;
  description: string;
  bestCards: Card[];
}

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number;
  handName: string;
  bestCards: Card[];
}

export interface TableState {
  phase: TablePhase;
  pot: number;
  currentHighBet: number;
  minRaise: number;
  smallBlind: number;
  bigBlind: number;
  dealerSeat: number;
  activeSeat: number;
  communityCards: Card[];
  winners: WinnerInfo[];
  handCount: number;
}

export type PlayerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PlayerAction {
  type: PlayerActionType;
  amount?: number;
}
