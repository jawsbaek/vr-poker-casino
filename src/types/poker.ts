export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type CardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  id: string;
  suit: Suit;
  rank: CardRank;
  faceUp: boolean;
  dealOrder?: number;
}

export type ChipDenomination = 1 | 5 | 25 | 100;

export interface Chip {
  denomination: ChipDenomination;
  color: string;
}

export type AIType = 'shark' | 'rock' | 'station' | 'maniac';

export type AIPersona =
  | 'human'
  | 'general_man'     // Seat #1: Viktor (Tailored Suit, Whiskey Glass, Shark)
  | 'woman'           // Seat #2: Elena (Evening Gown, Champagne Flute, Rock)
  | 'heavy_phone'     // Seat #3: Bao (Heavy build, Glowing 3D Smartphone, Soda Can, Calling Station)
  | 'flashy_maniac';  // Seat #4: Marcus (Aviator Sunglasses, Silk Blazer, Espresso, Maniac)

export type PhysicalActionType =
  | 'idle'
  | 'phone_scroll'
  | 'phone_down_alert'
  | 'check_knock'
  | 'chip_push'
  | 'fold_flick'
  | 'peek_cards'
  | 'fidget_bluff'
  | 'celebrate';

export type PhysicalTellType =
  | 'none'
  | 'phone_scrolling'
  | 'phone_down_monster'
  | 'chip_fidget_bluff'
  | 'watch_glance_strong'
  | 'posture_tight';

export type DealerActionType =
  | 'idle'
  | 'riffle_shuffle'
  | 'pitch_cards'
  | 'burn_tap'
  | 'sweep_pot'
  | 'announce';

export type MusicMood = 'lounge_jazz' | 'high_stakes';

export type QuickEmoteId =
  | 'nice_hand'
  | 'show_bluff'
  | 'eyes_off_phone'
  | 'lets_gamble'
  | 'drinks_on_me'
  | 'good_luck';

export interface QuickEmote {
  id: QuickEmoteId;
  label: string;
  text: string;
  icon: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor?: string;
  seatIndex?: number; // -1 for Dealer, 0..4 for Players
  text: string;
  timestamp: number;
  voiceStyle?: string;
  isDealer?: boolean;
}

export interface PlayerHUDStats {
  handsDealt: number;
  vpipCount: number;
  pfrCount: number;
  threeBetCount: number;
  aggressiveActions: number;
  passiveActions: number;
  vpipPct: number;          // Voluntarily Put $ In Pot %
  pfrPct: number;           // Preflop Raise %
  threeBetPct: number;      // 3-Bet %
  aggressionFactor: number; // (Bet + Raise) / Call
}

export interface PlayerState {
  id: string;
  name: string;
  avatarIndex: number;
  chips: number;
  currentBet: number;      // Bet in the current betting street
  totalHandBet: number;    // Cumulative chips committed in this hand (for side pots)
  folded: boolean;
  allIn: boolean;
  eliminated: boolean;     // True once busted out in tournament play
  finishPlace?: number;    // 1..5 tournament standing
  cards: Card[];
  isHuman: boolean;
  aiType?: AIType;
  persona?: AIPersona;
  avatarUrl?: string;
  voiceName?: string;
  voiceStyle?: string;
  physicalAction?: PhysicalActionType;
  activeTell?: PhysicalTellType;
  isWatchingPhone?: boolean;
  activeChatBubble?: string;
  activeChatTimestamp?: number;
  lastAction?: string;
  hasActedThisRound?: boolean;
  seatIndex: number;
  isTurn: boolean;
  color: string;
  hudStats?: PlayerHUDStats;
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

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
  label: string; // e.g., "Main Pot" or "Side Pot #1"
}

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number;
  handName: string;
  potLabel?: string;
  bestCards: Card[];
}

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
}

export interface SessionStats {
  handsPlayed: number;
  handsWon: number;
  biggestPotWon: number;
  netProfit: number;
  tournamentsWon: number;
  gtoDecisionsTotal: number;
  gtoOptimalCount: number;
  gtoCumulativeEvLossBB: number;
  gtoAccuracyScore: number; // 0..100%
}

export interface TableState {
  phase: TablePhase;
  pot: number;
  sidePots: SidePot[];
  currentHighBet: number;
  minRaise: number;
  smallBlind: number;
  bigBlind: number;
  blindLevel: number;
  dealerSeat: number;
  activeSeat: number;
  communityCards: Card[];
  burnCardsCount: number;
  winners: WinnerInfo[];
  handCount: number;
  stagedBet: number; // Chips physically dragged into the betting ring by Seat #0
  isAllInRunout?: boolean;
  tournamentWinnerId?: string;
}

export type PlayerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PlayerAction {
  type: PlayerActionType;
  amount?: number;
}

// ============================================================================
// PRO GTO STRATEGY, 13x13 RANGE MATRIX & DECISION GRADER TYPES
// ============================================================================

export type TablePosition = 'BTN' | 'SB' | 'BB' | 'UTG' | 'CO';

export type GTOSolverMode = 'exploit' | 'pure_gto';

export type BoardTextureType =
  | 'Preflop'
  | 'Dry Rainbow'
  | 'Dynamic Two-Tone'
  | 'Monotone Flush-Heavy'
  | 'Paired Board'
  | 'Connected Straight-Heavy'
  | 'High Broadway';

export interface GTOActionFrequencies {
  fold: number;       // 0..100
  checkCall: number;  // 0..100
  raiseSmall: number; // 0..100 (e.g. 2.2x preflop or 33%-50% pot postflop)
  raiseBig: number;   // 0..100 (e.g. 3x preflop or 66%-75% pot postflop)
  allin: number;      // 0..100
}

