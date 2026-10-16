import {
  Card,
  CardRank,
  PlayerState,
  TableState,
  PlayerAction,
  TablePosition,
  BoardTextureType,
  GTOAnalysis,
  GTOActionRecommendation,
  GTOActionFrequencies,
  GTOActionEVs,
  GTOComboCell,
  GTOOutsBreakdown,
  HandDecisionRecord,
  DecisionGradeTier,
  GTOSolverMode,
  PlayerHUDStats,
} from '../types/poker';
import { evaluate7CardHand, SUITS, RANKS, getSuitSymbol } from './pokerEngine';

// Canonical rank order from Ace (14) down to Two (2) for the 13x13 GTO Matrix
export const MATRIX_RANKS: CardRank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export function getShortRankChar(rank: CardRank): string {
  switch (rank) {
    case 14: return 'A';
    case 13: return 'K';
    case 12: return 'Q';
    case 11: return 'J';
    case 10: return 'T';
    default: return String(rank);
  }
}

/**
 * Returns the canonical 169 combo string (e.g. "AA", "AKs", "AKo", "T9s", "72o")
 */
export function getCanonicalCombo(cards: Card[]): string {
  if (cards.length < 2) return '--';
  const [c1, c2] = cards;
  const high = Math.max(c1.rank, c2.rank) as CardRank;
  const low = Math.min(c1.rank, c2.rank) as CardRank;
  const hChar = getShortRankChar(high);
  const lChar = getShortRankChar(low);
  if (high === low) return `${hChar}${lChar}`;
  const suited = c1.suit === c2.suit ? 's' : 'o';
  return `${hChar}${lChar}${suited}`;
}

/**
 * Returns the (row, col) in the 13x13 matrix for any 2-card hand or canonical combo string.
 * Pairs sit on the diagonal (row === col), Suited above (row < col), Offsuit below (row > col).
 */
export function getComboMatrixCoords(combo: string): { row: number; col: number } {
  if (!combo || combo.length < 2) return { row: 0, col: 0 };
  const charToIdx = (ch: string): number => {
    switch (ch) {
      case 'A': return 0;
      case 'K': return 1;
      case 'Q': return 2;
      case 'J': return 3;
      case 'T': return 4;
      default: {
        const n = parseInt(ch, 10);
        return Math.max(0, Math.min(12, 14 - n));
      }
    }
  };
  const i1 = charToIdx(combo[0]);
  const i2 = charToIdx(combo[1]);
  const highIdx = Math.min(i1, i2);
  const lowIdx = Math.max(i1, i2);
  if (highIdx === lowIdx) return { row: highIdx, col: lowIdx };
  const isSuited = combo[2] === 's';
  return isSuited ? { row: highIdx, col: lowIdx } : { row: lowIdx, col: highIdx };
}

/**
 * Computes a continuous preflop strength score (0..100) and percentile (1 = top 1%, 100 = worst)
 * calibrated to 5-Max No-Limit Hold'em GTO preflop rankings.
 */
export function evaluateComboStrength(
  highRank: CardRank,
  lowRank: CardRank,
  isPair: boolean,
  isSuited: boolean
): { score: number; percentile: number; tier: 1 | 2 | 3 | 4 | 5 } {
  let score = 0;
  if (isPair) {
    // Pairs: AA=100, KK=96, QQ=92, JJ=87, TT=82, 99=74, 88=68, 77=62, 66=56, 55=51, 44=46, 33=42, 22=39
    score = 35 + ((highRank - 2) / 12) * 65;
    if (highRank >= 10) score += 6;
  } else {
    const highVal = (highRank - 2) / 12; // 0..1
    const lowVal = (lowRank - 2) / 12;   // 0..1
    score = highVal * 52 + lowVal * 24;
    if (isSuited) score += 11;

    const gap = highRank - lowRank;
    if (gap === 1) score += 7;       // Connectors (JT, T9, 98, 87...)
    else if (gap === 2) score += 4;  // 1-gappers
    else if (gap === 3) score += 1.5;

    // Wheel Ace bonus (A5s, A4s, A3s, A2s)
    if (highRank === 14 && lowRank <= 5 && isSuited) {
      score += 7;
    }
    // Broadway synergy bonus
    if (highRank >= 13 && lowRank >= 10) {
      score += 8;
    }
  }

  const clampedScore = Math.max(4, Math.min(100, score));
  // Convert score into "Top X% of hands" percentile (1 = AA, 100 = 72o)
  const percentile = Math.max(1, Math.min(100, Math.round(102 - clampedScore)));

  let tier: 1 | 2 | 3 | 4 | 5 = 5;
  if (percentile <= 8) tier = 1;
  else if (percentile <= 19) tier = 2;
  else if (percentile <= 35) tier = 3;
  else if (percentile <= 55) tier = 4;
  else tier = 5;

  return { score: clampedScore, percentile, tier };
}

/**
 * Determines exact 5-Max / Short-Handed position (BTN, SB, BB, UTG, CO) for any seat
 */
export function getSeatPosition(
  seatIndex: number,
  dealerSeat: number,
  players: PlayerState[]
): { position: TablePosition; description: string } {
  const livingSeats: number[] = [];
  for (let i = 0; i < players.length; i++) {
    const s = (dealerSeat + i) % players.length;
    if (!players[s].eliminated && (players[s].chips > 0 || players[s].totalHandBet > 0)) {
      livingSeats.push(s);
    }
  }

  const n = livingSeats.length;
  const relIdx = livingSeats.indexOf(seatIndex);
  if (relIdx === -1 || n <= 1) {
    return { position: 'BTN', description: 'Button (Dealer)' };
  }

  if (n === 2) {
    return relIdx === 0
      ? { position: 'BTN', description: 'Button / Small Blind (Heads-Up)' }
      : { position: 'BB', description: 'Big Blind (Heads-Up)' };
  }

  if (n === 3) {
    if (relIdx === 0) return { position: 'BTN', description: 'Button (3-Handed)' };
    if (relIdx === 1) return { position: 'SB', description: 'Small Blind' };
    return { position: 'BB', description: 'Big Blind' };
  }

  if (n === 4) {
    if (relIdx === 0) return { position: 'BTN', description: 'Button' };
    if (relIdx === 1) return { position: 'SB', description: 'Small Blind' };
    if (relIdx === 2) return { position: 'BB', description: 'Big Blind' };
    return { position: 'CO', description: 'Cutoff (first to act)' };
  }

  // Full 5-Max Table
  switch (relIdx) {
    case 0: return { position: 'BTN', description: 'Button (best position)' };
    case 1: return { position: 'SB', description: 'Small Blind (out of position)' };
    case 2: return { position: 'BB', description: 'Big Blind (closes preflop action)' };
    case 3: return { position: 'UTG', description: 'Under the Gun (tightest range)' };
    default: return { position: 'CO', description: 'Cutoff (late position)' };
  }
}

