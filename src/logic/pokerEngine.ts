import {
  Card,
  CardRank,
  Suit,
  PlayerState,
  TableState,
  HandEvaluation,
  WinnerInfo,
  PlayerAction,
  BlindLevel,
  SidePot,
  PhysicalTellType,
  QuickEmote,
  QuickEmoteId,
  ChatMessage,
  HandDecisionRecord,
} from '../types/poker';
import {
  createInitialHUDStats,
  evaluateComboStrength,
  calculateOutsAndDraws,
} from './gtoEngine';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: CardRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const TOURNAMENT_BLIND_LEVELS: BlindLevel[] = [
  { level: 1, smallBlind: 1, bigBlind: 2 },
  { level: 2, smallBlind: 2, bigBlind: 4 },
  { level: 3, smallBlind: 5, bigBlind: 10 },
  { level: 4, smallBlind: 10, bigBlind: 20 },
  { level: 5, smallBlind: 25, bigBlind: 50 },
];

export const HANDS_PER_BLIND_LEVEL = 5;

export function getBlindLevelForHand(handCount: number): BlindLevel {
  const idx = Math.min(
    TOURNAMENT_BLIND_LEVELS.length - 1,
    Math.floor(Math.max(0, handCount - 1) / HANDS_PER_BLIND_LEVEL)
  );
  return TOURNAMENT_BLIND_LEVELS[idx];
}

/**
 * Deterministic 32-bit Mulberry32 PRNG for reproducible simulations, tests, and seeded Monte Carlo rollouts.
 */
export function createSeededRNG(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32-bit string hash for deriving deterministic PRNG seeds from canonical game state strings.
 */
export function hashStringSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Unbiased integer in [0, maxExclusive) using Web Crypto CSPRNG with rejection sampling (or optional seeded RNG).
 */
export function randomIntUnbiased(maxExclusive: number, rng?: () => number): number {
  if (maxExclusive <= 1) return 0;
  if (rng) {
    return Math.floor(rng() * maxExclusive);
  }
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const maxUint32 = 0x100000000;
    const limit = maxUint32 - (maxUint32 % maxExclusive);
    const buf = new Uint32Array(1);
    let val = 0;
    do {
      cryptoObj.getRandomValues(buf);
      val = buf[0];
    } while (val >= limit);
    return val % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function createDeck(rng?: () => number): Card[] {
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
  return shuffleDeck(deck, rng);
}

/**
 * Fisher-Yates shuffle using unbiased CSPRNG rejection sampling (or optional deterministic RNG).
 */
export function shuffleDeck(deck: Card[], rng?: () => number): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomIntUnbiased(i + 1, rng);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Builds a shuffled remaining deck excluding any cards already dealt to players or the board.
 * Validates against duplicate cards and ensures scenario loads have a complete legal stub deck.
 */
export function buildRemainingDeck(usedCards: Card[], rng?: () => number): Card[] {
  const usedKeys = new Set<string>();
  for (const c of usedCards) {
    usedKeys.add(`${c.suit}_${c.rank}`);
  }
  const deck: Card[] = [];
  let idCounter = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const key = `${suit}_${rank}`;
      if (!usedKeys.has(key)) {
        deck.push({
          id: `card_${idCounter++}_${suit}_${rank}`,
          suit,
          rank,
          faceUp: false,
        });
      } else {
        idCounter++;
      }
    }
  }
  return shuffleDeck(deck, rng);
}

/**
 * Standard casino clockwise 2-pass hole card dealing starting from Small Blind (sbSeat).
 * Pass 1 deals each active player their first card clockwise; Pass 2 deals their second card clockwise.
 * Attaches sequential `dealOrder` (0 .. 2*N - 1) to each dealt card for staggered 3D shoe flight.
 */
export function dealHoleCardsClockwise(
  deck: Card[],
  players: PlayerState[],
  sbSeat: number
): { updatedPlayers: PlayerState[]; remainingDeck: Card[] } {
  const remainingDeck = [...deck];
  const totalSeats = players.length;
  const activeSeatOrder: number[] = [];

  for (let offset = 0; offset < totalSeats; offset++) {
    const seatIdx = (sbSeat + offset) % totalSeats;
    const p = players[seatIdx];
    if (p && !p.eliminated) {
      activeSeatOrder.push(seatIdx);
    }
  }

  const dealtBySeat = new Map<number, Card[]>();
  for (const seatIdx of activeSeatOrder) {
    dealtBySeat.set(seatIdx, []);
  }

  let dealOrder = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const seatIdx of activeSeatOrder) {
      const rawCard = remainingDeck.pop();
      if (!rawCard) break;
      const player = players[seatIdx];
      dealtBySeat.get(seatIdx)!.push({
        ...rawCard,
        faceUp: player.isHuman,
        dealOrder: dealOrder++,
      });
    }
  }

  const updatedPlayers = players.map((p, idx) => {
    if (p.eliminated) {
      return { ...p, cards: [] };
    }
    return {
      ...p,
      cards: dealtBySeat.get(idx) || [],
    };
  });

  return { updatedPlayers, remainingDeck };
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

export function getRankPlural(rank: CardRank): string {
  return rank === 6 ? 'Sixes' : `${getRankWord(rank)}s`;
}

export function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
  }
}

// Precomputed 5-card combination index tables for zero-allocation 6-card and 7-card evaluation
const COMBOS_5_OF_6: readonly (readonly [number, number, number, number, number])[] = [
  [0, 1, 2, 3, 4],
  [0, 1, 2, 3, 5],
  [0, 1, 2, 4, 5],
  [0, 1, 3, 4, 5],
  [0, 2, 3, 4, 5],
  [1, 2, 3, 4, 5],
];

const COMBOS_5_OF_7: readonly (readonly [number, number, number, number, number])[] = [
  [0, 1, 2, 3, 4],
  [0, 1, 2, 3, 5],
  [0, 1, 2, 3, 6],
  [0, 1, 2, 4, 5],
  [0, 1, 2, 4, 6],
  [0, 1, 2, 5, 6],
  [0, 1, 3, 4, 5],
  [0, 1, 3, 4, 6],
  [0, 1, 3, 5, 6],
  [0, 1, 4, 5, 6],
  [0, 2, 3, 4, 5],
  [0, 2, 3, 4, 6],
  [0, 2, 3, 5, 6],
  [0, 2, 4, 5, 6],
  [0, 3, 4, 5, 6],
  [1, 2, 3, 4, 5],
  [1, 2, 3, 4, 6],
  [1, 2, 3, 5, 6],
  [1, 2, 4, 5, 6],
  [1, 3, 4, 5, 6],
  [2, 3, 4, 5, 6],
];

