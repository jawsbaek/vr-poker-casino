import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { CasinoScene } from './scene/CasinoScene';
import { WebXRManager } from './scene/WebXRManager';
import { PokerHUD } from './components/PokerHUD';
import {
  PlayerState,
  TableState,
  PlayerAction,
  Card,
  HandEvaluation,
  WinnerInfo,
  SessionStats,
  ChipDenomination,
  TablePhase,
  ChatMessage,
  QuickEmoteId,
  MusicMood,
  PhysicalActionType,
  GTOSolverMode,
  HandDecisionRecord,
  CameraPresetId,
  DogfoodScenarioId,
  SpatialAuditReport,
  HudUiAuditReport,
} from './types/poker';
import {
  createDeck,
  createInitialPlayers,
  evaluate7CardHand,
  getAIDecision,
  getBlindLevelForHand,
  calculateSidePots,
  adjudicateShowdown,
  evaluatePlayerTell,
  generateAITurnBanter,
  generateAIEmoteReply,
  generateAIGTOReactionBanter,
  QUICK_EMOTES,
} from './logic/pokerEngine';
import {
  computeGTOAnalysis,
  gradePlayerDecision,
  recordActionInHUDStats,
  createInitialHUDStats,
} from './logic/gtoEngine';
import { runHudUiAudit, HUD_UI_RULES } from './logic/hudUiRulesHarness';
import { pokerAudio } from './audio/pokerAudio';

const INITIAL_STATS: SessionStats = {
  handsPlayed: 0,
  handsWon: 0,
  biggestPotWon: 0,
  netProfit: 0,
  tournamentsWon: 0,
  gtoDecisionsTotal: 0,
  gtoOptimalCount: 0,
  gtoCumulativeEvLossBB: 0,
  gtoAccuracyScore: 100,
};

