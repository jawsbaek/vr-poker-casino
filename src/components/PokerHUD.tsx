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
  Camera,
  Bot,
  Layers,
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
  DogfoodScenarioId,
  SpatialAuditReport,
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
  activeScenario: DogfoodScenarioId | null;
  onLoadScenario: (scenario: DogfoodScenarioId) => void;
  isAutoPilot: boolean;
  onToggleAutoPilot: () => void;
  speedMultiplier: 1 | 2 | 5;
  onChangeSpeedMultiplier: (speed: 1 | 2 | 5) => void;
  show2DHUD: boolean;
  onToggle2DHUD: () => void;
  debugOverlayEnabled: boolean;
  onToggleDebugOverlay: () => void;
  spatialAudit: SpatialAuditReport | null;
  onRunSpatialAudit: () => void;
}

const CAMERA_PRESETS: { id: CameraPresetId; label: string; short: string }[] = [
  { id: 'seat0_pov', label: 'Seat #0 POV', short: 'Seat #0' },
  { id: 'top_down', label: 'Top-Down Felt', short: 'Top-Down' },
  { id: 'macro_cards_chips', label: 'Macro Cards & Ring', short: 'Macro' },
  { id: 'bao_tell_closeup', label: 'Bao Phone Tell', short: 'Bao Tell' },
  { id: 'viktor_marcus_rim', label: 'Viktor & Marcus Rim', short: 'Rim Cast' },
  { id: 'dealer_pov', label: 'Dealer Shoe POV', short: 'Dealer' },
];