/**
 * Encodes up to 5 tie-breaker card ranks (each in 0..14) in Base-15.
 * Max value is 14 * (15^4 + 15^3 + 15^2 + 15 + 1) = 759,374 < 1,000,000,
 * guaranteeing zero category overflow and strictly monotonic lexicographic ordering.
 */
function encodeBase15(r0 = 0, r1 = 0, r2 = 0, r3 = 0, r4 = 0): number {
  return (((r0 * 15 + r1) * 15 + r2) * 15 + r3) * 15 + r4;
}

/**
 * Evaluates best 5-card poker hand out of 5 to 7 cards.
 */
export function evaluate7CardHand(cards: Card[]): HandEvaluation {
  const len = cards.length;
  if (len < 5) {
    const sortedPartial = [...cards].sort((a, b) => b.rank - a.rank);
    return {
      score: encodeBase15(
        sortedPartial[0]?.rank ?? 0,
        sortedPartial[1]?.rank ?? 0,
        sortedPartial[2]?.rank ?? 0,
        sortedPartial[3]?.rank ?? 0,
        0
      ),
      category: 'High Card',
      description: 'Incomplete hand',
      bestCards: sortedPartial,
    };
  }

  if (len === 5) {
    return evaluate5Cards(cards);
  }

  if (len === 6 || len === 7) {
    const table = len === 7 ? COMBOS_5_OF_7 : COMBOS_5_OF_6;
    let bestEval: HandEvaluation | null = null;
    const tuple: Card[] = [cards[0], cards[1], cards[2], cards[3], cards[4]];
    for (let i = 0; i < table.length; i++) {
      const idx = table[i];
      tuple[0] = cards[idx[0]];
      tuple[1] = cards[idx[1]];
      tuple[2] = cards[idx[2]];
      tuple[3] = cards[idx[3]];
      tuple[4] = cards[idx[4]];
      const current = evaluate5Cards(tuple);
      if (!bestEval || current.score > bestEval.score) {
        bestEval = current;
      }
    }
    return bestEval!;
  }

  // Fallback for > 7 cards
  let bestEval: HandEvaluation | null = null;
  function walk(start: number, picked: Card[]) {
    if (picked.length === 5) {
      const current = evaluate5Cards(picked);
      if (!bestEval || current.score > bestEval.score) {
        bestEval = current;
      }
      return;
    }
    for (let i = start; i <= cards.length - (5 - picked.length); i++) {
      picked.push(cards[i]);
      walk(i + 1, picked);
      picked.pop();
    }
  }
  walk(0, []);
  return bestEval!;
}

function evaluate5Cards(fiveCards: Card[]): HandEvaluation {
  const sorted = [...fiveCards].sort((a, b) => b.rank - a.rank);
  const r0 = sorted[0].rank;
  const r1 = sorted[1].rank;
  const r2 = sorted[2].rank;
  const r3 = sorted[3].rank;
  const r4 = sorted[4].rank;
  const s0 = sorted[0].suit;

  const isFlush =
    sorted[1].suit === s0 &&
    sorted[2].suit === s0 &&
    sorted[3].suit === s0 &&
    sorted[4].suit === s0;

  // Check straight (standard & A-5-4-3-2 wheel)
  let isStraight = false;
  let straightHigh: CardRank = r0;
  let isWheel = false;

  if (r0 - r1 === 1 && r1 - r2 === 1 && r2 - r3 === 1 && r3 - r4 === 1) {
    isStraight = true;
    straightHigh = r0;
  } else if (r0 === 14 && r1 === 5 && r2 === 4 && r3 === 3 && r4 === 2) {
    isStraight = true;
    isWheel = true;
    straightHigh = 5;
  }

  // 1. Royal Flush & Straight Flush
  if (isStraight && isFlush) {
    const orderedStraightCards = isWheel
      ? [sorted[1], sorted[2], sorted[3], sorted[4], sorted[0]]
      : sorted;
    if (straightHigh === 14) {
      return {
        score: 9000000,
        category: 'Royal Flush',
        description: `Royal Flush in ${s0}`,
        bestCards: orderedStraightCards,
      };
    }
    return {
      score: 8000000 + encodeBase15(straightHigh, 0, 0, 0, 0),
      category: 'Straight Flush',
      description: `${getRankWord(straightHigh)}-high Straight Flush`,
      bestCards: orderedStraightCards,
    };
  }

  // Count rank occurrences and group cards by multiplicity then rank
  const rankCounts = new Map<CardRank, number>();
  for (let i = 0; i < 5; i++) {
    const rk = sorted[i].rank;
    rankCounts.set(rk, (rankCounts.get(rk) || 0) + 1);
  }

  const countEntries = Array.from(rankCounts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // Order bestCards by multiplicity first, then rank descending
  const canonicalCards = [...sorted].sort((a, b) => {
    const ca = rankCounts.get(a.rank)!;
    const cb = rankCounts.get(b.rank)!;
    return cb - ca || b.rank - a.rank;
  });

  // 2. Four of a Kind
  if (countEntries[0].count === 4) {
    const quadRank = countEntries[0].rank;
    const kicker = countEntries[1].rank;
    return {
      score: 7000000 + encodeBase15(quadRank, kicker, 0, 0, 0),
      category: 'Four of a Kind',
      description: `Four of a Kind, ${getRankPlural(quadRank)}`,
      bestCards: canonicalCards,
    };
  }

  // 3. Full House
  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    const trips = countEntries[0].rank;
    const pair = countEntries[1].rank;
    return {
      score: 6000000 + encodeBase15(trips, pair, 0, 0, 0),
      category: 'Full House',
      description: `Full House, ${getRankPlural(trips)} full of ${getRankPlural(pair)}`,
      bestCards: canonicalCards,
    };
  }

  // 4. Flush
  if (isFlush) {
    return {
      score: 5000000 + encodeBase15(r0, r1, r2, r3, r4),
      category: 'Flush',
      description: `Flush, ${getRankWord(r0)} high`,
      bestCards: sorted,
    };
  }

  // 5. Straight
  if (isStraight) {
    const orderedStraightCards = isWheel
      ? [sorted[1], sorted[2], sorted[3], sorted[4], sorted[0]]
      : sorted;
    return {
      score: 4000000 + encodeBase15(straightHigh, 0, 0, 0, 0),
      category: 'Straight',
      description: `${getRankWord(straightHigh)}-high Straight`,
      bestCards: orderedStraightCards,
    };
  }

  // 6. Three of a Kind
  if (countEntries[0].count === 3) {
    const trips = countEntries[0].rank;
    const kicker1 = countEntries[1].rank;
    const kicker2 = countEntries[2].rank;
    return {
      score: 3000000 + encodeBase15(trips, kicker1, kicker2, 0, 0),
      category: 'Three of a Kind',
      description: `Three of a Kind, ${getRankPlural(trips)}`,
      bestCards: canonicalCards,
    };
  }

  // 7. Two Pair
  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    const highPair = countEntries[0].rank;
    const lowPair = countEntries[1].rank;
    const kicker = countEntries[2].rank;
    return {
      score: 2000000 + encodeBase15(highPair, lowPair, kicker, 0, 0),
      category: 'Two Pair',
      description: `Two Pair, ${getRankPlural(highPair)} and ${getRankPlural(lowPair)}`,
      bestCards: canonicalCards,
    };
  }

  // 8. One Pair
  if (countEntries[0].count === 2) {
    const pair = countEntries[0].rank;
    const k1 = countEntries[1].rank;
    const k2 = countEntries[2].rank;
    const k3 = countEntries[3].rank;
    return {
      score: 1000000 + encodeBase15(pair, k1, k2, k3, 0),
      category: 'One Pair',
      description: `Pair of ${getRankPlural(pair)}`,
      bestCards: canonicalCards,
    };
  }

  // 9. High Card
  return {
    score: encodeBase15(r0, r1, r2, r3, r4),
    category: 'High Card',
    description: `High Card, ${getRankWord(r0)}`,
    bestCards: sorted,
  };
}

