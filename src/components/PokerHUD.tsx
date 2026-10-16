import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Glasses,
  RotateCcw,
  Eye,
  EyeOff,
  Flame,
  ShieldAlert,
  Coins,
  Trophy,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';
import { PlayerState, TableState, HandEvaluation, PlayerAction } from '../types/poker';
import { pokerAudio } from '../audio/pokerAudio';

interface PokerHUDProps {
  table: TableState;
  players: PlayerState[];
  humanPlayer: PlayerState;
  handEval: HandEvaluation | null;
  isXRSupported: boolean;
  isInXR: boolean;
  onEnterVR: () => void;
  onAction: (action: PlayerAction) => void;
  onRebuy: (amount: number) => void;
  onStartNextHand: () => void;
  onPeekCards: (peeking: boolean) => void;
  isPeeking: boolean;
  onResetView: () => void;
}

export const PokerHUD: React.FC<PokerHUDProps> = ({
  table,
  players,
  humanPlayer,
  handEval,
  isXRSupported,
  isInXR,
  onEnterVR,
  onAction,
  onRebuy,
  onStartNextHand,
  onPeekCards,
  isPeeking,
  onResetView,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [betAmount, setBetAmount] = useState<number>(table.bigBlind * 2);

  const toggleSound = () => {
    const next = !isMuted;
    setIsMuted(next);
    pokerAudio.setMuted(next);
  };

  const callAmount = Math.max(0, table.currentHighBet - humanPlayer.currentBet);
  const isFreeToCheck = callAmount === 0;
  const minAllowedBet = Math.max(table.bigBlind, table.currentHighBet + table.minRaise);
  const maxAllowedBet = humanPlayer.chips + humanPlayer.currentBet;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setBetAmount(val);
    pokerAudio.playTick();
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10 overflow-hidden">
      {/* 1. TOP BAR: Title, Pot, Stakes, and Quick Controls */}
      <div className="flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-2">
            <span className="text-xl">♠️</span>
            <div>
              <div className="font-extrabold text-sm gold-gradient-text tracking-wide">
                VIP HIGH ROLLER LOUNGE
              </div>
              <div className="text-[11px] text-slate-400">
                Stakes: ${table.smallBlind}/${table.bigBlind} No-Limit • Hand #{table.handCount}
              </div>
            </div>
          </div>
        </div>

        {/* Center Pot & Table Phase Display */}
        <div className="glass-panel px-6 py-2.5 rounded-2xl flex flex-col items-center">
          <span className="text-[10px] font-bold tracking-widest text-brass-light uppercase">
            Current Pot • {table.phase.toUpperCase()}
          </span>
          <span className="text-3xl font-extrabold text-amber-300 font-mono tracking-tight flex items-center gap-1">
            <Coins className="w-5 h-5 text-amber-400 inline" /> ${table.pot}
          </span>
        </div>

        {/* Right Tools (Mute, Reset View, WebXR) */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className="glass-panel p-2.5 rounded-xl hover:border-amber-400/50 transition-colors text-slate-200"
            title="Toggle Sound"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
          </button>

          <button
            onClick={onResetView}
            className="glass-panel p-2.5 rounded-xl hover:border-amber-400/50 transition-colors text-slate-200"
            title="Reset Camera View"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={onEnterVR}
            className={`glass-panel px-3.5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-xs tracking-wide transition-all ${
              isXRSupported
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 hover:bg-amber-500/30'
                : 'text-slate-400 border-slate-700 opacity-60'
            }`}
          >
            <Glasses className="w-4 h-4 text-amber-300" />
            {isInXR ? 'Exit VR' : isXRSupported ? 'Enter WebXR' : '3D Desktop'}
          </button>
        </div>
      </div>

      {/* 2. OPPONENTS STATUS ROW (AI Rivals) */}
      <div className="grid grid-cols-4 gap-2 w-full max-w-4xl mx-auto pointer-events-auto">
        {players
          .filter((p) => !p.isHuman)
          .map((p) => (
            <div
              key={p.id}
              className={`glass-panel p-2.5 rounded-xl transition-all border ${
                p.isTurn
                  ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-950/40'
                  : p.folded
                  ? 'opacity-40 border-slate-800'
                  : 'border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold truncate" style={{ color: p.color }}>
                  {p.name}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 font-mono text-amber-300">
                  ${p.chips}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>{p.folded ? 'Folded' : p.allIn ? 'All-In' : p.lastAction || 'Waiting'}</span>
                {p.currentBet > 0 && (
                  <span className="font-mono text-emerald-400 font-semibold">${p.currentBet}</span>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* 3. SHOWDOWN BANNER */}
      {table.phase === 'showdown' && table.winners.length > 0 && (
        <div className="self-center glass-panel p-5 rounded-2xl max-w-lg w-full text-center pointer-events-auto animate-bounce-short border-amber-400/60 shadow-2xl">
          <Trophy className="w-8 h-8 text-amber-400 mx-auto mb-1 animate-pulse" />
          <h2 className="text-xl font-black gold-gradient-text">
            {table.winners.map((w) => w.playerName).join(' & ')} Wins!
          </h2>
          <div className="text-sm text-amber-200/90 font-medium my-1">
            {table.winners[0].handName}
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono mb-4">
            +${table.winners.reduce((acc, w) => acc + w.amount, 0)}
          </div>
          <button
            onClick={onStartNextHand}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
          >
            <span>Deal Next Hand</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. RE-BUY MODAL (When player stack is zero or very low) */}
      {humanPlayer.chips <= 0 && table.phase !== 'showdown' && (
        <div className="self-center glass-panel p-6 rounded-2xl max-w-md w-full text-center pointer-events-auto border-red-500/40">
          <ShieldAlert className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <h3 className="text-lg font-bold text-white mb-1">Out of Chips!</h3>
          <p className="text-xs text-slate-300 mb-4">
            Re-buy chips now to continue playing at the VIP table.
          </p>
          <div className="flex gap-2 justify-center">
            {[100, 200, 500].map((amt) => (
              <button
                key={amt}
                onClick={() => onRebuy(amt)}
                className="flex-1 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-sm"
              >
                +${amt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. BOTTOM PLAYER DOCK: Hand Evaluation, Peeking, and Betting Affordances */}
      <div className="flex flex-col gap-3 max-w-2xl w-full mx-auto pointer-events-auto">
        {/* Human Status Bar & Peeking Toggle */}
        <div className="glass-panel px-4 py-2 rounded-xl flex items-center justify-between border-slate-800">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <div>
              <div className="text-xs font-bold text-blue-400">YOUR HAND (SEAT #0)</div>
              <div className="text-sm font-extrabold text-white">
                {humanPlayer.folded
                  ? 'Folded'
                  : handEval
                  ? handEval.description
                  : 'Holding 2 Hole Cards'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Your Stack
              </div>
              <div className="text-lg font-mono font-black text-amber-300">
                ${humanPlayer.chips}
              </div>
            </div>

            {/* Hold to Peek Cards Button */}
            {!humanPlayer.folded && humanPlayer.cards.length > 0 && (
              <button
                onMouseDown={() => onPeekCards(true)}
                onMouseUp={() => onPeekCards(false)}
                onTouchStart={() => onPeekCards(true)}
                onTouchEnd={() => onPeekCards(false)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  isPeeking
                    ? 'bg-amber-400 text-slate-950 border-amber-300 scale-95'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-amber-300 border-amber-500/30'
                }`}
                title="Hold to bend card corners and peek at your cards"
              >
                {isPeeking ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{isPeeking ? 'Peeking...' : 'Peek Cards'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons (Visible when it is Human's Turn) */}
        {humanPlayer.isTurn && !humanPlayer.folded && (
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col gap-3 border-amber-400/50 shadow-2xl">
            {/* Quick Raise Slider & Presets */}
            {humanPlayer.chips > callAmount && (
              <div className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded-xl">
                <span className="text-xs font-bold text-slate-300 font-mono min-w-14">
                  Raise: ${Math.max(betAmount, minAllowedBet)}
                </span>
                <input
                  type="range"
                  min={minAllowedBet}
                  max={maxAllowedBet}
                  step={1}
                  value={betAmount}
                  onChange={handleSliderChange}
                  className="flex-1 accent-amber-400 cursor-pointer"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setBetAmount(minAllowedBet)}
                    className="px-2 py-1 bg-slate-800 text-[11px] font-bold rounded hover:bg-slate-700"
                  >
                    Min
                  </button>
                  <button
                    onClick={() => setBetAmount(Math.min(maxAllowedBet, table.pot))}
                    className="px-2 py-1 bg-slate-800 text-[11px] font-bold rounded hover:bg-slate-700"
                  >
                    Pot
                  </button>
                  <button
                    onClick={() => setBetAmount(maxAllowedBet)}
                    className="px-2 py-1 bg-red-900/40 text-red-400 text-[11px] font-bold rounded hover:bg-red-800/50"
                  >
                    All-In
                  </button>
                </div>
              </div>
            )}

            {/* Main Action Buttons */}
            <div className="grid grid-cols-3 gap-3">
              {/* Fold */}
              <button
                onClick={() => onAction({ type: 'fold' })}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-red-400 font-extrabold text-sm border border-red-500/20 transition-all flex items-center justify-center gap-1.5"
              >
                <span>Fold</span>
              </button>

              {/* Check / Call */}
              <button
                onClick={() => onAction(isFreeToCheck ? { type: 'check' } : { type: 'call' })}
                className="py-3 px-4 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 active:scale-95 text-blue-200 font-extrabold text-sm border border-blue-500/40 transition-all flex items-center justify-center gap-1.5"
              >
                <span>{isFreeToCheck ? 'Check' : `Call $${callAmount}`}</span>
              </button>

              {/* Bet / Raise / All-in */}
              {humanPlayer.chips <= callAmount ? (
                <button
                  onClick={() => onAction({ type: 'allin' })}
                  className="py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-slate-950 font-black text-sm border border-amber-300 transition-all flex items-center justify-center gap-1.5 shadow-lg"
                >
                  <Flame className="w-4 h-4" />
                  <span>All-In (${humanPlayer.chips})</span>
                </button>
              ) : (
                <button
                  onClick={() =>
                    onAction({
                      type: 'raise',
                      amount: Math.max(betAmount, minAllowedBet),
                    })
                  }
                  className="py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-slate-950 font-black text-sm border border-amber-300 transition-all flex items-center justify-center gap-1.5 shadow-lg"
                >
                  <Flame className="w-4 h-4" />
                  <span>
                    {table.currentHighBet === 0
                      ? `Bet $${Math.max(betAmount, minAllowedBet)}`
                      : `Raise to $${Math.max(betAmount, minAllowedBet)}`}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
