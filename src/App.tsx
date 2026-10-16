import React, { useEffect, useRef, useState, useCallback } from 'react';
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
} from './types/poker';
import {
  createDeck,
  createInitialPlayers,
  evaluate7CardHand,
  getAIDecision,
} from './logic/pokerEngine';
import { pokerAudio } from './audio/pokerAudio';

export const App: React.FC = () => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CasinoScene | null>(null);
  const xrManagerRef = useRef<WebXRManager | null>(null);

  const [players, setPlayers] = useState<PlayerState[]>(createInitialPlayers);
  const [table, setTable] = useState<TableState>({
    phase: 'waiting',
    pot: 0,
    currentHighBet: 2,
    minRaise: 2,
    smallBlind: 1,
    bigBlind: 2,
    dealerSeat: 4,
    activeSeat: 0,
    communityCards: [],
    winners: [],
    handCount: 0,
  });

  const [deck, setDeck] = useState<Card[]>([]);
  const [isXRSupported, setIsXRSupported] = useState(false);
  const [isInXR, setIsInXR] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);

  // Reference to avoid stale state in async AI loops
  const playersRef = useRef(players);
  playersRef.current = players;
  const tableRef = useRef(table);
  tableRef.current = table;
  const deckRef = useRef(deck);
  deckRef.current = deck;

  // Initialize Three.js Scene and WebXR
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const casinoScene = new CasinoScene(canvasContainerRef.current);
    sceneRef.current = casinoScene;

    const xrManager = new WebXRManager(casinoScene.renderer, casinoScene.scene);
    xrManagerRef.current = xrManager;

    xrManager.checkSupport().then((supported) => {
      setIsXRSupported(supported);
    });

    // Peeking callback from VR Controller / pinch
    xrManager.onPinchCallback = (pinching) => {
      handlePeek(pinching);
    };

    // Keyboard shortcut for peeking cards (Hold Spacebar)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        handlePeek(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        handlePeek(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Initial table visual sync
    casinoScene.updateAvatars(playersRef.current);
    startNewHand();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      casinoScene.destroy();
    };
  }, []);

  const handlePeek = useCallback((peeking: boolean) => {
    setIsPeeking(peeking);
    if (sceneRef.current) {
      const human = playersRef.current[0];
      sceneRef.current.setPeekProgress(peeking ? 1 : 0, human.cards);
    }
  }, []);

  const resetCamera = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.camera.position.set(0, 1.45, 1.35);
      sceneRef.current.controls.target.set(0, 0.76, 0);
      sceneRef.current.controls.update();
    }
  }, []);

  const toggleVR = async () => {
    if (!xrManagerRef.current) return;
    if (isInXR) {
      await xrManagerRef.current.exitVR();
      setIsInXR(false);
    } else {
      const success = await xrManagerRef.current.enterVR();
      setIsInXR(success);
    }
  };

  /**
   * Starts a brand new hand: shuffles, posts blinds, deals hole cards
   */
  const startNewHand = () => {
    if (sceneRef.current) {
      sceneRef.current.clearCards();
    }

    const newDeck = createDeck();
    const prevTable = tableRef.current;
    const dealerSeat = (prevTable.dealerSeat + 1) % 5;
    const sbSeat = (dealerSeat + 1) % 5;
    const bbSeat = (dealerSeat + 2) % 5;
    const firstToAct = (dealerSeat + 3) % 5;

    let deckIndex = 0;
    const updatedPlayers = playersRef.current.map((p, idx) => {
      const c1 = { ...newDeck[deckIndex++], faceUp: p.isHuman };
      const c2 = { ...newDeck[deckIndex++], faceUp: p.isHuman };

      let bet = 0;
      let chips = p.chips;

      // Small Blind
      if (idx === sbSeat) {
        bet = Math.min(chips, prevTable.smallBlind);
        chips -= bet;
      }
      // Big Blind
      else if (idx === bbSeat) {
        bet = Math.min(chips, prevTable.bigBlind);
        chips -= bet;
      }

      return {
        ...p,
        cards: [c1, c2],
        currentBet: bet,
        chips,
        folded: p.chips <= 0,
        allIn: chips === 0,
        lastAction: idx === sbSeat ? 'Small Blind $1' : idx === bbSeat ? 'Big Blind $2' : undefined,
        isTurn: idx === firstToAct,
      };
    });

    const pot = updatedPlayers.reduce((acc, p) => acc + p.currentBet, 0);

    const remainingDeck = newDeck.slice(deckIndex);
    setDeck(remainingDeck);
    deckRef.current = remainingDeck;

    const nextTable: TableState = {
      ...prevTable,
      phase: 'preflop',
      pot,
      currentHighBet: prevTable.bigBlind,
      minRaise: prevTable.bigBlind,
      dealerSeat,
      activeSeat: firstToAct,
      communityCards: [],
      winners: [],
      handCount: prevTable.handCount + 1,
    };

    setPlayers(updatedPlayers);
    setTable(nextTable);

    // Sync 3D Scene
    if (sceneRef.current) {
      sceneRef.current.syncCards(nextTable, updatedPlayers);
      sceneRef.current.syncChips(nextTable, updatedPlayers);
      sceneRef.current.updateAvatars(updatedPlayers);
      sceneRef.current.updateActiveTurn(firstToAct);
    }

    pokerAudio.playChipClink(2);

    // If first player is AI, trigger turn
    if (!updatedPlayers[firstToAct].isHuman) {
      runAITurn(firstToAct, updatedPlayers, nextTable);
    }
  };

  /**
   * Executes player or AI action
   */
  const handleAction = useCallback(
    (action: PlayerAction) => {
      const currentPlayers = [...playersRef.current];
      const currentTable = { ...tableRef.current };
      const activeIdx = currentTable.activeSeat;
      const player = { ...currentPlayers[activeIdx] };

      let betAdded = 0;

      switch (action.type) {
        case 'fold': {
          player.folded = true;
          player.lastAction = 'Fold';
          pokerAudio.playCardSlide();
          break;
        }

        case 'check': {
          player.lastAction = 'Check';
          pokerAudio.playKnock();
          break;
        }

        case 'call': {
          const needed = currentTable.currentHighBet - player.currentBet;
          betAdded = Math.min(player.chips, needed);
          player.chips -= betAdded;
          player.currentBet += betAdded;
          player.allIn = player.chips === 0;
          player.lastAction = `Call $${needed}`;
          pokerAudio.playChipClink(1);
          break;
        }

        case 'bet':
        case 'raise': {
          const targetTotal = action.amount || currentTable.currentHighBet + currentTable.minRaise;
          const diff = targetTotal - player.currentBet;
          betAdded = Math.min(player.chips, diff);
          player.chips -= betAdded;
          player.currentBet += betAdded;
          player.allIn = player.chips === 0;

          const raiseDiff = player.currentBet - currentTable.currentHighBet;
          if (raiseDiff > 0) {
            currentTable.minRaise = Math.max(currentTable.minRaise, raiseDiff);
            currentTable.currentHighBet = player.currentBet;
          }
          player.lastAction = `Raise to $${player.currentBet}`;
          pokerAudio.playChipClink(3);
          break;
        }

        case 'allin': {
          betAdded = player.chips;
          player.currentBet += betAdded;
          player.chips = 0;
          player.allIn = true;
          if (player.currentBet > currentTable.currentHighBet) {
            currentTable.minRaise = Math.max(currentTable.minRaise, player.currentBet - currentTable.currentHighBet);
            currentTable.currentHighBet = player.currentBet;
          }
          player.lastAction = `All-In ($${player.currentBet})`;
          pokerAudio.playChipClink(4);
          break;
        }
      }

      currentTable.pot += betAdded;
      player.isTurn = false;
      currentPlayers[activeIdx] = player;

      // Update 3D chips
      if (sceneRef.current) {
        sceneRef.current.syncChips(currentTable, currentPlayers);
      }

      // Check if only 1 player remains unfolded (immediate win)
      const activePlayers = currentPlayers.filter((p) => !p.folded);
      if (activePlayers.length === 1) {
        handleSinglePlayerWin(activePlayers[0], currentTable, currentPlayers);
        return;
      }

      // Check if betting round is complete
      const isRoundDone = checkRoundComplete(currentPlayers, currentTable);

      if (isRoundDone) {
        advancePhase(currentPlayers, currentTable);
      } else {
        const nextSeat = findNextSeat(activeIdx, currentPlayers);
        currentTable.activeSeat = nextSeat;
        currentPlayers[nextSeat].isTurn = true;

        setPlayers(currentPlayers);
        setTable(currentTable);

        if (sceneRef.current) {
          sceneRef.current.updateAvatars(currentPlayers);
          sceneRef.current.updateActiveTurn(nextSeat);
        }

        if (!currentPlayers[nextSeat].isHuman) {
          runAITurn(nextSeat, currentPlayers, currentTable);
        }
      }
    },
    []
  );

  const checkRoundComplete = (pList: PlayerState[], tState: TableState): boolean => {
    const active = pList.filter((p) => !p.folded);
    // Everyone remaining is all-in or has matched currentHighBet
    return active.every((p) => p.allIn || (p.lastAction !== undefined && p.currentBet === tState.currentHighBet));
  };

  const findNextSeat = (currentSeat: number, pList: PlayerState[]): number => {
    let next = (currentSeat + 1) % pList.length;
    while (pList[next].folded || pList[next].allIn) {
      next = (next + 1) % pList.length;
    }
    return next;
  };

  /**
   * Advances game through Preflop -> Flop -> Turn -> River -> Showdown
   */
  const advancePhase = (currentPlayers: PlayerState[], currentTable: TableState) => {
    // Reset player current bets for the new betting round
    const resetPlayers = currentPlayers.map((p) => ({ ...p, currentBet: 0, lastAction: undefined }));
    let nextDeck = [...deckRef.current];
    const newCommunity = [...currentTable.communityCards];

    let nextPhase = currentTable.phase;

    if (currentTable.phase === 'preflop') {
      nextPhase = 'flop';
      nextDeck.shift(); // Burn card
      const flop = [nextDeck.shift()!, nextDeck.shift()!, nextDeck.shift()!].map((c) => ({
        ...c,
        faceUp: true,
      }));
      newCommunity.push(...flop);
      pokerAudio.playCardFlip();
    } else if (currentTable.phase === 'flop') {
      nextPhase = 'turn';
      nextDeck.shift(); // Burn
      const turnCard = { ...nextDeck.shift()!, faceUp: true };
      newCommunity.push(turnCard);
      pokerAudio.playCardFlip();
    } else if (currentTable.phase === 'turn') {
      nextPhase = 'river';
      nextDeck.shift(); // Burn
      const riverCard = { ...nextDeck.shift()!, faceUp: true };
      newCommunity.push(riverCard);
      pokerAudio.playCardFlip();
    } else if (currentTable.phase === 'river') {
      // Showdown!
      handleShowdown(resetPlayers, currentTable, newCommunity);
      return;
    }

    setDeck(nextDeck);
    deckRef.current = nextDeck;

    // Reset turn to first active player after dealer
    const firstSeat = findNextSeat(currentTable.dealerSeat, resetPlayers);
    resetPlayers[firstSeat].isTurn = true;

    const nextTable: TableState = {
      ...currentTable,
      phase: nextPhase,
      currentHighBet: 0,
      minRaise: currentTable.bigBlind,
      activeSeat: firstSeat,
      communityCards: newCommunity,
    };

    setPlayers(resetPlayers);
    setTable(nextTable);

    if (sceneRef.current) {
      sceneRef.current.syncCards(nextTable, resetPlayers);
      sceneRef.current.syncChips(nextTable, resetPlayers);
      sceneRef.current.updateAvatars(resetPlayers);
      sceneRef.current.updateActiveTurn(firstSeat);
    }

    if (!resetPlayers[firstSeat].isHuman) {
      runAITurn(firstSeat, resetPlayers, nextTable);
    }
  };

  /**
   * Evaluates showdown hands and awards the pot
   */
  const handleShowdown = (pList: PlayerState[], tState: TableState, communityCards: Card[]) => {
    const contenders = pList.filter((p) => !p.folded);

    // Flip all contenders' cards face up
    const revealedPlayers = pList.map((p) => ({
      ...p,
      cards: p.cards.map((c) => ({ ...c, faceUp: true })),
      isTurn: false,
    }));

    // Evaluate each hand
    const evals = contenders.map((player) => {
      const evaluation = evaluate7CardHand([...player.cards, ...communityCards]);
      return { player, evaluation };
    });

    evals.sort((a, b) => b.evaluation.score - a.evaluation.score);
    const topScore = evals[0].evaluation.score;
    const winners = evals.filter((e) => e.evaluation.score === topScore);

    const splitAmount = Math.floor(tState.pot / winners.length);

    const winnerInfos: WinnerInfo[] = winners.map((w) => ({
      playerId: w.player.id,
      playerName: w.player.name,
      amount: splitAmount,
      handName: w.evaluation.description,
      bestCards: w.evaluation.bestCards,
    }));

    // Award chips
    const finalPlayers = revealedPlayers.map((p) => {
      const win = winnerInfos.find((w) => w.playerId === p.id);
      return win ? { ...p, chips: p.chips + win.amount } : p;
    });

    const updatedTable: TableState = {
      ...tState,
      phase: 'showdown',
      pot: 0,
      winners: winnerInfos,
      communityCards,
    };

    setPlayers(finalPlayers);
    setTable(updatedTable);

    if (sceneRef.current) {
      sceneRef.current.syncCards(updatedTable, finalPlayers);
      sceneRef.current.syncChips(updatedTable, finalPlayers);
      sceneRef.current.updateAvatars(finalPlayers);
    }

    pokerAudio.playWinFanfare();
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  /**
   * When all other players fold, the last standing player wins
   */
  const handleSinglePlayerWin = (winner: PlayerState, tState: TableState, pList: PlayerState[]) => {
    const updatedPlayers = pList.map((p) =>
      p.id === winner.id ? { ...p, chips: p.chips + tState.pot, isTurn: false } : { ...p, isTurn: false }
    );

    const winnerInfo: WinnerInfo = {
      playerId: winner.id,
      playerName: winner.name,
      amount: tState.pot,
      handName: 'Opponents Folded',
      bestCards: winner.cards,
    };

    const nextTable: TableState = {
      ...tState,
      phase: 'showdown',
      pot: 0,
      winners: [winnerInfo],
    };

    setPlayers(updatedPlayers);
    setTable(nextTable);

    if (sceneRef.current) {
      sceneRef.current.syncChips(nextTable, updatedPlayers);
      sceneRef.current.updateAvatars(updatedPlayers);
    }

    pokerAudio.playWinFanfare();
  };

  /**
   * Autonomous AI decision loop with realistic deliberation delay
   */
  const runAITurn = (seatIdx: number, currentPlayers: PlayerState[], currentTable: TableState) => {
    const ai = currentPlayers[seatIdx];
    if (!ai || ai.isHuman || ai.folded || ai.allIn) return;

    const delay = 600 + Math.random() * 800;
    setTimeout(() => {
      const decision = getAIDecision(ai, currentTable, currentTable.communityCards);
      handleAction(decision);
    }, delay);
  };

  /**
   * Re-buy chips
   */
  const handleRebuy = (amount: number) => {
    const updated = playersRef.current.map((p) => (p.isHuman ? { ...p, chips: p.chips + amount } : p));
    setPlayers(updated);
    pokerAudio.playChipClink(4);
  };

  // Human player hand evaluation preview
  const human = players[0];
  const handEval: HandEvaluation | null =
    human && human.cards.length === 2 && (human.cards[0].faceUp || isPeeking)
      ? evaluate7CardHand([...human.cards, ...table.communityCards])
      : null;

  return (
    <div className="relative w-screen h-screen bg-[#070a12] select-none overflow-hidden">
      {/* 3D WebGL Canvas Container */}
      <div ref={canvasContainerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating 2D/Spatial HUD Overlay */}
      <PokerHUD
        table={table}
        players={players}
        humanPlayer={human}
        handEval={handEval}
        isXRSupported={isXRSupported}
        isInXR={isInXR}
        onEnterVR={toggleVR}
        onAction={handleAction}
        onRebuy={handleRebuy}
        onStartNextHand={startNewHand}
        onPeekCards={handlePeek}
        isPeeking={isPeeking}
        onResetView={resetCamera}
      />
    </div>
  );
};

export default App;