/**
 * Computes Main Pot and any Side Pots from players' cumulative hand contributions (totalHandBet).
 */
export function calculateSidePots(players: PlayerState[]): SidePot[] {
  const contributors = players.filter((p) => p.totalHandBet > 0);
  if (contributors.length === 0) return [];

  // Distinct contribution levels of non-folded players
  const liveLevels = Array.from(
    new Set(
      contributors
        .filter((p) => !p.folded)
        .map((p) => p.totalHandBet)
    )
  ).sort((a, b) => a - b);

  if (liveLevels.length === 0) {
    const total = contributors.reduce((s, p) => s + p.totalHandBet, 0);
    return [{ amount: total, eligiblePlayerIds: [], label: 'Main Pot' }];
  }

  const rawPots: { amount: number; eligiblePlayerIds: string[] }[] = [];
  let prevLevel = 0;

  for (const level of liveLevels) {
    const sliceDepth = level - prevLevel;
    if (sliceDepth <= 0) continue;

    let sliceAmount = 0;
    const eligibleIds: string[] = [];

    for (const p of contributors) {
      const contributedInSlice = Math.max(0, Math.min(p.totalHandBet, level) - prevLevel);
      sliceAmount += contributedInSlice;
      if (!p.folded && p.totalHandBet >= level) {
        eligibleIds.push(p.id);
      }
    }

    if (sliceAmount > 0) {
      // Merge with previous pot if eligible players are identical
      const lastPot = rawPots[rawPots.length - 1];
      if (
        lastPot &&
        lastPot.eligiblePlayerIds.length === eligibleIds.length &&
        lastPot.eligiblePlayerIds.every((id, i) => id === eligibleIds[i])
      ) {
        lastPot.amount += sliceAmount;
      } else {
        rawPots.push({ amount: sliceAmount, eligiblePlayerIds: eligibleIds });
      }
    }
    prevLevel = level;
  }

  // Any folded contribution above the highest live player's bet goes into the last pot
  const maxLiveLevel = liveLevels[liveLevels.length - 1];
  let orphanFoldedAmount = 0;
  for (const p of contributors) {
    if (p.totalHandBet > maxLiveLevel) {
      orphanFoldedAmount += p.totalHandBet - maxLiveLevel;
    }
  }
  if (orphanFoldedAmount > 0 && rawPots.length > 0) {
    rawPots[rawPots.length - 1].amount += orphanFoldedAmount;
  }

  return rawPots.map((pot, idx) => ({
    amount: pot.amount,
    eligiblePlayerIds: pot.eligiblePlayerIds,
    label: idx === 0 ? 'Main Pot' : `Side Pot #${idx}`,
  }));
}

/**
 * Adjudicates all pots (Main Pot + Side Pots) at showdown and returns WinnerInfo[] and total chip awards.
 * Implements:
 * - Uncalled overbet/shove return (returned to the bettor in chipAwards/payouts without creating a false WinnerInfo entry)
 * - TDA Rule 20 odd-chip distribution (odd chips awarded clockwise starting immediately left of dealerSeat)
 */