export interface GTOActionEVs {
  fold: number;       // Always 0.00 BB baseline
  checkCall: number;  // EV in BB
  raiseSmall: number; // EV in BB
  raiseBig: number;   // EV in BB
  allin: number;      // EV in BB
}

export interface GTOActionRecommendation {
  frequencies: GTOActionFrequencies;
  evs: GTOActionEVs;
  bestAction: PlayerAction;
  bestActionLabel: string;
  bestActionEvBB: number;
  sizingPresets: {
    smallLabel: string;
    smallAmount: number;
    bigLabel: string;
    bigAmount: number;
    potAmount: number;
  };
  reasoning: string;
}

export interface GTOOutsBreakdown {
  totalOuts: number;
  drawLabels: string[];
  nextStreetHitPct: number; // Turn or River single-card hit %
  byRiverHitPct: number;    // Combined Turn+River hit %
  keyOutCards: string[];    // e.g., ["Any ♠ (9)", "Any 9 or 4 (8)"]
}

export interface GTOComboCell {
  combo: string;        // e.g. "AA", "AKs", "AKo"
  row: number;          // 0..12 (A down to 2)
  col: number;          // 0..12 (A down to 2)
  isPair: boolean;
  isSuited: boolean;
  tier: 1 | 2 | 3 | 4 | 5;
  percentile: number;   // 0..100 (top % of hands)
  raiseFreq: number;    // 0..100 in current spot
  callFreq: number;     // 0..100 in current spot
  foldFreq: number;     // 0..100 in current spot
  villainWeight: number;// 0..100 likelihood in Villain's node-locked range
  isHeroHand: boolean;
}

export interface GTOAnalysis {
  position: TablePosition;
  positionDescription: string;
  effectiveStackBB: number;
  spr: number;                  // Stack-to-Pot Ratio
  potOddsPct: number;           // Call / (Pot + Call) * 100
  potOddsRatio: string;         // e.g. "2.5 : 1"
  requiredEquityPct: number;
  mdfPct: number;               // Minimum Defense Frequency %
  boardTexture: BoardTextureType;
  heroCombo: string;            // e.g. "AKs"
  heroHandTier: 1 | 2 | 3 | 4 | 5;
  heroPercentile: number;       // e.g. Top 4%
  pureGtoEquityPct: number;     // Monte Carlo Equity vs balanced positional range
  exploitEquityPct: number;     // Monte Carlo Equity vs Villain archetype + live tell range
  outs: GTOOutsBreakdown;
  pureGto: GTOActionRecommendation;
  exploit: GTOActionRecommendation;
  primaryVillain?: {
    id: string;
    name: string;
    persona?: AIPersona;
    aiType?: AIType;
    position: TablePosition;
    hudStats?: PlayerHUDStats;
    activeTell?: PhysicalTellType;
    isWatchingPhone?: boolean;
    tellLockTitle?: string;
    tellLockImpact?: string;
    estimatedRangeWidthPct: number;
  };
  rangeMatrix: GTOComboCell[][];
}

export type DecisionGradeTier = 'best' | 'good' | 'inaccuracy' | 'blunder';

export interface HandDecisionRecord {
  id: string;
  handNumber: number;
  phase: TablePhase;
  position: TablePosition;
  heroCombo: string;
  chosenActionLabel: string;
  chosenActionType: PlayerActionType;
  optimalActionLabel: string;
  optimalMode: GTOSolverMode;
  grade: DecisionGradeTier;
  evEarnedBB: number;
  optimalEvBB: number;
  evLossBB: number;
  equityPct: number;
  potOddsPct: number;
  coachingNote: string;
  timestamp: number;
}

// ==========================================
// 3D VISUAL FEEDBACK & DOGFOODING TYPES
// ==========================================

export type CameraPresetId =
  | 'seat0_pov'
  | 'top_down'
  | 'macro_cards_chips'
  | 'bao_tell_closeup'
  | 'viktor_marcus_rim'
  | 'dealer_pov';

export type DogfoodScenarioId =
  | 'preflop_deal'
  | 'card_peel'
  | 'chip_drag_stage'
  | 'bao_phone_scroll'
  | 'bao_phone_down_monster'
  | 'all_in_runout'
  | 'showdown_multiway';

export interface SpatialAuditCheck {
  id: string;
  label: string;
  passed: boolean;
  metric: string;
  details?: string;
}

export interface SpatialAuditReport {
  timestamp: number;
  allPassed: boolean;
  cameraPreset?: CameraPresetId;
  drawCalls: number;
  triangles: number;
  checks: SpatialAuditCheck[];
}

// ============================================================================
// HUD & UI DESIGN RULES + VERIFICATION HARNESS TYPES
// ============================================================================

export type ActiveDrawerId = 'none' | 'gto' | 'settings' | 'xr';

export interface ScreenBoundingRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface HudUiRuleSpec {
  id: string;
  code?: string;
  category: string;
  title: string;
  rule?: string;
  threshold?: string;
  constraint?: string;
  rationale?: string;
}

export interface HudUiAuditCheck {
  id: string;
  ruleId?: string;
  category?: string;
  label: string;
  passed: boolean;
  metric: string;
  details?: string;
}

export interface HudUiAuditReport {
  timestamp: number;
  allPassed: boolean;
  show2DHUD?: boolean;
  isInXR?: boolean;
  cameraPreset?: CameraPresetId;
  viewport: { width: number; height: number; area?: number };
  visibleInteractiveCount: number;
  topBarUtilityButtonCount: number;
  hudCoveragePct?: number;
  hudViewportCoveragePct?: number;
  activeDrawerCount?: number;
  openDrawerCount?: number;
  topBarHeightPx?: number;
  bottomDockHeightPx?: number;
  checks: HudUiAuditCheck[];
}