/**
 * Classifies postflop board texture for solver heuristics
 */
export function classifyBoardTexture(communityCards: Card[]): BoardTextureType {
  if (communityCards.length < 3) return 'Preflop';

  const suits: Record<string, number> = {};
  const ranks: Record<number, number> = {};
  const uniqueRanks: number[] = [];

  for (const c of communityCards) {
    suits[c.suit] = (suits[c.suit] || 0) + 1;
    ranks[c.rank] = (ranks[c.rank] || 0) + 1;
    if (!uniqueRanks.includes(c.rank)) uniqueRanks.push(c.rank);
  }

  const maxSuitCount = Math.max(...Object.values(suits));
  const maxRankCount = Math.max(...Object.values(ranks));
  uniqueRanks.sort((a, b) => a - b);

  if (maxSuitCount >= 3) return 'Monotone Flush-Heavy';
  if (maxRankCount >= 2) return 'Paired Board';

  // Check straight connectivity
  let maxConnected = 1;
  for (let i = 0; i < uniqueRanks.length; i++) {
    let withinSpan = 1;
    for (let j = i + 1; j < uniqueRanks.length; j++) {
      if (uniqueRanks[j] - uniqueRanks[i] <= 4) withinSpan++;
    }
    if (withinSpan > maxConnected) maxConnected = withinSpan;
  }

  if (maxConnected >= 3) return 'Connected Straight-Heavy';
  const highCount = communityCards.filter((c) => c.rank >= 11).length;
  if (highCount >= 2) return 'High Broadway';
  if (maxSuitCount === 2) return 'Dynamic Two-Tone';
  return 'Dry Rainbow';
}

/**
 * Computes clean Outs, draw categories, and exact Turn/River hit probabilities
 */
export function calculateOutsAndDraws(
  heroCards: Card[],
  communityCards: Card[]
): GTOOutsBreakdown {
  if (heroCards.length < 2 || communityCards.length < 3 || communityCards.length >= 5) {
    return {
      totalOuts: 0,
      drawLabels: communityCards.length === 5 ? ['River Complete'] : ['Preflop'],
      nextStreetHitPct: 0,
      byRiverHitPct: 0,
      keyOutCards: [],
    };
  }

  const knownCards = [...heroCards, ...communityCards];
  const currentEval = evaluate7CardHand(knownCards);
  const currentScore = currentEval.score;
  const currentCategory = currentEval.category;

  const drawLabels: string[] = [];
  const keyOutCards: string[] = [];
  const outRanks = new Set<string>();

  // 1. Check Flush Draw
  const suitCounts: Record<string, number> = {};
  for (const c of knownCards) {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  }
  let flushDrawSuit: string | null = null;
  for (const [s, cnt] of Object.entries(suitCounts)) {
    if (cnt === 4 && heroCards.some((hc) => hc.suit === s)) {
      flushDrawSuit = s;
    }
  }

  // 2. Test every remaining card in the 52-card deck to see which ones meaningfully upgrade Hero
  const unseenCards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const exists = knownCards.some((k) => k.suit === suit && k.rank === rank);
      if (!exists) {
        unseenCards.push({ id: `sim_${suit}_${rank}`, suit, rank, faceUp: true });
      }
    }
  }

  const maxBoardRank = Math.max(...communityCards.map((c) => c.rank));
  let flushOuts = 0;
  let straightOuts = 0;
  let tripsOrFullHouseOuts = 0;
  let overcardOrTwoPairOuts = 0;
  const improvingCardIds = new Set<string>();

  for (const candidate of unseenCards) {
    const nextEval = evaluate7CardHand([...knownCards, candidate]);
    // Ignore board-only improvements that don't use Hero's cards or merely pair the board without helping Hero
    const boardOnlyEval =
      communityCards.length >= 4 ? evaluate7CardHand([...communityCards, candidate]) : null;
    if (boardOnlyEval && boardOnlyEval.score >= nextEval.score) {
      continue;
    }

    if (nextEval.score > currentScore + 800000) {
      if (nextEval.category === 'Flush' || nextEval.category === 'Straight Flush' || nextEval.category === 'Royal Flush') {
        flushOuts++;
        improvingCardIds.add(candidate.id);
      } else if (nextEval.category === 'Straight') {
        straightOuts++;
        improvingCardIds.add(candidate.id);
        outRanks.add(getShortRankChar(candidate.rank));
      } else if (
        nextEval.category === 'Three of a Kind' ||
        nextEval.category === 'Full House' ||
        nextEval.category === 'Four of a Kind'
      ) {
        tripsOrFullHouseOuts++;
        improvingCardIds.add(candidate.id);
        outRanks.add(getShortRankChar(candidate.rank));
      } else if (
        currentCategory === 'High Card' &&
        nextEval.category === 'One Pair' &&
        candidate.rank > maxBoardRank &&
        heroCards.some((h) => h.rank === candidate.rank)
      ) {
        // Clean Overcard out to Top Pair
        overcardOrTwoPairOuts++;
        improvingCardIds.add(candidate.id);
        outRanks.add(getShortRankChar(candidate.rank));
      } else if (currentCategory === 'One Pair' && nextEval.category === 'Two Pair') {
        // Hero pairs their second hole card for Two Pair
        if (heroCards.some((h) => h.rank === candidate.rank)) {
          overcardOrTwoPairOuts++;
          improvingCardIds.add(candidate.id);
          outRanks.add(getShortRankChar(candidate.rank));
        }
      }
    }
  }

  if (flushDrawSuit && flushOuts > 0) {
    const sym = getSuitSymbol(flushDrawSuit as any);
    drawLabels.push(`Flush Draw (${flushOuts} outs)`);
    keyOutCards.push(`Any ${sym} (${flushOuts})`);
  }
  if (straightOuts >= 6) {
    drawLabels.push(`Open-Ended Straight Draw (${straightOuts} outs)`);
  } else if (straightOuts >= 3) {
    drawLabels.push(`Gutshot Straight Draw (${straightOuts} outs)`);
  }
  if (tripsOrFullHouseOuts > 0) {
    drawLabels.push(
      currentCategory === 'One Pair'
        ? `Set Outs (${tripsOrFullHouseOuts})`
        : `Full House / Quads Redraw (${tripsOrFullHouseOuts})`
    );
  }
  if (overcardOrTwoPairOuts > 0 && flushOuts === 0 && straightOuts === 0) {
    drawLabels.push(
      currentCategory === 'High Card'
        ? `Overcards (${overcardOrTwoPairOuts} outs)`
        : `Two-Pair Outs (${overcardOrTwoPairOuts} outs)`
    );
  }

  if (outRanks.size > 0) {
    keyOutCards.push(`Ranks: ${Array.from(outRanks).slice(0, 5).join(', ')}`);
  }

  const totalOuts = improvingCardIds.size;
  const unseenCount = unseenCards.length; // 47 on flop, 46 on turn
  const nextStreetHitPct =
    unseenCount > 0 ? Math.round((totalOuts / unseenCount) * 1000) / 10 : 0;

  let byRiverHitPct = nextStreetHitPct;
  if (communityCards.length === 3 && unseenCount >= 2) {
    const missTurn = (unseenCount - totalOuts) / unseenCount;
    const missRiver = Math.max(0, unseenCount - 1 - totalOuts) / (unseenCount - 1);
    byRiverHitPct = Math.round((1 - missTurn * missRiver) * 1000) / 10;
  }

  if (drawLabels.length === 0) {
    drawLabels.push(currentScore >= 2000000 ? 'Made Value Hand' : 'Showdown / Bluff-Catcher');
  }

  return {
    totalOuts,
    drawLabels,
    nextStreetHitPct,
    byRiverHitPct,
    keyOutCards,
  };
}

