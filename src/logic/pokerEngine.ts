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
import { createInitialHUDStats } from './gtoEngine';

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
 * Computes Main Pot and any Side Pots from players' cumulative hand contributions (totalHandBet).
 */
export function calculateSidePots(players: PlayerState[]): SidePot[] {
  const contributors = players.filter((p) => p.totalHandBet > 0);
  if (contributors.length === 0) return [];

  // Distinct contribution levels of non-folded players, plus max overall contribution
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
 */
export function adjudicateShowdown(
  players: PlayerState[],
  communityCards: Card[],
  fallbackTotalPot: number
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

  let sidePots = calculateSidePots(players);
  const sumSidePots = sidePots.reduce((acc, s) => acc + s.amount, 0);
  if (sidePots.length === 0 || sumSidePots === 0) {
    sidePots = [
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

  for (const pot of sidePots) {
    const eligible = contenders.filter((p) => pot.eligiblePlayerIds.includes(p.id));
    if (eligible.length === 0) continue;

    let bestScore = -1;
    for (const p of eligible) {
      const score = handEvals.get(p.id)!.score;
      if (score > bestScore) bestScore = score;
    }

    const potWinners = eligible.filter((p) => handEvals.get(p.id)!.score === bestScore);
    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount - share * potWinners.length;

    for (const w of potWinners) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      const award = share + extra;
      chipAwards[w.id] = (chipAwards[w.id] || 0) + award;
      payouts.set(w.id, (payouts.get(w.id) || 0) + award);

      const evalInfo = handEvals.get(w.id)!;
      const existing = winnerMap.get(w.id);
      if (existing) {
        existing.amount += award;
        existing.potLabel = existing.potLabel ? `${existing.potLabel} & ${pot.label}` : pot.label;
      } else {
        winnerMap.set(w.id, {
          playerId: w.id,
          playerName: w.name,
          amount: award,
          handName: evalInfo.description,
          potLabel: pot.label,
          bestCards: evalInfo.bestCards,
        });
      }
    }
  }

  return {
    winners: Array.from(winnerMap.values()),
    chipAwards,
    payouts,
    sidePots,
  };
}

/**
 * AI Decision Maker based on Personality & Tournament Stack Pressure
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

  // Pre-flop pocket quality (0..1 scale)
  let preflopStrength = 0.35;
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

  // Short-stack tournament push/fold pressure (< 8 big blinds)
  const mRatio = ai.chips / Math.max(1, table.bigBlind);
  if (mRatio <= 6 && preflopStrength >= 0.65) {
    return { type: 'allin' };
  }

  const aiType = ai.aiType || 'station';

  switch (aiType) {
    // Viktor (Shark): Aggressive, position-aware, bluffs weakness
    case 'shark': {
      if (table.phase === 'preflop') {
        if (preflopStrength > 0.65) {
          const raiseAmt = table.bigBlind * (2 + Math.floor(Math.random() * 2));
          return makeRaiseOrCall(raiseAmt);
        }
        if (callAmount > table.bigBlind * 4 && preflopStrength < 0.45) {
          return { type: 'fold' };
        }
        return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
      } else {
        const isStrong = handScore >= 2000000; // Two pair+
        const isMonster = handScore >= 4000000; // Straight+
        const randomBluff = Math.random() < 0.18;

        if (isMonster || randomBluff) {
          return makeRaiseOrCall(Math.max(table.minRaise, Math.floor(table.pot * 0.7)));
        }
        if (isStrong) {
          return makeRaiseOrCall(Math.max(table.minRaise, Math.floor(table.pot * 0.45)));
        }
        if (callAmount > table.pot * 0.6 && handScore < 1000000) {
          return isFreeToCheck ? { type: 'check' } : { type: 'fold' };
        }
        return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
      }
    }

    // Elena (Rock): Tight-passive, premium pairs & top hands
    case 'rock': {
      if (table.phase === 'preflop') {
        if (preflopStrength < 0.55 && callAmount > 0) return { type: 'fold' };
        if (preflopStrength >= 0.85) {
          return makeRaiseOrCall(table.bigBlind * 2);
        }
        return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
      } else {
        if (handScore < 1000000 && callAmount > 0) return { type: 'fold' };
        if (handScore >= 5000000) {
          return makeRaiseOrCall(Math.floor(table.pot * 0.5));
        }
        return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
      }
    }

    // Marcus (Maniac): High variance, frequent raises and all-ins
    case 'maniac': {
      const willSpike = Math.random() < 0.38;
      if (willSpike && ai.chips > callAmount) {
        if (Math.random() < 0.22 && ai.chips <= table.bigBlind * 20) {
          return { type: 'allin' };
        }
        return makeRaiseOrCall(table.bigBlind * (2 + Math.floor(Math.random() * 4)));
      }
      if (callAmount > ai.chips * 0.8 && preflopStrength < 0.35 && handScore < 1000000) {
        return isFreeToCheck ? { type: 'check' } : { type: 'fold' };
      }
      return isFreeToCheck ? { type: 'check' } : callAmount >= ai.chips ? { type: 'allin' } : { type: 'call' };
    }

    // Bao (Calling Station): Loves seeing flops and calling down
    case 'station':
    default: {
      if (callAmount > ai.chips * 0.65 && preflopStrength < 0.4 && handScore < 1000000) {
        return isFreeToCheck ? { type: 'check' } : { type: 'fold' };
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
    text: "Hey Bao, eyes off the phone—we're playing Hold'em!",
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

/**
 * Generates contextual AI table banter on turn actions (and cross-table teasing of Bao's phone habit)
 */
export function generateAITurnBanter(
  ai: PlayerState,
  action: PlayerAction,
  table: TableState,
  allPlayers: PlayerState[]
): ChatMessage | null {
  // ~42% chance on normal actions, 85% on all-in or big raises
  const isBigMove = action.type === 'allin' || action.type === 'raise' || action.type === 'bet';
  const triggerChance = action.type === 'allin' ? 0.92 : isBigMove ? 0.65 : 0.35;
  if (Math.random() > triggerChance) return null;

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
          'Bao is still staring at his screen—easy blinds.',
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
      if (!ai.isWatchingPhone || ai.activeTell === 'phone_down_monster') {
        // Phone is DOWN on the table!
        text = pick([
          'Hold on—putting the phone down for this hand.',
          'Screen locked. You have my full attention now.',
          'Wait a second... look at these cards. I am in!',
        ]);
      } else if (action.type === 'allin') {
        text = pick([
          'Hold my phone! All-in!',
          'Pushing the whole stack—hope I do not miss my stream!',
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
          'Checking—this video is hilarious, keep dealing.',
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
          'No guts, no Monte Carlo glory—all in!',
        ]);
      } else if (action.type === 'raise' || action.type === 'bet') {
        text = pick([
          'Pump it up! Small pots put me to sleep!',
          'Raise! Somebody wake Bao up from his phone!',
          'Let us make this pot worth a new sports car!',
        ]);
      } else if (action.type === 'call') {
        text = pick([
          'I love action—count me in!',
          'Floating along! Any two cards can win!',
        ]);
      } else if (action.type === 'check') {
        text = pick(['Trapping? Maybe! Check!', 'Free card—I will take it!']);
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
      'Wait until I put this phone down—then you are really in trouble.',
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
        ? 'Hold on, pausing my video—let us splash the pot!'
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
          `Sharp line—your range construction is disciplined.`,
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
          `Questionable math—that line torches roughly ${record.evLossBB.toFixed(1)} big blinds of EV.`,
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
