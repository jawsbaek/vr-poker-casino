import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Glasses,
  RotateCcw,
  Eye,
  EyeOff,
  Lock,
  Trophy,
  ArrowRight,
  RefreshCw,
  MessageSquare,
  Music,
  Mic,
  KeyRound,
  Brain,
  Camera,
  Layers,
  Sliders,
} from 'lucide-react';
import {
  PlayerState,
  TableState,
  HandEvaluation,
  PlayerAction,
  SessionStats,
  ChipDenomination,
  MusicMood,
  ChatMessage,
  QuickEmoteId,
  GTOAnalysis,
  GTOSolverMode,
  HandDecisionRecord,
  CameraPresetId,
  ActiveDrawerId,
  Suit,
} from '../types/poker';
import {
  getRankLabel,
  getSuitSymbol,
  HANDS_PER_BLIND_LEVEL,
  QUICK_EMOTES,
} from '../logic/pokerEngine';
import { getSeatPosition } from '../logic/gtoEngine';
import {
  GTOSolverDrawer,
  getGradeBadgeStyle,
} from './GTOSolverDrawer';
import { pokerAudio } from '../audio/pokerAudio';
import { geminiMedia } from '../services/geminiMediaService';

export const getSuitCardStyle = (
  suit: Suit,
  fourColor: boolean
): React.CSSProperties => {
  const cardFace = { backgroundColor: '#ffffff' };
  if (fourColor) {
    switch (suit) {
      case 'spades':
        return { ...cardFace, color: '#0f172a', borderColor: '#94a3b8' };
      case 'hearts':
        return { ...cardFace, color: '#dc2626', borderColor: '#f87171' };
      case 'diamonds':
        return { ...cardFace, color: '#2563eb', borderColor: '#60a5fa' };
      case 'clubs':
        return { ...cardFace, color: '#047857', borderColor: '#10b981' };
    }
  }
  const isRed = suit === 'hearts' || suit === 'diamonds';
  return {
    ...cardFace,
    color: isRed ? '#dc2626' : '#0f172a',
    borderColor: isRed ? '#f87171' : '#94a3b8',
  };
};

interface PokerHUDProps {
  isTitleMode: boolean;
  onStartDesktopGame: () => void;
  table: TableState;
  players: PlayerState[];
  humanPlayer: PlayerState;
  handEval: HandEvaluation | null;
  stats: SessionStats;
  drawCalls: number;
  musicMood: MusicMood;
  chatMessages: ChatMessage[];
  onSendQuickEmote: (emoteId: QuickEmoteId) => void;
  isXRSupported: boolean;
  isInXR: boolean;
  onEnterVR: () => void;
  onAdjustXROffset?: (dx: number, dy: number, dz: number) => void;
  onAction: (action: PlayerAction) => void;
  onStageChip: (denom: ChipDenomination) => void;
  onClearStagedBet: () => void;
  onStartNewTournament: () => void;
  onStartNextHand: () => void;
  onPeekCards: (peeking: boolean) => void;
  isPeeking: boolean;
  isPeekLocked: boolean;
  onTogglePeekLock: () => void;
  onResetView: () => void;
  gtoAnalysis: GTOAnalysis;
  solverMode: GTOSolverMode;
  onChangeSolverMode: (mode: GTOSolverMode) => void;
  decisionHistory: HandDecisionRecord[];
  lastDecisionRecord: HandDecisionRecord | null;
  cameraPreset: CameraPresetId;
  onSelectCameraPreset: (preset: CameraPresetId) => void;
  show2DHUD: boolean;
  onToggle2DHUD: () => void;
  debugOverlayEnabled: boolean;
  onToggleDebugOverlay: () => void;
}

const CAMERA_PRESETS: { id: CameraPresetId; label: string; short: string }[] = [
  { id: 'seat0_pov', label: 'Seat #0 POV', short: 'Seat #0' },
  { id: 'top_down', label: 'Top-Down Felt', short: 'Top-Down' },
  { id: 'macro_cards_chips', label: 'Macro Cards & Ring', short: 'Macro' },
  { id: 'bao_tell_closeup', label: 'Bao Phone Tell', short: 'Bao Tell' },
  { id: 'viktor_marcus_rim', label: 'Viktor & Marcus Rim', short: 'Rim Cast' },
  { id: 'dealer_pov', label: 'Dealer Shoe POV', short: 'Dealer' },
];