export function adjudicateShowdown(
  players: PlayerState[],
  communityCards: Card[],
  fallbackTotalPot: number,
  dealerSeat = 0
): {
  winners: WinnerInfo[];
  chipAwards: Record<string, number>;
  payouts: Map<string, number>;
  sidePots: SidePot[];
} {
  const contenders = players.filter((p) => !p.folded && !p.eliminated);
  const handEvals = new Map<string, HandEvaluation>();

  for (const p of contenders) {
    handEvals.set(p.id, evaluate7CardHand([...p.cards, ...communityCards]));
  }

  let rawSidePots = calculateSidePots(players);
  const sumSidePots = rawSidePots.reduce((acc, s) => acc + s.amount, 0);
  if (rawSidePots.length === 0 || sumSidePots === 0) {
    rawSidePots = [
      {
        amount: fallbackTotalPot,
        eligiblePlayerIds: contenders.map((c) => c.id),
        label: 'Main Pot',
      },
    ];
  }

  const chipAwards: Record<string, number> = {};
  const payouts = new Map<string, number>();
  const winnerMap = new Map<string, WinnerInfo>();
  const contestedSidePots: SidePot[] = [];
  const totalSeats = Math.max(players.length, 5);

  for (const pot of rawSidePots) {
    const eligible = contenders.filter((p) => pot.eligiblePlayerIds.includes(p.id));
    if (eligible.length === 0) continue;

    // Uncalled bet slice above all other contenders: return chips directly without declaring a showdown pot win
    if (eligible.length === 1 && rawSidePots.length > 1) {
      const solePlayer = eligible[0];
      chipAwards[solePlayer.id] = (chipAwards[solePlayer.id] || 0) + pot.amount;
      payouts.set(solePlayer.id, (payouts.get(solePlayer.id) || 0) + pot.amount);
      continue;
    }

    const potLabel =
      contestedSidePots.length === 0 ? 'Main Pot' : `Side Pot #${contestedSidePots.length}`;
    contestedSidePots.push({
      ...pot,
      label: potLabel,
    });

    let bestScore = -1;
    for (const p of eligible) {
      const score = handEvals.get(p.id)!.score;
      if (score > bestScore) bestScore = score;
    }

    const potWinners = eligible.filter((p) => handEvals.get(p.id)!.score === bestScore);
    // Sort tied winners in clockwise order starting immediately left of dealerSeat (TDA Rule 20)
    const clockwiseWinners = [...potWinners].sort((a, b) => {
      const distA = (a.seatIndex - dealerSeat - 1 + totalSeats * 2) % totalSeats;
      const distB = (b.seatIndex - dealerSeat - 1 + totalSeats * 2) % totalSeats;
      return distA - distB;
    });

    const share = Math.floor(pot.amount / clockwiseWinners.length);
    let remainder = pot.amount - share * clockwiseWinners.length;

    for (const w of clockwiseWinners) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      const award = share + extra;
      chipAwards[w.id] = (chipAwards[w.id] || 0) + award;
      payouts.set(w.id, (payouts.get(w.id) || 0) + award);

      const evalInfo = handEvals.get(w.id)!;
      const existing = winnerMap.get(w.id);
      if (existing) {
        existing.amount += award;
        existing.potLabel = existing.potLabel ? `${existing.potLabel} & ${potLabel}` : potLabel;
      } else {
        winnerMap.set(w.id, {
          playerId: w.id,
          playerName: w.name,
          amount: award,
          handName: evalInfo.description,
          potLabel,
          bestCards: evalInfo.bestCards,
        });
      }
    }
  }

  return {
    winners: Array.from(winnerMap.values()),
    chipAwards,
    payouts,
    sidePots: contestedSidePots.length > 0 ? contestedSidePots : rawSidePots,
  };
}

/**
 * AI Decision Maker based on Personality, Position, Draw Outs, Pot Odds, SPR & Stack Pressure
 */
