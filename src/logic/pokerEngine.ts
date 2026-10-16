import { Card, CardRank, Suit, PlayerState, TableState, HandEvaluation, WinnerInfo, PlayerAction, AIType } from '../types/poker';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: CardRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  let idCounter = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `card_${idCounter++}_${suit}_${rank}`,
        suit,
        rank,
        faceUp: false,
      });
    }
  }
  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getRankLabel(rank: CardRank): string {
  switch (rank) {
    case 14: return 'A';
    case 13: return 'K';
    case 12: return 'Q';
    case 11: return 'J';
    case 10: return '10';
    default: return String(rank);
  }
}

export function getRankWord(rank: CardRank): string {
  switch (rank) {
    case 14: return 'Ace';
    case 13: return 'King';
    case 12: return 'Queen';
    case 11: return 'Jack';
    case 10: return 'Ten';
    case 9: return 'Nine';
    case 8: return 'Eight';
    case 7: return 'Seven';
    case 6: return 'Six';
    case 5: return 'Five';
    case 4: return 'Four';
    case 3: return 'Three';
    case 2: return 'Two';
    default: return String(rank);
  }
}

export function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
  }
}

/**
 * Evaluates best 5-card poker hand out of 5 to 7 cards.
 */
export function evaluate7CardHand(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    return {
      score: 0,
      category: 'High Card',
      description: 'Incomplete hand',
      bestCards: [...cards],
    };
  }

  // Generate all 5-card combinations
  const combos: Card[][] = [];
  function k_combinations(set: Card[], k: number, prefix: Card[] = []) {
    if (prefix.length === k) {
      combos.push(prefix);
      return;
    }
    for (let i = 0; i < set.length; i++) {
      k_combinations(set.slice(i + 1), k, [...prefix, set[i]]);
    }
  }
  k_combinations(cards, 5);

  let bestEval: HandEvaluation | null = null;
  for (const combo of combos) {
    const current = evaluate5Cards(combo);
    if (!bestEval || current.score > bestEval.score) {
      bestEval = current;
    }
  }

  return bestEval!;
}

function evaluate5Cards(fiveCards: Card[]): HandEvaluation {
  const sorted = [...fiveCards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const suits = sorted.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;

  // Standard straight
  if (
    ranks[0] - ranks[1] === 1 &&
    ranks[1] - ranks[2] === 1 &&
    ranks[2] - ranks[3] === 1 &&
    ranks[3] - ranks[4] === 1
  ) {
    isStraight = true;
    straightHigh = ranks[0];
  } else if (
    // Wheel straight: A-5-4-3-2
    ranks[0] === 14 &&
    ranks[1] === 5 &&
    ranks[2] === 4 &&
    ranks[3] === 3 &&
    ranks[4] === 2
  ) {
    isStraight = true;
    straightHigh = 5; // In wheel straight, 5 is high
  }

  // Count rank occurrences
  const rankCounts: Record<number, number> = {};
  for (const r of ranks) {
    rankCounts[r] = (rankCounts[r] || 0) + 1;
  }
  const countEntries = Object.entries(rankCounts)
    .map(([rankStr, count]) => ({ rank: Number(rankStr) as CardRank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // 1. Royal Flush & Straight Flush
  if (isStraight && isFlush) {
    if (straightHigh === 14) {
      return {
        score: 9000000,
        category: 'Royal Flush',
        description: `Royal Flush in ${suits[0]}`,
        bestCards: sorted,
      };
    }
    return {
      score: 8000000 + straightHigh,
      category: 'Straight Flush',
      description: `${getRankWord(straightHigh as CardRank)}-high Straight Flush`,
      bestCards: sorted,
    };
  }

  // 2. Four of a Kind
  if (countEntries[0].count === 4) {
    const quadRank = countEntries[0].rank;
    const kicker = countEntries[1].rank;
    return {
      score: 7000000 + quadRank * 100 + kicker,
      category: 'Four of a Kind',
      description: `Four of a Kind, ${getRankWord(quadRank)}s`,
      bestCards: sorted,
    };
  }

  // 3. Full House
  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    const trips = countEntries[0].rank;
    const pair = countEntries[1].rank;
    return {
      score: 6000000 + trips * 100 + pair,
      category: 'Full House',
      description: `Full House, ${getRankWord(trips)}s full of ${getRankWord(pair)}s`,
      bestCards: sorted,
    };
  }

  // 4. Flush
  if (isFlush) {
    const tieBreak = ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4];
    return {
      score: 5000000 + tieBreak,
      category: 'Flush',
      description: `Flush, ${getRankWord(ranks[0])} high`,
      bestCards: sorted,
    };
  }

  // 5. Straight
  if (isStraight) {
    return {
      score: 4000000 + straightHigh,
      category: 'Straight',
      description: `${getRankWord(straightHigh as CardRank)}-high Straight`,
      bestCards: sorted,
    };
  }

  // 6. Three of a Kind
  if (countEntries[0].count === 3) {
    const trips = countEntries[0].rank;
    const kicker1 = countEntries[1].rank;
    const kicker2 = countEntries[2].rank;
    return {
      score: 3000000 + trips * 10000 + kicker1 * 100 + kicker2,
      category: 'Three of a Kind',
      description: `Three of a Kind, ${getRankWord(trips)}s`,
      bestCards: sorted,
    };
  }

  // 7. Two Pair
  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    const highPair = Math.max(countEntries[0].rank, countEntries[1].rank);
    const lowPair = Math.min(countEntries[0].rank, countEntries[1].rank);
    const kicker = countEntries[2].rank;
    return {
      score: 2000000 + highPair * 10000 + lowPair * 100 + kicker,
      category: 'Two Pair',
      description: `Two Pair, ${getRankWord(highPair as CardRank)}s and ${getRankWord(lowPair as CardRank)}s`,
      bestCards: sorted,
    };
  }

  // 8. One Pair
  if (countEntries[0].count === 2) {
    const pair = countEntries[0].rank;
    const k1 = countEntries[1].rank;
    const k2 = countEntries[2].rank;
    const k3 = countEntries[3].rank;
    return {
      score: 1000000 + pair * 100000 + k1 * 1000 + k2 * 100 + k3,
      category: 'One Pair',
      description: `Pair of ${getRankWord(pair)}s`,
      bestCards: sorted,
    };
  }

  // 9. High Card
  const tieBreak = ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4];
  return {
    score: tieBreak,
    category: 'High Card',
    description: `High Card, ${getRankWord(ranks[0])}`,
    bestCards: sorted,
  };
}