export const PokerHUD: React.FC<PokerHUDProps> = ({
  isTitleMode,
  onStartDesktopGame,
  table,
  players,
  humanPlayer,
  handEval,
  stats,
  drawCalls,
  musicMood,
  chatMessages,
  onSendQuickEmote,
  isXRSupported,
  isInXR,
  onEnterVR,
  onAdjustXROffset,
  onAction,
  onClearStagedBet,
  onStartNewTournament,
  onStartNextHand,
  onPeekCards,
  isPeeking,
  isPeekLocked,
  onTogglePeekLock,
  onResetView,
  gtoAnalysis,
  solverMode,
  onChangeSolverMode,
  decisionHistory,
  lastDecisionRecord,
  cameraPreset,
  onSelectCameraPreset,
  show2DHUD,
  onToggle2DHUD,
  debugOverlayEnabled,
  onToggleDebugOverlay,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [volume, setVolume] = useState(0.65);
  const [fourColorDeck, setFourColorDeck] = useState<boolean>(true);
  const [showInBB, setShowInBB] = useState<boolean>(false);

  // HUD-R4: Single active drawer mutex ('none' | 'gto' | 'settings' | 'xr')
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawerId>('none');
  const [showBanterPopover, setShowBanterPopover] = useState(false);

  const [betAmount, setBetAmount] = useState<number>(table.bigBlind * 2);
  const pendingBetSelection = useRef<number | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => {
    try {
      return localStorage.getItem('GEMINI_API_KEY') || geminiMedia.getApiKey() || '';
    } catch {
      return geminiMedia.getApiKey() || '';
    }
  });
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(() => geminiMedia.isConfigured());

  const toggleDrawer = (drawer: Exclude<ActiveDrawerId, 'none'>) => {
    setActiveDrawer((prev) => {
      return prev === drawer ? 'none' : drawer;
    });
  };

  const callAmount = Math.max(0, table.currentHighBet - humanPlayer.currentBet);
  const isFreeToCheck = callAmount === 0;
  const minAllowedBet = Math.min(
    humanPlayer.chips + humanPlayer.currentBet,
    Math.max(table.bigBlind, table.currentHighBet + table.minRaise)
  );
  const maxAllowedBet = humanPlayer.chips + humanPlayer.currentBet;
  const effectiveRaiseAmount = Math.min(maxAllowedBet, Math.max(betAmount, minAllowedBet));

  const formatChipValue = (amount: number): string => {
    if (!showInBB) return `$${amount.toLocaleString()}`;
    const bb = Math.max(1, table.bigBlind);
    const bbVal = amount / bb;
    const formatted = Number.isInteger(bbVal) ? `${bbVal}` : bbVal.toFixed(1).replace(/\.0$/, '');
    return `${formatted} BB`;
  };

  // True No-Limit Hold'em Pot-Fraction Math & Street-Aware Quick-Bet Presets
  const potAfterCall = table.pot + callAmount;
  const clampRaise = (rawTotalBet: number) =>
    Math.min(maxAllowedBet, Math.max(minAllowedBet, Math.round(rawTotalBet)));
  const calcPotFractionBet = (fraction: number) =>
    clampRaise(table.currentHighBet + fraction * potAfterCall);
  const selectBetAmount = (amount: number) => {
    if (table.stagedBet > 0) {
      // Preserve this selection when clearing the physical chips updates the table.
      pendingBetSelection.current = amount;
      onClearStagedBet();
    }
    setBetAmount(amount);
  };

  const quickBetPresets: { label: string; amount: number; hotkey?: string }[] =
    table.phase === 'preflop'
      ? table.currentHighBet <= table.bigBlind
        ? [
            { label: 'Min', amount: minAllowedBet, hotkey: '1' },
            { label: '2.2x', amount: clampRaise(table.bigBlind * 2.2), hotkey: '2' },
            { label: '2.5x', amount: clampRaise(table.bigBlind * 2.5), hotkey: '3' },
            { label: '3x', amount: clampRaise(table.bigBlind * 3), hotkey: '4' },
            { label: 'Pot', amount: calcPotFractionBet(1.0), hotkey: '5' },
            { label: 'Max', amount: maxAllowedBet },
          ]
        : [
            { label: 'Min', amount: minAllowedBet, hotkey: '1' },
            { label: '2.5x', amount: clampRaise(table.currentHighBet * 2.5), hotkey: '2' },
            { label: '3x', amount: clampRaise(table.currentHighBet * 3), hotkey: '3' },
            { label: '4x', amount: clampRaise(table.currentHighBet * 4), hotkey: '4' },
            { label: 'Pot', amount: calcPotFractionBet(1.0), hotkey: '5' },
            { label: 'Max', amount: maxAllowedBet },
          ]
      : [
          { label: 'Min', amount: minAllowedBet, hotkey: '1' },
          { label: '33%', amount: calcPotFractionBet(0.33), hotkey: '2' },
          { label: '50%', amount: calcPotFractionBet(0.5), hotkey: '3' },
          { label: '75%', amount: calcPotFractionBet(0.75), hotkey: '4' },
          { label: 'Pot', amount: calcPotFractionBet(1.0), hotkey: '5' },
          { label: 'Max', amount: maxAllowedBet },
        ];

  // Keep slider synced with table minAllowedBet or physically staged 3D chips
  useEffect(() => {
    if (table.stagedBet > 0) {
      setBetAmount(
        Math.min(maxAllowedBet, Math.max(minAllowedBet, humanPlayer.currentBet + table.stagedBet))
      );
    } else {
      setBetAmount(pendingBetSelection.current ?? minAllowedBet);
      pendingBetSelection.current = null;
    }
  }, [
    table.currentHighBet,
    table.minRaise,
    table.stagedBet,
    table.handCount,
    table.phase,
    minAllowedBet,
    maxAllowedBet,
    humanPlayer.currentBet,
  ]);

  const toggleSound = () => {
    const next = !isMuted;
    setIsMuted(next);
    pokerAudio.setMuted(next);
  };

  const toggleMusic = () => {
    const next = !musicEnabled;
    setMusicEnabled(next);
    pokerAudio.setMusicEnabled(next);
  };

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    pokerAudio.setVoiceEnabled(next);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    pokerAudio.setVolume(v);
    if (v > 0 && isMuted) {
      setIsMuted(false);
      pokerAudio.setMuted(false);
    }
  };

  const handleSaveApiKey = () => {
    geminiMedia.setApiKey(apiKeyInput.trim());
    setHasGeminiKey(geminiMedia.isConfigured());
  };

  const isPlayerTurn =
    table.activeSeat === 0 &&
    !humanPlayer.folded &&
    !humanPlayer.allIn &&
    table.phase !== 'showdown' &&
    table.phase !== 'waiting';

  const canRaise = humanPlayer.chips > callAmount;
  const handsUntilBlindUp =
    HANDS_PER_BLIND_LEVEL - (table.handCount % HANDS_PER_BLIND_LEVEL);
  const cardsVisible =
    isPeeking || isPeekLocked || table.phase === 'showdown' || !!table.isAllInRunout;

  // Desktop Grinding Keyboard Shortcuts (F = Fold, C = Check/Call, R/B = Bet/Raise, 1-5 = Sizing Presets)
  useEffect(() => {
    if (isTitleMode || isInXR || !isPlayerTurn || activeDrawer !== 'none' || showBanterPopover) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'KeyF') {
        e.preventDefault();
        onAction({ type: 'fold' });
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        onAction(isFreeToCheck ? { type: 'check' } : { type: 'call' });
      } else if (e.code === 'KeyR' || e.code === 'KeyB') {
        if (!canRaise) return;
        e.preventDefault();
        if (effectiveRaiseAmount >= maxAllowedBet) {
          onAction({ type: 'allin' });
        } else {
          onAction({ type: 'raise', amount: effectiveRaiseAmount });
        }
      } else if (
        canRaise &&
        (e.code === 'Digit1' ||
          e.code === 'Digit2' ||
          e.code === 'Digit3' ||
          e.code === 'Digit4' ||
          e.code === 'Digit5')
      ) {
        const presetIdx = Number(e.code.replace('Digit', '')) - 1;
        const preset = quickBetPresets[presetIdx];
        if (preset) {
          e.preventDefault();
          selectBetAmount(preset.amount);
          pokerAudio.playTick();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isTitleMode,
    isInXR,
    activeDrawer,
    showBanterPopover,
    isPlayerTurn,
    isFreeToCheck,
    canRaise,
    effectiveRaiseAmount,
    maxAllowedBet,
    quickBetPresets,
    table.stagedBet,
    onClearStagedBet,
    onAction,
  ]);

  // ==========================================================================
  // REDESIGNED HOME SCREEN OVERLAY (Sightline-Free Split Dock,
  // 3 Buttons Total, 0% Character Face/Torso Occlusion, Strict 3-Tone Luxury)
  // ==========================================================================
  if (isTitleMode) {
    return (
      <div
        data-ux-layer="title-screen"
        className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-7 select-none"
      >
        {/* Top Outer Edge: Minimal Hold'em Identity (Left) + Quiet Audio Toggle (Right) */}
        <div className="flex items-start justify-between gap-4 w-full pointer-events-auto">
          <div
            data-ux-panel="title-top-left"
            className="bg-[#090c12]/88 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-[#d4af37]/35 shadow-2xl flex items-center gap-3"
          >
            <div className="w-7 h-7 rounded-xl bg-[#0f141c] border border-[#d4af37]/45 flex items-center justify-center text-[#d4af37] text-sm font-black shadow-inner">
              ♠
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-xs sm:text-sm font-black tracking-[0.18em] uppercase text-[#f8fafc]">
                NO-LIMIT HOLD&apos;EM
              </span>
              <span className="text-[11px] font-mono font-semibold text-[#d4af37]">
                $1 / $2 · 5-MAX
              </span>
            </div>
          </div>

          <div data-ux-panel="title-top-right" className="flex items-center">
            <button
              data-testid="title-audio-toggle"
              onClick={toggleSound}
              className="bg-[#090c12]/88 hover:bg-[#0f141c] backdrop-blur-md px-3.5 py-2.5 rounded-2xl border border-[#d4af37]/35 text-xs font-bold text-[#f8fafc] flex items-center gap-2 transition-all shadow-2xl active:scale-95"
              title={isMuted ? 'Unmute table audio' : 'Mute table audio'}
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-4 h-4 text-[#94a3b8]" />
                  <span className="text-[#94a3b8]">Audio Muted</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-[#d4af37]" />
                  <span className="text-[#f3e5ab]">Audio On</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Center 75%+ Sightline Corridor intentionally left 100% open so the live 3D table, felt, and characters take the spotlight */}

        {/* Bottom-Center Streamlined Entry Pill */}
        <div
          data-ux-panel="title-bottom-dock"
          className="w-full max-w-xl mx-auto bg-[#090c12]/92 backdrop-blur-xl px-5 py-3.5 rounded-2xl border border-[#d4af37]/45 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 pointer-events-auto"
        >
          <div className="text-center sm:text-left">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
              PRIVATE SALON · 5-MAX SIT &amp; GO · $200 BUY-IN
            </div>
            <h1 className="font-display text-lg sm:text-xl font-extrabold tracking-wide text-[#f8fafc] mt-0.5">
              TEXAS HOLD&apos;EM
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              data-testid="title-start-desktop"
              onClick={onStartDesktopGame}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#f3e5ab] hover:brightness-110 text-[#090c12] font-black text-xs sm:text-sm tracking-wider uppercase shadow-xl transition-all active:scale-95 flex items-center gap-2"
            >
              <span>Take Your Seat</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              data-testid="title-start-vr"
              onClick={() => {
                onStartDesktopGame();
                onEnterVR();
              }}
              className="py-2.5 px-4 rounded-xl bg-[#0f141c] hover:bg-slate-900 text-[#f3e5ab] border border-[#d4af37]/45 font-bold text-xs sm:text-sm tracking-wider uppercase transition-all active:scale-95 flex items-center gap-1.5"
              title="Enter immersive WebXR / VR table view"
            >
              <Glasses className="w-4 h-4 text-[#d4af37]" />
              <span>{isXRSupported ? 'Enter VR' : 'VR Mode'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }


  // Pure 3D Canvas mode: only show a tiny floating restore pill in the top-right corner
  if (!show2DHUD) {
    return (
      <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 select-none">
        <div
          data-hud-zone="top-bar"
          className="pointer-events-auto ml-auto flex items-center gap-2 rounded-xl border border-amber-400/40 bg-slate-950/90 px-3 py-1.5 shadow-xl backdrop-blur-md"
        >
          <span className="text-[11px] font-bold text-amber-300">
            Pure 3D Mode ({CAMERA_PRESETS.find((c) => c.id === cameraPreset)?.short})
          </span>
          <button
            data-testid="hud-pure3d-toggle"
            onClick={onToggle2DHUD}
            className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-black text-amber-200 transition hover:bg-amber-500/30"
          >
            Show 2D HUD
          </button>
        </div>
      </div>
    );
  }

  const latestChat = chatMessages[chatMessages.length - 1] ?? null;
  const heroSeatPos = getSeatPosition(0, table.dealerSeat, players).position;
  const activeEquityPct =
    solverMode === 'exploit' ? gtoAnalysis.exploitEquityPct : gtoAnalysis.pureGtoEquityPct;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-2.5 select-none">
      {/* =====================================================================
          ZONE 1: TOP PERIMETER BAR (data-hud-zone="top-bar", height <= 60px)
          Contains: Blind/Hand/Pot telemetry strip + 4 Utility Trigger Buttons
          ===================================================================== */}
      <header
        data-hud-zone="top-bar"
        className="pointer-events-auto flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-slate-950/88 px-3.5 py-1.5 shadow-lg backdrop-blur-xl"
      >
        {/* Left: Brand + Street/Pot/Blinds Telemetry */}
        <div className="flex items-center gap-2.5 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="text-xs font-black tracking-wider text-amber-400 uppercase">
              VIP #{table.handCount}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-1.5 rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs">
            <span className="font-bold tracking-wider text-slate-400 uppercase">
              {table.phase}
            </span>
            <span className="text-slate-600">•</span>
            <span className="font-black text-amber-300">
              Pot {formatChipValue(table.pot)}
            </span>
            {table.currentHighBet > 0 && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-[11px] font-semibold text-emerald-300">
                  To Call {formatChipValue(callAmount)}
                </span>
              </>
            )}
          </div>

          <div
            role="button"
            tabIndex={0}
            data-testid="hud-unit-toggle"
            aria-label={`Display amounts in ${showInBB ? 'dollars' : 'big blinds'}`}
            aria-pressed={showInBB}
            onClick={() => setShowInBB((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowInBB((prev) => !prev);
              }
            }}
            title="Click to toggle stack & pot display between $ and Big Blinds (BB)"
            className="hidden cursor-pointer items-center gap-1.5 rounded-lg border border-slate-800/80 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-300 transition select-none hover:border-amber-400/50 md:flex"
          >
            <span className="font-semibold text-amber-300/90">
              Lv.{table.blindLevel} (${table.smallBlind}/${table.bigBlind})
            </span>
            <span className="text-slate-600">•</span>
            <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[10px] font-black text-amber-300">
              {showInBB ? 'BB' : '$'}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">Next in {handsUntilBlindUp}h</span>
          </div>

          {/* 5-Card 2D Community Board Strip for instant glanceability */}
          <div
            data-testid="hud-community-strip"
            role="group"
            aria-label="Community cards"
            className="hidden items-center gap-1 sm:flex"
          >
            {[0, 1, 2, 3, 4].map((slotIdx) => {
              const c = table.communityCards[slotIdx];
              if (!c) {
                return (
                  <span
                    key={slotIdx}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-800/70 bg-slate-900/40 text-[10px] font-bold text-slate-600"
                  >
                    ·
                  </span>
                );
              }
              return (
                <span
                  key={slotIdx}
                  style={getSuitCardStyle(c.suit, fourColorDeck)}
                  className="flex h-6 min-w-[26px] items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-black shadow-sm"
                >
                  {getRankLabel(c.rank)}
                  {getSuitSymbol(c.suit)}
                </span>
              );
            })}
          </div>
        </div>

        {/* Right: HUD-R2 <= 4 Utility Trigger Buttons */}
        <div
          data-hud-zone="top-bar-utilities"
          className="flex items-center gap-1.5"
        >
          {/* 1. Pure 3D Canvas Toggle */}
          <button
            data-testid="hud-pure3d-toggle"
            onClick={onToggle2DHUD}
            title="Switch to Pure 3D Canvas Mode (Hides 2D HUD and enables 3D Spatial Rim Buttons)"
            className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 py-1.5 text-xs font-bold text-slate-200 transition hover:border-amber-400/50 hover:text-amber-300"
          >
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Pure 3D</span>
          </button>

          {/* 2. GTO Coach Drawer Trigger */}
          <button
            data-testid="hud-gto-trigger"
            onClick={() => toggleDrawer('gto')}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
              activeDrawer === 'gto'
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-700/80 bg-slate-900/90 text-slate-200 hover:border-cyan-400/40'
            }`}
          >
            <Brain className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">GTO</span>
            <span className="rounded bg-cyan-500/20 px-1 py-0.2 text-[10px] font-black text-cyan-300">
              {activeEquityPct}%
            </span>
            {lastDecisionRecord && (
              <span
                className={`rounded border px-1 text-[10px] font-black ${
                  getGradeBadgeStyle(lastDecisionRecord.grade).bg
                }`}
              >
                {lastDecisionRecord.grade.toUpperCase()}
              </span>
            )}
          </button>

          {/* 3. Audio, Camera & Table Settings Drawer Trigger */}
          <button
            data-testid="hud-settings-trigger"
            onClick={() => toggleDrawer('settings')}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
              activeDrawer === 'settings'
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                : 'border-slate-700/80 bg-slate-900/90 text-slate-200 hover:border-amber-400/40'
            }`}
          >
            <Sliders className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Table &amp; Cam</span>
          </button>

        </div>
      </header>

      {/* =====================================================================
          ZONE 2: TOP-LEFT COMPACT BANTER PILL (data-hud-zone="left-utility")
          Sits cleanly in the top-left perimeter corner above Seat #1 (x <= 240px)
          ===================================================================== */}
      <div
        data-hud-zone="left-utility"
        className="pointer-events-auto fixed top-16 left-3 z-20 max-w-[190px]"
      >
        <button
          onClick={() => setShowBanterPopover((prev) => !prev)}
          className="flex w-full items-center gap-2 rounded-xl border border-slate-800/90 bg-slate-950/85 px-2.5 py-1.5 text-left text-[11px] text-slate-200 shadow-md backdrop-blur-md transition hover:border-amber-400/40"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <div className="truncate">
            {latestChat ? (
              <>
                <span className="font-bold text-amber-300">{latestChat.senderName}: </span>
                <span className="text-slate-300">{latestChat.text}</span>
              </>
            ) : (
              <span className="text-slate-400">Table Banter &amp; Emotes</span>
            )}
          </div>
        </button>

        {showBanterPopover && (
          <div
            data-hud-popover="banter"
            className="mt-1.5 w-64 rounded-2xl border border-slate-700/80 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase">
              <span>Live Table Banter</span>
              <span className="text-[10px] text-emerald-400">AI + Tells</span>
            </div>
            <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1 text-xs">
              {chatMessages.slice(-4).map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg bg-slate-900/90 px-2 py-1 text-[11px]"
                >
                  <span className="font-bold text-amber-300">{msg.senderName}: </span>
                  <span className="text-slate-200">{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1 border-t border-slate-800 pt-2">
              {QUICK_EMOTES.map((emote) => (
                <button
                  key={emote.id}
                  onClick={() => {
                    onSendQuickEmote(emote.id);
                    setShowBanterPopover(false);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-200 transition hover:border-amber-400/40 hover:bg-slate-800"
                >
                  {emote.icon} {emote.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          SINGLE MUTEX SIDE DRAWER (HUD-R4: at most 1 [data-hud-drawer] open)
          Uses fixed out-of-flow positioning so top-bar & bottom-dock shift 0px
          ===================================================================== */}
      {activeDrawer === 'gto' && (
        <GTOSolverDrawer
          isOpen={true}
          onClose={() => setActiveDrawer('none')}
          analysis={gtoAnalysis}
          solverMode={solverMode}
          onChangeSolverMode={onChangeSolverMode}
          cardsVisible={cardsVisible}
          decisionHistory={decisionHistory}
          stats={stats}
        />
      )}

      {activeDrawer === 'settings' && (
        <aside
          data-hud-drawer="settings"
          className="pointer-events-auto fixed top-16 right-3 z-30 max-h-[calc(100vh-11rem)] w-88 overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-2xl backdrop-blur-2xl"
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 font-black tracking-wider text-amber-400 uppercase">
              <Sliders className="h-4 w-4" />
              <span>Camera, Audio &amp; Table Controls</span>
            </div>
            <button
              onClick={() => setActiveDrawer('none')}
              className="rounded-lg px-2 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Pro Readability & Display Toggles (4-Color Deck & $ / BB Units) */}
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <button
              data-testid="toggle-four-color-deck"
              aria-pressed={fourColorDeck}
              onClick={() => setFourColorDeck((prev) => !prev)}
              className={`flex items-center justify-between rounded-xl border px-2.5 py-2 text-[11px] font-bold transition ${
                fourColorDeck
                  ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-800 bg-slate-900/80 text-slate-300'
              }`}
            >
              <span>4-Color Deck</span>
              <span className="rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-black">
                {fourColorDeck ? 'ON' : '2-CLR'}
              </span>
            </button>
            <button
              data-testid="toggle-bb-display"
              aria-pressed={showInBB}
              onClick={() => setShowInBB((prev) => !prev)}
              className={`flex items-center justify-between rounded-xl border px-2.5 py-2 text-[11px] font-bold transition ${
                showInBB
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : 'border-slate-800 bg-slate-900/80 text-slate-300'
              }`}
            >
              <span>Stack Display</span>
              <span className="rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-black">
                {showInBB ? 'BB' : '$ Chips'}
              </span>
            </button>
          </div>

          {/* 3D Camera Angle Presets */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase">
              <span className="flex items-center gap-1">
                <Camera className="h-3.5 w-3.5 text-amber-400" /> 3D Camera Presets
              </span>
              <button
                onClick={onResetView}
                className="flex items-center gap-1 text-[10px] text-amber-300 hover:underline"
              >
                <RotateCcw className="h-3 w-3" /> Reset Orbit
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => onSelectCameraPreset(preset.id)}
                  className={`rounded-xl border px-2.5 py-1.5 text-left text-[11px] font-semibold transition ${
                    cameraPreset === preset.id
                      ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                      : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Audio Controls */}
          <div className="mb-3 rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-slate-300">
                Master Volume ({Math.round(volume * 100)}%)
              </span>
              <span className="text-[10px] text-amber-400 uppercase">{musicMood}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="mb-2 h-1.5 w-full cursor-pointer accent-amber-400"
            />
            <div className="flex gap-1.5">
              <button
                onClick={toggleSound}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-900 py-1.5 text-[11px] font-semibold"
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>{isMuted ? 'Muted' : 'SFX On'}</span>
              </button>
              <button
                onClick={toggleMusic}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-900 py-1.5 text-[11px] font-semibold"
              >
                <Music className={`h-3.5 w-3.5 ${musicEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
                <span>Music</span>
              </button>
              <button
                onClick={toggleVoice}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-900 py-1.5 text-[11px] font-semibold"
              >
                <Mic className={`h-3.5 w-3.5 ${voiceEnabled ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>Voice</span>
              </button>
            </div>
          </div>

          {/* Session Stats & WebXR / Tournament Actions */}
          <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
              <div className="text-[10px] text-slate-400">Hands Won</div>
              <div className="text-sm font-black text-emerald-400">
                {stats.handsWon}/{stats.handsPlayed}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
              <div className="text-[10px] text-slate-400">Biggest Pot</div>
              <div className="text-sm font-black text-amber-300">
                ${stats.biggestPotWon}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
              <div className="text-[10px] text-slate-400">GTO Score</div>
              <div className="text-sm font-black text-cyan-300">
                {stats.gtoAccuracyScore}%
              </div>
            </div>
          </div>

          {/* Optional Gemini Live API Key */}
          <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-semibold text-slate-300">
                <KeyRound className="h-3 w-3 text-amber-400" /> Gemini Voice/Portrait Key
              </span>
              <span className={hasGeminiKey ? 'text-emerald-400' : 'text-slate-500'}>
                {hasGeminiKey ? 'Configured' : 'Procedural Fallback'}
              </span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIza..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
              />
              <button
                onClick={handleSaveApiKey}
                className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30"
              >
                Save
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onEnterVR}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/25"
            >
              <Glasses className="h-3.5 w-3.5" />
              <span>{isInXR ? 'XR Calibrate' : 'Enter WebXR'}</span>
            </button>
            <button
              onClick={onStartNewTournament}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/25"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reset Table</span>
            </button>
          </div>

          {isInXR && onAdjustXROffset && (
            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-2">
              <span className="text-[11px] text-slate-400">XR Seat Height/Depth</span>
              <div className="flex gap-1">
                <button
                  onClick={() => onAdjustXROffset(0, 0.05, 0)}
                  className="rounded bg-slate-800 px-2 py-1 text-[10px]"
                >
                  +Up
                </button>
                <button
                  onClick={() => onAdjustXROffset(0, -0.05, 0)}
                  className="rounded bg-slate-800 px-2 py-1 text-[10px]"
                >
                  -Down
                </button>
                <button
                  onClick={() => onAdjustXROffset(0, 0, -0.05)}
                  className="rounded bg-slate-800 px-2 py-1 text-[10px]"
                >
                  Closer
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* =====================================================================
          ZONE 4: BOTTOM PERIMETER DOCK (data-hud-zone="bottom-dock", height <= 110px)
          Single streamlined row: Hero Stack/Pos/Cards + Peek + Turn-Gated Betting
          Zero duplicate 2D chip-toss buttons (HUD-R5).
          ===================================================================== */}
      <footer
        data-hud-zone="bottom-dock"
        className="pointer-events-auto mx-auto flex w-full max-w-[920px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-slate-950/90 px-4 py-2 shadow-2xl backdrop-blur-xl sm:flex-nowrap"
      >
        {/* Left: Hero Identity, Position Badge, Stack, Hole Cards & Peek Control */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-300">
              {heroSeatPos}
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-white">YOU</span>
                <span className="text-xs font-black text-emerald-400">
                  {formatChipValue(humanPlayer.chips)}
                </span>
                {humanPlayer.currentBet > 0 && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-300">
                    In: {formatChipValue(humanPlayer.currentBet)}
                  </span>
                )}
                {table.stagedBet > 0 && (
                  <span className="rounded border border-amber-400/40 bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-black text-amber-200">
                    Ring: +{formatChipValue(table.stagedBet)}
                  </span>
                )}
              </div>
              <div className="text-[10px] font-semibold text-cyan-300">
                {handEval ? handEval.description : 'Click 3D cards or Hold Peek'}
              </div>
            </div>
          </div>

          {/* Hero Hole Card Badges (shown when peeking or at showdown) */}
          <div className="flex items-center gap-1">
            {humanPlayer.cards.map((c, idx) => (
              <div
                key={idx}
                style={cardsVisible ? getSuitCardStyle(c.suit, fourColorDeck) : undefined}
                className={`flex h-9 w-7 items-center justify-center rounded-lg border text-xs font-black shadow-inner ${
                  cardsVisible
                    ? ''
                    : 'border-amber-500/30 bg-slate-900/90 text-amber-400/70'
                }`}
              >
                {cardsVisible ? `${getRankLabel(c.rank)}${getSuitSymbol(c.suit)}` : '🂠'}
              </div>
            ))}
          </div>

          {/* Single Combined Peek / Lock-Peek Button (1 interactive control) */}
          <button
            data-testid="action-peek"
            onMouseDown={() => onPeekCards(true)}
            onMouseUp={() => onPeekCards(false)}
            onMouseLeave={() => onPeekCards(false)}
            onClick={onTogglePeekLock}
            title="Hold to peek or click to lock hole cards face-up"
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
              isPeekLocked || isPeeking
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400/40'
            }`}
          >
            {isPeekLocked ? (
              <Lock className="h-3.5 w-3.5 text-amber-400" />
            ) : isPeeking ? (
              <Eye className="h-3.5 w-3.5 text-amber-300" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span className="hidden sm:inline">
              {isPeekLocked ? 'Locked' : 'Peek'}
            </span>
          </button>
        </div>

        {/* Right: Turn-Gated Betting Controls (HUD-R5: 0 bet buttons when not Hero's turn) */}
        {isPlayerTurn ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {/* Street-Aware Quick-Bet Sizing Presets + Slider */}
            {canRaise && (
              <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 px-2 py-1">
                {quickBetPresets.map((preset) => {
                  const isActivePreset = effectiveRaiseAmount === preset.amount;
                  return (
                    <span
                      key={preset.label}
                      role="button"
                      tabIndex={0}
                      data-testid={`bet-preset-${preset.label.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
                      aria-pressed={isActivePreset}
                      aria-keyshortcuts={preset.hotkey}
                      onClick={() => selectBetAmount(preset.amount)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectBetAmount(preset.amount);
                        }
                      }}
                      title={`${preset.label} (${formatChipValue(preset.amount)})${
                        preset.hotkey ? ` [Key ${preset.hotkey}]` : ''
                      }`}
                      className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-bold transition select-none ${
                        isActivePreset
                          ? 'border border-amber-400/70 bg-amber-500/25 text-amber-200 shadow-sm'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </span>
                  );
                })}
                <input
                  type="range"
                  aria-label="Bet or raise total"
                  min={minAllowedBet}
                  max={maxAllowedBet}
                  step={1}
                  value={effectiveRaiseAmount}
                  onChange={(e) => selectBetAmount(Number(e.target.value))}
                  className="h-1.5 w-16 cursor-pointer accent-amber-400 sm:w-20"
                />
                <span className="min-w-[46px] text-right text-xs font-black text-amber-300">
                  {formatChipValue(effectiveRaiseAmount)}
                </span>
              </div>
            )}

            {/* 3 Primary Bet Execution Buttons (Fold [F], Check/Call [C], Raise/All-In [R]) */}
            <div className="flex items-center gap-1.5">
              <button
                data-testid="action-fold"
                data-hud-bet-action="fold"
                onClick={() => onAction({ type: 'fold' })}
                title="Fold hand [Shortcut: F]"
                className="flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-950/70 px-2.5 py-1.5 text-xs font-black tracking-wider text-rose-200 uppercase transition hover:bg-rose-900/80 active:scale-95"
              >
                <span>Fold</span>
                <span className="hidden rounded bg-rose-900/70 px-1 text-[9px] font-bold text-rose-300/80 sm:inline">
                  [F]
                </span>
              </button>

              <button
                data-testid="action-check-call"
                data-hud-bet-action="check-call"
                onClick={() =>
                  onAction({ type: isFreeToCheck ? 'check' : 'call' })
                }
                title={isFreeToCheck ? 'Check [Shortcut: C]' : 'Call [Shortcut: C]'}
                className="flex items-center gap-1 rounded-xl border border-emerald-400/50 bg-emerald-600/85 px-3 py-1.5 text-xs font-black tracking-wider text-white uppercase shadow-md shadow-emerald-950/50 transition hover:bg-emerald-500 active:scale-95"
              >
                <span>
                  {isFreeToCheck
                    ? 'Check'
                    : `Call ${formatChipValue(Math.min(humanPlayer.chips, callAmount))}`}
                </span>
                <span className="hidden rounded bg-emerald-900/60 px-1 text-[9px] font-bold text-emerald-100/85 sm:inline">
                  [C]
                </span>
              </button>

              {canRaise && (
                <button
                  data-testid="action-raise"
                  data-hud-bet-action="raise"
                  onClick={() => {
                    if (effectiveRaiseAmount >= maxAllowedBet) {
                      onAction({ type: 'allin' });
                    } else {
                      onAction({ type: 'raise', amount: effectiveRaiseAmount });
                    }
                  }}
                  title="Bet / Raise [Shortcut: R or B]"
                  className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-3 py-1.5 text-xs font-black tracking-wider text-slate-950 uppercase shadow-md shadow-amber-500/20 transition hover:brightness-110 active:scale-95"
                >
                  <span>
                    {effectiveRaiseAmount >= maxAllowedBet
                      ? `All-In ${formatChipValue(maxAllowedBet)}`
                      : table.currentHighBet === 0
                      ? `Bet ${formatChipValue(effectiveRaiseAmount)}`
                      : `Raise ${formatChipValue(effectiveRaiseAmount)}`}
                  </span>
                  <span className="hidden rounded bg-slate-950/20 px-1 text-[9px] font-black text-slate-900/80 sm:inline">
                    [R]
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-xs text-slate-400">
            {table.phase === 'showdown' ? (
              <div
                data-testid="showdown-dock-summary"
                className="flex items-center gap-2.5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-1"
              >
                <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
                <div className="text-xs">
                  <span className="font-black text-amber-300">
                    {table.winners.length > 0
                      ? table.winners
                          .map((w) => {
                            const p = players.find((pl) => pl.id === w.playerId);
                            const isHero = p ? p.isHuman : w.playerId === 'human' || w.playerName === 'You';
                            return isHero ? 'You Win!' : `${p?.name || w.playerName || 'Winner'} Wins!`;
                          })
                          .join(' & ')
                      : 'Showdown Complete'}
                  </span>
                  {table.winners.length > 0 && (
                    <span className="ml-2 text-slate-200">
                      +{formatChipValue(table.winners.reduce((s, w) => s + w.amount, 0))} (
                      {table.winners[0]?.handName})
                    </span>
                  )}
                </div>
                {humanPlayer.chips <= 0 ? (
                  <button
                    onClick={onStartNewTournament}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-400 to-teal-500 px-2.5 py-1 text-xs font-black text-slate-950 shadow transition hover:brightness-110"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Rebuy ($200)</span>
                  </button>
                ) : (
                  <button
                    data-testid="action-next-hand"
                    onClick={onStartNextHand}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-2.5 py-1 text-xs font-black text-slate-950 shadow transition hover:brightness-110"
                  >
                    <span>Next Hand</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : humanPlayer.folded ? (
              <span className="text-rose-300/90">
                You folded — watching live 3D table action
              </span>
            ) : humanPlayer.allIn ? (
              <span className="font-bold text-amber-300">
                All-In! Watching dramatic 3D board runout...
              </span>
            ) : (
              <span>
                Waiting for{' '}
                <strong className="text-amber-300">
                  {players[table.activeSeat]?.name ?? 'Dealer'}
                </strong>{' '}
                • Drag 3D chips to Golden Ring to pre-stage
              </span>
            )}
          </div>
        )}
      </footer>
    </div>
  );
};