export function getAIDecision(
  ai: PlayerState,
  table: TableState,
  communityCards: Card[]
): PlayerAction {
  const callAmount = Math.max(0, table.currentHighBet - ai.currentBet);
  const isFreeToCheck = callAmount === 0;
  const myCards = [...ai.cards, ...communityCards];
  const evalResult = myCards.length >= 5 ? evaluate7CardHand(myCards) : null;
  const handScore = evalResult ? evalResult.score : 0;

  // Calibrated 169-combo preflop quality (0..1 scale)
  let preflopStrength = 0.35;
  if (ai.cards.length === 2) {
    const highRank = Math.max(ai.cards[0].rank, ai.cards[1].rank) as CardRank;
    const lowRank = Math.min(ai.cards[0].rank, ai.cards[1].rank) as CardRank;
    const isPair = highRank === lowRank;
    const isSuited = ai.cards[0].suit === ai.cards[1].suit;
    const comboEval = evaluateComboStrength(highRank, lowRank, isPair, isSuited);
    preflopStrength = Math.min(1, Math.max(0.15, comboEval.score / 100));
  }

  // Positional awareness (BTN/CO play wider; UTG/SB play tighter)
  const relSeat = (ai.seatIndex - table.dealerSeat + 5) % 5;
  const position =
    relSeat === 0 ? 'BTN' : relSeat === 1 ? 'SB' : relSeat === 2 ? 'BB' : relSeat === 3 ? 'UTG' : 'CO';
  const isLatePosition = position === 'BTN' || position === 'CO';
  const posBonus = position === 'BTN' ? 0.08 : position === 'CO' ? 0.05 : position === 'UTG' ? -0.05 : 0;
  const effectivePreflop = Math.min(1, Math.max(0, preflopStrength + posBonus));

  // Postflop draw outs and pot odds
  const drawOuts =
    table.phase !== 'preflop' && ai.cards.length === 2
      ? calculateOutsAndDraws(ai.cards, communityCards).totalOuts
      : 0;
  const potOddsNeeded = callAmount > 0 ? callAmount / Math.max(1, table.pot + callAmount) : 0;
  const drawEquity =
    table.phase === 'flop'
      ? Math.min(0.65, (drawOuts * 4) / 100)
      : table.phase === 'turn'
      ? Math.min(0.45, (drawOuts * 2.2) / 100)
      : 0;
  const hasStrongDraw = drawOuts >= 8;

  // Helper to construct a legal raise or fallback to allin/call
  const makeRaiseOrCall = (desiredRaiseOverHigh: number): PlayerAction => {
    if (ai.chips <= callAmount) {
      return { type: 'allin' };
    }
    const minLegalTotal = table.currentHighBet + table.minRaise;
    const maxLegalTotal = ai.chips + ai.currentBet;
    const targetTotal = Math.min(
      maxLegalTotal,
      Math.max(minLegalTotal, table.currentHighBet + desiredRaiseOverHigh)
    );
    if (targetTotal >= maxLegalTotal) {
      return { type: 'allin' };
    }
    return { type: 'raise', amount: targetTotal };
  };

  // Short-stack tournament push/fold pressure (<= 8 big blinds)
  const mRatio = ai.chips / Math.max(1, table.bigBlind);
  if (mRatio <= 8 && effectivePreflop >= 0.62) {
    return { type: 'allin' };
  }

  const aiType = ai.aiType || 'station';

  switch (aiType) {
    // Viktor (Shark): Aggressive, position-aware, semi-bluffs strong draws & punishes weakness
    case 'shark': {
      if (table.phase === 'preflop') {
        if (effectivePreflop >= 0.64 || (isLatePosition && callAmount <= table.bigBlind && effectivePreflop >= 0.52)) {
          const raiseAmt = table.bigBlind * (2 + (isLatePosition ? 1 : 2));
          return makeRaiseOrCall(raiseAmt);
        }
        if (callAmount > table.bigBlind * 4 && effectivePreflop < 0.52) {
          return { type: 'fold' };
        }
        if (callAmount > 0 && effectivePreflop < 0.38 && potOddsNeeded > 0.28) {
          return { type: 'fold' };
        }
        return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
      } else {
        const isStrong = handScore >= 2000000; // Two pair+
        const isMonster = handScore >= 4000000; // Straight+
        const isTopPairPlus = handScore >= 1300000; // High One Pair+
        const semiBluff = hasStrongDraw && isFreeToCheck && Math.random() < 0.55;
        const positionalBluff = isLatePosition && isFreeToCheck && Math.random() < 0.24;

        if (isMonster || semiBluff) {
          return makeRaiseOrCall(Math.max(table.minRaise, Math.floor(table.pot * 0.68)));
        }
        if (isStrong || (isTopPairPlus && isFreeToCheck) || positionalBluff) {
          return makeRaiseOrCall(Math.max(table.minRaise, Math.floor(table.pot * 0.48)));
        }
        if (callAmount > 0 && handScore < 1000000 && drawEquity < potOddsNeeded && callAmount > table.pot * 0.45) {
          return { type: 'fold' };
        }
        return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
      }
    }

    // Elena (Rock): Tight-solid, premium holdings & mathematically sound pot-odds calls
    case 'rock': {
      if (table.phase === 'preflop') {
        if (effectivePreflop < 0.55 && callAmount > 0) return { type: 'fold' };
        if (effectivePreflop >= 0.8) {
          return makeRaiseOrCall(table.bigBlind * 2);
        }
        return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
      } else {
        if (handScore < 1000000 && drawEquity < potOddsNeeded && callAmount > 0) {
          return { type: 'fold' };
        }
        if (handScore >= 3000000) {
          return makeRaiseOrCall(Math.max(table.minRaise, Math.floor(table.pot * 0.55)));
        }
        return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
      }
    }

    // Marcus (Maniac): High variance, wide pressure, frequent raises and semi-bluff barrels
    case 'maniac': {
      const alreadyRaisedStreet = table.currentHighBet > table.bigBlind * 2;
      const willSpike =
        !alreadyRaisedStreet &&
        effectivePreflop >= 0.28 &&
        Math.random() < (hasStrongDraw || isLatePosition ? 0.48 : 0.36);
      if (willSpike && ai.chips > callAmount) {
        if (Math.random() < 0.22 && ai.chips <= table.bigBlind * 20) {
          return { type: 'allin' };
        }
        return makeRaiseOrCall(table.bigBlind * (2 + Math.floor(Math.random() * 4)));
      }
      if (
        table.phase !== 'preflop' &&
        callAmount >= table.bigBlind * 3 &&
        handScore < 1000000 &&
        !hasStrongDraw
      ) {
        return { type: 'fold' };
      }
      if (callAmount > ai.chips * 0.8 && effectivePreflop < 0.35 && handScore < 1000000 && !hasStrongDraw) {
        return isFreeToCheck ? { type: 'check' } : { type: 'fold' };
      }
      return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
    }

    // Bao (Calling Station): Sticky with any pair or draw, loves seeing flops and calling down
    case 'station':
    default: {
      if (callAmount > ai.chips * 0.65 && effectivePreflop < 0.4 && handScore < 1000000 && drawOuts < 4) {
        return isFreeToCheck ? { type: 'check' } : { type: 'fold' };
      }
      if (handScore >= 4000000 && isFreeToCheck) {
        return makeRaiseOrCall(Math.max(table.minRaise, Math.floor(table.pot * 0.5)));
      }
      return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
    }
  }
}

/**
 * Evaluates physical behavioral tells for each AI player based on hand strength and pot pressure.
 * Specifically:
 * - Seat #3 (Bao, Heavy Phone-Watcher) scrolls his glowing smartphone during routine hands,
 *   but puts his phone flat on the table rim and leans forward when holding a monster hand or facing high stakes!
 * - Seat #4 (Marcus, Maniac) fidgets with chips when bluffing.
 * - Seat #1 (Viktor, Shark) glances at his watch when holding a strong hand.
 * - Seat #2 (Elena, Rock) shifts into an upright poised posture with top holdings.
 */
export function evaluatePlayerTell(
  player: PlayerState,
  table: TableState,
  communityCards: Card[]
): { activeTell: PhysicalTellType; isWatchingPhone: boolean } {
  if (player.isHuman || player.folded || player.eliminated) {
    return {
      activeTell: 'none',
      isWatchingPhone: player.persona === 'heavy_phone',
    };
  }

  const allCards = [...player.cards, ...communityCards];
  const evalResult = allCards.length >= 5 ? evaluate7CardHand(allCards) : null;
  const score = evalResult ? evalResult.score : 0;

  // Pocket strength for preflop
  let pocketStrong = false;
  if (player.cards.length === 2) {
    const r1 = player.cards[0].rank;
    const r2 = player.cards[1].rank;
    pocketStrong = (r1 === r2 && r1 >= 10) || (r1 >= 13 && r2 >= 12);
  }

  const isMonster = pocketStrong || score >= 2000000; // Two pair or better / high pocket pair
  const isHighPressure = table.pot >= table.bigBlind * 12 || table.currentHighBet >= table.bigBlind * 6;

  switch (player.persona) {
    case 'heavy_phone': {
      // Bao puts his phone down on the mahogany rail and leans in when holding a monster or in a huge pot with a pair+
      if (isMonster || (isHighPressure && score >= 1000000)) {
        return { activeTell: 'phone_down_monster', isWatchingPhone: false };
      }
      return { activeTell: 'phone_scrolling', isWatchingPhone: true };
    }
    case 'flashy_maniac': {
      const isWeakBluff = !pocketStrong && score < 1000000 && player.currentBet > table.bigBlind;
      return {
        activeTell: isWeakBluff ? 'chip_fidget_bluff' : 'none',
        isWatchingPhone: false,
      };
    }
    case 'general_man': {
      return {
        activeTell: isMonster ? 'watch_glance_strong' : 'none',
        isWatchingPhone: false,
      };
    }
    case 'woman': {
      return {
        activeTell: isMonster ? 'posture_tight' : 'none',
        isWatchingPhone: false,
      };
    }
    default:
      return { activeTell: 'none', isWatchingPhone: false };
  }
}