/**
 * AI Decision Maker based on Personality
 */
export function getAIDecision(
  ai: PlayerState,
  table: TableState,
  communityCards: Card[]
): PlayerAction {
  const callAmount = table.currentHighBet - ai.currentBet;
  const isFreeToCheck = callAmount <= 0;
  const myCards = [...ai.cards, ...communityCards];
  const evalResult = myCards.length >= 5 ? evaluate7CardHand(myCards) : null;
  const handScore = evalResult ? evalResult.score : 0;

  // Pre-flop pocket quality (rough 0..1 scale)
  let preflopStrength = 0.3;
  if (ai.cards.length === 2) {
    const r1 = ai.cards[0].rank;
    const r2 = ai.cards[1].rank;
    const isPair = r1 === r2;
    const isSuited = ai.cards[0].suit === ai.cards[1].suit;
    const highRank = Math.max(r1, r2);

    if (isPair) {
      preflopStrength = highRank >= 10 ? 0.95 : highRank >= 7 ? 0.8 : 0.65;
    } else {
      let score = (r1 + r2) / 28;
      if (isSuited) score += 0.15;
      if (Math.abs(r1 - r2) === 1) score += 0.1; // Connector
      preflopStrength = Math.min(0.9, Math.max(0.2, score));
    }
  }

  const aiType = ai.aiType || 'station';

  switch (aiType) {
    // Viktor (Shark): Aggressive, position-aware, bluffs
    case 'shark': {
      if (table.phase === 'preflop') {
        if (preflopStrength > 0.65) {
          const raiseAmt = Math.min(ai.chips, table.bigBlind * 3 + Math.floor(Math.random() * 4));
          return { type: 'raise', amount: table.currentHighBet + raiseAmt };
        }
        if (callAmount > table.bigBlind * 4 && preflopStrength < 0.45) {
          return { type: 'fold' };
        }
        return isFreeToCheck ? { type: 'check' } : { type: 'call' };
      } else {
        // Post-flop
        const isStrong = handScore >= 2000000; // Two pair+
        const isMonster = handScore >= 4000000; // Straight+
        const randomBluff = Math.random() < 0.2;

        if (isMonster || randomBluff) {
          const betAmt = Math.min(ai.chips, Math.max(table.minRaise, Math.floor(table.pot * 0.75)));
          return { type: 'raise', amount: table.currentHighBet + betAmt };
        }
        if (isStrong) {
          const betAmt = Math.min(ai.chips, Math.max(table.minRaise, Math.floor(table.pot * 0.5)));
          return { type: 'raise', amount: table.currentHighBet + betAmt };
        }
        if (callAmount > table.pot * 0.6 && handScore < 1000000) {
          return isFreeToCheck ? { type: 'check' } : { type: 'fold' };
        }
        return isFreeToCheck ? { type: 'check' } : { type: 'call' };
      }
    }

    // Elena (Rock): Tight-passive
    case 'rock': {
      if (table.phase === 'preflop') {
        if (preflopStrength < 0.55 && callAmount > 0) return { type: 'fold' };
        if (preflopStrength >= 0.85) {
          return { type: 'raise', amount: table.currentHighBet + table.bigBlind * 2 };
        }
        return isFreeToCheck ? { type: 'check' } : { type: 'call' };
      } else {
        if (handScore < 1000000 && callAmount > 0) return { type: 'fold' };
        if (handScore >= 5000000) {
          // Flush or better
          return { type: 'raise', amount: table.currentHighBet + Math.floor(table.pot * 0.5) };
        }
        return isFreeToCheck ? { type: 'check' } : { type: 'call' };
      }
    }

    // Marcus (Maniac): High variance, frequent raises and erratic all-ins
    case 'maniac': {
      const willSpike = Math.random() < 0.4;
      if (willSpike && ai.chips > table.currentHighBet) {
        if (Math.random() < 0.25 && ai.chips <= table.bigBlind * 25) {
          return { type: 'allin' };
        }
        const raiseAmt = Math.min(ai.chips, table.currentHighBet + table.bigBlind * (3 + Math.floor(Math.random() * 5)));
        return { type: 'raise', amount: raiseAmt };
      }
      return isFreeToCheck ? { type: 'check' } : { type: 'call' };
    }

    // Bao (Calling Station): Loves to call and see showdowns
    case 'station':
    default: {
      if (callAmount > ai.chips * 0.6 && preflopStrength < 0.4) {
        return isFreeToCheck ? { type: 'check' } : { type: 'fold' };
      }
      return isFreeToCheck ? { type: 'check' } : { type: 'call' };
    }
  }
}

