import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'node_modules', '.cache', 'algo-verify');
fs.mkdirSync(tmpDir, { recursive: true });

function compileTsModule(relPath, replacements = {}) {
  let source = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
  for (const [from, to] of Object.entries(replacements)) {
    source = source.replaceAll(from, to);
  }
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const outName = path.basename(relPath).replace(/\.ts$/, '.mjs');
  const outPath = path.join(tmpDir, outName);
  fs.writeFileSync(outPath, result.outputText, 'utf8');
  return pathToFileURL(outPath).href;
}

compileTsModule('src/types/poker.ts');
const gtoEngineUrl = compileTsModule('src/logic/gtoEngine.ts', {
  "from '../types/poker'": "from './poker.mjs'",
  "from './pokerEngine'": "from './pokerEngine.mjs'",
});
const pokerEngineUrl = compileTsModule('src/logic/pokerEngine.ts', {
  "from '../types/poker'": "from './poker.mjs'",
  "from './gtoEngine'": "from './gtoEngine.mjs'",
});

const pokerEngine = await import(pokerEngineUrl);
const gtoEngine = await import(gtoEngineUrl);

const {
  createDeck,
  shuffleDeck,
  createSeededRNG,
  hashStringSeed,
  buildRemainingDeck,
  dealHoleCardsClockwise,
  evaluate7CardHand,
  computeSidePots,
  adjudicateShowdown,
  getAIDecision,
} = pokerEngine;

const {
  evaluateComboStrength,
  classifyBoardTexture,
  calculateOutsAndDraws,
  runDualMonteCarloEquity,
  computeGTOAnalysis,
} = gtoEngine;

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const RANK_MAP = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function card(rank, suit) {
  const numRank = RANK_MAP[rank] ?? rank;
  return { id: `${numRank}_${suit}`, rank: numRank, suit, faceUp: true };
}

console.log('=== 1. CSPRNG & Seeded Fisher-Yates Deck Integrity ===');
{
  const deck1 = createDeck();
  assert(deck1.length === 52, 'Standard deck has 52 cards', `len=${deck1.length}`);
  const uniqueIds = new Set(deck1.map((c) => `${c.rank}_${c.suit}`));
  assert(uniqueIds.size === 52, 'All 52 cards have unique rank+suit combinations', `unique=${uniqueIds.size}`);

  // Deterministic seeded shuffle reproducibility
  const seed = hashStringSeed('test-seed-2026');
  const seededA = createDeck(createSeededRNG(seed));
  const seededB = createDeck(createSeededRNG(seed));
  const sameOrder = seededA.every((c, i) => c.rank === seededB[i].rank && c.suit === seededB[i].suit);
  assert(sameOrder, 'Seeded RNG produces identical 52-card permutation for identical seed');

  const diffSeed = createDeck(createSeededRNG(hashStringSeed('different-seed')));
  const isDifferent = diffSeed.some((c, i) => c.rank !== seededA[i].rank || c.suit !== seededA[i].suit);
  assert(isDifferent, 'Different seeds produce distinct deck permutations');

  // buildRemainingDeck integrity
  const excluded = [card('A', 'spades'), card('K', 'spades'), card('Q', 'hearts'), card('J', 'clubs')];
  const remaining = buildRemainingDeck(excluded, createSeededRNG(42));
  assert(remaining.length === 48, 'buildRemainingDeck excludes known cards accurately', `len=${remaining.length}`);
  const hasExcluded = remaining.some((c) =>
    excluded.some((e) => e.rank === c.rank && e.suit === c.suit)
  );
  assert(!hasExcluded, 'buildRemainingDeck contains zero excluded hole/board cards');
}