/**
 * Initializes realistic baseline HUD stats for each AI persona so pro grinders immediately
 * have meaningful VPIP / PFR / 3-Bet / AF telemetry on Hand #1, which updates dynamically.
 */
export function createInitialHUDStats(persona?: string): PlayerHUDStats {
  switch (persona) {
    case 'general_man': // Viktor (TAG Shark: 26% VPIP / 21% PFR / 9% 3B / 2.8 AF)
      return {
        handsDealt: 24,
        vpipCount: 6,
        pfrCount: 5,
        threeBetCount: 2,
        aggressiveActions: 14,
        passiveActions: 5,
        vpipPct: 26,
        pfrPct: 21,
        threeBetPct: 9,
        aggressionFactor: 2.8,
      };
    case 'woman': // Elena (Tight Rock: 16% VPIP / 13% PFR / 5% 3B / 1.5 AF)
      return {
        handsDealt: 24,
        vpipCount: 4,
        pfrCount: 3,
        threeBetCount: 1,
        aggressiveActions: 6,
        passiveActions: 4,
        vpipPct: 16,
        pfrPct: 13,
        threeBetPct: 5,
        aggressionFactor: 1.5,
      };
    case 'heavy_phone': // Bao (Calling Station: 58% VPIP / 9% PFR / 2% 3B / 0.6 AF)
      return {
        handsDealt: 24,
        vpipCount: 14,
        pfrCount: 2,
        threeBetCount: 0,
        aggressiveActions: 7,
        passiveActions: 12,
        vpipPct: 58,
        pfrPct: 9,
        threeBetPct: 2,
        aggressionFactor: 0.6,
      };
    case 'flashy_maniac': // Marcus (Loose Maniac: 52% VPIP / 38% PFR / 18% 3B / 3.6 AF)
      return {
        handsDealt: 24,
        vpipCount: 12,
        pfrCount: 9,
        threeBetCount: 4,
        aggressiveActions: 18,
        passiveActions: 5,
        vpipPct: 52,
        pfrPct: 38,
        threeBetPct: 18,
        aggressionFactor: 3.6,
      };
    default: // Human player starts fresh
      return {
        handsDealt: 0,
        vpipCount: 0,
        pfrCount: 0,
        threeBetCount: 0,
        aggressiveActions: 0,
        passiveActions: 0,
        vpipPct: 0,
        pfrPct: 0,
        threeBetPct: 0,
        aggressionFactor: 1.0,
      };
  }
}

/**
 * Updates a player's HUD stats when they make an action
 */
export function recordActionInHUDStats(
  prev: PlayerHUDStats | undefined,
  action: PlayerAction,
  phase: string,
  wasFacingRaise: boolean
): PlayerHUDStats {
  const stats = prev ? { ...prev } : createInitialHUDStats('human');
  const isVoluntary = action.type === 'call' || action.type === 'bet' || action.type === 'raise' || action.type === 'allin';
  const isRaise = action.type === 'bet' || action.type === 'raise' || action.type === 'allin';

  if (phase === 'preflop' && isVoluntary) {
    stats.vpipCount += 1;
    if (isRaise) {
      stats.pfrCount += 1;
      if (wasFacingRaise) stats.threeBetCount += 1;
    }
  }

  if (isRaise) stats.aggressiveActions += 1;
  else if (action.type === 'call') stats.passiveActions += 1;

  const denom = Math.max(1, stats.handsDealt);
  stats.vpipPct = Math.min(99, Math.round((stats.vpipCount / denom) * 100));
  stats.pfrPct = Math.min(stats.vpipPct, Math.round((stats.pfrCount / denom) * 100));
  stats.threeBetPct = Math.min(stats.pfrPct, Math.round((stats.threeBetCount / denom) * 100));
  stats.aggressionFactor =
    Math.round((stats.aggressiveActions / Math.max(1, stats.passiveActions)) * 10) / 10;

  return stats;
}

/**
 * Selects the primary Villain in the hand (either the current high-bet aggressor or the most relevant active opponent)
 */
function findPrimaryVillain(
  players: PlayerState[],
  table: TableState
): PlayerState | undefined {
  const activeOpponents = players.filter((p) => !p.isHuman && !p.eliminated && !p.folded);
  if (activeOpponents.length === 0) return undefined;

  // Prefer opponent who has committed the highest bet this street, or has an active physical tell
  const sorted = [...activeOpponents].sort((a, b) => {
    if (b.currentBet !== a.currentBet) return b.currentBet - a.currentBet;
    if (b.activeTell && b.activeTell !== 'none' && (!a.activeTell || a.activeTell === 'none')) return 1;
    return b.chips - a.chips;
  });
  return sorted[0];
}

/**
 * Fast Monte Carlo Equity Simulator:
 * Computes both Pure GTO Equity (vs balanced positional range) and Node-Locked Exploit Equity
 * (adjusted for Villain's VPIP/PFR archetype and live 3D physical tells!).
 */