/**
 * Initial Player Setups for 5-seat VIP table (Seat 0 is Human)
 */
export function createInitialPlayers(): PlayerState[] {
  return [
    {
      id: 'player_0',
      name: 'You (VIP)',
      avatarIndex: 0,
      chips: 200,
      currentBet: 0,
      folded: false,
      allIn: false,
      cards: [],
      isHuman: true,
      seatIndex: 0,
      isTurn: false,
      color: '#3b82f6',
    },
    {
      id: 'player_1',
      name: 'Viktor (Shark)',
      avatarIndex: 1,
      chips: 200,
      currentBet: 0,
      folded: false,
      allIn: false,
      cards: [],
      isHuman: false,
      aiType: 'shark',
      seatIndex: 1,
      isTurn: false,
      color: '#ef4444',
    },
    {
      id: 'player_2',
      name: 'Elena (Rock)',
      avatarIndex: 2,
      chips: 200,
      currentBet: 0,
      folded: false,
      allIn: false,
      cards: [],
      isHuman: false,
      aiType: 'rock',
      seatIndex: 2,
      isTurn: false,
      color: '#8b5cf6',
    },
    {
      id: 'player_3',
      name: 'Bao (Station)',
      avatarIndex: 3,
      chips: 200,
      currentBet: 0,
      folded: false,
      allIn: false,
      cards: [],
      isHuman: false,
      aiType: 'station',
      seatIndex: 3,
      isTurn: false,
      color: '#10b981',
    },
    {
      id: 'player_4',
      name: 'Marcus (Maniac)',
      avatarIndex: 4,
      chips: 200,
      currentBet: 0,
      folded: false,
      allIn: false,
      cards: [],
      isHuman: false,
      aiType: 'maniac',
      seatIndex: 4,
      isTurn: false,
      color: '#f59e0b',
    },
  ];
}