console.log('\n=== 2. Clockwise 2-Pass Dealing Algorithm (TDA Standard) ===');
{
  const deck = [
    card('A', 'spades'),
    card('2', 'spades'),
    card('3', 'spades'),
    card('4', 'spades'),
    card('5', 'spades'),
    card('6', 'spades'),
    card('7', 'spades'),
    card('8', 'spades'),
    card('9', 'spades'),
    card('10', 'spades'),
    card('J', 'spades'),
  ];
  const mockPlayers = [0, 1, 2, 3, 4].map((seatIndex) => ({
    id: `p_${seatIndex}`,
    name: `P${seatIndex}`,
    seatIndex,
    chips: 200,
    currentBet: 0,
    totalHandBet: 0,
    folded: false,
    eliminated: false,
    isAllIn: false,
    isHuman: seatIndex === 0,
    cards: [],
  }));
  // Dealer at seat 0 -> SB is seat 1, active seats [0, 1, 2, 3, 4]
  const { updatedPlayers, remainingDeck } = dealHoleCardsClockwise(deck, mockPlayers, 1);
  const pSeat1 = updatedPlayers.find((p) => p.seatIndex === 1);
  const pSeat0 = updatedPlayers.find((p) => p.seatIndex === 0);
  // Pass 1: seats 1, 2, 3, 4, 0 get dealOrder 0..4
  // Pass 2: seats 1, 2, 3, 4, 0 get dealOrder 5..9
  assert(
    pSeat1.cards[0].dealOrder === 0 && pSeat1.cards[1].dealOrder === 5,
    'SB (seat 1) receives 1st card (dealOrder 0) and 6th card (dealOrder 5)',
    `orders=[${pSeat1.cards[0].dealOrder}, ${pSeat1.cards[1].dealOrder}]`
  );
  assert(
    pSeat0.cards[0].dealOrder === 4 && pSeat0.cards[1].dealOrder === 9,
    'Dealer (seat 0) receives 5th card (dealOrder 4) and 10th card (dealOrder 9)',
    `orders=[${pSeat0.cards[0].dealOrder}, ${pSeat0.cards[1].dealOrder}]`
  );
  assert(remainingDeck.length === 1, 'Remaining deck has 10 fewer cards after dealing to 5 seats');
}