function runDualMonteCarloEquity(
  heroCards: Card[],
  communityCards: Card[],
  pureGtoRangeWidthPct: number,
  exploitRangeWidthPct: number,
  villainTell?: string,
  villainPersona?: string
): { pureGtoEquityPct: number; exploitEquityPct: number } {
  if (heroCards.length < 2) {
    return { pureGtoEquityPct: 50, exploitEquityPct: 50 };
  }

  const known = [...heroCards, ...communityCards];
  const remainingDeck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (!known.some((k) => k.suit === suit && k.rank === rank)) {
        remainingDeck.push({ id: `mc_${suit}_${rank}`, suit, rank, faceUp: true });
      }
    }
  }

  const boardNeeded = Math.max(0, 5 - communityCards.length);
  const iterations = 260;

  let pureWins = 0;
  let pureTotalWeight = 0;
  let exploitWins = 0;
  let exploitTotalWeight = 0;

  for (let i = 0; i < iterations; i++) {
    // Partial Fisher-Yates shuffle for (2 villain hole cards + boardNeeded community cards)
    const sampleCount = 2 + boardNeeded;
    for (let j = 0; j < sampleCount; j++) {
      const r = j + Math.floor(Math.random() * (remainingDeck.length - j));
      const tmp = remainingDeck[j];
      remainingDeck[j] = remainingDeck[r];
      remainingDeck[r] = tmp;
    }

    const v1 = remainingDeck[0];
    const v2 = remainingDeck[1];
    const simBoard = [...communityCards];
    for (let b = 0; b < boardNeeded; b++) {
      simBoard.push(remainingDeck[2 + b]);
    }

    const high = Math.max(v1.rank, v2.rank) as CardRank;
    const low = Math.min(v1.rank, v2.rank) as CardRank;
    const { percentile } = evaluateComboStrength(high, low, high === low, v1.suit === v2.suit);

    const heroScore = evaluate7CardHand([...heroCards, ...simBoard]).score;
    const villainCurrentEval =
      communityCards.length >= 3 ? evaluate7CardHand([v1, v2, ...communityCards]) : null;
    const villainFinalScore = evaluate7CardHand([v1, v2, ...simBoard]).score;

    const resultShare =
      heroScore > villainFinalScore ? 1.0 : heroScore === villainFinalScore ? 0.5 : 0.0;

    // 1. Pure GTO Weighting (strictly positional preflop range percentile)
    const pureWeight = percentile <= pureGtoRangeWidthPct ? 1.0 : 0.15;
    pureWins += resultShare * pureWeight;
    pureTotalWeight += pureWeight;

    // 2. Node-Locked Exploit Weighting (Persona VPIP + Live 3D Physical Tell Lock!)
    let exploitWeight = percentile <= exploitRangeWidthPct ? 1.0 : 0.1;

    if (villainTell === 'phone_down_monster') {
      // Bao put his phone down! Lock range heavily to Monsters (Two Pair+ postflop or Top 12% preflop)
      const isPostflopMonster = villainCurrentEval && villainCurrentEval.score >= 2000000;
      const isPreflopMonster = percentile <= 12;
      exploitWeight = isPostflopMonster || isPreflopMonster ? 8.5 : 0.08;
    } else if (villainTell === 'chip_fidget_bluff') {
      // Marcus is fidgeting with chips! Weight heavily toward bluffs / weak holdings
      const isWeakPostflop = !villainCurrentEval || villainCurrentEval.score < 1000000;
      exploitWeight = isWeakPostflop && percentile > 22 ? 6.5 : 0.3;
    } else if (villainTell === 'posture_tight') {
      // Elena poised = Top 8% nutted range
      const isNutted = (villainCurrentEval && villainCurrentEval.score >= 2000000) || percentile <= 8;
      exploitWeight = isNutted ? 9.0 : 0.06;
    } else if (villainTell === 'watch_glance_strong') {
      // Viktor glanced at watch = Top 15% strong range
      const isStrong = (villainCurrentEval && villainCurrentEval.score >= 1500000) || percentile <= 15;
      exploitWeight = isStrong ? 6.0 : 0.15;
    } else if (villainPersona === 'heavy_phone') {
      // Bao scrolling phone = wide calling station (58% range)
      exploitWeight = percentile <= 58 ? 1.5 : 0.25;
    }

    exploitWins += resultShare * exploitWeight;
    exploitTotalWeight += exploitWeight;
  }

  const pureGtoEquityPct =
    pureTotalWeight > 0 ? Math.round((pureWins / pureTotalWeight) * 1000) / 10 : 50;
  const exploitEquityPct =
    exploitTotalWeight > 0 ? Math.round((exploitWins / exploitTotalWeight) * 1000) / 10 : 50;

  return { pureGtoEquityPct, exploitEquityPct };
}

/**
 * Builds an Action Recommendation (frequencies, EV in BB, best move & sizing presets)
 */