/**
 * Interactive Quick-Emotes for the human player at Seat #0
 */
export const QUICK_EMOTES: QuickEmote[] = [
  {
    id: 'eyes_off_phone',
    label: 'Phone Check',
    text: "Hey Bao, eyes off the phone. We're playing Hold'em!",
    icon: '📱',
  },
  {
    id: 'nice_hand',
    label: 'Nice Hand',
    text: 'Nice hand, well played.',
    icon: '👏',
  },
  {
    id: 'show_bluff',
    label: 'Show Bluff',
    text: 'Show the bluff if you have the nerve!',
    icon: '🃏',
  },
  {
    id: 'lets_gamble',
    label: "Let's Gamble",
    text: "Let's gamble! Raise the stakes!",
    icon: '🔥',
  },
  {
    id: 'drinks_on_me',
    label: 'VIP Round',
    text: 'Dealer, another round for the table on me.',
    icon: '🥃',
  },
];

let lastBanterStreetKey = '';
let routineBanterCountInStreet = 0;
let bigRaiseBanterCountInStreet = 0;
let lastBanterTimestamp = 0;
let baoMonsterAnnouncedHandCount = -1;

/**
 * Generates contextual AI table banter on turn actions (and cross-table teasing of Bao's phone habit)
 */
export function generateAITurnBanter(
  ai: PlayerState,
  action: PlayerAction,
  table: TableState,
  allPlayers: PlayerState[]
): ChatMessage | null {
  const streetKey = `${table.handCount}_${table.phase}`;
  if (streetKey !== lastBanterStreetKey) {
    lastBanterStreetKey = streetKey;
    routineBanterCountInStreet = 0;
    bigRaiseBanterCountInStreet = 0;
  }

  // Only treat a bet/raise as a highlight "big move" if it is >= 50% of the pot (postflop) or a 3-bet / >= 4.5x BB (preflop)
  const targetStreetBet = action.amount ?? ai.currentBet;
  const isBigBetOrRaise =
    (action.type === 'raise' || action.type === 'bet') &&
    (table.phase === 'preflop'
      ? targetStreetBet >= table.bigBlind * 4.5 || targetStreetBet >= table.pot * 0.85
      : targetStreetBet >= Math.max(table.bigBlind * 3, table.pot * 0.5));

  const isBigMove = action.type === 'allin' || isBigBetOrRaise;

  // Bao's "putting the phone down" voice line only triggers ONCE per hand on the first turn he puts his phone down
  const isFirstBaoPhoneDownInHand =
    ai.persona === 'heavy_phone' &&
    ai.activeTell === 'phone_down_monster' &&
    action.type !== 'fold' &&
    baoMonsterAnnouncedHandCount !== table.handCount;

  const now = Date.now();

  if (!isBigMove && !isFirstBaoPhoneDownInHand) {
    // Routine actions (check, call, fold, or small standard raises) have a strict per-street cooldown
    if (routineBanterCountInStreet >= 1 || now - lastBanterTimestamp < 2500) {
      return null;
    }
  } else if (action.type !== 'allin' && !isFirstBaoPhoneDownInHand) {
    // Cap big-raise banter to 1 per street with a minimum 1.6s gap so raise wars don't stack voices
    if (bigRaiseBanterCountInStreet >= 1 || now - lastBanterTimestamp < 1600) {
      return null;
    }
  }

  const triggerChance =
    action.type === 'allin'
      ? 0.92
      : isFirstBaoPhoneDownInHand
      ? 0.88
      : isBigMove
      ? 0.62
      : 0.26;
  if (Math.random() > triggerChance) return null;

  lastBanterTimestamp = now;
  if (isFirstBaoPhoneDownInHand) {
    baoMonsterAnnouncedHandCount = table.handCount;
  }
  if (!isBigMove && !isFirstBaoPhoneDownInHand) {
    routineBanterCountInStreet += 1;
  } else if (isBigBetOrRaise) {
    bigRaiseBanterCountInStreet += 1;
  }

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  let text = '';

  switch (ai.persona) {
    case 'general_man': {
      // Viktor (Shark - Tailored Suit, Whiskey)
      if (action.type === 'allin') {
        text = pick([
          'Every chip in the middle. Let us see your courage.',
          'Maximum pressure. The math is already decided.',
          'All in. Care to test my range?',
        ]);
      } else if (action.type === 'raise' || action.type === 'bet') {
        text = pick([
          'Price of admission just went up.',
          'Let us thin the field a little.',
          'A standard continuation. Your move.',
          'Bao is still staring at his screen. Easy blinds.',
        ]);
      } else if (action.type === 'call') {
        text = pick([
          'The pot odds justify a look.',
          'I will keep you honest.',
          'Calling. Show me what you are representing.',
        ]);
      } else if (action.type === 'check') {
        text = pick(['Check. Proceed.', 'I will exercise patience here.']);
      } else {
        text = pick(['Unfavorable spot. You may have this one.', 'Disciplined fold.']);
      }
      break;
    }

    case 'woman': {
      // Elena (Rock - Evening Gown, Champagne)
      if (action.type === 'allin') {
        text = pick([
          'All-in. I do not push without the goods.',
          'Everything goes in, darling. Good luck catching up.',
        ]);
      } else if (action.type === 'raise' || action.type === 'bet') {
        text = pick([
          'Quality cards deserve a proper raise.',
          'Patience always pays in Monte Carlo.',
          'Raising. Play carefully, gentlemen.',
        ]);
      } else if (action.type === 'call') {
        text = pick([
          'I will call and see the next street.',
          'Curiosity costs a few chips, I suppose.',
        ]);
      } else if (action.type === 'check') {
        text = pick(['Checking to the aggressor.', 'Check. My champagne is still chilled.']);
      } else {
        text = pick([
          'Not my tempo. Folding.',
          'I will wait for a better couture hand.',
        ]);
      }
      break;
    }

    case 'heavy_phone': {
      // Bao (Calling Station - Heavy Phone-Watcher)
      if (action.type === 'allin') {
        text = pick([
          'Hold my phone! All-in!',
          'Pushing the whole stack. Hope I do not miss my stream!',
        ]);
      } else if (isFirstBaoPhoneDownInHand) {
        // First turn in this hand after putting his phone DOWN on the table!
        text = pick([
          'Hold on, putting the phone down for this hand.',
          'Screen locked. You have my full attention now.',
          'Wait a second... look at these cards. I am in!',
        ]);
      } else if (ai.activeTell === 'phone_down_monster' && (action.type === 'raise' || action.type === 'bet')) {
        text = pick([
          'Phone is still face down, my friend. Raising!',
          'No distractions on this pot—I am raising.',
        ]);
      } else if (action.type === 'call') {
        text = pick([
          'Huh? My turn? Yeah, yeah, I call.',
          'One sec, watching this reel... okay, I call.',
          'Can not fold suited cards while scrolling. Call!',
          'Hang on, let me tap call real quick.',
        ]);
      } else if (action.type === 'check') {
        text = pick([
          'Oh, on me? Check, check.',
          'Check. This video is hilarious, keep dealing.',
        ]);
      } else {
        text = pick([
          'Nah, folding. Back to my feed.',
          'Pass. My food delivery notification just pinged anyway.',
        ]);
      }
      break;
    }

    case 'flashy_maniac':
    default: {
      // Marcus (Maniac - Sunglasses & Silk Blazer)
      if (action.type === 'allin') {
        text = pick([
          'ALL IN BABY! Fortune favors the bold!',
          'Ship it! Let us see some fireworks!',
          'No guts, no Monte Carlo glory. All in!',
        ]);
      } else if (action.type === 'raise' || action.type === 'bet') {
        text = pick([
          'Pump it up! Small pots put me to sleep!',
          'Raise! Somebody wake Bao up from his phone!',
          'Let us make this pot worth a new sports car!',
        ]);
      } else if (action.type === 'call') {
        text = pick([
          'I love action. Count me in!',
          'Floating along! Any two cards can win!',
        ]);
      } else if (action.type === 'check') {
        text = pick(['Trapping? Maybe! Check!', 'Free card? I will take it!']);
      } else {
        text = pick(['Even I can not bluff this board. Fold!', 'Alright, alright, you got me.']);
      }
      break;
    }
  }

  return {
    id: `chat_${Date.now()}_${ai.id}`,
    senderId: ai.id,
    senderName: ai.name.split(' ')[0],
    seatIndex: ai.seatIndex,
    text,
    timestamp: Date.now(),
    voiceStyle: ai.voiceStyle,
  };
}