console.log('\n=== 3. Collision-Free Base-15 Hand Evaluator & Category Monotonicity ===');
{
  // Critical regression test: Highest One Pair (Pair of Aces with K-Q-J kickers) MUST score strictly lower than Lowest Two Pair (2s & 3s with 4 kicker)!
  const highestOnePair = evaluate7CardHand([
    card('A', 'spades'),
    card('A', 'hearts'),
    card('K', 'clubs'),
    card('Q', 'diamonds'),
    card('J', 'spades'),
    card('9', 'hearts'),
    card('2', 'clubs'),
  ]);
  const lowestTwoPair = evaluate7CardHand([
    card('3', 'spades'),
    card('3', 'hearts'),
    card('2', 'diamonds'),
    card('2', 'clubs'),
    card('4', 'spades'),
    card('7', 'hearts'),
    card('9', 'clubs'),
  ]);
  assert(
    highestOnePair.category === 'One Pair' && lowestTwoPair.category === 'Two Pair',
    'Correctly classifies Highest One Pair (AA-KQJ) and Lowest Two Pair (33-22-4)',
    `onePair="${highestOnePair.category} (${highestOnePair.description})", twoPair="${lowestTwoPair.category} (${lowestTwoPair.description})"`
  );
  assert(
    highestOnePair.score < lowestTwoPair.score,
    'CRITICAL: Highest One Pair (AA-KQJ) strictly loses to Lowest Two Pair (33-22-4)',
    `OnePair=${highestOnePair.score} < TwoPair=${lowestTwoPair.score}`
  );

  // Full 9-tier category monotonicity test (worst of tier N+1 > best of tier N)
  const highestHighCard = evaluate7CardHand([
    card('A', 'spades'),
    card('K', 'hearts'),
    card('Q', 'clubs'),
    card('J', 'diamonds'),
    card('9', 'spades'),
    card('4', 'hearts'),
    card('2', 'clubs'),
  ]);
  const lowestOnePair = evaluate7CardHand([
    card('2', 'spades'),
    card('2', 'hearts'),
    card('3', 'clubs'),
    card('4', 'diamonds'),
    card('5', 'spades'),
    card('7', 'hearts'),
    card('8', 'clubs'),
  ]);
  const highestTwoPair = evaluate7CardHand([
    card('A', 'spades'),
    card('A', 'hearts'),
    card('K', 'clubs'),
    card('K', 'diamonds'),
    card('Q', 'spades'),
    card('3', 'hearts'),
    card('2', 'clubs'),
  ]);
  const lowestTrips = evaluate7CardHand([
    card('2', 'spades'),
    card('2', 'hearts'),
    card('2', 'clubs'),
    card('3', 'diamonds'),
    card('4', 'spades'),
    card('6', 'hearts'),
    card('8', 'clubs'),
  ]);
  const highestTrips = evaluate7CardHand([
    card('A', 'spades'),
    card('A', 'hearts'),
    card('A', 'clubs'),
    card('K', 'diamonds'),
    card('Q', 'spades'),
    card('3', 'hearts'),
    card('2', 'clubs'),
  ]);
  const wheelStraight = evaluate7CardHand([
    card('A', 'spades'),
    card('2', 'hearts'),
    card('3', 'clubs'),
    card('4', 'diamonds'),
    card('5', 'spades'),
    card('9', 'hearts'),
    card('K', 'clubs'),
  ]);
  const sixHighStraight = evaluate7CardHand([
    card('2', 'spades'),
    card('3', 'hearts'),
    card('4', 'clubs'),
    card('5', 'diamonds'),
    card('6', 'spades'),
    card('9', 'hearts'),
    card('K', 'clubs'),
  ]);
  const broadwayStraight = evaluate7CardHand([
    card('A', 'spades'),
    card('K', 'hearts'),
    card('Q', 'clubs'),
    card('J', 'diamonds'),
    card('10', 'spades'),
    card('3', 'hearts'),
    card('2', 'clubs'),
  ]);
  const lowestFlush = evaluate7CardHand([
    card('7', 'hearts'),
    card('5', 'hearts'),
    card('4', 'hearts'),
    card('3', 'hearts'),
    card('2', 'hearts'),
    card('K', 'clubs'),
    card('Q', 'spades'),
  ]);
  const highestFlush = evaluate7CardHand([
    card('A', 'hearts'),
    card('K', 'hearts'),
    card('Q', 'hearts'),
    card('J', 'hearts'),
    card('9', 'hearts'),
    card('3', 'clubs'),
    card('2', 'spades'),
  ]);
  const lowestFullHouse = evaluate7CardHand([
    card('2', 'spades'),
    card('2', 'hearts'),
    card('2', 'clubs'),
    card('3', 'diamonds'),
    card('3', 'spades'),
    card('7', 'hearts'),
    card('9', 'clubs'),
  ]);
  const highestFullHouse = evaluate7CardHand([
    card('A', 'spades'),
    card('A', 'hearts'),
    card('A', 'clubs'),
    card('K', 'diamonds'),
    card('K', 'spades'),
    card('3', 'hearts'),
    card('2', 'clubs'),
  ]);
  const lowestQuads = evaluate7CardHand([
    card('2', 'spades'),
    card('2', 'hearts'),
    card('2', 'clubs'),
    card('2', 'diamonds'),
    card('3', 'spades'),
    card('4', 'hearts'),
    card('5', 'clubs'),
  ]);
  const highestQuads = evaluate7CardHand([
    card('A', 'spades'),
    card('A', 'hearts'),
    card('A', 'clubs'),
    card('A', 'diamonds'),
    card('K', 'spades'),
    card('Q', 'hearts'),
    card('J', 'clubs'),
  ]);
  const steelWheelStraightFlush = evaluate7CardHand([
    card('A', 'spades'),
    card('2', 'spades'),
    card('3', 'spades'),
    card('4', 'spades'),
    card('5', 'spades'),
    card('K', 'hearts'),
    card('Q', 'clubs'),
  ]);
  const royalFlush = evaluate7CardHand([
    card('A', 'spades'),
    card('K', 'spades'),
    card('Q', 'spades'),
    card('J', 'spades'),
    card('10', 'spades'),
    card('2', 'hearts'),
    card('3', 'clubs'),
  ]);

  assert(
    highestHighCard.score < lowestOnePair.score &&
      highestOnePair.score < lowestTwoPair.score &&
      highestTwoPair.score < lowestTrips.score &&
      highestTrips.score < wheelStraight.score &&
      wheelStraight.score < sixHighStraight.score &&
      sixHighStraight.score < broadwayStraight.score &&
      broadwayStraight.score < lowestFlush.score &&
      lowestFlush.score < highestFlush.score &&
      highestFlush.score < lowestFullHouse.score &&
      lowestFullHouse.score < highestFullHouse.score &&
      highestFullHouse.score < lowestQuads.score &&
      lowestQuads.score < highestQuads.score &&
      highestQuads.score < steelWheelStraightFlush.score &&
      steelWheelStraightFlush.score < royalFlush.score,
    'Strict monotonic ordering holds across all 9 hand categories + wheel/royal boundaries'
  );

  // Verify canonical ordering of wheel straight bestCards: 5-4-3-2-A (numeric 5-4-3-2-14)
  const wheelRanks = wheelStraight.bestCards.map((c) => c.rank).join('-');
  assert(
    wheelRanks === '5-4-3-2-14',
    'Wheel straight bestCards ordered canonically as 5-4-3-2-A (5-4-3-2-14)',
    `bestCards=${wheelRanks}`
  );
}