function buildRecommendation(params: {
  mode: GTOSolverMode;
  table: TableState;
  human: PlayerState;
  equityPct: number;
  potOddsPct: number;
  effectiveStackBB: number;
  spr: number;
  heroPercentile: number;
  position: TablePosition;
  outs: GTOOutsBreakdown;
  villain?: PlayerState;
}): GTOActionRecommendation {
  const {
    mode,
    table,
    human,
    equityPct,
    potOddsPct,
    effectiveStackBB,
    heroPercentile,
    position,
    outs,
    villain,
  } = params;

  const bb = Math.max(1, table.bigBlind);
  const callAmount = Math.max(0, table.currentHighBet - human.currentBet);
  const isFreeToCheck = callAmount === 0;
  const minLegalRaiseTotal = Math.min(
    human.chips + human.currentBet,
    Math.max(table.bigBlind, table.currentHighBet + table.minRaise)
  );
  const maxLegalTotal = human.chips + human.currentBet;

  // Sizing presets (Preflop vs Postflop)
  let smallRaiseTotal = minLegalRaiseTotal;
  let bigRaiseTotal = minLegalRaiseTotal;
  let smallLabel = '33% Pot';
  let bigLabel = '75% Pot';

  if (table.phase === 'preflop') {
    const isUnopened = table.currentHighBet <= table.bigBlind;
    smallLabel = isUnopened ? '2.2x Open' : '2.8x 3-Bet';
    bigLabel = isUnopened ? '3.2x Open' : '4.0x 3-Bet';
    const rawSmall = isUnopened ? Math.round(bb * 2.2) : Math.round(table.currentHighBet * 2.8);
    const rawBig = isUnopened ? Math.round(bb * 3.2) : Math.round(table.currentHighBet * 4.0);
    smallRaiseTotal = Math.min(maxLegalTotal, Math.max(minLegalRaiseTotal, rawSmall));
    bigRaiseTotal = Math.min(maxLegalTotal, Math.max(minLegalRaiseTotal, rawBig));
  } else {
    const activePot = Math.max(bb * 2, table.pot + callAmount);
    smallLabel = '33% Pot';
    bigLabel = '75% Pot';
    const rawSmall = table.currentHighBet + Math.max(bb, Math.round(activePot * 0.35));
    const rawBig = table.currentHighBet + Math.max(bb * 2, Math.round(activePot * 0.75));
    smallRaiseTotal = Math.min(maxLegalTotal, Math.max(minLegalRaiseTotal, rawSmall));
    bigRaiseTotal = Math.min(maxLegalTotal, Math.max(minLegalRaiseTotal, rawBig));
  }

  const potRaiseTotal = Math.min(
    maxLegalTotal,
    Math.max(minLegalRaiseTotal, table.currentHighBet + table.pot + callAmount)
  );

  // Estimate Villain Fold Equity (how often Villain folds to a raise)
  let foldEquity = 0.38;
  if (mode === 'exploit' && villain) {
    if (villain.activeTell === 'phone_down_monster' || villain.activeTell === 'posture_tight') {
      foldEquity = 0.04; // Monster tell = Villain almost never folds!
    } else if (villain.activeTell === 'chip_fidget_bluff') {
      foldEquity = 0.68; // Bluff tell = Villain folds air to re-raises or barrels into calls
    } else if (villain.persona === 'heavy_phone') {
      foldEquity = 0.16; // Calling station rarely folds
    } else if (villain.persona === 'woman') {
      foldEquity = 0.56; // Rock folds often without the goods
    } else if (villain.persona === 'flashy_maniac') {
      foldEquity = 0.32;
    }
  }

  const eq = equityPct / 100;
  const potBB = table.pot / bb;
  const callBB = Math.min(human.chips, callAmount) / bb;
  const smallRaiseCostBB = Math.max(callBB, (smallRaiseTotal - human.currentBet) / bb);
  const bigRaiseCostBB = Math.max(callBB, (bigRaiseTotal - human.currentBet) / bb);
  const allinCostBB = human.chips / bb;

  // EV Calculations in Big Blinds (relative to 0.00 BB for Fold)
  const evFold = 0;
  const evCheckCall = isFreeToCheck
    ? Math.round(eq * potBB * 100) / 100
    : Math.round((eq * (potBB + callBB) - (1 - eq) * callBB) * 100) / 100;

  const evRaiseSmall =
    Math.round(
      (foldEquity * potBB +
        (1 - foldEquity) * (eq * (potBB + smallRaiseCostBB * 2) - (1 - eq) * smallRaiseCostBB)) *
        100
    ) / 100;

  const evRaiseBig =
    Math.round(
      (Math.min(0.85, foldEquity * 1.22) * potBB +
        (1 - Math.min(0.85, foldEquity * 1.22)) *
          (eq * (potBB + bigRaiseCostBB * 2) - (1 - eq) * bigRaiseCostBB)) *
        100
    ) / 100;

  const allinFoldEq = Math.min(0.88, foldEquity * 1.35);
  const evAllin =
    Math.round(
      (allinFoldEq * potBB +
        (1 - allinFoldEq) * (eq * (potBB + allinCostBB * 2) - (1 - eq) * allinCostBB)) *
        100
    ) / 100;

  // Compute Action Frequencies (0..100%)
  let fold = 0;
  let checkCall = 0;
  let raiseSmall = 0;
  let raiseBig = 0;
  let allin = 0;
  let reasoning = '';

  // Push/Fold short stack regime (<= 10 BB)
  if (effectiveStackBB <= 10 && table.phase === 'preflop') {
    const pushThresholdPct = position === 'BTN' || position === 'SB' ? 46 : 28;
    if (heroPercentile <= pushThresholdPct || equityPct >= 54) {
      allin = 78;
      raiseSmall = 12;
      checkCall = 10;
      reasoning = `Short stack (${effectiveStackBB.toFixed(1)} BB): shove the top ${pushThresholdPct}% from ${position}.`;
    } else {
      fold = isFreeToCheck ? 0 : 85;
      checkCall = isFreeToCheck ? 90 : 10;
      allin = 5;
      reasoning = `Short stack (${effectiveStackBB.toFixed(1)} BB): ${equityPct}% equity is too weak to shove from ${position}. Wait for a better spot.`;
    }
  } else if (mode === 'exploit' && villain?.activeTell === 'phone_down_monster') {
    // Node-Locked Exploit against Bao's Phone-Down Monster Tell!
    if (equityPct >= 62) {
      raiseBig = 60;
      allin = 25;
      checkCall = 15;
      reasoning = `Bao put his phone down (top 12%), but you still have ${equityPct}% equity. Bet for value.`;
    } else if (!isFreeToCheck && equityPct < potOddsPct + 6) {
      fold = 88;
      checkCall = 12;
      reasoning = `Bao put his phone down (two pair or better). ${equityPct}% equity vs ${potOddsPct}% pot odds: fold.`;
    } else {
      checkCall = 78;
      raiseSmall = 12;
      fold = isFreeToCheck ? 0 : 10;
      reasoning = `Bao's phone is down. Keep the pot small and don't bluff.`;
    }
  } else if (mode === 'exploit' && villain?.activeTell === 'chip_fidget_bluff') {
    // Node-Locked Exploit against Marcus's Chip Fidget Bluff Tell!
    if (equityPct >= 44) {
      checkCall = isFreeToCheck ? 35 : 68;
      raiseSmall = 22;
      raiseBig = 10;
      reasoning = `Marcus is fidgeting (about 65% bluffs). With ${equityPct}% equity, call down or trap.`;
    } else {
      checkCall = isFreeToCheck ? 75 : 40;
      raiseBig = 35;
      fold = isFreeToCheck ? 0 : 25;
      reasoning = `Marcus's fidget means weakness. Raise or bluff-catch.`;
    }
  } else if (mode === 'exploit' && villain?.persona === 'heavy_phone' && villain.isWatchingPhone) {
    // Node-Locked Exploit against Distracted Calling Station Bao!
    if (equityPct >= 58) {
      raiseBig = 68;
      raiseSmall = 22;
      checkCall = 10;
      reasoning = `Bao is scrolling and calls too much. Bet ${bigLabel} ($${bigRaiseTotal}) for value.`;
    } else if (outs.totalOuts >= 8) {
      checkCall = 76;
      raiseSmall = 18;
      fold = isFreeToCheck ? 0 : 6;
      reasoning = `Bao won't fold while scrolling, so don't semi-bluff. Take the cheap card (${outs.totalOuts} outs, ${outs.byRiverHitPct}% to hit).`;
    } else {
      fold = isFreeToCheck ? 0 : 82;
      checkCall = isFreeToCheck ? 92 : 18;
      reasoning = `Don't bluff Bao with ${equityPct}% equity. Check/fold.`;
    }
  } else {
    // Standard Pure GTO / Balanced Solver Logic
    const equityMargin = equityPct - potOddsPct;
    if (equityPct >= 70) {
      raiseBig = 52;
      raiseSmall = 30;
      checkCall = 12;
      allin = effectiveStackBB <= 18 ? 6 : 6;
      reasoning = `${equityPct}% equity vs ${potOddsPct}% pot odds from ${position}. Mix ${smallLabel} and ${bigLabel} bets.`;
    } else if (equityPct >= 54) {
      raiseSmall = 48;
      checkCall = 38;
      raiseBig = 14;
      reasoning = `${equityPct}% equity. Mix ${smallLabel} bets with ${checkCall}% check/call.`;
    } else if (outs.totalOuts >= 8 && equityMargin >= -6) {
      checkCall = 58;
      raiseSmall = 32;
      fold = isFreeToCheck ? 0 : 10;
      reasoning = `Strong draw (${outs.totalOuts} outs, ${outs.byRiverHitPct}% by the river). Call ${checkCall}%, raise ${raiseSmall}%.`;
    } else if (isFreeToCheck) {
      checkCall = 82;
      raiseSmall = 18;
      reasoning = `${equityPct}% equity from ${position}. Check and see a free card.`;
    } else if (equityMargin >= 2) {
      checkCall = 72;
      raiseSmall = 14;
      fold = 14;
      reasoning = `${equityPct}% equity beats the ${potOddsPct}% you need ($${callAmount} into $${table.pot}). Call.`;
    } else {
      fold = 80;
      checkCall = 15;
      raiseSmall = 5;
      reasoning = `Calling $${callAmount} needs ${potOddsPct}% equity. You have ${equityPct}%.`;
    }
  }

  // Ensure legal normalization (if free to check, fold is 0%)
  if (isFreeToCheck && fold > 0) {
    checkCall += fold;
    fold = 0;
  }
  if (human.chips <= callAmount) {
    // Facing an all-in or stack-committing bet: only Fold or All-In/Call exist
    const continueFreq = checkCall + raiseSmall + raiseBig + allin;
    checkCall = 0;
    raiseSmall = 0;
    raiseBig = 0;
    allin = continueFreq;
  }

  const sum = Math.max(1, fold + checkCall + raiseSmall + raiseBig + allin);
  const frequencies: GTOActionFrequencies = {
    fold: Math.round((fold / sum) * 100),
    checkCall: Math.round((checkCall / sum) * 100),
    raiseSmall: Math.round((raiseSmall / sum) * 100),
    raiseBig: Math.round((raiseBig / sum) * 100),
    allin: Math.max(0, 100 - Math.round((fold / sum) * 100) - Math.round((checkCall / sum) * 100) - Math.round((raiseSmall / sum) * 100) - Math.round((raiseBig / sum) * 100)),
  };

  // Determine highest-frequency / highest-EV primary recommended action
  const candidates: {
    key: keyof GTOActionFrequencies;
    freq: number;
    ev: number;
    action: PlayerAction;
    label: string;
  }[] = [
    {
      key: 'fold',
      freq: frequencies.fold,
      ev: evFold,
      action: { type: 'fold' },
      label: 'Fold',
    },
    {
      key: 'checkCall',
      freq: frequencies.checkCall,
      ev: evCheckCall,
      action: isFreeToCheck ? { type: 'check' } : { type: 'call' },
      label: isFreeToCheck ? 'Check' : `Call $${Math.min(human.chips, callAmount)}`,
    },
    {
      key: 'raiseSmall',
      freq: frequencies.raiseSmall,
      ev: evRaiseSmall,
      action:
        smallRaiseTotal >= maxLegalTotal
          ? { type: 'allin' }
          : { type: 'raise', amount: smallRaiseTotal },
      label:
        smallRaiseTotal >= maxLegalTotal
          ? `All-In ($${human.chips})`
          : `${table.currentHighBet === 0 ? 'Bet' : 'Raise'} $${smallRaiseTotal} (${smallLabel})`,
    },
    {
      key: 'raiseBig',
      freq: frequencies.raiseBig,
      ev: evRaiseBig,
      action:
        bigRaiseTotal >= maxLegalTotal
          ? { type: 'allin' }
          : { type: 'raise', amount: bigRaiseTotal },
      label:
        bigRaiseTotal >= maxLegalTotal
          ? `All-In ($${human.chips})`
          : `${table.currentHighBet === 0 ? 'Bet' : 'Raise'} $${bigRaiseTotal} (${bigLabel})`,
    },
    {
      key: 'allin',
      freq: frequencies.allin,
      ev: evAllin,
      action: { type: 'allin' },
      label: `All-In ($${human.chips})`,
    },
  ];

  candidates.sort((a, b) => b.freq - a.freq || b.ev - a.ev);
  const best = candidates[0];

  return {
    frequencies,
    evs: {
      fold: evFold,
      checkCall: evCheckCall,
      raiseSmall: evRaiseSmall,
      raiseBig: evRaiseBig,
      allin: evAllin,
    },
    bestAction: best.action,
    bestActionLabel: best.label,
    bestActionEvBB: best.ev,
    sizingPresets: {
      smallLabel,
      smallAmount: smallRaiseTotal,
      bigLabel,
      bigAmount: bigRaiseTotal,
      potAmount: potRaiseTotal,
    },
    reasoning,
  };
}