/**
 * Generates an AI reply when the human player clicks a Quick-Emote in the Table-Talk bar
 */
export function generateAIEmoteReply(
  emoteId: QuickEmoteId,
  players: PlayerState[]
): ChatMessage | null {
  const livingAI = players.filter((p) => !p.isHuman && !p.eliminated);
  if (livingAI.length === 0) return null;

  // If teasing the phone-watcher, Bao (Seat #3) responds if still in tournament
  const bao = livingAI.find((p) => p.persona === 'heavy_phone');
  const responder =
    emoteId === 'eyes_off_phone' && bao
      ? bao
      : livingAI[Math.floor(Math.random() * livingAI.length)];

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  let text = '';

  if (emoteId === 'eyes_off_phone' && responder.persona === 'heavy_phone') {
    text = pick([
      'Relax! I can scroll my feed and call your bets at the same time!',
      'Wait until I put this phone down. Then you are really in trouble.',
      'Hey, multitasking is a high-roller skill, my friend!',
    ]);
  } else if (emoteId === 'nice_hand') {
    text =
      responder.persona === 'woman'
        ? 'Thank you, darling. Class recognizes class.'
        : responder.persona === 'general_man'
        ? 'Appreciated. Well executed.'
        : 'That is how we roll in the VIP room!';
  } else if (emoteId === 'show_bluff') {
    text =
      responder.persona === 'flashy_maniac'
        ? 'Pay the price of admission if you want to see these cards!'
        : responder.persona === 'general_man'
        ? 'Information is never free at this table.'
        : 'A lady never reveals her secrets for free.';
  } else if (emoteId === 'lets_gamble') {
    text =
      responder.persona === 'flashy_maniac'
        ? 'Now you are speaking my language! Pile those chips in!'
        : responder.persona === 'heavy_phone'
        ? 'Hold on, pausing my video. Let us splash the pot!'
        : 'Careful what you wish for.';
  } else {
    text =
      responder.persona === 'woman'
        ? 'Make mine vintage champagne, please.'
        : responder.persona === 'general_man'
        ? 'Single malt, neat. Cheers.'
        : 'Cheers to a thousand-dollar pot!';
  }

  return {
    id: `chat_reply_${Date.now()}_${responder.id}`,
    senderId: responder.id,
    senderName: responder.name.split(' ')[0],
    seatIndex: responder.seatIndex,
    text,
    timestamp: Date.now(),
    voiceStyle: responder.voiceStyle,
  };
}

/**
 * Generates an AI table-talk reaction when the human player executes a sharp GTO/Exploit play
 * or commits a mathematical EV blunder.
 */