console.log('\n=== 4. Side Pots, Uncalled Bet Return & TDA Rule 20 Odd-Chip Distribution ===');
{
  const board = [
    card('2', 'clubs'),
    card('7', 'diamonds'),
    card('9', 'hearts'),
    card('J', 'spades'),
    card('10', 'clubs'),
  ];
  // 3 players:
  // Seat 1 (p1): all-in for 50, has AA (best hand -> wins Main Pot of 150)
  // Seat 2 (p2): all-in for 120, has KK (second best -> wins Side Pot 1 of 140)
  // Seat 3 (p3): bet 200 (80 uncalled overbet!), has QQ (loses pots, but gets 80 uncalled back!)
  const players = [
    {
      id: 'p1',
      name: 'Viktor',
      seatIndex: 1,
      chips: 0,
      currentBet: 0,
      totalHandBet: 50,
      folded: false,
      eliminated: false,
      isAllIn: true,
      cards: [card('A', 'spades'), card('A', 'hearts')],
    },
    {
      id: 'p2',
      name: 'Elena',
      seatIndex: 2,
      chips: 0,
      currentBet: 0,
      totalHandBet: 120,
      folded: false,
      eliminated: false,
      isAllIn: true,
      cards: [card('K', 'spades'), card('K', 'hearts')],
    },
    {
      id: 'p3',
      name: 'Bao',
      seatIndex: 3,
      chips: 100,
      currentBet: 0,
      totalHandBet: 200,
      folded: false,
      eliminated: false,
      isAllIn: false,
      cards: [card('Q', 'spades'), card('Q', 'hearts')],
    },
  ];

  const totalPot = 50 + 120 + 200; // 370
  const result = adjudicateShowdown(players, board, totalPot, 0);
  assert(
    result.chipAwards['p1'] === 150 && result.payouts.get('p1') === 150,
    'Short-stack AA wins Main Pot ($150)',
    `p1=${result.chipAwards['p1']}`
  );
  assert(
    result.chipAwards['p2'] === 140 && result.payouts.get('p2') === 140,
    'Medium-stack KK wins Side Pot 1 ($140)',
    `p2=${result.chipAwards['p2']}`
  );
  assert(
    result.chipAwards['p3'] === 80 && result.payouts.get('p3') === 80,
    'Deep-stack QQ receives $80 uncalled bet refund in chipAwards/payouts',
    `p3=${result.chipAwards['p3']}`
  );
  assert(
    !result.winners.some((w) => w.playerId === 'p3'),
    'Uncalled bet refund does NOT create a false WinnerInfo badge for losing overbettor'
  );

  // Odd-chip split pot test (TDA Rule 20: first eligible winner clockwise left of dealerSeat gets odd chip)
  const splitBoard = [
    card('A', 'spades'),
    card('K', 'spades'),
    card('Q', 'spades'),
    card('J', 'spades'),
    card('10', 'spades'),
  ]; // Royal Flush on board -> split pot!
  const splitPlayers = [
    {
      id: 's1',
      name: 'Seat1',
      seatIndex: 1,
      chips: 100,
      currentBet: 0,
      totalHandBet: 50,
      folded: false,
      eliminated: false,
      isAllIn: false,
      cards: [card('2', 'hearts'), card('3', 'hearts')],
    },
    {
      id: 's3',
      name: 'Seat3',
      seatIndex: 3,
      chips: 100,
      currentBet: 0,
      totalHandBet: 50,
      folded: false,
      eliminated: false,
      isAllIn: false,
      cards: [card('4', 'clubs'), card('5', 'clubs')],
    },
    {
      id: 's4',
      name: 'Seat4_Folded',
      seatIndex: 4,
      chips: 100,
      currentBet: 0,
      totalHandBet: 5, // Dead blind creating odd 105 pot!
      folded: true,
      eliminated: false,
      isAllIn: false,
      cards: [card('7', 'diamonds'), card('8', 'diamonds')],
    },
  ];
  // When dealerSeat = 2, clockwise order is 3, 4, 0, 1, 2 -> Seat 3 is first left of dealer!
  const splitResultDealer2 = adjudicateShowdown(splitPlayers, splitBoard, 105, 2);
  assert(
    splitResultDealer2.chipAwards['s3'] === 53 && splitResultDealer2.chipAwards['s1'] === 52,
    'TDA Rule 20: When dealer is Seat 2, Seat 3 (first clockwise) receives the odd $1 chip ($53 vs $52)',
    `s3=${splitResultDealer2.chipAwards['s3']}, s1=${splitResultDealer2.chipAwards['s1']}`
  );
  // When dealerSeat = 0, clockwise order is 1, 2, 3, 4, 0 -> Seat 1 is first left of dealer!
  const splitResultDealer0 = adjudicateShowdown(splitPlayers, splitBoard, 105, 0);
  assert(
    splitResultDealer0.chipAwards['s1'] === 53 && splitResultDealer0.chipAwards['s3'] === 52,
    'TDA Rule 20: When dealer is Seat 0, Seat 1 (first clockwise) receives the odd $1 chip ($53 vs $52)',
    `s1=${splitResultDealer0.chipAwards['s1']}, s3=${splitResultDealer0.chipAwards['s3']}`
  );
}