/**
 * Generates the 13x13 (169-combo) GTO Range Matrix for the current position & Villain range lock
 */
export function build13x13RangeMatrix(
  heroCombo: string,
  position: TablePosition,
  facingRaise: boolean,
  villainRangeWidthPct: number
): GTOComboCell[][] {
  // Positional open/defend thresholds in 5-Max
  const openCutoffPct =
    position === 'BTN'
      ? 45
      : position === 'CO'
      ? 32
      : position === 'SB'
      ? 42
      : position === 'BB'
      ? 48
      : 22; // UTG

  const matrix: GTOComboCell[][] = [];

  for (let r = 0; r < 13; r++) {
    const rowCells: GTOComboCell[] = [];
    for (let c = 0; c < 13; c++) {
      const rankRow = MATRIX_RANKS[r];
      const rankCol = MATRIX_RANKS[c];
      const isPair = r === c;
      const isSuited = r < c;
      const highRank = Math.max(rankRow, rankCol) as CardRank;
      const lowRank = Math.min(rankRow, rankCol) as CardRank;

      const hChar = getShortRankChar(highRank);
      const lChar = getShortRankChar(lowRank);
      const combo = isPair ? `${hChar}${lChar}` : `${hChar}${lChar}${isSuited ? 's' : 'o'}`;

      const { percentile, tier } = evaluateComboStrength(highRank, lowRank, isPair, isSuited);

      let raiseFreq = 0;
      let callFreq = 0;
      let foldFreq = 100;

      if (!facingRaise) {
        if (percentile <= openCutoffPct * 0.68) {
          raiseFreq = 90;
          callFreq = 10;
          foldFreq = 0;
        } else if (percentile <= openCutoffPct) {
          raiseFreq = 60;
          callFreq = 25;
          foldFreq = 15;
        } else if (percentile <= openCutoffPct + 10) {
          raiseFreq = 20;
          callFreq = 20;
          foldFreq = 60;
        }
      } else {
        // Facing a raise (3-bet or Call or Fold)
        if (percentile <= 10) {
          raiseFreq = 82;
          callFreq = 18;
          foldFreq = 0;
        } else if (percentile <= openCutoffPct * 0.72) {
          raiseFreq = 25;
          callFreq = 65;
          foldFreq = 10;
        } else if (percentile <= openCutoffPct) {
          raiseFreq = 10;
          callFreq = 35;
          foldFreq = 55;
        }
      }

      const villainWeight =
        percentile <= villainRangeWidthPct
          ? 100
          : percentile <= villainRangeWidthPct + 12
          ? 45
          : 0;

      rowCells.push({
        combo,
        row: r,
        col: c,
        isPair,
        isSuited,
        tier,
        percentile,
        raiseFreq,
        callFreq,
        foldFreq,
        villainWeight,
        isHeroHand: combo === heroCombo,
      });
    }
    matrix.push(rowCells);
  }

  return matrix;
}