export const App: React.FC = () => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CasinoScene | null>(null);
  const xrManagerRef = useRef<WebXRManager | null>(null);
  const aiTimeoutRef = useRef<number | null>(null);
  const runoutTimeoutRef = useRef<number | null>(null);
  const autoPilotTimeoutRef = useRef<number | null>(null);

  const [isTitleMode, setIsTitleMode] = useState(true);
  const [players, setPlayers] = useState<PlayerState[]>(createInitialPlayers);
  const [table, setTable] = useState<TableState>({
    phase: 'waiting',
    pot: 0,
    sidePots: [],
    currentHighBet: 2,
    minRaise: 2,
    smallBlind: 1,
    bigBlind: 2,
    blindLevel: 1,
    dealerSeat: 4,
    activeSeat: 0,
    communityCards: [],
    burnCardsCount: 0,
    winners: [],
    handCount: 0,
    stagedBet: 0,
    isAllInRunout: false,
    tournamentWinnerId: undefined,
  });

  const [deck, setDeck] = useState<Card[]>([]);
  const [isXRSupported, setIsXRSupported] = useState(false);
  const [isInXR, setIsInXR] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [isPeekLocked, setIsPeekLocked] = useState(false);
  const [stats, setStats] = useState<SessionStats>(INITIAL_STATS);
  const [drawCalls, setDrawCalls] = useState<number>(18);
  const [musicMood, setMusicMood] = useState<MusicMood>('lounge_jazz');
  const [solverMode, setSolverMode] = useState<GTOSolverMode>('exploit');
  const [decisionHistory, setDecisionHistory] = useState<HandDecisionRecord[]>([]);
  const [lastDecisionRecord, setLastDecisionRecord] = useState<HandDecisionRecord | null>(null);

  // 3D Visual Feedback & Dogfooding Inspector State
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('seat0_pov');
  const [activeScenario, setActiveScenario] = useState<DogfoodScenarioId | null>(null);
  const [isAutoPilot, setIsAutoPilot] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 5>(1);
  const [show2DHUD, setShow2DHUD] = useState<boolean>(true);
  const [debugOverlayEnabled, setDebugOverlayEnabled] = useState<boolean>(false);
  const [spatialAudit, setSpatialAudit] = useState<SpatialAuditReport | null>(null);
  const [hudUiAudit, setHudUiAudit] = useState<HudUiAuditReport | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_dealer',
      senderId: 'dealer',
      senderName: 'VIP Croupier',
      senderColor: '#facc15',
      text: 'Welcome to the Monte Carlo VIP Suite. Viktor, Elena, Bao, and Marcus are seated.',
      timestamp: Date.now(),
      isDealer: true,
    },
  ]);

  // Refs to avoid stale closures in async loops & spatial callbacks
  const playersRef = useRef(players);
  playersRef.current = players;
  const tableRef = useRef(table);
  tableRef.current = table;
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const isPeekLockedRef = useRef(isPeekLocked);
  isPeekLockedRef.current = isPeekLocked;
  const isPeekingRef = useRef(isPeeking);
  isPeekingRef.current = isPeeking;
  const isTitleModeRef = useRef(isTitleMode);
  isTitleModeRef.current = isTitleMode;
  const solverModeRef = useRef(solverMode);
  solverModeRef.current = solverMode;
  const isAutoPilotRef = useRef(isAutoPilot);
  isAutoPilotRef.current = isAutoPilot;
  const speedMultiplierRef = useRef(speedMultiplier);
  speedMultiplierRef.current = speedMultiplier;
  const show2DHUDRef = useRef(show2DHUD);
  show2DHUDRef.current = show2DHUD;
  const isInXRRef = useRef(isInXR);
  isInXRRef.current = isInXR;

  const appendChatMessage = useCallback(
    (
      senderId: string,
      senderName: string,
      senderColor: string,
      text: string,
      isDealer: boolean = false
    ) => {
      setChatMessages((prev) => [
        ...prev.slice(-17),
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          senderId,
          senderName,
          senderColor,
          text,
          timestamp: Date.now(),
          isDealer,
        },
      ]);
    },
    []
  );

  const clearTimers = () => {
    if (aiTimeoutRef.current !== null) {
      window.clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
    if (runoutTimeoutRef.current !== null) {
      window.clearTimeout(runoutTimeoutRef.current);
      runoutTimeoutRef.current = null;
    }
    if (autoPilotTimeoutRef.current !== null) {
      window.clearTimeout(autoPilotTimeoutRef.current);
      autoPilotTimeoutRef.current = null;
    }
  };

  /**
   * Re-evaluates AI physical tells (including Bao's "Phone Down = Monster Hand" tell)
   * and synchronizes the two-state Lyria/procedural music mood.
   */
  const refreshAITellsAndMood = useCallback(
    (pList: PlayerState[], tState: TableState): PlayerState[] => {
      let anyAllIn = false;
      let baoWatching = false;

      const updated = pList.map((p) => {
        if (p.allIn && !p.eliminated && !p.folded) {
          anyAllIn = true;
        }
        if (p.isHuman || p.eliminated || p.folded) {
          return { ...p, activeTell: 'none' as const, isWatchingPhone: false };
        }
        const { activeTell, isWatchingPhone } = evaluatePlayerTell(p, tState, tState.communityCards);
        if (p.persona === 'heavy_phone' && isWatchingPhone) {
          baoWatching = true;
        }
        return {
          ...p,
          activeTell,
          isWatchingPhone,
        };
      });

      pokerAudio.isBaoWatchingPhone = baoWatching;

      const nextMood: MusicMood =
        tState.isAllInRunout || anyAllIn || tState.pot >= tState.bigBlind * 14
          ? 'high_stakes'
          : 'lounge_jazz';
      setMusicMood(nextMood);
      pokerAudio.setMusicMood(nextMood);

      return updated;
    },
    []
  );

  /**
   * Synchronizes all 3D CasinoScene elements with current React state
   */
  const syncSceneAll = useCallback(
    (nextTable: TableState, nextPlayers: PlayerState[], peeking?: boolean) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const effectivePeek = (peeking ?? isPeekingRef.current) || isPeekLockedRef.current;
      scene.syncCards(nextTable, nextPlayers);
      scene.syncChips(nextTable, nextPlayers);
      scene.updateAvatars(nextPlayers, nextTable.dealerSeat);
      scene.updateActiveTurn(nextTable.activeSeat);
      scene.updateSpatialHUD(nextTable, nextPlayers[0], effectivePeek);
      scene.setPeekProgress(effectivePeek ? 1 : 0, nextPlayers[0]?.cards);
      setDrawCalls(scene.getDrawCalls());
      setSpatialAudit(scene.runSpatialAudit());
    },
    []
  );

  const handlePeek = useCallback((peeking: boolean) => {
    setIsPeeking(peeking);
    isPeekingRef.current = peeking;
    if (sceneRef.current) {
      const effectivePeek = peeking || isPeekLockedRef.current;
      sceneRef.current.setPeekProgress(effectivePeek ? 1 : 0, playersRef.current[0]?.cards);
      sceneRef.current.updateSpatialHUD(tableRef.current, playersRef.current[0], effectivePeek);
    }
  }, []);

  const handleTogglePeekLock = useCallback(() => {
    const nextLocked = !isPeekLockedRef.current;
    setIsPeekLocked(nextLocked);
    isPeekLockedRef.current = nextLocked;
    pokerAudio.playCardFlip();

    // Update human card faceUp state if locked
    const updatedPlayers = playersRef.current.map((p) =>
      p.isHuman
        ? { ...p, cards: p.cards.map((c) => ({ ...c, faceUp: nextLocked })) }
        : p
    );
    setPlayers(updatedPlayers);
    playersRef.current = updatedPlayers;

    if (sceneRef.current) {
      const effectivePeek = nextLocked || isPeekingRef.current;
      sceneRef.current.syncCards(tableRef.current, updatedPlayers);
      sceneRef.current.setPeekProgress(effectivePeek ? 1 : 0, updatedPlayers[0]?.cards);
      sceneRef.current.updateSpatialHUD(tableRef.current, updatedPlayers[0], effectivePeek);
    }
  }, []);

  /**
   * Stages a physical chip denomination into the Golden Betting Ring
   */
  const handleStageChip = useCallback((denom: ChipDenomination) => {
    const curTable = tableRef.current;
    const human = playersRef.current[0];
    if (!human || !human.isTurn || human.folded || curTable.phase === 'showdown') return;

    const available = Math.max(0, human.chips - curTable.stagedBet);
    if (available <= 0) return;

    const addAmount = Math.min(denom, available);
    const nextTable: TableState = {
      ...curTable,
      stagedBet: curTable.stagedBet + addAmount,
    };

    setTable(nextTable);
    tableRef.current = nextTable;

    if (sceneRef.current) {
      sceneRef.current.syncChips(nextTable, playersRef.current);
      sceneRef.current.updateSpatialHUD(
        nextTable,
        human,
        isPeekingRef.current || isPeekLockedRef.current
      );
    }
  }, []);

  const handleClearStagedBet = useCallback(() => {
    const curTable = tableRef.current;
    if (curTable.stagedBet === 0) return;
    pokerAudio.playChipClink(1);

    const nextTable: TableState = {
      ...curTable,
      stagedBet: 0,
    };
    setTable(nextTable);
    tableRef.current = nextTable;

    if (sceneRef.current) {
      sceneRef.current.syncChips(nextTable, playersRef.current);
      sceneRef.current.updateSpatialHUD(
        nextTable,
        playersRef.current[0],
        isPeekingRef.current || isPeekLockedRef.current
      );
    }
  }, []);

  /**
   * Helper: Finds the next non-eliminated seat in clockwise order
   */
  const findNextLivingSeat = (fromSeat: number, pList: PlayerState[]): number => {
    let seat = (fromSeat + 1) % pList.length;
    for (let i = 0; i < pList.length; i++) {
      if (!pList[seat].eliminated && pList[seat].chips > 0) {
        return seat;
      }
      seat = (seat + 1) % pList.length;
    }
    return fromSeat;
  };

  /**
   * Helper: Finds next seat eligible to act in the current street (not folded, not all-in, not eliminated)
   */
  const findNextActionableSeat = (fromSeat: number, pList: PlayerState[]): number => {
    let seat = (fromSeat + 1) % pList.length;
    for (let i = 0; i < pList.length; i++) {
      const p = pList[seat];
      if (!p.eliminated && !p.folded && !p.allIn) {
        return seat;
      }
      seat = (seat + 1) % pList.length;
    }
    return -1;
  };

  /**
   * Starts a brand new hand: escalates tournament blinds every 5 hands, posts SB/BB, deals facedown hole cards
   */
  const startNewHand = useCallback(
    (overridePlayers?: PlayerState[], resetTournament: boolean = false) => {
      clearTimers();
      if (sceneRef.current) {
        sceneRef.current.clearCards();
        sceneRef.current.triggerDealerAction('riffle_shuffle');
      }

      const basePlayers = overridePlayers || playersRef.current;
      const livingPlayers = basePlayers.filter((p) => !p.eliminated && p.chips > 0);
      if (livingPlayers.length <= 1 && !resetTournament) {
        return;
      }

      const prevTable = tableRef.current;
      const nextHandCount = resetTournament ? 1 : prevTable.handCount + 1;
      const blindLevelObj = getBlindLevelForHand(nextHandCount);

      if (!resetTournament && blindLevelObj.level > prevTable.blindLevel) {
        pokerAudio.playBlindUp();
      } else if (!isTitleModeRef.current) {
        pokerAudio.playRiffleShuffle();
      }

      const dealerSeat = resetTournament
        ? 4
        : findNextLivingSeat(prevTable.dealerSeat, basePlayers);
      const sbSeat =
        livingPlayers.length === 2
          ? dealerSeat
          : findNextLivingSeat(dealerSeat, basePlayers);
      const bbSeat = findNextLivingSeat(sbSeat, basePlayers);
      const firstToAct = findNextLivingSeat(bbSeat, basePlayers);

      const newDeck = createDeck();
      let deckIndex = 0;

      const rawPlayers: PlayerState[] = basePlayers.map((p, idx) => {
        if (p.eliminated || p.chips <= 0) {
          return {
            ...p,
            eliminated: true,
            cards: [],
            currentBet: 0,
            totalHandBet: 0,
            folded: true,
            allIn: false,
            isTurn: false,
            hasActedThisRound: true,
            lastAction: undefined,
            activeTell: 'none',
            isWatchingPhone: false,
          };
        }

        // Deal hole cards facedown by default (unless human has Lock Peek enabled)
        const showFace = p.isHuman && isPeekLockedRef.current;
        const c1 = { ...newDeck[deckIndex++], faceUp: showFace };
        const c2 = { ...newDeck[deckIndex++], faceUp: showFace };

        let bet = 0;
        let chips = p.chips;

        if (idx === sbSeat) {
          bet = Math.min(chips, blindLevelObj.smallBlind);
          chips -= bet;
        } else if (idx === bbSeat) {
          bet = Math.min(chips, blindLevelObj.bigBlind);
          chips -= bet;
        }

        const prevHud = p.hudStats || createInitialHUDStats(p.persona);

        return {
          ...p,
          cards: [c1, c2],
          currentBet: bet,
          totalHandBet: bet,
          chips,
          folded: false,
          allIn: chips === 0,
          hasActedThisRound: false,
          lastAction:
            idx === sbSeat
              ? `SB $${bet}`
              : idx === bbSeat
              ? `BB $${bet}`
              : undefined,
          isTurn: idx === firstToAct,
          physicalAction: 'idle',
          hudStats: {
            ...prevHud,
            handsDealt: prevHud.handsDealt + 1,
          },
        };
      });

      setLastDecisionRecord(null);

      const pot = rawPlayers.reduce((acc, p) => acc + p.currentBet, 0);
      const sidePots = calculateSidePots(rawPlayers);
      const remainingDeck = newDeck.slice(deckIndex);

      setDeck(remainingDeck);
      deckRef.current = remainingDeck;

      const nextTable: TableState = {
        phase: 'preflop',
        pot,
        sidePots,
        currentHighBet: blindLevelObj.bigBlind,
        minRaise: blindLevelObj.bigBlind,
        smallBlind: blindLevelObj.smallBlind,
        bigBlind: blindLevelObj.bigBlind,
        blindLevel: blindLevelObj.level,
        dealerSeat,
        activeSeat: firstToAct,
        communityCards: [],
        burnCardsCount: 0,
        winners: [],
        handCount: nextHandCount,
        stagedBet: 0,
        isAllInRunout: false,
        tournamentWinnerId: undefined,
      };

      const updatedPlayers = refreshAITellsAndMood(rawPlayers, nextTable);

      setPlayers(updatedPlayers);
      playersRef.current = updatedPlayers;
      setTable(nextTable);
      tableRef.current = nextTable;

      syncSceneAll(nextTable, updatedPlayers);
      pokerAudio.playChipClink(2);

      if (!isTitleModeRef.current) {
        const dealerCallout =
          !resetTournament && blindLevelObj.level > prevTable.blindLevel
            ? `Blinds up to $${blindLevelObj.smallBlind} and $${blindLevelObj.bigBlind}. Dealing hand ${nextHandCount}.`
            : `Shuffle up and deal. Hand ${nextHandCount}, blinds $${blindLevelObj.smallBlind} and $${blindLevelObj.bigBlind}.`;
        appendChatMessage('dealer', 'VIP Croupier', '#facc15', dealerCallout, true);
        pokerAudio.speakDealer(dealerCallout);
      }

      if (!updatedPlayers[firstToAct].isHuman) {
        runAITurn(firstToAct, updatedPlayers, nextTable);
      }
    },
    [syncSceneAll, refreshAITellsAndMood, appendChatMessage]
  );

  /**
   * Starts a fresh 5-Max Sit & Go Tournament ($200 stacks, Level 1 Blinds)
   */
  const startNewTournament = useCallback(() => {
    clearTimers();
    const freshPlayers = createInitialPlayers();
    setPlayers(freshPlayers);
    playersRef.current = freshPlayers;
    startNewHand(freshPlayers, true);
  }, [startNewHand]);

  /**
   * Checks if all non-folded players have acted and matched the street high bet (or are all-in)
   */
  const checkRoundComplete = (pList: PlayerState[], tState: TableState): boolean => {
    const contenders = pList.filter((p) => !p.eliminated && !p.folded);
    return contenders.every(
      (p) => p.allIn || (p.hasActedThisRound && p.currentBet === tState.currentHighBet)
    );
  };

  /**
   * Dramatic All-In Runout Choreography:
   * Flips all remaining contenders' hole cards face-up and deals Flop -> Turn -> River with 1.15s suspense pauses
   */
  const triggerDramaticAllInRunout = (currentPlayers: PlayerState[], currentTable: TableState) => {
    const revealedPlayers = currentPlayers.map((p) => ({
      ...p,
      currentBet: 0,
      isTurn: false,
      isWatchingPhone: false,
      cards: !p.folded && !p.eliminated ? p.cards.map((c) => ({ ...c, faceUp: true })) : p.cards,
    }));

    const runoutTable: TableState = {
      ...currentTable,
      currentHighBet: 0,
      stagedBet: 0,
      isAllInRunout: true,
    };

    setMusicMood('high_stakes');
    pokerAudio.setMusicMood('high_stakes');

    if (!isTitleModeRef.current) {
      const msg = 'All-in showdown! Players, turn your cards face up.';
      appendChatMessage('dealer', 'VIP Croupier', '#facc15', msg, true);
      pokerAudio.speakDealer(msg);
    }

    setPlayers(revealedPlayers);
    playersRef.current = revealedPlayers;
    setTable(runoutTable);
    tableRef.current = runoutTable;
    syncSceneAll(runoutTable, revealedPlayers);

    const dealNextRunoutStreet = (tState: TableState, pList: PlayerState[]) => {
      runoutTimeoutRef.current = window.setTimeout(() => {
        const nextDeck = [...deckRef.current];
        const nextCommunity = [...tState.communityCards];
        let nextPhase = tState.phase;
        let nextBurn = tState.burnCardsCount;

        if (tState.phase === 'preflop') {
          nextPhase = 'flop';
          nextBurn += 1;
          nextDeck.shift(); // Burn
          const flop = [nextDeck.shift()!, nextDeck.shift()!, nextDeck.shift()!].map((c) => ({
            ...c,
            faceUp: true,
          }));
          nextCommunity.push(...flop);
          sceneRef.current?.triggerDealerAction('burn_tap');
          pokerAudio.playBurnTap();
          pokerAudio.playCardFlip();
        } else if (tState.phase === 'flop') {
          nextPhase = 'turn';
          nextBurn += 1;
          nextDeck.shift(); // Burn
          nextCommunity.push({ ...nextDeck.shift()!, faceUp: true });
          sceneRef.current?.triggerDealerAction('burn_tap');
          pokerAudio.playBurnTap();
          pokerAudio.playCardFlip();
        } else if (tState.phase === 'turn') {
          nextPhase = 'river';
          nextBurn += 1;
          nextDeck.shift(); // Burn
          nextCommunity.push({ ...nextDeck.shift()!, faceUp: true });
          sceneRef.current?.triggerDealerAction('burn_tap');
          pokerAudio.playBurnTap();
          pokerAudio.playCardFlip();
        } else {
          handleShowdown(pList, tState, nextCommunity);
          return;
        }

        setDeck(nextDeck);
        deckRef.current = nextDeck;

        const updatedTable: TableState = {
          ...tState,
          phase: nextPhase,
          communityCards: nextCommunity,
          burnCardsCount: nextBurn,
          isAllInRunout: true,
        };

        setTable(updatedTable);
        tableRef.current = updatedTable;
        syncSceneAll(updatedTable, pList);

        dealNextRunoutStreet(updatedTable, pList);
      }, Math.round(1150 / speedMultiplierRef.current));
    };

    dealNextRunoutStreet(runoutTable, revealedPlayers);
  };

  /**
   * Advances game through Preflop -> Flop -> Turn -> River -> Showdown
   */
  const advancePhase = (currentPlayers: PlayerState[], currentTable: TableState) => {
    const contenders = currentPlayers.filter((p) => !p.eliminated && !p.folded);
    const playersWithChips = contenders.filter((p) => !p.allIn && p.chips > 0);

    // If already at river, go straight to showdown
    if (currentTable.phase === 'river') {
      handleShowdown(currentPlayers, currentTable, currentTable.communityCards);
      return;
    }

    // If <= 1 contender has chips left, no more betting is possible -> trigger dramatic All-In Runout!
    if (playersWithChips.length <= 1) {
      triggerDramaticAllInRunout(currentPlayers, currentTable);
      return;
    }

    const resetPlayers = currentPlayers.map((p) => ({
      ...p,
      currentBet: 0,
      isTurn: false,
      hasActedThisRound: false,
      lastAction: p.folded || p.allIn || p.eliminated ? p.lastAction : undefined,
    }));

    const nextDeck = [...deckRef.current];
    const newCommunity = [...currentTable.communityCards];
    let nextPhase: TablePhase = currentTable.phase;
    let nextBurn = currentTable.burnCardsCount;
    let dealerStreetAnnouncement = '';

    if (currentTable.phase === 'preflop') {
      nextPhase = 'flop';
      nextBurn += 1;
      nextDeck.shift(); // Burn card
      const flop = [nextDeck.shift()!, nextDeck.shift()!, nextDeck.shift()!].map((c) => ({
        ...c,
        faceUp: true,
      }));
      newCommunity.push(...flop);
      dealerStreetAnnouncement = 'Burn and turn the Flop.';
    } else if (currentTable.phase === 'flop') {
      nextPhase = 'turn';
      nextBurn += 1;
      nextDeck.shift(); // Burn
      newCommunity.push({ ...nextDeck.shift()!, faceUp: true });
      dealerStreetAnnouncement = 'Fourth street, the Turn.';
    } else if (currentTable.phase === 'turn') {
      nextPhase = 'river';
      nextBurn += 1;
      nextDeck.shift(); // Burn
      newCommunity.push({ ...nextDeck.shift()!, faceUp: true });
      dealerStreetAnnouncement = 'Fifth street, the River.';
    }

    sceneRef.current?.triggerDealerAction('burn_tap');
    pokerAudio.playBurnTap();
    pokerAudio.playCardFlip();

    if (dealerStreetAnnouncement && !isTitleModeRef.current) {
      appendChatMessage('dealer', 'VIP Croupier', '#facc15', dealerStreetAnnouncement, true);
      pokerAudio.speakDealer(dealerStreetAnnouncement);
    }

    setDeck(nextDeck);
    deckRef.current = nextDeck;

    const firstSeat = findNextActionableSeat(currentTable.dealerSeat, resetPlayers);
    if (firstSeat === -1) {
      triggerDramaticAllInRunout(resetPlayers, {
        ...currentTable,
        phase: nextPhase,
        communityCards: newCommunity,
        burnCardsCount: nextBurn,
      });
      return;
    }

    resetPlayers[firstSeat].isTurn = true;

    const nextTable: TableState = {
      ...currentTable,
      phase: nextPhase,
      currentHighBet: 0,
      minRaise: currentTable.bigBlind,
      activeSeat: firstSeat,
      communityCards: newCommunity,
      burnCardsCount: nextBurn,
      stagedBet: 0,
    };

    const playersWithUpdatedTells = refreshAITellsAndMood(resetPlayers, nextTable);

    // Check if Bao just put his phone down on this street (Monster Hand Tell notification!)
    const prevBao = currentPlayers.find((p) => p.persona === 'heavy_phone');
    const nextBao = playersWithUpdatedTells.find((p) => p.persona === 'heavy_phone');
    if (
      !isTitleModeRef.current &&
      prevBao?.isWatchingPhone &&
      nextBao &&
      nextBao.activeTell === 'phone_down_monster'
    ) {
      appendChatMessage(
        nextBao.id,
        nextBao.name,
        nextBao.color,
        '[Puts his phone down and leans in]',
        false
      );
    }

    setPlayers(playersWithUpdatedTells);
    playersRef.current = playersWithUpdatedTells;
    setTable(nextTable);
    tableRef.current = nextTable;

    syncSceneAll(nextTable, playersWithUpdatedTells);

    if (!playersWithUpdatedTells[firstSeat].isHuman) {
      runAITurn(firstSeat, playersWithUpdatedTells, nextTable);
    }
  };

  /**
   * Finalizes hand results, processes tournament eliminations & finish standings, and updates session telemetry
   */
  const finalizeHandAndStandings = (
    awardedPlayers: PlayerState[],
    winnerInfos: WinnerInfo[],
    tState: TableState,
    communityCards: Card[]
  ) => {
    const aliveBefore = awardedPlayers.filter((p) => !p.eliminated);
    const newlyBusted = aliveBefore
      .filter((p) => p.chips <= 0)
      .sort((a, b) => b.totalHandBet - a.totalHandBet);

    let nextFinishPlace = aliveBefore.length;
    const bustPlaceMap = new Map<string, number>();
    for (let i = newlyBusted.length - 1; i >= 0; i--) {
      bustPlaceMap.set(newlyBusted[i].id, nextFinishPlace);
      nextFinishPlace--;
    }

    const finalPlayers = awardedPlayers.map((p) => {
      if (bustPlaceMap.has(p.id)) {
        return {
          ...p,
          chips: 0,
          eliminated: true,
          finishPlace: bustPlaceMap.get(p.id),
          isTurn: false,
          currentBet: 0,
          isWatchingPhone: false,
          activeTell: 'none' as const,
        };
      }
      return {
        ...p,
        isTurn: false,
        currentBet: 0,
      };
    });

    // Check if only 1 player remains with all $1,000 in tournament chips
    const survivors = finalPlayers.filter((p) => !p.eliminated && p.chips > 0);
    let tournamentWinnerId: string | undefined = undefined;
    if (survivors.length === 1) {
      tournamentWinnerId = survivors[0].id;
      survivors[0].finishPlace = 1;
    }

    const human = finalPlayers[0];
    const humanWin = winnerInfos.find((w) => w.playerId === human.id);

    setStats((prev) => ({
      ...prev,
      handsPlayed: prev.handsPlayed + 1,
      handsWon: humanWin ? prev.handsWon + 1 : prev.handsWon,
      biggestPotWon: humanWin ? Math.max(prev.biggestPotWon, humanWin.amount) : prev.biggestPotWon,
      netProfit: human.chips - 200,
      tournamentsWon:
        tournamentWinnerId === human.id ? prev.tournamentsWon + 1 : prev.tournamentsWon,
    }));

    const updatedTable: TableState = {
      ...tState,
      phase: 'showdown',
      pot: 0,
      currentHighBet: 0,
      stagedBet: 0,
      winners: winnerInfos,
      communityCards,
      tournamentWinnerId,
    };

    // Dealer sweeps pot and winning AI players celebrate!
    sceneRef.current?.triggerDealerAction('sweep_pot');
    winnerInfos.forEach((w) => {
      const wp = finalPlayers.find((p) => p.id === w.playerId);
      if (wp && !wp.isHuman) {
        sceneRef.current?.triggerPlayerAction(wp.seatIndex, 'celebrate');
      }
    });

    if (winnerInfos.length > 0 && !isTitleModeRef.current) {
      const mainWinner = winnerInfos[0];
      const winAnnouncement = `${mainWinner.playerName} wins $${mainWinner.amount} with ${mainWinner.handName}!`;
      appendChatMessage('dealer', 'VIP Croupier', '#facc15', winAnnouncement, true);
      pokerAudio.speakDealer(winAnnouncement);
    }

    setPlayers(finalPlayers);
    playersRef.current = finalPlayers;
    setTable(updatedTable);
    tableRef.current = updatedTable;

    syncSceneAll(updatedTable, finalPlayers);
    pokerAudio.playWinFanfare();

    if (humanWin || tournamentWinnerId === human.id) {
      confetti({
        particleCount: tournamentWinnerId === human.id ? 160 : 85,
        spread: 75,
        origin: { y: 0.6 },
      });
    }
  };

  /**
   * Evaluates multi-way side pots and awards chips at Showdown
   */
  const handleShowdown = (pList: PlayerState[], tState: TableState, communityCards: Card[]) => {
    const revealedPlayers = pList.map((p) => ({
      ...p,
      cards: !p.folded && !p.eliminated ? p.cards.map((c) => ({ ...c, faceUp: true })) : p.cards,
      isTurn: false,
    }));

    const { winners, chipAwards, sidePots } = adjudicateShowdown(
      revealedPlayers,
      communityCards,
      tState.pot
    );

    const awardedPlayers = revealedPlayers.map((p) => {
      const won = chipAwards[p.id] || 0;
      return won > 0 ? { ...p, chips: p.chips + won } : p;
    });

    finalizeHandAndStandings(
      awardedPlayers,
      winners,
      { ...tState, sidePots },
      communityCards
    );
  };

  /**
   * When all other players fold, the last standing player wins uncontested
   */
  const handleSinglePlayerWin = (winner: PlayerState, tState: TableState, pList: PlayerState[]) => {
    const awardedPlayers = pList.map((p) =>
      p.id === winner.id
        ? { ...p, chips: p.chips + tState.pot, isTurn: false }
        : { ...p, isTurn: false }
    );

    const winnerInfo: WinnerInfo = {
      playerId: winner.id,
      playerName: winner.name,
      amount: tState.pot,
      handName: 'Opponents Folded',
      bestCards: [],
      potLabel: 'Main Pot',
    };

    finalizeHandAndStandings(awardedPlayers, [winnerInfo], tState, tState.communityCards);
  };

  /**
   * Executes player or AI action (Fold, Check, Call, Bet/Raise, All-In)
   */
  const handleAction = useCallback(
    (action: PlayerAction) => {
      clearTimers();
      const currentPlayers = [...playersRef.current];
      const currentTable = { ...tableRef.current };
      const activeIdx = currentTable.activeSeat;
      const player = { ...currentPlayers[activeIdx] };

      if (!player || player.folded || player.eliminated || currentTable.phase === 'showdown') {
        return;
      }

      const facedRaiseBeforeAction = currentTable.currentHighBet > player.currentBet;

      // Update live VPIP / PFR / AF HUD stats for the acting seat
      player.hudStats = recordActionInHUDStats(
        player.hudStats || createInitialHUDStats(player.persona),
        action,
        currentTable.phase,
        facedRaiseBeforeAction
      );

      // Grade Human Player's move against Solver (Pure GTO or Node-Locked Exploit)
      if (player.isHuman && !isTitleModeRef.current) {
        const currentAnalysis = computeGTOAnalysis(currentTable, currentPlayers);
        const decisionRecord = gradePlayerDecision(
          action,
          currentAnalysis,
          currentTable,
          player,
          solverModeRef.current
        );

        setLastDecisionRecord(decisionRecord);
        setDecisionHistory((prev) => [...prev.slice(-39), decisionRecord]);

        setStats((prev) => {
          const nextTotal = prev.gtoDecisionsTotal + 1;
          const isOptimal = decisionRecord.grade === 'best' || decisionRecord.grade === 'good';
          const nextOptimal = prev.gtoOptimalCount + (isOptimal ? 1 : 0);
          const nextEvLoss = Number(
            (prev.gtoCumulativeEvLossBB + decisionRecord.evLossBB).toFixed(2)
          );
          const penaltyScore = Math.max(0, 100 - (nextEvLoss / Math.max(1, nextTotal)) * 22);
          const hitRateScore = (nextOptimal / nextTotal) * 100;
          const nextScore = Math.round(penaltyScore * 0.55 + hitRateScore * 0.45);
          return {
            ...prev,
            gtoDecisionsTotal: nextTotal,
            gtoOptimalCount: nextOptimal,
            gtoCumulativeEvLossBB: nextEvLoss,
            gtoAccuracyScore: Math.max(0, Math.min(100, nextScore)),
          };
        });

        // Trigger AI Shark / Table Banter reaction on notable Best Moves or Blunders
        const gtoReaction = generateAIGTOReactionBanter(decisionRecord, currentPlayers);
        if (gtoReaction) {
          window.setTimeout(() => {
            const reactor = playersRef.current.find((p) => p.id === gtoReaction.senderId);
            if (!reactor) return;
            appendChatMessage(reactor.id, reactor.name, reactor.color, gtoReaction.text, false);
            pokerAudio.speakPlayer(
              gtoReaction.text,
              reactor.persona || 'general_man',
              reactor.voiceName || 'Charon',
              reactor.voiceStyle || 'calm'
            );
          }, 520);
        }
      }

      let betAdded = 0;
      let raisedHighBet = false;
      let physicalAction: PhysicalActionType = 'idle';

      switch (action.type) {
        case 'fold': {
          player.folded = true;
          player.hasActedThisRound = true;
          player.lastAction = 'Fold';
          player.isWatchingPhone = false;
          physicalAction = 'fold_flick';
          pokerAudio.playCardSlide();
          break;
        }

        case 'check': {
          player.hasActedThisRound = true;
          player.lastAction = 'Check';
          physicalAction = 'check_knock';
          pokerAudio.playKnock();
          break;
        }

        case 'call': {
          const needed = Math.max(0, currentTable.currentHighBet - player.currentBet);
          betAdded = Math.min(player.chips, needed);
          player.chips -= betAdded;
          player.currentBet += betAdded;
          player.totalHandBet += betAdded;
          player.allIn = player.chips === 0;
          player.hasActedThisRound = true;
          player.lastAction = player.allIn ? `All-In ($${player.totalHandBet})` : `Call $${betAdded}`;
          physicalAction = 'chip_push';
          pokerAudio.playChipSlide();
          break;
        }

        case 'bet':
        case 'raise': {
          const defaultTarget = currentTable.currentHighBet + currentTable.minRaise;
          const targetTotal = action.amount || defaultTarget;
          const diff = Math.max(0, targetTotal - player.currentBet);
          betAdded = Math.min(player.chips, diff);
          player.chips -= betAdded;
          player.currentBet += betAdded;
          player.totalHandBet += betAdded;
          player.allIn = player.chips === 0;
          player.hasActedThisRound = true;

          const raiseDiff = player.currentBet - currentTable.currentHighBet;
          if (raiseDiff > 0) {
            currentTable.minRaise = Math.max(currentTable.minRaise, raiseDiff);
            currentTable.currentHighBet = player.currentBet;
            raisedHighBet = true;
          }
          player.lastAction = player.allIn
            ? `All-In ($${player.totalHandBet})`
            : `Raise to $${player.currentBet}`;
          physicalAction = 'chip_push';
          pokerAudio.playChipSlide();
          break;
        }

        case 'allin': {
          betAdded = player.chips;
          player.currentBet += betAdded;
          player.totalHandBet += betAdded;
          player.chips = 0;
          player.allIn = true;
          player.hasActedThisRound = true;

          const raiseDiff = player.currentBet - currentTable.currentHighBet;
          if (raiseDiff > 0) {
            currentTable.minRaise = Math.max(currentTable.minRaise, raiseDiff);
            currentTable.currentHighBet = player.currentBet;
            raisedHighBet = true;
          }
          player.lastAction = `All-In ($${player.totalHandBet})`;
          physicalAction = 'chip_push';
          pokerAudio.playChipClink(4);
          break;
        }
      }

      player.physicalAction = physicalAction;
      if (!player.isHuman && sceneRef.current) {
        sceneRef.current.triggerPlayerAction(activeIdx, physicalAction);
      }

      // Contextual AI Chit-Chat & Gemini 3.8 Flash TTS Voice Banter
      if (!player.isHuman && !isTitleModeRef.current) {
        const banterMsg = generateAITurnBanter(player, action, currentTable, currentPlayers);
        if (banterMsg) {
          player.activeChatBubble = banterMsg.text;
          player.activeChatTimestamp = Date.now();
          appendChatMessage(player.id, player.name, player.color, banterMsg.text, false);
          pokerAudio.speakPlayer(
            banterMsg.text,
            player.persona || 'general_man',
            player.voiceName || 'Charon',
            player.voiceStyle || 'calm'
          );
        }
      }

      // If a player raised the high bet, other active players must act again
      if (raisedHighBet) {
        for (let i = 0; i < currentPlayers.length; i++) {
          if (
            i !== activeIdx &&
            !currentPlayers[i].folded &&
            !currentPlayers[i].allIn &&
            !currentPlayers[i].eliminated
          ) {
            currentPlayers[i] = { ...currentPlayers[i], hasActedThisRound: false };
          }
        }
      }

      currentTable.pot += betAdded;
      currentTable.stagedBet = 0;
      player.isTurn = false;
      currentPlayers[activeIdx] = player;
      currentTable.sidePots = calculateSidePots(currentPlayers);

      const playersWithUpdatedTells = refreshAITellsAndMood(currentPlayers, currentTable);

      // Check if only 1 player remains unfolded (immediate uncontested win)
      const activeContenders = playersWithUpdatedTells.filter((p) => !p.eliminated && !p.folded);
      if (activeContenders.length === 1) {
        handleSinglePlayerWin(activeContenders[0], currentTable, playersWithUpdatedTells);
        return;
      }

      // Check if betting round is complete
      const isRoundDone = checkRoundComplete(playersWithUpdatedTells, currentTable);
      if (isRoundDone) {
        advancePhase(playersWithUpdatedTells, currentTable);
      } else {
        const nextSeat = findNextActionableSeat(activeIdx, playersWithUpdatedTells);
        if (nextSeat === -1) {
          advancePhase(playersWithUpdatedTells, currentTable);
          return;
        }

        currentTable.activeSeat = nextSeat;
        playersWithUpdatedTells[nextSeat] = {
          ...playersWithUpdatedTells[nextSeat],
          isTurn: true,
        };

        setPlayers(playersWithUpdatedTells);
        playersRef.current = playersWithUpdatedTells;
        setTable(currentTable);
        tableRef.current = currentTable;

        syncSceneAll(currentTable, playersWithUpdatedTells);

        if (!playersWithUpdatedTells[nextSeat].isHuman) {
          runAITurn(nextSeat, playersWithUpdatedTells, currentTable);
        }
      }
    },
    [syncSceneAll, refreshAITellsAndMood, appendChatMessage]
  );

  /**
   * Autonomous AI decision loop with persona-specific deliberation delay
   * (Bao has a distracted delay while scrolling his smartphone)
   */
  const runAITurn = (seatIdx: number, currentPlayers: PlayerState[], currentTable: TableState) => {
    const ai = currentPlayers[seatIdx];
    if (!ai || ai.isHuman || ai.folded || ai.allIn || ai.eliminated) return;

    const isBaoScrolling = ai.persona === 'heavy_phone' && ai.isWatchingPhone;
    const baseDelay = isBaoScrolling ? 1250 + Math.random() * 650 : 650 + Math.random() * 650;
    const delay = Math.max(120, Math.round(baseDelay / speedMultiplierRef.current));

    if (isBaoScrolling && !isTitleModeRef.current) {
      pokerAudio.playPhoneReelLeak();
    }

    aiTimeoutRef.current = window.setTimeout(() => {
      const decision = getAIDecision(ai, currentTable, currentTable.communityCards);
      handleAction(decision);
    }, delay);
  };

  /**
   * Interactive Quick-Emote / Table-Talk Bar Handler:
   * Sends human player banter and triggers an AI personality reply + TTS voice
   */
  const handleSendQuickEmote = useCallback(
    (emoteId: QuickEmoteId) => {
      const emote = QUICK_EMOTES.find((e) => e.id === emoteId);
      if (!emote) return;

      pokerAudio.playTick();
      appendChatMessage('human', 'You (Seat #0)', '#38bdf8', emote.text, false);

      window.setTimeout(() => {
        const replyMsg = generateAIEmoteReply(emoteId, playersRef.current);
        if (!replyMsg) return;
        const responder = playersRef.current.find((p) => p.id === replyMsg.senderId);
        if (!responder) return;
        const now = Date.now();

        const nextPlayers: PlayerState[] = playersRef.current.map((p) => {
          if (p.id !== responder.id) return p;
          // If player called out Bao on his phone, Bao briefly glances up!
          const putPhoneDownBriefly = emoteId === 'eyes_off_phone' ? false : p.isWatchingPhone;
          return {
            ...p,
            isWatchingPhone: putPhoneDownBriefly,
            activeChatBubble: replyMsg.text,
            activeChatTimestamp: now,
          };
        });

        setPlayers(nextPlayers);
        playersRef.current = nextPlayers;
        sceneRef.current?.updateAvatars(nextPlayers, tableRef.current.dealerSeat);

        appendChatMessage(responder.id, responder.name, responder.color, replyMsg.text, false);
        pokerAudio.speakPlayer(
          replyMsg.text,
          responder.persona || 'general_man',
          responder.voiceName || 'Puck',
          responder.voiceStyle || 'casual'
        );
      }, 650);
    },
    [appendChatMessage]
  );

  // ============================================================================
  // 3D VISUAL FEEDBACK & DETERMINISTIC DOGFOODING HARNESS
  // ============================================================================

  const handleChangeCameraPreset = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    sceneRef.current?.setCameraPreset(preset);
  }, []);

  const handleToggleDebugOverlay = useCallback(() => {
    setDebugOverlayEnabled((prev) => {
      const next = !prev;
      sceneRef.current?.setDebugOverlay(next);
      return next;
    });
  }, []);

  const handleRefreshSpatialAudit = useCallback(() => {
    if (sceneRef.current) {
      setSpatialAudit(sceneRef.current.runSpatialAudit());
    }
  }, []);

  const handleRefreshHudUiAudit = useCallback(() => {
    const p0 = playersRef.current[0];
    const t = tableRef.current;
    const isPlayerTurn =
      t.activeSeat === 0 && !p0?.folded && !p0?.allIn && t.phase !== 'showdown' && t.phase !== 'waiting';
    const report = runHudUiAudit(sceneRef.current, {
      show2DHUD: show2DHUDRef.current,
      isInXR: isInXRRef.current,
      isPlayerTurn,
      phase: t.phase,
    });
    setHudUiAudit(report);
    return report;
  }, []);

  /**
   * Deterministically loads any of the 7 key 3D visual scenarios for inspection & dogfooding
   */
  const handleLoadScenario = useCallback(
    (scenario: DogfoodScenarioId) => {
      clearTimers();
      setIsAutoPilot(false);
      isAutoPilotRef.current = false;
      setActiveScenario(scenario);

      // Exit 3D title mode so gameplay cameras and interactions are unlocked
      setIsTitleMode(false);
      isTitleModeRef.current = false;
      sceneRef.current?.setTitleMode(false);
      sceneRef.current?.clearCards();

      const basePlayers = createInitialPlayers();
      const now = Date.now();
      const rankMap: Record<string, Card['rank']> = {
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
      const makeCard = (
        rankLabel: string,
        suit: Card['suit'],
        faceUp: boolean = false
      ): Card => ({
        id: `${rankLabel}_${suit}_df_${scenario}`,
        rank: rankMap[rankLabel] || 14,
        suit,
        faceUp,
      });

      let nextPlayers: PlayerState[] = basePlayers.map((p) => ({
        ...p,
        chips: 190,
        currentBet: 0,
        totalHandBet: 10,
        folded: false,
        allIn: false,
        eliminated: false,
        isTurn: false,
        hasActedThisRound: false,
        activeTell: 'none',
        isWatchingPhone: p.persona === 'heavy_phone',
      }));

      let nextTable: TableState = {
        phase: 'flop',
        pot: 30,
        sidePots: [],
        currentHighBet: 0,
        minRaise: 2,
        smallBlind: 1,
        bigBlind: 2,
        blindLevel: 1,
        dealerSeat: 4,
        activeSeat: 0,
        communityCards: [],
        burnCardsCount: 1,
        winners: [],
        handCount: 4,
        stagedBet: 0,
        isAllInRunout: false,
        tournamentWinnerId: undefined,
      };

      let nextPeeking = false;
      let nextPeekLock = false;

      switch (scenario) {
        case 'preflop_deal': {
          nextPlayers[0] = {
            ...nextPlayers[0],
            chips: 198,
            currentBet: 2,
            totalHandBet: 2,
            isTurn: true,
            cards: [makeCard('A', 'spades'), makeCard('K', 'spades')],
            lastAction: 'Post BB $2',
          };
          nextPlayers[1] = {
            ...nextPlayers[1],
            chips: 196,
            currentBet: 4,
            totalHandBet: 4,
            cards: [makeCard('Q', 'clubs'), makeCard('J', 'clubs')],
            lastAction: 'Raise to $4',
            activeTell: 'watch_glance_strong',
          };
          nextPlayers[2] = {
            ...nextPlayers[2],
            chips: 196,
            currentBet: 4,
            totalHandBet: 4,
            cards: [makeCard('10', 'diamonds'), makeCard('10', 'spades')],
            lastAction: 'Call $4',
            activeTell: 'posture_tight',
          };
          nextPlayers[3] = {
            ...nextPlayers[3],
            chips: 200,
            currentBet: 0,
            totalHandBet: 0,
            cards: [makeCard('7', 'hearts'), makeCard('2', 'clubs')],
            isWatchingPhone: true,
            lastAction: 'Scrolling...',
          };
          nextPlayers[4] = {
            ...nextPlayers[4],
            chips: 199,
            currentBet: 1,
            totalHandBet: 1,
            cards: [makeCard('A', 'diamonds'), makeCard('Q', 'diamonds')],
            lastAction: 'Post SB $1',
          };
          nextTable = {
            ...nextTable,
            phase: 'preflop',
            pot: 11,
            currentHighBet: 4,
            minRaise: 2,
            dealerSeat: 3,
            activeSeat: 0,
            communityCards: [],
            burnCardsCount: 0,
          };
          sceneRef.current?.triggerDealerAction('pitch_cards');
          break;
        }

        case 'card_peel': {
          nextPeeking = true;
          nextPlayers[0] = {
            ...nextPlayers[0],
            chips: 185,
            currentBet: 0,
            totalHandBet: 15,
            isTurn: true,
            cards: [makeCard('A', 'spades', true), makeCard('J', 'spades', true)],
            lastAction: 'Your Turn',
          };
          nextPlayers[1] = {
            ...nextPlayers[1],
            chips: 175,
            currentBet: 10,
            totalHandBet: 25,
            cards: [makeCard('K', 'hearts'), makeCard('Q', 'hearts')],
            lastAction: 'Bet $10',
            activeTell: 'watch_glance_strong',
          };
          nextPlayers[2] = {
            ...nextPlayers[2],
            chips: 185,
            currentBet: 0,
            totalHandBet: 15,
            folded: true,
            cards: [makeCard('6', 'clubs'), makeCard('5', 'clubs')],
            lastAction: 'Fold',
          };
          nextPlayers[3] = {
            ...nextPlayers[3],
            chips: 185,
            currentBet: 0,
            totalHandBet: 15,
            cards: [makeCard('9', 'diamonds'), makeCard('4', 'spades')],
            isWatchingPhone: true,
          };
          nextPlayers[4] = {
            ...nextPlayers[4],
            chips: 175,
            currentBet: 10,
            totalHandBet: 25,
            cards: [makeCard('Q', 'spades'), makeCard('10', 'hearts')],
            lastAction: 'Call $10',
          };
          nextTable = {
            ...nextTable,
            phase: 'flop',
            pot: 95,
            currentHighBet: 10,
            minRaise: 10,
            activeSeat: 0,
            communityCards: [
              makeCard('K', 'spades', true),
              makeCard('Q', 'diamonds', true),
              makeCard('10', 'clubs', true),
            ],
            burnCardsCount: 1,
          };
          break;
        }

        case 'chip_drag_stage': {
          nextPlayers[0] = {
            ...nextPlayers[0],
            chips: 190,
            currentBet: 0,
            totalHandBet: 10,
            isTurn: true,
            cards: [makeCard('9', 'hearts', true), makeCard('9', 'clubs', true)],
            lastAction: 'Staging $35...',
          };
          nextPlayers[1] = {
            ...nextPlayers[1],
            chips: 178,
            currentBet: 12,
            totalHandBet: 22,
            cards: [makeCard('A', 'spades'), makeCard('8', 'spades')],
            lastAction: 'Bet $12',
          };
          nextPlayers[2] = {
            ...nextPlayers[2],
            chips: 178,
            currentBet: 12,
            totalHandBet: 22,
            cards: [makeCard('J', 'spades'), makeCard('10', 'spades')],
            lastAction: 'Call $12',
          };
          nextPlayers[3] = {
            ...nextPlayers[3],
            chips: 190,
            currentBet: 0,
            totalHandBet: 10,
            folded: true,
            cards: [makeCard('4', 'hearts'), makeCard('2', 'diamonds')],
            lastAction: 'Fold',
          };
          nextPlayers[4] = {
            ...nextPlayers[4],
            chips: 190,
            currentBet: 0,
            totalHandBet: 10,
            cards: [makeCard('7', 'spades'), makeCard('6', 'spades')],
            activeTell: 'chip_fidget_bluff',
          };
          nextTable = {
            ...nextTable,
            phase: 'flop',
            pot: 74,
            currentHighBet: 12,
            minRaise: 12,
            activeSeat: 0,
            stagedBet: 35,
            communityCards: [
              makeCard('9', 'spades', true),
              makeCard('8', 'diamonds', true),
              makeCard('2', 'clubs', true),
            ],
            burnCardsCount: 1,
          };
          sceneRef.current?.triggerActionRipple(CasinoScene.BETTING_RING_CENTER, 0xfacc15);
          break;
        }

        case 'bao_phone_scroll': {
          nextPlayers[0] = {
            ...nextPlayers[0],
            chips: 192,
            currentBet: 8,
            totalHandBet: 8,
            cards: [makeCard('A', 'hearts'), makeCard('K', 'clubs')],
            lastAction: 'Bet $8',
          };
          nextPlayers[1] = {
            ...nextPlayers[1],
            chips: 192,
            currentBet: 8,
            totalHandBet: 8,
            cards: [makeCard('J', 'hearts'), makeCard('J', 'diamonds')],
            lastAction: 'Call $8',
          };
          nextPlayers[2] = {
            ...nextPlayers[2],
            chips: 192,
            currentBet: 8,
            totalHandBet: 8,
            cards: [makeCard('Q', 'clubs'), makeCard('10', 'clubs')],
            lastAction: 'Call $8',
          };
          nextPlayers[3] = {
            ...nextPlayers[3],
            chips: 196,
            currentBet: 0,
            totalHandBet: 4,
            isTurn: true,
            isWatchingPhone: true,
            activeTell: 'none',
            cards: [makeCard('8', 'clubs'), makeCard('3', 'diamonds')],
            lastAction: 'Scrolling Reels...',
            activeChatBubble: 'Hold on, watching this reel 😂📱',
            activeChatTimestamp: now,
          };
          nextPlayers[4] = {
            ...nextPlayers[4],
            chips: 196,
            currentBet: 0,
            totalHandBet: 4,
            folded: true,
            cards: [makeCard('5', 'hearts'), makeCard('2', 'spades')],
            lastAction: 'Fold',
          };
          nextTable = {
            ...nextTable,
            phase: 'flop',
            pot: 32,
            currentHighBet: 8,
            minRaise: 8,
            activeSeat: 3,
            communityCards: [
              makeCard('K', 'diamonds', true),
              makeCard('7', 'clubs', true),
              makeCard('3', 'spades', true),
            ],
            burnCardsCount: 1,
          };
          break;
        }

        case 'bao_phone_down_monster': {
          nextPlayers[0] = {
            ...nextPlayers[0],
            chips: 170,
            currentBet: 15,
            totalHandBet: 30,
            isTurn: true,
            cards: [makeCard('A', 'clubs', true), makeCard('Q', 'spades', true)],
            lastAction: 'Bet $15',
          };
          nextPlayers[1] = {
            ...nextPlayers[1],
            chips: 170,
            currentBet: 15,
            totalHandBet: 30,
            cards: [makeCard('K', 'hearts'), makeCard('J', 'hearts')],
            lastAction: 'Call $15',
          };
          nextPlayers[2] = {
            ...nextPlayers[2],
            chips: 185,
            currentBet: 0,
            totalHandBet: 15,
            folded: true,
            cards: [makeCard('9', 'clubs'), makeCard('8', 'clubs')],
            lastAction: 'Fold',
          };
          nextPlayers[3] = {
            ...nextPlayers[3],
            chips: 140,
            currentBet: 45,
            totalHandBet: 60,
            isWatchingPhone: false,
            activeTell: 'phone_down_monster',
            cards: [makeCard('A', 'hearts'), makeCard('A', 'diamonds')],
            lastAction: 'Raise to $45',
            activeChatBubble: 'Phone down. Raise to $45.',
            activeChatTimestamp: now,
          };
          nextPlayers[4] = {
            ...nextPlayers[4],
            chips: 185,
            currentBet: 0,
            totalHandBet: 15,
            folded: true,
            cards: [makeCard('6', 'diamonds'), makeCard('4', 'diamonds')],
            lastAction: 'Fold',
          };
          nextTable = {
            ...nextTable,
            phase: 'turn',
            pot: 150,
            currentHighBet: 45,
            minRaise: 30,
            activeSeat: 0,
            communityCards: [
              makeCard('A', 'spades', true),
              makeCard('K', 'diamonds', true),
              makeCard('K', 'clubs', true),
              makeCard('7', 'spades', true),
            ],
            burnCardsCount: 2,
          };
          break;
        }

        case 'all_in_runout': {
          nextPeekLock = true;
          nextPlayers[0] = {
            ...nextPlayers[0],
            chips: 0,
            currentBet: 200,
            totalHandBet: 200,
            allIn: true,
            cards: [makeCard('A', 'diamonds', true), makeCard('K', 'diamonds', true)],
            lastAction: 'All-In ($200)',
          };
          nextPlayers[1] = {
            ...nextPlayers[1],
            chips: 0,
            currentBet: 200,
            totalHandBet: 200,
            allIn: true,
            cards: [makeCard('Q', 'spades', true), makeCard('Q', 'diamonds', true)],
            lastAction: 'All-In ($200)',
          };
          nextPlayers[2] = {
            ...nextPlayers[2],
            chips: 190,
            currentBet: 0,
            totalHandBet: 10,
            folded: true,
            cards: [makeCard('8', 'hearts'), makeCard('7', 'hearts')],
            lastAction: 'Fold',
          };
          nextPlayers[3] = {
            ...nextPlayers[3],
            chips: 0,
            currentBet: 80,
            totalHandBet: 80,
            allIn: true,
            isWatchingPhone: false,
            activeTell: 'phone_down_monster',
            cards: [makeCard('J', 'spades', true), makeCard('10', 'spades', true)],
            lastAction: 'All-In ($80)',
          };
          nextPlayers[4] = {
            ...nextPlayers[4],
            chips: 190,
            currentBet: 0,
            totalHandBet: 10,
            folded: true,
            cards: [makeCard('5', 'clubs'), makeCard('4', 'clubs')],
            lastAction: 'Fold',
          };
          nextTable = {
            ...nextTable,
            phase: 'turn',
            pot: 500,
            sidePots: [
              {
                amount: 260,
                eligiblePlayerIds: ['human', 'ai_1', 'ai_3'],
                label: 'Main Pot',
              },
              {
                amount: 240,
                eligiblePlayerIds: ['human', 'ai_1'],
                label: 'Side Pot 1',
              },
            ],
            currentHighBet: 200,
            minRaise: 200,
            activeSeat: 0,
            isAllInRunout: true,
            communityCards: [
              makeCard('A', 'spades', true),
              makeCard('K', 'spades', true),
              makeCard('Q', 'clubs', true),
              makeCard('2', 'diamonds', true),
            ],
            burnCardsCount: 2,
          };
          break;
        }

        case 'showdown_multiway': {
          nextPeekLock = true;
          const comm = [
            makeCard('A', 'spades', true),
            makeCard('K', 'spades', true),
            makeCard('Q', 'spades', true),
            makeCard('J', 'spades', true),
            makeCard('2', 'clubs', true),
          ];
          const humanCards = [makeCard('10', 'spades', true), makeCard('9', 'spades', true)];
          nextPlayers[0] = {
            ...nextPlayers[0],
            chips: 420,
            currentBet: 0,
            totalHandBet: 140,
            cards: humanCards,
            lastAction: 'Royal Flush!',
          };
          nextPlayers[1] = {
            ...nextPlayers[1],
            chips: 60,
            currentBet: 0,
            totalHandBet: 140,
            cards: [makeCard('A', 'clubs', true), makeCard('A', 'diamonds', true)],
            lastAction: 'Three Aces',
          };
          nextPlayers[2] = {
            ...nextPlayers[2],
            chips: 190,
            currentBet: 0,
            totalHandBet: 10,
            folded: true,
            cards: [makeCard('7', 'diamonds'), makeCard('6', 'diamonds')],
            lastAction: 'Fold',
          };
          nextPlayers[3] = {
            ...nextPlayers[3],
            chips: 120,
            currentBet: 0,
            totalHandBet: 130,
            isWatchingPhone: false,
            cards: [makeCard('K', 'clubs', true), makeCard('Q', 'clubs', true)],
            lastAction: 'Two Pair',
          };
          nextPlayers[4] = {
            ...nextPlayers[4],
            chips: 210,
            currentBet: 0,
            totalHandBet: 0,
            folded: true,
            cards: [makeCard('4', 'spades'), makeCard('3', 'spades')],
            lastAction: 'Fold',
          };
          nextTable = {
            ...nextTable,
            phase: 'showdown',
            pot: 0,
            currentHighBet: 0,
            minRaise: 2,
            activeSeat: 0,
            isAllInRunout: false,
            communityCards: comm,
            burnCardsCount: 3,
            winners: [
              {
                playerId: 'human',
                playerName: 'You',
                amount: 420,
                handName: 'Royal Flush',
                bestCards: [comm[0], comm[1], comm[2], comm[3], humanCards[0]],
                potLabel: 'Main Pot',
              },
            ],
          };
          break;
        }
      }

      setIsPeeking(nextPeeking);
      isPeekingRef.current = nextPeeking;
      setIsPeekLocked(nextPeekLock);
      isPeekLockedRef.current = nextPeekLock;

      setPlayers(nextPlayers);
      playersRef.current = nextPlayers;
      setTable(nextTable);
      tableRef.current = nextTable;

      syncSceneAll(nextTable, nextPlayers, nextPeeking || nextPeekLock);
    },
    [syncSceneAll]
  );

  // Initialize Three.js Scene and WebXR
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const casinoScene = new CasinoScene(canvasContainerRef.current);
    sceneRef.current = casinoScene;

    const xrManager = new WebXRManager(casinoScene.renderer, casinoScene.scene, casinoScene.cameraRig);
    xrManagerRef.current = xrManager;

    xrManager.checkSupport().then((supported) => {
      setIsXRSupported(supported);
    });

    // Bind WebXR Unified Spatial Ray & Hand Pinch Events into CasinoScene
    xrManager.onRayDown = (ray) => {
      casinoScene.handleRayDown(ray);
    };
    xrManager.onRayMove = (ray) => {
      casinoScene.handleRayMove(ray);
    };
    xrManager.onRayUp = (ray) => {
      casinoScene.handleRayUp(ray);
    };
    xrManager.onSessionStateChange = (presenting, isFloorSpace = true) => {
      setIsInXR(presenting);
      casinoScene.setXRPresenting(presenting, isFloorSpace);
      if (presenting) {
        setIsTitleMode(false);
        isTitleModeRef.current = false;
        casinoScene.setTitleMode(false);
        pokerAudio.startMusicAndAmbience();
      }
    };

    // Update WebXR 25-Joint Hand Mesh & Pinch Polling inside the 90fps render loop
    casinoScene.onXRFrameCallback = (frame) => {
      xrManager.updateFrame(frame);
    };

    // Keyboard shortcut for peeking cards (Hold Spacebar) & XR View Offset nudges
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        handlePeek(true);
      } else if (xrManagerRef.current?.isPresenting) {
        // XR Viewpoint fine-tuning keys:
        // ArrowDown / S: move further away from dealer (+Z)
        // ArrowUp / W: move closer to table (-Z)
        // PageUp / E: elevate viewpoint (+Y)
        // PageDown / Q: lower viewpoint (-Y)
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          casinoScene.adjustXROffset(0, 0, 0.05);
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          casinoScene.adjustXROffset(0, 0, -0.05);
        } else if (e.code === 'PageUp' || e.code === 'KeyE') {
          casinoScene.adjustXROffset(0, 0.04, 0);
        } else if (e.code === 'PageDown' || e.code === 'KeyQ') {
          casinoScene.adjustXROffset(0, -0.04, 0);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handlePeek(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Deal initial preview hand in the background of the 3D Title Screen
    startNewHand(createInitialPlayers(), true);

    return () => {
      clearTimers();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      casinoScene.destroy();
    };
  }, []);

  // Keep CasinoScene spatial callbacks bound to latest handlers
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.onStageChipCallback = handleStageChip;
    scene.onClearStagedChipsCallback = handleClearStagedBet;
    scene.onPlayerActionCallback = handleAction;
    scene.onPeekChangeCallback = (peeking) => {
      setIsPeeking(peeking);
      isPeekingRef.current = peeking;
      scene.updateSpatialHUD(
        tableRef.current,
        playersRef.current[0],
        peeking || isPeekLockedRef.current
      );
    };
    scene.onNextHandCallback = () => {
      if (tableRef.current.tournamentWinnerId || playersRef.current[0]?.eliminated) {
        startNewTournament();
      } else {
        startNewHand();
      }
    };
  }, [handleStageChip, handleClearStagedBet, handleAction, startNewHand, startNewTournament]);

  const handleStartDesktopGame = useCallback(() => {
    setIsTitleMode(false);
    isTitleModeRef.current = false;
    if (sceneRef.current) {
      sceneRef.current.setTitleMode(false);
    }
    pokerAudio.playChipClink(2);
    pokerAudio.startMusicAndAmbience();
    pokerAudio.speakDealer('Welcome to the Monte Carlo VIP table. Good luck, players.');
  }, []);

  const resetCamera = useCallback(() => {
    setCameraPreset('seat0_pov');
    sceneRef.current?.setCameraPreset('seat0_pov');
  }, []);

  const toggleVR = async () => {
    if (!xrManagerRef.current) return;
    if (isInXR) {
      await xrManagerRef.current.exitVR();
      setIsInXR(false);
    } else {
      setIsTitleMode(false);
      isTitleModeRef.current = false;
      sceneRef.current?.setTitleMode(false);
      pokerAudio.startMusicAndAmbience();
      const success = await xrManagerRef.current.enterVR();
      setIsInXR(success);
    }
  };

  // Human player hand evaluation preview (only revealed when peeking, peek-locked, all-in runout, or showdown)
  const human = players[0];
  const isCardsRevealed =
    isPeeking || isPeekLocked || table.isAllInRunout || table.phase === 'showdown';
  const handEval: HandEvaluation | null =
    human && human.cards.length === 2 && isCardsRevealed
      ? evaluate7CardHand([...human.cards, ...table.communityCards])
      : null;

  // Real-time GTO & Node-Locked Exploitative Analysis
  const gtoAnalysis = useMemo(() => computeGTOAnalysis(table, players), [table, players]);

  // Seat #0 Auto-Pilot Bot Loop (uses GTO Solver recommendation + auto-advances Showdown)
  useEffect(() => {
    if (!isAutoPilot || isTitleMode) {
      if (autoPilotTimeoutRef.current !== null) {
        window.clearTimeout(autoPilotTimeoutRef.current);
        autoPilotTimeoutRef.current = null;
      }
      return;
    }

    if (table.phase === 'showdown') {
      const delay = Math.max(180, Math.round(1100 / speedMultiplier));
      autoPilotTimeoutRef.current = window.setTimeout(() => {
        if (tableRef.current.tournamentWinnerId || playersRef.current[0]?.eliminated) {
          startNewTournament();
        } else {
          startNewHand();
        }
      }, delay);
      return;
    }

    if (human && human.isTurn && !human.folded && !human.allIn && !table.isAllInRunout) {
      const delay = Math.max(140, Math.round(620 / speedMultiplier));
      autoPilotTimeoutRef.current = window.setTimeout(() => {
        const activeRec = solverMode === 'exploit' ? gtoAnalysis.exploit : gtoAnalysis.pureGto;
        handleAction(activeRec.bestAction);
      }, delay);
    }
  }, [
    isAutoPilot,
    isTitleMode,
    table,
    human,
    gtoAnalysis,
    solverMode,
    speedMultiplier,
    handleAction,
    startNewHand,
    startNewTournament,
  ]);

  // Synchronize 2D vs. 3D Spatial HUD mutual exclusivity with CasinoScene
  useEffect(() => {
    sceneRef.current?.setShow2DHUD(show2DHUD && !isInXR);
    const timer = window.setTimeout(() => {
      handleRefreshHudUiAudit();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [show2DHUD, isInXR, table.phase, table.activeSeat, cameraPreset, handleRefreshHudUiAudit]);

  // Expose window.__POKER_DOGFOOD__ for Automated Playwright & Console Visual Verification
  useEffect(() => {
    const dogfoodApi = {
      loadScenario: (id: DogfoodScenarioId) => handleLoadScenario(id),
      setCameraPreset: (preset: CameraPresetId) => handleChangeCameraPreset(preset),
      setShow2DHUD: (show: boolean) => {
        show2DHUDRef.current = show;
        setShow2DHUD(show);
        sceneRef.current?.setShow2DHUD(show && !isInXRRef.current);
      },
      setDebugOverlay: (enabled: boolean) => {
        setDebugOverlayEnabled(enabled);
        sceneRef.current?.setDebugOverlay(enabled);
      },
      setAutoPilot: (enabled: boolean, speed: 1 | 2 | 5 = 1) => {
        if (enabled && isTitleModeRef.current) {
          handleStartDesktopGame();
        }
        setSpeedMultiplier(speed);
        speedMultiplierRef.current = speed;
        setIsAutoPilot(enabled);
        isAutoPilotRef.current = enabled;
      },
      runSpatialAudit: () => {
        const report = sceneRef.current?.runSpatialAudit() || null;
        setSpatialAudit(report);
        return report;
      },
      runHudUiAudit: () => {
        return handleRefreshHudUiAudit();
      },
      getHudUiRules: () => HUD_UI_RULES,
      getCharacterScreenBounds: () => {
        return sceneRef.current?.getCharacterScreenBounds() || [];
      },
      getTableSafeZoneScreenBounds: () => {
        return sceneRef.current?.getTableSafeZoneScreenBounds() || null;
      },
      getState: () => ({
        isTitleMode: isTitleModeRef.current,
        table: tableRef.current,
        players: playersRef.current,
        cameraPreset,
        activeScenario,
        isAutoPilot: isAutoPilotRef.current,
        speedMultiplier: speedMultiplierRef.current,
        show2DHUD,
        isInXR,
        debugOverlayEnabled,
        drawCalls,
      }),
    };
    (window as unknown as { __POKER_DOGFOOD__: typeof dogfoodApi }).__POKER_DOGFOOD__ = dogfoodApi;
  }, [
    handleLoadScenario,
    handleChangeCameraPreset,
    handleStartDesktopGame,
    handleRefreshHudUiAudit,
    cameraPreset,
    activeScenario,
    show2DHUD,
    isInXR,
    debugOverlayEnabled,
    drawCalls,
  ]);

  return (
    <div className="relative w-screen h-screen bg-[#060911] select-none overflow-hidden">
      {/* 3D WebGL / WebXR Canvas Container */}
      <div ref={canvasContainerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Synchronized 2D Glassmorphic & Spatial HUD Overlay */}
      <PokerHUD
        isTitleMode={isTitleMode}
        onStartDesktopGame={handleStartDesktopGame}
        table={table}
        players={players}
        humanPlayer={human}
        handEval={handEval}
        stats={stats}
        drawCalls={drawCalls}
        musicMood={musicMood}
        chatMessages={chatMessages}
        onSendQuickEmote={handleSendQuickEmote}
        isXRSupported={isXRSupported}
        isInXR={isInXR}
        onEnterVR={toggleVR}
        onAdjustXROffset={(dx, dy, dz) => sceneRef.current?.adjustXROffset(dx, dy, dz)}
        onAction={handleAction}
        onStageChip={handleStageChip}
        onClearStagedBet={handleClearStagedBet}
        onStartNewTournament={startNewTournament}
        onStartNextHand={() => startNewHand()}
        onPeekCards={handlePeek}
        isPeeking={isPeeking}
        isPeekLocked={isPeekLocked}
        onTogglePeekLock={handleTogglePeekLock}
        onResetView={resetCamera}
        gtoAnalysis={gtoAnalysis}
        solverMode={solverMode}
        onChangeSolverMode={setSolverMode}
        decisionHistory={decisionHistory}
        lastDecisionRecord={lastDecisionRecord}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={handleChangeCameraPreset}
        activeScenario={activeScenario}
        onLoadScenario={handleLoadScenario}
        isAutoPilot={isAutoPilot}
        onToggleAutoPilot={() => {
          if (!isAutoPilot && isTitleMode) {
            handleStartDesktopGame();
          }
          setIsAutoPilot((prev) => !prev);
        }}
        speedMultiplier={speedMultiplier}
        onChangeSpeedMultiplier={setSpeedMultiplier}
        show2DHUD={show2DHUD}
        onToggle2DHUD={() =>
          setShow2DHUD((prev) => {
            const next = !prev;
            show2DHUDRef.current = next;
            sceneRef.current?.setShow2DHUD(next && !isInXR);
            return next;
          })
        }
        debugOverlayEnabled={debugOverlayEnabled}
        onToggleDebugOverlay={handleToggleDebugOverlay}
        spatialAudit={spatialAudit}
        onRunSpatialAudit={handleRefreshSpatialAudit}
        hudUiAudit={hudUiAudit}
        onRunHudUiAudit={handleRefreshHudUiAudit}
      />
    </div>
  );
};

export default App;