console.log('\n=== 5. GTO Monte Carlo Determinism, Outs/Draws & EV Formula Verification ===');
{
  const heroCards = [card('A', 'hearts'), card('K', 'hearts')];
  const flopBoard = [card('Q', 'hearts'), card('J', 'hearts'), card('2', 'clubs')]; // Royal + Flush + Straight Monster Draw!

  const outsInfo = calculateOutsAndDraws(heroCards, flopBoard);
  assert(
    outsInfo.totalOuts >= 12 && outsInfo.drawLabels.some((l) => l.includes('Monster Combo Draw') || l.includes('Flush')),
    'calculateOutsAndDraws detects Royal/Nut Flush + Broadway Straight monster draw',
    `totalOuts=${outsInfo.totalOuts}, labels="${outsInfo.drawLabels.join(' | ')}"`
  );

  // Category improvement check: Hero has AK on A-7-2 rainbow (Top Pair Top Kicker) -> 2 Aces for Trips + 3 Kings for Two Pair = 5 outs!
  const pairHero = [card('A', 'spades'), card('K', 'diamonds')];
  const pairBoard = [card('A', 'clubs'), card('7', 'hearts'), card('2', 'spades')];
  const pairOuts = calculateOutsAndDraws(pairHero, pairBoard);
  assert(
    pairOuts.totalOuts === 5,
    'High One Pair (AK on A-7-2) accurately counts 5 outs (2 Aces for Trips + 3 Kings for Two Pair)',
    `totalOuts=${pairOuts.totalOuts}, labels="${pairOuts.drawLabels.join(' | ')}"`
  );

  const sampleTable = {
    phase: 'flop',
    pot: 60,
    currentHighBet: 20,
    minRaise: 20,
    dealerSeat: 4,
    activeSeat: 0,
    communityCards: flopBoard,
    winners: [],
    stagedBet: 0,
    isAllInRunout: false,
    burnCardsCount: 1,
    sidePots: [],
    smallBlind: 5,
    bigBlind: 10,
    handCount: 1,
    blindLevel: 1,
  };
  const samplePlayers = [
    {
      id: 'human',
      name: 'You',
      seatIndex: 0,
      chips: 200,
      currentBet: 0,
      totalHandBet: 20,
      folded: false,
      eliminated: false,
      allIn: false,
      isHuman: true,
      cards: heroCards,
    },
    {
      id: 'ai1',
      name: 'Viktor',
      seatIndex: 1,
      chips: 180,
      currentBet: 20,
      totalHandBet: 40,
      folded: false,
      eliminated: false,
      allIn: false,
      isHuman: false,
      persona: 'general_man',
      aiType: 'shark',
      cards: [card('9', 'spades'), card('9', 'diamonds')],
    },
  ];
  const gto1 = computeGTOAnalysis(sampleTable, samplePlayers);
  const gto2 = computeGTOAnalysis(sampleTable, samplePlayers);
  assert(
    gto1.pureGtoEquityPct === gto2.pureGtoEquityPct &&
      gto1.exploitEquityPct === gto2.exploitEquityPct,
    'computeGTOAnalysis Monte Carlo rollout is 100% deterministic for identical game state',
    `pureGto=${gto1.pureGtoEquityPct}%, exploit=${gto1.exploitEquityPct}%`
  );
  assert(
    gto1.potOddsPct === 25 && gto1.pureGto.evs.checkCall > 0,
    'computeGTOAnalysis computes accurate potOddsPct (20 / (60+20) = 25%) and positive EV on monster draw',
    `potOdds=${gto1.potOddsPct}%, evCheckCall=+${gto1.pureGto.evs.checkCall}BB, best=${gto1.pureGto.bestActionLabel}`
  );
}

console.log(`\n========================================`);
console.log(`Algorithm Verification Summary: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
if (failed > 0) {
  process.exit(1);
}