/**
 * Master GTO & Node-Locked Exploitative Analyzer for the Human Player (Seat #0)
 */
export function computeGTOAnalysis(
  table: TableState,
  players: PlayerState[]
): GTOAnalysis {
  const human = players[0];
  const bb = Math.max(1, table.bigBlind);
  const { position, description: positionDescription } = getSeatPosition(
    0,
    table.dealerSeat,
    players
  );

  const activeOpponents = players.filter((p) => !p.isHuman && !p.eliminated && !p.folded);
  const maxOppStack =
    activeOpponents.length > 0
      ? Math.max(...activeOpponents.map((p) => p.chips + p.currentBet))
      : human.chips;
  const effectiveStack = Math.min(human.chips + human.currentBet, maxOppStack);
  const effectiveStackBB = Math.round((effectiveStack / bb) * 10) / 10;

  const callAmount = Math.max(0, table.currentHighBet - human.currentBet);
  const totalPotWithCall = table.pot + callAmount;
  const potOddsPct =
    callAmount > 0 && totalPotWithCall > 0
      ? Math.round((callAmount / totalPotWithCall) * 1000) / 10
      : 0;
  const potOddsRatio =
    callAmount > 0 ? `${(table.pot / callAmount).toFixed(1)} : 1` : 'Free Check';
  const requiredEquityPct = potOddsPct;

  const spr =
    table.pot > 0 ? Math.round((effectiveStack / table.pot) * 10) / 10 : effectiveStackBB;

  // Minimum Defense Frequency: Pot / (Pot + Bet)
  const currentStreetBet = Math.max(0, table.currentHighBet);
  const potBeforeBet = Math.max(bb, table.pot - currentStreetBet);
  const mdfPct =
    callAmount > 0
      ? Math.round((potBeforeBet / (potBeforeBet + callAmount)) * 100)
      : 100;

  const boardTexture = classifyBoardTexture(table.communityCards);
  const heroCombo = getCanonicalCombo(human.cards);

  let heroHandTier: 1 | 2 | 3 | 4 | 5 = 3;
  let heroPercentile = 50;
  if (human.cards.length >= 2) {
    const high = Math.max(human.cards[0].rank, human.cards[1].rank) as CardRank;
    const low = Math.min(human.cards[0].rank, human.cards[1].rank) as CardRank;
    const evalCombo = evaluateComboStrength(
      high,
      low,
      high === low,
      human.cards[0].suit === human.cards[1].suit
    );
    heroHandTier = evalCombo.tier;
    heroPercentile = evalCombo.percentile;
  }

  // Primary Villain & Tell-Lock Profile
  const villain = findPrimaryVillain(players, table);
  let pureGtoRangeWidthPct = 28;
  let exploitRangeWidthPct = 28;
  let tellLockTitle: string | undefined;
  let tellLockImpact: string | undefined;

  if (villain) {
    const vPos = getSeatPosition(villain.seatIndex, table.dealerSeat, players).position;
    pureGtoRangeWidthPct =
      vPos === 'UTG' ? 20 : vPos === 'CO' ? 28 : vPos === 'BTN' ? 42 : 36;

    if (villain.activeTell === 'phone_down_monster') {
      exploitRangeWidthPct = 12;
      tellLockTitle = 'Tell lock: Bao put his phone down';
      tellLockImpact =
        'Top 12% range (two pair or better). Don\'t bluff.';
    } else if (villain.activeTell === 'chip_fidget_bluff') {
      exploitRangeWidthPct = 66;
      tellLockTitle = 'Tell lock: Marcus is fidgeting with his chips';
      tellLockImpact =
        'About 65% bluffs. Call wide or trap.';
    } else if (villain.activeTell === 'posture_tight') {
      exploitRangeWidthPct = 8;
      tellLockTitle = 'Tell lock: Elena tightened up (nutted range)';
      tellLockImpact =
        'Top 8% range (QQ+, AK, sets, flushes). Fold medium pairs.';
    } else if (villain.activeTell === 'watch_glance_strong') {
      exploitRangeWidthPct = 15;
      tellLockTitle = 'Tell lock: Viktor checked his watch';
      tellLockImpact =
        'Top 15% range. Call less.';
    } else if (villain.persona === 'heavy_phone') {
      exploitRangeWidthPct = 58;
      tellLockTitle = 'Archetype lock: distracted calling station';
      tellLockImpact =
        '58% VPIP, calls with weak pairs. Don\'t bluff; value-bet big.';
    } else if (villain.persona === 'flashy_maniac') {
      exploitRangeWidthPct = 52;
      tellLockTitle = 'Archetype lock: high-variance maniac';
      tellLockImpact =
        '52% VPIP / 38% PFR. 3-bet wider and bluff-catch more.';
    } else if (villain.persona === 'woman') {
      exploitRangeWidthPct = 16;
      tellLockTitle = 'Archetype lock: tight-passive rock';
      tellLockImpact =
        '16% VPIP, folds without top pair. Steal her blinds and c-bet often.';
    } else {
      exploitRangeWidthPct = 26;
      tellLockTitle = 'Archetype lock: balanced TAG shark';
      tellLockImpact =
        '26% VPIP / 21% PFR, balanced. Play standard GTO.';
    }
  }

  const outs = calculateOutsAndDraws(human.cards, table.communityCards);
  const { pureGtoEquityPct, exploitEquityPct } = runDualMonteCarloEquity(
    human.cards,
    table.communityCards,
    pureGtoRangeWidthPct,
    exploitRangeWidthPct,
    villain?.activeTell,
    villain?.persona
  );

  const pureGto = buildRecommendation({
    mode: 'pure_gto',
    table,
    human,
    equityPct: pureGtoEquityPct,
    potOddsPct,
    effectiveStackBB,
    spr,
    heroPercentile,
    position,
    outs,
    villain,
  });

  const exploit = buildRecommendation({
    mode: 'exploit',
    table,
    human,
    equityPct: exploitEquityPct,
    potOddsPct,
    effectiveStackBB,
    spr,
    heroPercentile,
    position,
    outs,
    villain,
  });

  const facingRaise = table.currentHighBet > table.bigBlind;
  const rangeMatrix = build13x13RangeMatrix(
    heroCombo,
    position,
    facingRaise,
    exploitRangeWidthPct
  );

  return {
    position,
    positionDescription,
    effectiveStackBB,
    spr,
    potOddsPct,
    potOddsRatio,
    requiredEquityPct,
    mdfPct,
    boardTexture,
    heroCombo,
    heroHandTier,
    heroPercentile,
    pureGtoEquityPct,
    exploitEquityPct,
    outs,
    pureGto,
    exploit,
    primaryVillain: villain
      ? {
          id: villain.id,
          name: villain.name,
          persona: villain.persona,
          aiType: villain.aiType,
          position: getSeatPosition(villain.seatIndex, table.dealerSeat, players).position,
          hudStats: villain.hudStats,
          activeTell: villain.activeTell,
          isWatchingPhone: villain.isWatchingPhone,
          tellLockTitle,
          tellLockImpact,
          estimatedRangeWidthPct: exploitRangeWidthPct,
        }
      : undefined,
    rangeMatrix,
  };
}