const DOGFOOD_SCENARIOS: { id: DogfoodScenarioId; label: string; desc: string }[] = [
  { id: 'preflop_deal', label: '1. Preflop Deal', desc: 'A♠K♠ dealt, blinds posted' },
  { id: 'card_peel', label: '2. Hole Card Peel', desc: '3D corner peel + Flop board' },
  { id: 'chip_drag_stage', label: '3. Staged Bet Ring', desc: '$175 staged inside gold ring' },
  { id: 'bao_phone_scroll', label: '4. Bao Phone Scroll', desc: 'Dr. Bao scrolling video feed' },
  { id: 'bao_phone_down_monster', label: '5. 🔥 Bao Phone Down', desc: 'Phone flat on rail + monster raise' },
  { id: 'all_in_runout', label: '6. 🔥 All-In Spotlight', desc: 'Dimmed room + intense runout beam' },
  { id: 'showdown_multiway', label: '7. 🏆 Showdown Sweep', desc: 'Levitating winning hand + pot sweep' },
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
  cameraPreset,
  onSelectCameraPreset,
  activeScenario,
  onLoadScenario,
  isAutoPilot,
  onToggleAutoPilot,
  speedMultiplier,
  onChangeSpeedMultiplier,
  show2DHUD,
  onToggle2DHUD,
  debugOverlayEnabled,
  onToggleDebugOverlay,
  spatialAudit,
  onRunSpatialAudit,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [volume, setVolume] = useState(0.65);
  const [showStatsDrawer, setShowStatsDrawer] = useState(false);
  const [showGTODrawer, setShowGTODrawer] = useState(false);
  const [showDogfoodDrawer, setShowDogfoodDrawer] = useState(false);
  const [showBanterFeed, setShowBanterFeed] = useState(true);
  const [betAmount, setBetAmount] = useState<number>(table.bigBlind * 2);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => {
    try {
      return localStorage.getItem('GEMINI_API_KEY') || geminiMedia.getApiKey() || '';
    } catch {
      return geminiMedia.getApiKey() || '';
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
  // 2. IN-GAME HUD OVERLAY (Sightline-Safe Outer-Edge Architecture, <= 6 Buttons,
  //    Monochrome Deep Obsidian + Warm Ivory + Single Champagne Gold Accent)
  // ==========================================================================
  if (!show2DHUD) {
    return (
      <div className="absolute top-3 right-4 z-20 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={onToggle2DHUD}
          className="px-3 py-1.5 rounded-xl bg-[#090c12]/90 hover:bg-[#0f141c] border border-[#d4af37]/50 text-[#f3e5ab] text-xs font-bold tracking-wider uppercase shadow-xl"
        >
          HUD 표시
        </button>
      </div>
    );
  }

  return (
    <div
      data-ux-layer="main-hud"
      className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4 z-10 overflow-hidden"
    >
      {/* 1. OUTER TOP EDGE BAR: Ultra-Compact Left Status Strip + Single Right Menu Button */}
      <div className="flex items-start justify-between gap-3 pointer-events-auto">
        {/* Top-Left Single-Line Status & Pot Strip (Never hangs into center Dealer sightline) */}
        <div
          data-ux-panel="top-left-status"
          className="bg-[#090c12]/92 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#d4af37]/40 flex flex-wrap items-center gap-3 shadow-2xl"
        >
          <div className="flex items-center gap-2">
            <span className="text-[#d4af37] text-sm font-black">♠</span>
            <span className="text-xs font-extrabold tracking-wider text-[#f8fafc] uppercase">
              VIP LVL {table.blindLevel}
            </span>
            <span className="text-[11px] font-mono text-[#94a3b8]">
              #{table.handCount} · ${table.smallBlind}/${table.bigBlind} · {alivePlayersCount}/5명
            </span>
          </div>

          <div className="h-3.5 w-[1px] bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
              {table.isAllInRunout ? 'ALL-IN RUNOUT' : table.phase.toUpperCase()} POT
            </span>
            <span className="text-sm sm:text-base font-black font-mono text-[#f3e5ab]">
              ${table.pot + table.stagedBet}
            </span>
            {table.sidePots.length > 1 && (
              <span className="text-[10px] font-mono text-[#94a3b8]">
                ({table.sidePots.map((sp) => `${sp.label} $${sp.amount}`).join(' · ')})
              </span>
            )}
          </div>
        </div>

        {/* Top-Right Single Unified Menu / Settings Trigger (Button #1) */}
        <div data-ux-panel="top-right-menu" className="flex items-center">
          <button
            data-testid="hud-menu-trigger"
            onClick={() => {
              const next = !showDogfoodDrawer;
              setShowDogfoodDrawer(next);
              if (next) onRunSpatialAudit();
            }}
            className="bg-[#090c12]/92 hover:bg-[#0f141c] backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#d4af37]/50 text-[#f3e5ab] text-xs font-extrabold tracking-wider flex items-center gap-2 shadow-2xl transition-all active:scale-95"
            title="메뉴, GTO 13×13 매트릭스, 카메라 시점, 사운드 및 3D 공간 검증 열기"
          >
            <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>메뉴 / 설정</span>
            <span className="px-1.5 py-0.5 rounded bg-[#d4af37]/20 border border-[#d4af37]/40 text-[#f3e5ab] font-mono text-[10px]">
              GTO {stats.gtoAccuracyScore}%
            </span>
          </button>
        </div>
      </div>

      {/* 2. UNIFIED SLIDE-OVER MENU / SETTINGS / INSPECTOR DRAWER (Only visible when toggled open) */}
      {showDogfoodDrawer && (
        <div
          data-ux-drawer="unified-settings-drawer"
          className="self-end bg-[#090c12]/96 backdrop-blur-xl p-4 rounded-2xl w-96 max-h-[76vh] overflow-y-auto pointer-events-auto border border-[#d4af37]/50 shadow-2xl space-y-3 text-[#f8fafc]"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#d4af37]" />
              <span className="font-extrabold text-sm text-[#f3e5ab]">
                통합 메뉴 · 코칭 · 3D 시점 설정
              </span>
            </div>
            <button
              onClick={() => setShowDogfoodDrawer(false)}
              className="text-xs text-[#94a3b8] hover:text-[#f8fafc] px-2 py-0.5 rounded bg-[#0f141c] border border-slate-800"
            >
              닫기 ✕
            </button>
          </div>

          {/* Quick Tools: GTO Matrix, Stats, Audio, XR, Vision Pro */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                setShowDogfoodDrawer(false);
                setShowGTODrawer(true);
              }}
              className="px-3 py-2 rounded-xl bg-[#0f141c] hover:bg-slate-900 border border-[#d4af37]/40 text-xs font-bold text-[#f3e5ab] flex items-center gap-2"
            >
              <Brain className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>13×13 GTO 솔버</span>
            </button>

            <button
              onClick={() => {
                const nextMode = solverMode === 'exploit' ? 'pure_gto' : 'exploit';
                onChangeSolverMode(nextMode);
              }}
              className="px-3 py-2 rounded-xl bg-[#0f141c] hover:bg-slate-900 border border-slate-800 text-xs font-bold text-[#f8fafc] flex items-center justify-between"
            >
              <span>솔버 모드</span>
              <span className="text-[#d4af37] font-mono uppercase">
                {solverMode === 'exploit' ? 'Exploit' : 'Nash'}
              </span>
            </button>

            <button
              onClick={toggleSound}
              className="px-3 py-2 rounded-xl bg-[#0f141c] hover:bg-slate-900 border border-slate-800 text-xs font-bold text-[#f8fafc] flex items-center gap-2"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-[#94a3b8]" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-[#d4af37]" />
              )}
              <span>{isMuted ? '오디오 음소거됨' : '오디오 켜짐'}</span>
            </button>

            <button
              onClick={toggleMusic}
              className="px-3 py-2 rounded-xl bg-[#0f141c] hover:bg-slate-900 border border-slate-800 text-xs font-bold text-[#f8fafc] flex items-center gap-2"
            >
              <Music className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>{musicEnabled ? '재즈 BGM 켜짐' : '재즈 BGM 꺼짐'}</span>
            </button>

            <button
              onClick={toggleVoice}
              className="px-3 py-2 rounded-xl bg-[#0f141c] hover:bg-slate-900 border border-slate-800 text-xs font-bold text-[#f8fafc] flex items-center gap-2"
            >
              <Mic className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>{voiceEnabled ? '딜러 음성 켜짐' : '딜러 음성 꺼짐'}</span>
            </button>

            <button
              onClick={onResetView}
              className="px-3 py-2 rounded-xl bg-[#0f141c] hover:bg-slate-900 border border-slate-800 text-xs font-bold text-[#f8fafc] flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>기본 시점 초기화</span>
            </button>

            <button
              onClick={() => {
                setShowDogfoodDrawer(false);
                setShowVisionProModal(true);
              }}
              className="px-3 py-2 rounded-xl bg-[#0f141c] hover:bg-slate-900 border border-slate-800 text-xs font-bold text-[#f8fafc] flex items-center gap-2"
            >
              <Box className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Vision Pro / USDZ</span>
            </button>

            <button
              onClick={onEnterVR}
              className="px-3 py-2 rounded-xl bg-[#0f141c] hover:bg-slate-900 border border-slate-800 text-xs font-bold text-[#f8fafc] flex items-center gap-2"
            >
              <Glasses className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>{isInXR ? 'WebXR 종료' : 'WebXR 진입'}</span>
            </button>
          </div>

          {/* Physical Chip Ring Toss & Quick Table-Talk Emotes (Consolidated in Drawer) */}
          <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">
              테이블 대화 (Table Talk) & 수동 칩 토스
            </div>
            <div className="flex flex-wrap gap-1">
              {QUICK_EMOTES.map((emote) => (
                <button
                  key={emote.id}
                  onClick={() => onSendQuickEmote(emote.id)}
                  className="px-2 py-1 rounded-lg bg-[#090c12] hover:bg-slate-900 border border-slate-800 text-[10px] font-semibold text-[#f8fafc] flex items-center gap-1"
                >
                  <span>{emote.icon}</span>
                  <span>{emote.label}</span>
                </button>
              ))}
            </div>
            {humanPlayer.isTurn && !humanPlayer.folded && table.phase !== 'showdown' && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
                <span className="text-[10px] text-[#94a3b8] font-bold">베팅 링 칩 투척:</span>
                {([1, 5, 25, 100] as ChipDenomination[]).map((denom) => (
                  <button
                    key={denom}
                    disabled={humanPlayer.chips - table.stagedBet < denom}
                    onClick={() => onStageChip(denom)}
                    className="px-2 py-1 rounded-lg bg-[#090c12] border border-[#d4af37]/40 text-[#f3e5ab] font-mono text-[10px] font-bold disabled:opacity-30"
                  >
                    +${denom}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 1. Multi-Angle Camera Rig Presets */}
          <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">
                카메라 프리셋 (6개 앵글)
              </span>
              <button
                onClick={onToggle2DHUD}
                className="px-2 py-0.5 rounded bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f3e5ab] text-[10px] font-bold"
              >
                클린 3D 뷰 (HUD 숨김)
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {CAMERA_PRESETS.map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => onSelectCameraPreset(cam.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-left text-[11px] font-bold transition-all border ${
                    cameraPreset === cam.id
                      ? 'bg-[#d4af37] text-[#090c12] border-[#f3e5ab] font-black'
                      : 'bg-[#090c12] text-[#f8fafc] border-slate-800 hover:border-[#d4af37]/50'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Deterministic Scenario Loader */}
          <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">
              시나리오 즉시 로드 (Deterministic State)
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {DOGFOOD_SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => onLoadScenario(sc.id)}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-left transition-all border flex items-center justify-between ${
                    activeScenario === sc.id
                      ? 'bg-[#d4af37]/20 border-[#d4af37] text-[#f3e5ab]'
                      : 'bg-[#090c12] border-slate-800 text-[#f8fafc] hover:border-[#d4af37]/40'
                  }`}
                >
                  <div>
                    <div className="text-[11px] font-extrabold">{sc.label}</div>
                    <div className="text-[9px] text-[#94a3b8]">{sc.desc}</div>
                  </div>
                  <span className="text-[10px] font-mono text-[#d4af37] font-bold">로드 →</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Seat #0 Auto-Pilot Bot + Speed Multiplier */}
          <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
            <button
              onClick={onToggleAutoPilot}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                isAutoPilot
                  ? 'bg-[#d4af37] text-[#090c12]'
                  : 'bg-[#090c12] text-[#f8fafc] border border-slate-700'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>{isAutoPilot ? 'Auto-Pilot 켜짐' : 'Auto-Pilot 봇'}</span>
            </button>
            <div className="flex items-center gap-1">
              {([1, 2, 5] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => onChangeSpeedMultiplier(spd)}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${
                    speedMultiplier === spd
                      ? 'bg-[#d4af37] text-[#090c12]'
                      : 'bg-[#090c12] text-[#94a3b8]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* 4. Gemini API Key & Tournament Restart */}
          <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[10px] text-[#94a3b8] font-bold">
              <span>GEMINI API KEY ({hasGeminiKey ? '연결됨' : '미설정'})</span>
              <span>Draws: {drawCalls}</span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-[#090c12] border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-[#f8fafc] font-mono focus:outline-none focus:border-[#d4af37]"
              />
              <button
                onClick={handleSaveApiKey}
                className="px-2.5 py-1 rounded-lg bg-[#d4af37] text-[#090c12] font-bold text-xs"
              >
                저장
              </button>
            </div>
            <button
              onClick={() => {
                setShowDogfoodDrawer(false);
                onStartNewTournament();
              }}
              className="w-full py-1.5 px-3 rounded-xl bg-[#090c12] hover:bg-slate-900 border border-[#d4af37]/40 text-[#f3e5ab] text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>토너먼트 새 게임 시작 ($200 스택)</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. OUTER BOTTOM PLAYER DOCK: Low-Profile Telemetry + Primary Actions (Strictly <= 5 Buttons here) */}
      <div
        data-ux-panel="bottom-action-dock"
        className="flex flex-col gap-1.5 max-w-xl w-full mx-auto pointer-events-auto"
      >
        {/* Single-Row GTO Telemetry Strip (0 <button> tags inside) */}
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

        {/* Integrated Hero Status & Primary Action Dock */}
        <div className="bg-[#090c12]/94 backdrop-blur-md px-3.5 py-2.5 rounded-2xl border border-[#d4af37]/45 shadow-2xl flex flex-col gap-2">
          {/* Top Row of Dock: Hole Cards + Hero Stack + Peek / Lock Peek (Buttons #2 & #3) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-1 shrink-0">
                {humanPlayer.cards.map((c) => (
                  <div
                    key={c.id}
                    className={`w-8 h-10 rounded-lg border flex flex-col items-center justify-center font-mono font-black leading-none text-xs shadow ${
                      cardsVisible
                        ? 'bg-[#f8fafc] text-[#090c12] border-[#d4af37]'
                        : 'bg-[#0f141c] text-[#d4af37] border-[#d4af37]/50'
                    }`}
                    title={
                      cardsVisible
                        ? `${getRankLabel(c.rank)}${getSuitSymbol(c.suit)}`
                        : 'Facedown Hole Card (Hold Peek or Spacebar)'
                    }
                  >
                    {cardsVisible ? (
                      <>
                        <span className="text-[11px]">{getRankLabel(c.rank)}</span>
                        <span className="text-xs">{getSuitSymbol(c.suit)}</span>
                      </>
                    ) : (
                      <span>♠</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[#94a3b8] uppercase">
                  <span>SEAT #0 · YOU</span>
                  {table.dealerSeat === 0 && (
                    <span className="px-1.5 py-0.2 rounded bg-[#d4af37] text-[#090c12] text-[9px] font-black">
                      BTN
                    </span>
                  )}
                  {table.stagedBet > 0 && (
                    <span
                      onClick={onClearStagedBet}
                      className="cursor-pointer px-1.5 py-0.2 rounded bg-[#d4af37]/20 border border-[#d4af37]/50 text-[#f3e5ab] font-mono text-[9px]"
                      title="클릭하여 베팅 링에 올려둔 칩 초기화"
                    >
                      링 +${table.stagedBet} ✕
                    </span>
                  )}
                </div>
                <div className="text-xs sm:text-sm font-extrabold text-[#f8fafc] truncate">
                  {humanPlayer.folded
                    ? 'Folded (폴드됨)'
                    : cardsVisible && handEval
                    ? handEval.description
                    : '홀카드 덮임 — Peek(스페이스바)으로 확인'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right mr-1">
                <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-bold">
                  보유 스택
                </div>
                <div className="text-sm sm:text-base font-mono font-black text-[#f3e5ab]">
                  ${Math.max(0, humanPlayer.chips - table.stagedBet)}
                </div>
              </div>

              {!humanPlayer.folded && humanPlayer.cards.length > 0 && (
                <div className="flex items-center gap-1">
                  {/* Button #2: Hold to Peek */}
                  <button
                    data-testid="action-peek"
                    onMouseDown={() => onPeekCards(true)}
                    onMouseUp={() => onPeekCards(false)}
                    onMouseLeave={() => isPeeking && onPeekCards(false)}
                    onTouchStart={() => onPeekCards(true)}
                    onTouchEnd={() => onPeekCards(false)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border ${
                      isPeeking
                        ? 'bg-[#d4af37] text-[#090c12] border-[#f3e5ab]'
                        : 'bg-[#0f141c] hover:bg-slate-900 text-[#f3e5ab] border-[#d4af37]/40'
                    }`}
                    title="누르고 있는 동안 카드 모서리 확인 (스페이스바)"
                  >
                    {isPeeking ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>Peek</span>
                  </button>

                  {/* Button #3: Lock Peek */}
                  <button
                    data-testid="action-lock-peek"
                    onClick={onTogglePeekLock}
                    className={`p-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isPeekLocked
                        ? 'bg-[#d4af37]/25 text-[#f3e5ab] border-[#d4af37]'
                        : 'bg-[#0f141c] text-[#94a3b8] border-slate-800 hover:text-[#f8fafc]'
                    }`}
                    title={isPeekLocked ? '홀카드 오픈 고정됨' : '홀카드 오픈 상태 고정'}
                  >
                    {isPeekLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row: Showdown Result OR Primary Turn Actions (Buttons #4, #5, #6) */}
          {table.phase === 'showdown' && table.winners.length > 0 ? (
            <div className="pt-2 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-black text-[#f3e5ab] flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
                  <span className="truncate">
                    {table.winners.map((w) => w.playerName).join(' & ')} 승리 (+$
                    {table.winners.reduce((acc, w) => acc + w.amount, 0)})
                  </span>
                </div>
                <div className="text-[11px] text-[#94a3b8] truncate">
                  {table.winners
                    .map((w) => `${w.potLabel ? `[${w.potLabel}] ` : ''}${w.handName}`)
                    .join(' · ')}
                </div>
              </div>

              {/* Button #4 in Showdown: Next Hand / New Tournament */}
              <button
                data-testid="action-next-hand"
                onClick={isTournamentOver ? onStartNewTournament : onStartNextHand}
                className="px-4 py-2 rounded-xl bg-[#d4af37] hover:bg-[#f3e5ab] text-[#090c12] font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg shrink-0"
              >
                <span>{isTournamentOver ? '새 토너먼트 시작' : '다음 핸드 딜링'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            humanPlayer.isTurn &&
            !humanPlayer.folded &&
            table.phase !== 'showdown' && (
              <div className="pt-1.5 border-t border-slate-800/90 flex flex-col gap-1.5">
                {/* Compact Sizing Slider Track (Uses clickable spans for quick presets to keep button count <= 6) */}
                {humanPlayer.chips > callAmount && (
                  <div className="flex items-center gap-2.5 bg-[#0f141c] px-2.5 py-1 rounded-xl border border-slate-800/90">
                    <span className="text-[11px] font-bold text-[#f3e5ab] font-mono min-w-24">
                      사이징: ${Math.max(betAmount, minAllowedBet)}
                    </span>
                    <input
                      type="range"
                      min={minAllowedBet}
                      max={maxAllowedBet}
                      step={1}
                      value={Math.max(betAmount, minAllowedBet)}
                      onChange={handleSliderChange}
                      className="flex-1 accent-[#d4af37] cursor-pointer h-1.5"
                    />
                    <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#94a3b8]">
                      <span
                        onClick={() => setBetAmount(minAllowedBet)}
                        className="cursor-pointer px-1.5 py-0.5 rounded bg-[#090c12] hover:text-[#f3e5ab] border border-slate-800"
                      >
                        Min
                      </span>
                      <span
                        onClick={() =>
                          setBetAmount(
                            Math.min(
                              maxAllowedBet,
                              Math.max(minAllowedBet, table.currentHighBet + table.pot)
                            )
                          )
                        }
                        className="cursor-pointer px-1.5 py-0.5 rounded bg-[#090c12] hover:text-[#f3e5ab] border border-slate-800"
                      >
                        Pot
                      </span>
                      <span
                        onClick={() => setBetAmount(maxAllowedBet)}
                        className="cursor-pointer px-1.5 py-0.5 rounded bg-[#090c12] hover:text-[#f3e5ab] border border-slate-800"
                      >
                        Max
                      </span>
                    </div>
                  </div>
                )}

                {/* 3 Primary Turn Action Buttons (Buttons #4, #5, #6) */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Button #4: Fold */}
                  <button
                    data-testid="action-fold"
                    onClick={() => onAction({ type: 'fold' })}
                    className="py-2 px-3 rounded-xl bg-[#0f141c] hover:bg-slate-900 active:scale-95 text-[#94a3b8] hover:text-[#f8fafc] font-extrabold text-xs sm:text-sm border border-slate-800 transition-all flex items-center justify-center gap-1"
                  >
                    <span>Fold</span>
                  </button>

                  {/* Button #5: Check / Call */}
                  <button
                    data-testid="action-check-call"
                    onClick={() => onAction(isFreeToCheck ? { type: 'check' } : { type: 'call' })}
                    className="py-2 px-3 rounded-xl bg-[#0f141c] hover:bg-slate-900 active:scale-95 text-[#f8fafc] font-extrabold text-xs sm:text-sm border border-[#d4af37]/45 hover:border-[#d4af37] transition-all flex items-center justify-center gap-1"
                  >
                    <span>
                      {isFreeToCheck ? 'Check' : `Call $${Math.min(humanPlayer.chips, callAmount)}`}
                    </span>
                  </button>

                  {/* Button #6: Bet / Raise / All-In */}
                  {humanPlayer.chips <= callAmount ? (
                    <button
                      data-testid="action-raise"
                      onClick={() => onAction({ type: 'allin' })}
                      className="py-2 px-3 rounded-xl bg-[#d4af37] hover:bg-[#f3e5ab] active:scale-95 text-[#090c12] font-black text-xs sm:text-sm border border-[#f3e5ab] transition-all flex items-center justify-center gap-1 shadow-lg"
                    >
                      <span>All-In (${humanPlayer.chips})</span>
                    </button>
                  ) : (
                    <button
                      data-testid="action-raise"
                      onClick={() => {
                        const targetAmt = Math.max(betAmount, minAllowedBet);
                        if (targetAmt >= maxAllowedBet) {
                          onAction({ type: 'allin' });
                        } else {
                          onAction({ type: 'raise', amount: targetAmt });
                        }
                      }}
                      className="py-2 px-3 rounded-xl bg-[#d4af37] hover:bg-[#f3e5ab] active:scale-95 text-[#090c12] font-black text-xs sm:text-sm border border-[#f3e5ab] transition-all flex items-center justify-center gap-1 shadow-lg"
                    >
                      <span>
                        {table.currentHighBet === 0
                          ? `Bet $${Math.max(betAmount, minAllowedBet)}`
                          : `Raise $${Math.max(betAmount, minAllowedBet)}`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
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

