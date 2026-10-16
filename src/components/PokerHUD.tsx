import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Glasses,
  RotateCcw,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Flame,
  Trophy,
  ArrowRight,
  BarChart3,
  Sparkles,
  Hand,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MessageSquare,
  Music,
  Mic,
  Smartphone,
  KeyRound,
  Box,
  Brain,
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
} from '../types/poker';
import {
  getRankLabel,
  getSuitSymbol,
  HANDS_PER_BLIND_LEVEL,
  QUICK_EMOTES,
} from '../logic/pokerEngine';
import { getSeatPosition } from '../logic/gtoEngine';
import {
  CompactGTOPill,
  GTOSolverDrawer,
  getGradeBadgeStyle,
} from './GTOSolverDrawer';
import { pokerAudio } from '../audio/pokerAudio';
import { geminiMedia } from '../services/geminiMediaService';

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
}

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
  onAction,
  onStageChip,
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
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [volume, setVolume] = useState(0.65);
  const [showStatsDrawer, setShowStatsDrawer] = useState(false);
  const [showGTODrawer, setShowGTODrawer] = useState(false);
  const [showBanterFeed, setShowBanterFeed] = useState(true);
  const [betAmount, setBetAmount] = useState<number>(table.bigBlind * 2);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => {
    try {
      return localStorage.getItem('GEMINI_API_KEY') || '';
    } catch {
      return '';
    }
  });
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(() => geminiMedia.isConfigured());

  const callAmount = Math.max(0, table.currentHighBet - humanPlayer.currentBet);
  const isFreeToCheck = callAmount === 0;
  const minAllowedBet = Math.min(
    humanPlayer.chips + humanPlayer.currentBet,
    Math.max(table.bigBlind, table.currentHighBet + table.minRaise)
  );
  const maxAllowedBet = humanPlayer.chips + humanPlayer.currentBet;

  // Keep slider synced with table minAllowedBet or physically staged chips
  useEffect(() => {
    if (table.stagedBet > 0) {
      setBetAmount(
        Math.min(maxAllowedBet, Math.max(minAllowedBet, humanPlayer.currentBet + table.stagedBet))
      );
    } else {
      setBetAmount(minAllowedBet);
    }
  }, [
    table.currentHighBet,
    table.minRaise,
    table.stagedBet,
    table.handCount,
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
    if (geminiMedia.isConfigured()) {
      pokerAudio.setMusicMood(musicMood);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setBetAmount(val);
    pokerAudio.playTick();
  };

  const cardsVisible =
    isPeeking || isPeekLocked || table.phase === 'showdown' || !!table.isAllInRunout;
  const handsUntilBlindUp =
    HANDS_PER_BLIND_LEVEL - ((Math.max(1, table.handCount) - 1) % HANDS_PER_BLIND_LEVEL);
  const alivePlayersCount = players.filter((p) => !p.eliminated).length;
  const isTournamentOver = !!table.tournamentWinnerId || humanPlayer.eliminated;

  const getTellBadge = (p: PlayerState) => {
    if (p.eliminated || p.folded) return null;
    if (p.activeTell === 'phone_down_monster') {
      return {
        label: '🔥 Phone Down!',
        className: 'bg-amber-500/30 text-amber-200 border-amber-400 animate-pulse',
        title: 'Tell Alert: Bao locked his phone and placed it flat on the mahogany rail!',
      };
    }
    if (p.persona === 'heavy_phone' && p.isWatchingPhone) {
      return {
        label: '📱 Scrolling',
        className: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50',
        title: 'Bao is hunched over his glowing smartphone scrolling short videos',
      };
    }
    if (p.activeTell === 'watch_glance_strong') {
      return {
        label: '⌚ Checks Watch',
        className: 'bg-blue-500/20 text-blue-200 border-blue-400/40',
        title: 'Viktor glanced at his gold wristwatch',
      };
    }
    if (p.activeTell === 'chip_fidget_bluff') {
      return {
        label: '🎲 Chip Fidget',
        className: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
        title: 'Marcus is restlessly fidgeting with his chip stack',
      };
    }
    if (p.activeTell === 'posture_tight') {
      return {
        label: '✨ Poised',
        className: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
        title: 'Elena is sitting upright and poised',
      };
    }
    return null;
  };

  const [showVisionProModal, setShowVisionProModal] = useState(false);
  const [pinchCalibrationHits, setPinchCalibrationHits] = useState<number[]>([0, 0, 0]);
  const [lastPinchTarget, setLastPinchTarget] = useState<string>('Tap or Eye-Pinch a calibration ring below');

  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false;
  const hasWebXRAPI = typeof navigator !== 'undefined' && 'xr' in navigator;

  const handleCalibrationPinch = (idx: number, label: string) => {
    pokerAudio.playChipClink(2);
    setPinchCalibrationHits((prev) => prev.map((c, i) => (i === idx ? c + 1 : c)));
    setLastPinchTarget(`Verified Gaze+Pinch on ${label} (${new Date().toLocaleTimeString()})`);
  };

  const renderVisionProModal = () => {
    if (!showVisionProModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md pointer-events-auto">
        <div className="glass-panel max-w-xl w-full p-6 rounded-3xl border border-amber-400/50 shadow-2xl text-left">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Glasses className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-black tracking-wide text-white uppercase">
                Apple Vision Pro (visionOS) Test & Calibration Suite
              </h3>
            </div>
            <button
              onClick={() => setShowVisionProModal(false)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-xs">
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">HTTPS Context</div>
              <div className={`font-mono font-bold mt-0.5 ${isSecure ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isSecure ? '✓ Secure' : '⚠ HTTP Local'}
              </div>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">navigator.xr</div>
              <div className={`font-mono font-bold mt-0.5 ${hasWebXRAPI ? 'text-emerald-400' : 'text-amber-400'}`}>
                {hasWebXRAPI ? '✓ Present' : '✗ Disabled'}
              </div>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">immersive-vr</div>
              <div className={`font-mono font-bold mt-0.5 ${isXRSupported ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isXRSupported ? '✓ Ready' : 'Enable Flag'}
              </div>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Stereo Draw Calls</div>
              <div className="font-mono font-bold text-blue-400 mt-0.5">{drawCalls} / 35 max</div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 mb-4 text-xs text-slate-300 space-y-1.5">
            <div className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
              Real Apple Vision Pro Setup (visionOS Safari):
            </div>
            <div>
              1. Open <strong>Settings → Apps → Safari → Advanced → Feature Flags</strong> on Vision Pro.
            </div>
            <div>
              2. Enable <strong>WebXR Device API</strong>, <strong>WebXR Hand Input Module</strong>, and <strong>WebXR VRModule</strong>.
            </div>
            <div>
              3. Look at any chip stack, hole card, or spatial button and <strong>pinch thumb + index finger</strong> (`transient-pointer`) or reach out with direct 25-joint optical hand tracking.
            </div>
          </div>

          <div className="bg-slate-900/90 border border-amber-400/30 rounded-2xl p-3.5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Interactive Eye-Gaze + Pinch Calibration Targets
              </span>
              <span className="text-[11px] font-mono text-emerald-400">{lastPinchTarget}</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {['Left Rail ($25)', 'Center Pot', 'Right Rail (Peek)'].map((label, idx) => (
                <button
                  key={label}
                  onClick={() => handleCalibrationPinch(idx, label)}
                  className="py-3 px-2 rounded-xl bg-slate-950 hover:bg-amber-500/20 active:scale-95 border border-amber-400/40 flex flex-col items-center justify-center gap-1 transition-all"
                >
                  <span className="w-6 h-6 rounded-full border-2 border-amber-400 flex items-center justify-center text-[11px] font-mono font-bold text-amber-300">
                    {pinchCalibrationHits[idx]}
                  </span>
                  <span className="text-[11px] font-bold text-white">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <a
              rel="ar"
              href="/models/vip_poker_table.usdz"
              className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 text-center"
            >
              <img src="/models/vip_poker_table.usdz" alt="" className="hidden" />
              <span>📦 Open 1:1 Table in visionOS AR QuickLook (.USDZ)</span>
            </a>
            <a
              href="/models/vision_pro_ergonomics_report.json"
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center"
            >
              <span>Blender 5.2 Ergonomics JSON</span>
            </a>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // 1. CINEMATIC TITLE & ENTRY SCREEN OVERLAY
  // ==========================================================================
  if (isTitleMode) {
    return (
      <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 bg-gradient-to-b from-slate-950/80 via-slate-950/35 to-slate-950/90 pointer-events-auto">
        {renderVisionProModal()}
        {/* Top Header */}
        <div className="flex items-center justify-between max-w-6xl w-full mx-auto">
          <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-2.5 border-amber-400/30">
            <span className="text-xl">♠️</span>
            <span className="text-xs font-extrabold tracking-widest uppercase text-amber-300">
              Monte Carlo Private VIP Suite • Nano Banana + Gemini 3.8 TTS + Lyria 3
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVisionProModal(true)}
              className="glass-panel px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-bold text-amber-300 border border-amber-400/40 hover:bg-amber-500/15 transition-all"
            >
              <Glasses className="w-4 h-4 text-amber-300" />
              <span>Vision Pro Test & .USDZ</span>
            </button>

            <button
              onClick={toggleSound}
              className="glass-panel px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-bold text-slate-200 hover:border-amber-400/50 transition-all"
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-4 h-4 text-red-400" />
                  <span>Audio Muted</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span>Spatial Audio & Voice On</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Center Hero Card */}
        <div className="my-auto max-w-2xl w-full mx-auto glass-panel p-7 sm:p-8 rounded-3xl border border-amber-400/40 shadow-2xl text-center backdrop-blur-xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-widest mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>5-Max Sit & Go Championship • $1,000 Prize Pool</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight gold-gradient-text mb-2.5">
            REALISTIC VR POKER CASINO
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto mb-5 leading-relaxed">
            Step into the private mahogany & emerald velvet suite. Read live physical tells across
            four articulated AI sharks—including <strong>Bao</strong> scrolling his glowing phone
            until he hits a monster hand—backed by Gemini 3.8 TTS banter and Lyria lounge jazz.
          </p>

          {/* Cast Preview Strip (Nano Banana Portraits) */}
          <div className="grid grid-cols-4 gap-2.5 max-w-xl mx-auto mb-6">
            {players
              .filter((p) => !p.isHuman)
              .map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl p-2 flex flex-col items-center text-center"
                >
                  <img
                    src={p.avatarUrl}
                    alt={p.name}
                    className="w-11 h-11 rounded-full object-cover border-2 mb-1"
                    style={{ borderColor: p.color }}
                  />
                  <div className="text-[11px] font-bold text-white truncate w-full">
                    {p.name.split(' ')[0]}
                  </div>
                  <div className="text-[9px] text-slate-400 truncate w-full">
                    {p.persona === 'heavy_phone'
                      ? '📱 Phone Watcher'
                      : p.persona === 'general_man'
                      ? '⌚ Tailored Shark'
                      : p.persona === 'woman'
                      ? '🥂 Poised Rock'
                      : '🕶️ Flashy Maniac'}
                  </div>
                </div>
              ))}
          </div>

          {/* Primary Launch Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onStartDesktopGame}
              className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-base tracking-wide shadow-xl transition-all active:scale-98 flex items-center justify-center gap-2"
            >
              <span>Play in 3D Desktop Mode</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                onStartDesktopGame();
                onEnterVR();
              }}
              className={`flex-1 py-3.5 px-6 rounded-2xl font-black text-base tracking-wide transition-all flex items-center justify-center gap-2.5 border ${
                isXRSupported
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-400/50 shadow-lg'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-amber-200 border-amber-400/30'
              }`}
            >
              <Glasses className="w-5 h-5 text-amber-300" />
              <span>{isXRSupported ? 'Enter WebXR Casino' : 'Launch WebXR / VR Mode'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Tactile Gesture Guide */}
        <div className="max-w-4xl w-full mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="glass-panel px-3.5 py-2.5 rounded-xl flex items-center gap-2.5">
            <Hand className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="font-bold text-white">Pinch / Drag Chips</div>
              <div className="text-[11px] text-slate-400">Drop into gold ring to bet</div>
            </div>
          </div>
          <div className="glass-panel px-3.5 py-2.5 rounded-xl flex items-center gap-2.5">
            <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="font-bold text-white">Spot Live AI Tells</div>
              <div className="text-[11px] text-slate-400">Watch when Bao puts phone down</div>
            </div>
          </div>
          <div className="glass-panel px-3.5 py-2.5 rounded-xl flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <div className="font-bold text-white">Table Talk & Banter</div>
              <div className="text-[11px] text-slate-400">Call out AI players with emotes</div>
            </div>
          </div>
          <div className="glass-panel px-3.5 py-2.5 rounded-xl flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold text-white">Double-Tap Felt</div>
              <div className="text-[11px] text-slate-400">Knock table to Check</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // 2. IN-GAME HUD OVERLAY (Synchronized with 3D Spatial Dock)
  // ==========================================================================
  const now = Date.now();

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4 z-10 overflow-hidden">
      {/* 1. TOP BAR: Tournament Level, Pot + Side Pots, and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        <div className="glass-panel px-3.5 py-2 rounded-xl flex items-center gap-3">
          <span className="text-xl">♠️</span>
          <div>
            <div className="font-extrabold text-xs sm:text-sm gold-gradient-text tracking-wide flex items-center gap-2">
              <span>VIP SIT & GO • LVL {table.blindLevel}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                {alivePlayersCount}/5 Left
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  musicMood === 'high_stakes'
                    ? 'bg-rose-500/25 text-rose-300 border border-rose-400/40 animate-pulse'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                }`}
              >
                {musicMood === 'high_stakes' ? '🔥 High-Stakes Pulse' : '🎷 Lounge Jazz'}
              </span>
            </div>
            <div className="text-[11px] text-slate-300 font-mono">
              Blinds: <strong className="text-amber-300">${table.smallBlind}/${table.bigBlind}</strong> • Hand #{table.handCount} • Next lvl in {handsUntilBlindUp}h
            </div>
          </div>
        </div>

        {/* Center Main Pot + Side Pots Display */}
        <div className="glass-panel px-6 py-1.5 rounded-2xl flex flex-col items-center border-amber-400/40">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest text-amber-200/80 uppercase">
              {table.isAllInRunout ? '🔥 ALL-IN RUNOUT' : `TOTAL POT • ${table.phase.toUpperCase()}`}
            </span>
          </div>
          <span className="text-2xl sm:text-3xl font-extrabold text-amber-300 font-mono tracking-tight">
            ${table.pot + table.stagedBet}
          </span>
          {table.sidePots.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {table.sidePots.map((sp, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/90 border border-amber-400/30 text-amber-200 font-mono"
                >
                  {sp.label}: ${sp.amount}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right Quick Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowBanterFeed((prev) => !prev)}
            className={`glass-panel p-2.5 rounded-xl transition-colors ${
              showBanterFeed
                ? 'border-amber-400/50 text-amber-300 bg-amber-500/15'
                : 'text-slate-300 hover:border-amber-400/50'
            }`}
            title="Toggle Live Table-Talk & Croupier Feed"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          <button
            onClick={toggleMusic}
            className={`glass-panel p-2.5 rounded-xl transition-colors ${
              musicEnabled && !isMuted
                ? 'text-emerald-400 hover:border-amber-400/50'
                : 'text-slate-500 hover:border-amber-400/50'
            }`}
            title="Toggle Lounge Jazz / High-Stakes Soundtrack"
          >
            <Music className="w-4 h-4" />
          </button>

          <button
            onClick={toggleVoice}
            className={`glass-panel p-2.5 rounded-xl transition-colors ${
              voiceEnabled && !isMuted
                ? 'text-amber-300 hover:border-amber-400/50'
                : 'text-slate-500 hover:border-amber-400/50'
            }`}
            title="Toggle Gemini 3.8 TTS & Croupier Voice"
          >
            <Mic className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowGTODrawer((prev) => !prev)}
            className={`glass-panel px-2.5 py-2 rounded-xl flex items-center gap-1.5 font-bold text-xs transition-all border ${
              showGTODrawer
                ? 'border-cyan-400 text-cyan-200 bg-cyan-500/25 shadow-lg'
                : 'border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/15'
            }`}
            title="Open GTO Solver, 13x13 Hand Range Matrix & EV Decision Grader"
          >
            <Brain className="w-4 h-4 text-cyan-400" />
            <span>GTO {stats.gtoAccuracyScore}%</span>
          </button>

          <button
            onClick={() => setShowStatsDrawer((prev) => !prev)}
            className={`glass-panel p-2.5 rounded-xl transition-colors ${
              showStatsDrawer
                ? 'border-amber-400 text-amber-300 bg-amber-500/20'
                : 'text-slate-200 hover:border-amber-400/50'
            }`}
            title="Tournament Telemetry & Gemini API Key Settings"
          >
            <BarChart3 className="w-4 h-4" />
          </button>

          <button
            onClick={toggleSound}
            className="glass-panel p-2.5 rounded-xl hover:border-amber-400/50 transition-colors text-slate-200"
            title="Mute / Unmute All Audio"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          <button
            onClick={onResetView}
            className="glass-panel p-2.5 rounded-xl hover:border-amber-400/50 transition-colors text-slate-200"
            title="Reset Camera to Seat #0"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowVisionProModal(true)}
            className="glass-panel px-2.5 py-2 rounded-xl flex items-center gap-1.5 font-bold text-xs text-emerald-300 border-emerald-400/40 hover:bg-emerald-500/20 transition-all"
            title="Apple Vision Pro (visionOS) Test & Blender .USDZ AR QuickLook"
          >
            <Box className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">Vision Pro / .USDZ</span>
          </button>

          <button
            onClick={onEnterVR}
            className={`glass-panel px-3 py-2 rounded-xl flex items-center gap-1.5 font-bold text-xs tracking-wide transition-all ${
              isXRSupported
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 hover:bg-amber-500/30'
                : 'text-slate-300 border-slate-700 hover:border-amber-400/40'
            }`}
          >
            <Glasses className="w-4 h-4 text-amber-300" />
            <span className="hidden sm:inline">
              {isInXR ? 'Exit XR' : isXRSupported ? 'Enter WebXR' : 'WebXR'}
            </span>
          </button>
        </div>
      </div>

      {/* 2. AI RIVAL STATUS BAR WITH NANO BANANA PORTRAITS, VILLAIN HUD (VPIP/PFR/AF), PHYSICAL TELLS & SPEECH BUBBLES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-5xl mx-auto pointer-events-auto">
        {players
          .filter((p) => !p.isHuman)
          .map((p) => {
            const tellBadge = getTellBadge(p);
            const seatPos = getSeatPosition(p.seatIndex, table.dealerSeat, players);
            const hasLiveSpeech =
              p.activeChatBubble && p.activeChatTimestamp && now - p.activeChatTimestamp < 6500;

            return (
              <div
                key={p.id}
                className={`relative glass-panel px-2.5 py-2 rounded-xl transition-all border ${
                  p.eliminated
                    ? 'opacity-35 border-slate-800 bg-slate-950/40'
                    : p.isTurn
                    ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-950/40'
                    : p.folded
                    ? 'opacity-50 border-slate-800'
                    : 'border-slate-800/90'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {p.avatarUrl && (
                    <img
                      src={p.avatarUrl}
                      alt={p.name}
                      className="w-8 h-8 rounded-full object-cover border shrink-0"
                      style={{ borderColor: p.color }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className="font-bold truncate flex items-center gap-1"
                        style={{ color: p.color }}
                      >
                        {p.name.split(' ')[0]}
                        {!p.eliminated && (
                          <span
                            className="px-1 py-0.2 rounded bg-slate-900 border border-slate-700 text-[9px] font-mono text-slate-300"
                            title={seatPos.description}
                          >
                            {seatPos.position}
                          </span>
                        )}
                        {table.dealerSeat === p.seatIndex && !p.eliminated && (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black">
                            D
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-900 font-mono text-amber-300 font-bold">
                        {p.eliminated ? `OUT #${p.finishPlace}` : `$${p.chips}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-300 mt-0.5">
                      <span className="truncate">
                        {p.eliminated
                          ? 'Eliminated'
                          : p.folded
                          ? 'Folded'
                          : p.allIn
                          ? '🔥 ALL-IN'
                          : p.lastAction || 'Ready'}
                      </span>
                      {p.currentBet > 0 && !p.eliminated && (
                        <span className="font-mono text-emerald-400 font-bold">
                          ${p.currentBet}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pro Villain HUD Strip (VPIP / PFR / AF) + Live Physical Tell Pill */}
                <div className="flex flex-wrap items-center justify-between gap-1 mt-1">
                  {p.hudStats && !p.eliminated && (
                    <div
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-800 text-slate-300 flex items-center gap-1"
                      title={`Villain HUD Telemetry — VPIP: ${p.hudStats.vpipPct}% (Voluntarily Put $ In Pot) • PFR: ${p.hudStats.pfrPct}% (Preflop Raise) • AF: ${p.hudStats.aggressionFactor.toFixed(1)} (Postflop Aggression Factor)`}
                    >
                      <span>
                        VPIP <strong className="text-cyan-300">{p.hudStats.vpipPct}%</strong>
                      </span>
                      <span className="text-slate-600">•</span>
                      <span>
                        PFR <strong className="text-amber-300">{p.hudStats.pfrPct}%</strong>
                      </span>
                      <span className="text-slate-600">•</span>
                      <span>
                        AF{' '}
                        <strong className="text-rose-300">
                          {p.hudStats.aggressionFactor.toFixed(1)}
                        </strong>
                      </span>
                    </div>
                  )}

                  {tellBadge && (
                    <div
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${tellBadge.className}`}
                      title={tellBadge.title}
                    >
                      <span>{tellBadge.label}</span>
                    </div>
                  )}
                </div>

                {/* Floating Speech Bubble when AI talks */}
                {hasLiveSpeech && (
                  <div className="mt-1 px-2 py-1 rounded-lg bg-slate-950/95 border border-amber-400/50 text-[10px] text-amber-100 italic leading-snug shadow-lg">
                    "{p.activeChatBubble}"
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* 3. STATS, AUDIO & GEMINI API KEY DRAWER MODAL */}
      {showStatsDrawer && (
        <div className="self-end glass-panel p-4 rounded-2xl w-80 pointer-events-auto border-amber-400/40 shadow-2xl">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
              VIP Telemetry & AI Media Settings
            </span>
            <button
              onClick={() => setShowStatsDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Hands Played</div>
              <div className="text-sm font-mono font-bold text-white">{stats.handsPlayed}</div>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Win Rate</div>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {stats.handsPlayed > 0
                  ? `${Math.round((stats.handsWon / stats.handsPlayed) * 100)}%`
                  : '0%'}
              </div>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">GTO Accuracy</div>
              <div className="text-sm font-mono font-bold text-cyan-300">
                {stats.gtoAccuracyScore}% ({stats.gtoOptimalCount}/{stats.gtoDecisionsTotal})
              </div>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">EV Loss / Draw Calls</div>
              <div className="text-sm font-mono font-bold text-amber-300">
                -{stats.gtoCumulativeEvLossBB.toFixed(1)} BB • {drawCalls}dc
              </div>
            </div>
          </div>

          {/* Audio Volume Slider */}
          <div className="mb-3 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <div className="flex justify-between text-[11px] text-slate-300 mb-1">
              <span>Master Lounge Volume</span>
              <span className="font-mono">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>

          {/* Gemini 3.8 Flash TTS & Lyria 3 API Key Config */}
          <div className="mb-3 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-300 mb-1">
              <span className="flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Gemini TTS & Lyria 3 Key</span>
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  hasGeminiKey
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {hasGeminiKey ? 'Live API Active' : 'WebSpeech + Synth Fallback'}
              </span>
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <input
                type="password"
                placeholder="Paste Gemini API Key..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              <button
                onClick={handleSaveApiKey}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                Save
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              setShowStatsDrawer(false);
              onStartNewTournament();
            }}
            className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Restart 5-Max Sit & Go ($200)</span>
          </button>
        </div>
      )}

      {/* 4. SHOWDOWN / TOURNAMENT CHAMPION BANNER + STREET-BY-STREET GTO AUDIT */}
      {table.phase === 'showdown' && table.winners.length > 0 && (
        <div className="self-center glass-panel p-5 rounded-2xl max-w-lg w-full text-center pointer-events-auto border-amber-400/60 shadow-2xl">
          <Trophy className="w-8 h-8 text-amber-400 mx-auto mb-1 animate-pulse" />
          {isTournamentOver ? (
            <>
              <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300 mb-1">
                Sit & Go Championship Complete
              </div>
              <h2 className="text-2xl font-black gold-gradient-text mb-1">
                {table.tournamentWinnerId === humanPlayer.id
                  ? '🏆 YOU WON THE $1,000 VIP TOURNAMENT!'
                  : `Eliminated in #${humanPlayer.finishPlace || alivePlayersCount} Place`}
              </h2>
              <p className="text-xs text-slate-300 mb-3">
                {table.winners.map((w) => `${w.playerName} (+$${w.amount})`).join(' • ')} —{' '}
                {table.winners[0].handName}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-black gold-gradient-text">
                {table.winners.map((w) => w.playerName).join(' & ')} Wins!
              </h2>
              <div className="text-xs text-amber-200/90 font-medium my-1">
                {table.winners
                  .map(
                    (w) => `${w.potLabel ? `[${w.potLabel}] ` : ''}${w.handName} (+$${w.amount})`
                  )
                  .join(' • ')}
              </div>
              <div className="text-2xl font-extrabold text-emerald-400 font-mono mb-2">
                +${table.winners.reduce((acc, w) => acc + w.amount, 0)}
              </div>
            </>
          )}

          {/* Street-by-Street Hand GTO Audit Strip */}
          {decisionHistory.some((d) => d.handNumber === table.handCount) && (
            <div className="bg-slate-950/90 border border-cyan-500/30 rounded-xl p-2.5 mb-3 text-left">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-cyan-300 mb-1.5">
                <span className="flex items-center gap-1">
                  <Brain className="w-3.5 h-3.5" />
                  <span>Hand #{table.handCount} Solver Audit</span>
                </span>
                <button
                  onClick={() => setShowGTODrawer(true)}
                  className="text-amber-300 hover:underline font-mono"
                >
                  Inspect 13×13 Grid →
                </button>
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {decisionHistory
                  .filter((d) => d.handNumber === table.handCount)
                  .map((rec) => {
                    const badge = getGradeBadgeStyle(rec.grade);
                    return (
                      <div
                        key={rec.id}
                        className="flex items-center justify-between gap-2 text-[11px] bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-800"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                          <span className="font-mono uppercase text-[10px] text-slate-400 shrink-0">
                            {rec.phase}:
                          </span>
                          <span className="text-white font-semibold truncate">
                            {rec.chosenActionLabel}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          {rec.evLossBB > 0 ? (
                            <span className="text-rose-300">-{rec.evLossBB.toFixed(2)} BB</span>
                          ) : (
                            <span className="text-emerald-300">0.00 BB loss</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {isTournamentOver ? (
            <button
              onClick={onStartNewTournament}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Enter New VIP Sit & Go ($200 Stack)</span>
            </button>
          ) : (
            <button
              onClick={onStartNextHand}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
            >
              <span>Deal Next Hand</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* 5. BOTTOM PLAYER DOCK: Live GTO Advisor Pill, Quick-Emote Table Talk, Hole Cards, Staged Ring Chips, and Betting Controls */}
      <div className="flex flex-col gap-2 max-w-2xl w-full mx-auto pointer-events-auto">
        {/* Live GTO & Node-Locked Exploitative Advisor Pill */}
        <CompactGTOPill
          analysis={gtoAnalysis}
          solverMode={solverMode}
          onChangeSolverMode={onChangeSolverMode}
          cardsVisible={cardsVisible}
          isHumanTurn={humanPlayer.isTurn}
          table={table}
          humanPlayer={humanPlayer}
          lastDecisionRecord={lastDecisionRecord}
          onSelectSizing={(amount) => {
            setBetAmount(Math.min(maxAllowedBet, Math.max(minAllowedBet, amount)));
            pokerAudio.playTick();
          }}
          onExecuteAction={onAction}
          onOpenFullDrawer={() => setShowGTODrawer(true)}
        />

        {/* Compact Live Table-Talk & Croupier Feed + Interactive Quick-Emote Bar */}
        {showBanterFeed && (
          <div className="glass-panel px-3 py-2 rounded-xl border border-slate-800/90 flex flex-col gap-1.5">
            {/* Last 2 Table-Talk / Dealer Callout Messages */}
            <div className="flex flex-col gap-0.5 max-h-11 overflow-y-auto text-[11px]">
              {chatMessages.slice(-2).map((msg) => (
                <div key={msg.id} className="truncate">
                  <span className="font-bold mr-1.5" style={{ color: msg.senderColor }}>
                    {msg.isDealer ? '🎙️ ' : '💬 '}
                    {msg.senderName}:
                  </span>
                  <span className="text-slate-200">{msg.text}</span>
                </div>
              ))}
            </div>

            {/* Interactive Quick-Emote / Table-Talk Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-800/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90 shrink-0 mr-1">
                Table Talk:
              </span>
              {QUICK_EMOTES.map((emote) => (
                <button
                  key={emote.id}
                  onClick={() => onSendQuickEmote(emote.id)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/50 text-[11px] font-semibold text-slate-200 flex items-center gap-1 shrink-0 transition-all active:scale-95"
                  title={emote.text}
                >
                  <span>{emote.icon}</span>
                  <span>{emote.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Staged Physical Chips Banner (When chips are dragged/clicked into the Betting Ring) */}
        {table.stagedBet > 0 && humanPlayer.isTurn && !humanPlayer.folded && (
          <div className="glass-panel px-4 py-2 rounded-xl border border-emerald-400/60 bg-emerald-950/60 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-emerald-200">
                Staged in Betting Ring:{' '}
                <strong className="font-mono text-emerald-300 text-sm">+${table.stagedBet}</strong>{' '}
                (Total Bet: ${humanPlayer.currentBet + table.stagedBet})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClearStagedBet}
                className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-xs font-bold text-slate-300 flex items-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span>Clear Ring</span>
              </button>
              <button
                onClick={() => {
                  const targetTotal = humanPlayer.currentBet + table.stagedBet;
                  if (targetTotal <= table.currentHighBet) {
                    onAction(isFreeToCheck ? { type: 'check' } : { type: 'call' });
                  } else if (table.stagedBet >= humanPlayer.chips) {
                    onAction({ type: 'allin' });
                  } else {
                    onAction({
                      type: 'raise',
                      amount: Math.max(minAllowedBet, targetTotal),
                    });
                  }
                }}
                className="px-3.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1 shadow-md"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Bet</span>
              </button>
            </div>
          </div>
        )}

        {/* Human Status Bar, Hole Card Preview & Peeking Controls */}
        <div className="glass-panel px-4 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 border-slate-800">
          <div className="flex items-center gap-3">
            {/* Live Hole Cards Badges (Hidden when facedown unless peeking or locked) */}
            <div className="flex items-center gap-1.5">
              {humanPlayer.cards.map((c) => {
                const isRed = c.suit === 'hearts' || c.suit === 'diamonds';
                return cardsVisible ? (
                  <div
                    key={c.id}
                    className={`w-9 h-12 rounded-lg bg-white border-2 border-amber-300 shadow-md flex flex-col items-center justify-center font-black leading-none ${
                      isRed ? 'text-red-600' : 'text-slate-900'
                    }`}
                  >
                    <span className="text-xs">{getRankLabel(c.rank)}</span>
                    <span className="text-sm">{getSuitSymbol(c.suit)}</span>
                  </div>
                ) : (
                  <div
                    key={c.id}
                    className="w-9 h-12 rounded-lg bg-gradient-to-br from-rose-950 to-slate-900 border border-amber-400/50 shadow-md flex items-center justify-center text-amber-400 text-xs font-bold"
                    title="Facedown Hole Card — Hold Peek or Drag Card Corner"
                  >
                    ♠
                  </div>
                );
              })}
            </div>

            <div>
              <div className="text-[11px] font-bold text-blue-400 flex items-center gap-1.5">
                <span>SEAT #0 • YOU</span>
                {table.dealerSeat === 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                    DEALER
                  </span>
                )}
              </div>
              <div className="text-xs sm:text-sm font-extrabold text-white">
                {humanPlayer.folded
                  ? 'Folded (In Muck)'
                  : cardsVisible && handEval
                  ? handEval.description
                  : 'Cards Facedown (Pinch / Hold Space to Peek)'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Physical Chip Ring Taps ($1, $5, $25, $100) */}
            {humanPlayer.isTurn && !humanPlayer.folded && table.phase !== 'showdown' && (
              <div className="hidden sm:flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold mr-1">Toss Chip:</span>
                {([1, 5, 25, 100] as ChipDenomination[]).map((denom) => (
                  <button
                    key={denom}
                    disabled={humanPlayer.chips - table.stagedBet < denom}
                    onClick={() => onStageChip(denom)}
                    className={`w-7 h-7 rounded-full font-mono text-[10px] font-black border transition-transform active:scale-90 disabled:opacity-30 ${
                      denom === 1
                        ? 'bg-slate-100 text-slate-900 border-blue-400'
                        : denom === 5
                        ? 'bg-red-600 text-white border-white'
                        : denom === 25
                        ? 'bg-emerald-600 text-white border-amber-300'
                        : 'bg-slate-900 text-amber-300 border-amber-400'
                    }`}
                    title={`Toss $${denom} chip into the betting ring`}
                  >
                    ${denom}
                  </button>
                ))}
              </div>
            )}

            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Stack
              </div>
              <div className="text-base sm:text-lg font-mono font-black text-amber-300">
                ${Math.max(0, humanPlayer.chips - table.stagedBet)}
              </div>
            </div>

            {/* Hold to Peek + Lock Peek Toggle */}
            {!humanPlayer.folded && humanPlayer.cards.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onMouseDown={() => onPeekCards(true)}
                  onMouseUp={() => onPeekCards(false)}
                  onMouseLeave={() => isPeeking && onPeekCards(false)}
                  onTouchStart={() => onPeekCards(true)}
                  onTouchEnd={() => onPeekCards(false)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                    isPeeking
                      ? 'bg-amber-400 text-slate-950 border-amber-300 scale-95'
                      : 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-amber-500/30'
                  }`}
                  title="Hold to peel card corners up (or hold Spacebar)"
                >
                  {isPeeking ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>Peek</span>
                </button>

                <button
                  onClick={onTogglePeekLock}
                  className={`p-2 rounded-xl text-xs font-bold border transition-all ${
                    isPeekLocked
                      ? 'bg-amber-500/25 text-amber-300 border-amber-400/60'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title={isPeekLocked ? 'Cards Locked Face-Up' : 'Lock Peek (Keep Cards Revealed)'}
                >
                  {isPeekLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls (Visible when it is Human's Turn) */}
        {humanPlayer.isTurn && !humanPlayer.folded && table.phase !== 'showdown' && (
          <div className="glass-panel p-2.5 rounded-2xl flex flex-col gap-2 border-amber-400/50 shadow-2xl">
            {/* Raise Slider & Presets */}
            {humanPlayer.chips > callAmount && (
              <div className="flex items-center gap-3 bg-slate-900/70 px-3 py-1.5 rounded-xl">
                <span className="text-xs font-bold text-amber-300 font-mono min-w-24">
                  Raise To: ${Math.max(betAmount, minAllowedBet)}
                </span>
                <input
                  type="range"
                  min={minAllowedBet}
                  max={maxAllowedBet}
                  step={1}
                  value={Math.max(betAmount, minAllowedBet)}
                  onChange={handleSliderChange}
                  className="flex-1 accent-amber-400 cursor-pointer"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setBetAmount(minAllowedBet)}
                    className="px-2 py-1 bg-slate-800 text-[11px] font-bold rounded hover:bg-slate-700 text-slate-200"
                  >
                    Min
                  </button>
                  <button
                    onClick={() =>
                      setBetAmount(
                        Math.min(
                          maxAllowedBet,
                          Math.max(minAllowedBet, table.currentHighBet + table.pot)
                        )
                      )
                    }
                    className="px-2 py-1 bg-slate-800 text-[11px] font-bold rounded hover:bg-slate-700 text-slate-200"
                  >
                    Pot
                  </button>
                  <button
                    onClick={() => setBetAmount(maxAllowedBet)}
                    className="px-2 py-1 bg-red-900/40 text-red-300 text-[11px] font-bold rounded hover:bg-red-800/50"
                  >
                    All-In
                  </button>
                </div>
              </div>
            )}

            {/* Primary Turn Buttons */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={() => onAction({ type: 'fold' })}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-red-400 font-extrabold text-sm border border-red-500/25 transition-all flex items-center justify-center gap-1.5"
              >
                <span>Fold</span>
                <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                  (Flick)
                </span>
              </button>

              <button
                onClick={() => onAction(isFreeToCheck ? { type: 'check' } : { type: 'call' })}
                className="py-2 px-4 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 active:scale-95 text-blue-200 font-extrabold text-sm border border-blue-500/40 transition-all flex items-center justify-center gap-1.5"
              >
                <span>
                  {isFreeToCheck ? 'Check' : `Call $${Math.min(humanPlayer.chips, callAmount)}`}
                </span>
                {isFreeToCheck && (
                  <span className="text-[10px] text-blue-300/70 font-normal hidden sm:inline">
                    (2x Tap)
                  </span>
                )}
              </button>

              {humanPlayer.chips <= callAmount ? (
                <button
                  onClick={() => onAction({ type: 'allin' })}
                  className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-slate-950 font-black text-sm border border-amber-300 transition-all flex items-center justify-center gap-1.5 shadow-lg"
                >
                  <Flame className="w-4 h-4" />
                  <span>All-In (${humanPlayer.chips})</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    const targetAmt = Math.max(betAmount, minAllowedBet);
                    if (targetAmt >= maxAllowedBet) {
                      onAction({ type: 'allin' });
                    } else {
                      onAction({ type: 'raise', amount: targetAmt });
                    }
                  }}
                  className="py-2 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-slate-950 font-black text-sm border border-amber-300 transition-all flex items-center justify-center gap-1.5 shadow-lg"
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

      {/* Expandable 13x13 Hand Range Matrix & GTO vs Node-Locked Exploit Drawer */}
      <GTOSolverDrawer
        isOpen={showGTODrawer}
        onClose={() => setShowGTODrawer(false)}
        analysis={gtoAnalysis}
        solverMode={solverMode}
        onChangeSolverMode={onChangeSolverMode}
        cardsVisible={cardsVisible}
        decisionHistory={decisionHistory}
        stats={stats}
      />

      {/* Apple Vision Pro (visionOS) Test & Calibration Suite Modal */}
      {renderVisionProModal()}
    </div>
  );
};