/**
 * Grades a human player's chosen action against the active GTO / Exploit solver recommendation
 */
export function gradePlayerDecision(
  action: PlayerAction,
  analysis: GTOAnalysis,
  table: TableState,
  human: PlayerState,
  activeMode: GTOSolverMode = 'exploit'
): HandDecisionRecord {
  const rec = activeMode === 'exploit' ? analysis.exploit : analysis.pureGto;
  const equityPct =
    activeMode === 'exploit' ? analysis.exploitEquityPct : analysis.pureGtoEquityPct;
  const callAmount = Math.max(0, table.currentHighBet - human.currentBet);

  let chosenFreq = 0;
  let evEarnedBB = 0;
  let chosenActionLabel = '';

  switch (action.type) {
    case 'fold':
      chosenFreq = rec.frequencies.fold;
      evEarnedBB = rec.evs.fold;
      chosenActionLabel = 'Fold';
      break;
    case 'check':
      chosenFreq = rec.frequencies.checkCall;
      evEarnedBB = rec.evs.checkCall;
      chosenActionLabel = 'Check';
      break;
    case 'call':
      chosenFreq = rec.frequencies.checkCall;
      evEarnedBB = rec.evs.checkCall;
      chosenActionLabel = `Call $${Math.min(human.chips, callAmount)}`;
      break;
    case 'bet':
    case 'raise': {
      const amt = action.amount || table.currentHighBet + table.minRaise;
      const isBig = amt >= (rec.sizingPresets.smallAmount + rec.sizingPresets.bigAmount) / 2;
      chosenFreq = isBig
        ? rec.frequencies.raiseBig + rec.frequencies.raiseSmall * 0.5
        : rec.frequencies.raiseSmall + rec.frequencies.raiseBig * 0.5;
      evEarnedBB = isBig ? rec.evs.raiseBig : rec.evs.raiseSmall;
      chosenActionLabel = `${table.currentHighBet === 0 ? 'Bet' : 'Raise'} $${amt}`;
      break;
    }
    case 'allin':
      chosenFreq = rec.frequencies.allin + rec.frequencies.raiseBig * 0.6;
      evEarnedBB = rec.evs.allin;
      chosenActionLabel = `All-In ($${human.chips})`;
      break;
  }

  const optimalEvBB = Math.max(
    rec.evs.fold,
    rec.evs.checkCall,
    rec.evs.raiseSmall,
    rec.evs.raiseBig,
    rec.evs.allin
  );
  const rawEvLoss = Math.max(0, Math.round((optimalEvBB - evEarnedBB) * 100) / 100);

  let grade: DecisionGradeTier = 'best';
  let evLossBB = rawEvLoss;

  if (action.type === rec.bestAction.type || chosenFreq >= 38 || rawEvLoss <= 0.18) {
    grade = 'best';
    evLossBB = 0;
  } else if (chosenFreq >= 16 || rawEvLoss <= 0.65) {
    grade = 'good';
  } else if (rawEvLoss <= 1.75) {
    grade = 'inaccuracy';
  } else {
    grade = 'blunder';
  }

  let coachingNote = '';
  if (grade === 'best') {
    coachingNote = `Best ${activeMode === 'exploit' ? 'Exploit' : 'GTO'} line. ${rec.reasoning}`;
  } else if (grade === 'good') {
    coachingNote = `Fine (${Math.round(chosenFreq)}% mix). Slightly better: ${rec.bestActionLabel} (+${optimalEvBB.toFixed(2)} BB).`;
  } else if (grade === 'inaccuracy') {
    coachingNote = `Inaccuracy (-${evLossBB.toFixed(2)} BB): ${rec.bestActionLabel} is better. ${rec.reasoning}`;
  } else {
    coachingNote = `Blunder (-${evLossBB.toFixed(2)} BB): ${equityPct}% equity vs ${analysis.potOddsPct}% pot odds. Play ${rec.bestActionLabel}.`;
  }

  return {
    id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    handNumber: table.handCount,
    phase: table.phase,
    position: analysis.position,
    heroCombo: analysis.heroCombo,
    chosenActionLabel,
    chosenActionType: action.type,
    optimalActionLabel: rec.bestActionLabel,
    optimalMode: activeMode,
    grade,
    evEarnedBB,
    optimalEvBB,
    evLossBB,
    equityPct,
    potOddsPct: analysis.potOddsPct,
    coachingNote,
    timestamp: Date.now(),
  };
}