export function generateAIGTOReactionBanter(
  record: HandDecisionRecord,
  players: PlayerState[]
): ChatMessage | null {
  const livingAI = players.filter((p) => !p.isHuman && !p.eliminated);
  if (livingAI.length === 0) return null;

  // Trigger on blunders (~75% chance) or high-leverage optimal plays (~40% chance)
  if (record.grade === 'good' || record.grade === 'inaccuracy') return null;
  if (record.grade === 'best' && Math.random() > 0.42) return null;
  if (record.grade === 'blunder' && Math.random() > 0.78) return null;

  // Prefer Viktor (Shark) for math/solver commentary, or fallback to another living AI
  const viktor = livingAI.find((p) => p.persona === 'general_man');
  const responder =
    viktor && Math.random() < 0.65
      ? viktor
      : livingAI[Math.floor(Math.random() * livingAI.length)];

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  let text = '';

  if (record.grade === 'best') {
    switch (responder.persona) {
      case 'general_man':
        text = pick([
          `Textbook solver sizing from ${record.position}. You know your pot odds.`,
          `Clean GTO frequency there. You are not making it easy to exploit you.`,
          `Sharp line. Well played.`,
        ]);
        break;
      case 'woman':
        text = pick([
          `Poised and mathematically sound, darling. Well played.`,
          `A very composed line. You read the table texture well.`,
        ]);
        break;
      case 'heavy_phone':
        text = pick([
          `Wait, did you run a solver on me while I was scrolling?!`,
          `Hold on, that bet sizing looks way too balanced...`,
        ]);
        break;
      default:
        text = pick([
          `Look at the professor playing textbook GTO over here!`,
          `Sharp move! You brought your A-game to Monte Carlo!`,
        ]);
        break;
    }
  } else {
    // Blunder reaction
    switch (responder.persona) {
      case 'general_man':
        text = pick([
          `Bad math. That cost about ${record.evLossBB.toFixed(1)} big blinds.`,
          `The pot odds were ${record.potOddsPct}%, yet you deviated heavily. Interesting.`,
          `My solver model says that play is a major EV leak.`,
        ]);
        break;
      case 'woman':
        text = pick([
          `Bold, darling, though the mathematics were hardly in your favor.`,
          `Patience is cheaper than torching equity against a tight range.`,
        ]);
        break;
      case 'heavy_phone':
        text = pick([
          `Even while watching my feed I knew those pot odds looked wild!`,
          `Whoa, spicy move! You sure the math checks out on that one?`,
        ]);
        break;
      default:
        text = pick([
          `Throw the math book out the window! That is pure Vegas gamble!`,
          `Who cares about EV when you have heart?! Haha!`,
        ]);
        break;
    }
  }

  return {
    id: `chat_gto_${Date.now()}_${responder.id}`,
    senderId: responder.id,
    senderName: responder.name.split(' ')[0],
    seatIndex: responder.seatIndex,
    text,
    timestamp: Date.now(),
    voiceStyle: responder.voiceStyle,
  };
}

/**
 * Initial Player Setups for 5-seat VIP Sit & Go Tournament (Seat 0 is Human)
 */
export function createInitialPlayers(): PlayerState[] {
  return [
    {
      id: 'player_0',
      name: 'You (VIP)',
      avatarIndex: 0,
      chips: 200,
      currentBet: 0,
      totalHandBet: 0,
      folded: false,
      allIn: false,
      eliminated: false,
      cards: [],
      isHuman: true,
      persona: 'human',
      physicalAction: 'idle',
      activeTell: 'none',
      seatIndex: 0,
      isTurn: false,
      color: '#3b82f6',
      hudStats: createInitialHUDStats('human'),
    },
    {
      id: 'player_1',
      name: 'Viktor (Shark)',
      avatarIndex: 1,
      chips: 200,
      currentBet: 0,
      totalHandBet: 0,
      folded: false,
      allIn: false,
      eliminated: false,
      cards: [],
      isHuman: false,
      aiType: 'shark',
      persona: 'general_man',
      avatarUrl: '/assets/avatar_viktor.png',
      voiceName: 'Charon',
      voiceStyle: 'calm, deep, calculating European high-roller gentleman',
      physicalAction: 'idle',
      activeTell: 'none',
      isWatchingPhone: false,
      seatIndex: 1,
      isTurn: false,
      color: '#ef4444',
      hudStats: createInitialHUDStats('general_man'),
    },
    {
      id: 'player_2',
      name: 'Elena (Rock)',
      avatarIndex: 2,
      chips: 200,
      currentBet: 0,
      totalHandBet: 0,
      folded: false,
      allIn: false,
      eliminated: false,
      cards: [],
      isHuman: false,
      aiType: 'rock',
      persona: 'woman',
      avatarUrl: '/assets/avatar_elena.png',
      voiceName: 'Kore',
      voiceStyle: 'poised, sophisticated, warm aristocratic woman',
      physicalAction: 'idle',
      activeTell: 'none',
      isWatchingPhone: false,
      seatIndex: 2,
      isTurn: false,
      color: '#8b5cf6',
      hudStats: createInitialHUDStats('woman'),
    },
    {
      id: 'player_3',
      name: 'Bao (Station)',
      avatarIndex: 3,
      chips: 200,
      currentBet: 0,
      totalHandBet: 0,
      folded: false,
      allIn: false,
      eliminated: false,
      cards: [],
      isHuman: false,
      aiType: 'station',
      persona: 'heavy_phone',
      avatarUrl: '/assets/avatar_bao.png',
      voiceName: 'Fenrir',
      voiceStyle: 'casual, relaxed, slightly distracted heavy-set guy scrolling his phone',
      physicalAction: 'phone_scroll',
      activeTell: 'phone_scrolling',
      isWatchingPhone: true,
      seatIndex: 3,
      isTurn: false,
      color: '#10b981',
      hudStats: createInitialHUDStats('heavy_phone'),
    },
    {
      id: 'player_4',
      name: 'Marcus (Maniac)',
      avatarIndex: 4,
      chips: 200,
      currentBet: 0,
      totalHandBet: 0,
      folded: false,
      allIn: false,
      eliminated: false,
      cards: [],
      isHuman: false,
      aiType: 'maniac',
      persona: 'flashy_maniac',
      avatarUrl: '/assets/avatar_marcus.png',
      voiceName: 'Puck',
      voiceStyle: 'energetic, brash, fast-talking Vegas high-roller gambler',
      physicalAction: 'idle',
      activeTell: 'none',
      isWatchingPhone: false,
      seatIndex: 4,
      isTurn: false,
      color: '#f59e0b',
      hudStats: createInitialHUDStats('flashy_maniac'),
    },
  ];
}
