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
  CompactGTOPill,
  GTOSolverDrawer,
  getGradeBadgeStyle,
} from './GTOSolverDrawer';
import { pokerAudio } from '../audio/pokerAudio';
import { geminiMedia } from '../services/geminiMediaService';

export const getSuitCardStyle = (
  suit: Suit,
  fourColor: boolean
): { color: string; borderClass: string } => {
  if (fourColor) {
    switch (suit) {
      case 'spades':
        return { color: '#0f172a', borderClass: 'border-slate-400' };
      case 'hearts':
        return { color: '#dc2626', borderClass: 'border-red-400' };
      case 'diamonds':
        return { color: '#2563eb', borderClass: 'border-blue-400' };
      case 'clubs':
        return { color: '#16a34a', borderClass: 'border-emerald-500' };
    }
  }
  const isRed = suit === 'hearts' || suit === 'diamonds';
  return {
    color: isRed ? '#dc2626' : '#0f172a',
    borderClass: isRed ? 'border-red-400' : 'border-slate-400',
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
  { id: 'all_in_runout', label: '6. 🔥 All-In Spotlight', desc: 'Spotlight on the runout' },
  { id: 'showdown_multiway', label: '7. 🏆 Showdown Sweep', desc: 'Winning hand rises, pot is swept' },
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
  const [fourColorDeck, setFourColorDeck] = useState<boolean>(true);
  const [showInBB, setShowInBB] = useState<boolean>(false);
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
  const effectiveRaiseAmount = Math.min(maxAllowedBet, Math.max(betAmount, minAllowedBet));

  const formatChipValue = (amount: number): string => {
    if (!showInBB) return `$${amount}`;
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
    clampRaise(table.currentHighBet + Math.max(table.bigBlind, Math.round(potAfterCall * fraction)));

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

  // Desktop Grinding Keyboard Shortcuts (F = Fold, C = Check/Call, R/B = Bet/Raise, 1-5 = Sizing Presets)
  useEffect(() => {
    if (
      isTitleMode ||
      !humanPlayer.isTurn ||
      humanPlayer.folded ||
      humanPlayer.allIn ||
      table.phase === 'showdown'
    ) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
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
        e.preventDefault();
        if (humanPlayer.chips <= callAmount || effectiveRaiseAmount >= maxAllowedBet) {
          onAction({ type: 'allin' });
        } else {
          onAction({ type: 'raise', amount: effectiveRaiseAmount });
        }
      } else if (
        humanPlayer.chips > callAmount &&
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
          setBetAmount(preset.amount);
          pokerAudio.playTick();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isTitleMode,
    humanPlayer.isTurn,
    humanPlayer.folded,
    humanPlayer.allIn,
    humanPlayer.chips,
    table.phase,
    isFreeToCheck,
    callAmount,
    effectiveRaiseAmount,
    maxAllowedBet,
    quickBetPresets,
    onAction,
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
        title: 'Tell: Bao put his phone down.',
      };
    }
    if (p.persona === 'heavy_phone' && p.isWatchingPhone) {
      return {
        label: '📱 Scrolling',
        className: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50',
        title: 'Bao is scrolling his phone',
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
        title: 'Marcus is fidgeting with his chips',
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
  const [lastPinchTarget, setLastPinchTarget] = useState<string>('Tap or pinch a ring below');

  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false;
  const hasWebXRAPI = typeof navigator !== 'undefined' && 'xr' in navigator;

  const handleCalibrationPinch = (idx: number, label: string) => {
    pokerAudio.playChipClink(2);
    setPinchCalibrationHits((prev) => prev.map((c, i) => (i === idx ? c + 1 : c)));
    setLastPinchTarget(`Pinched ${label} (${new Date().toLocaleTimeString()})`);
  };

  const renderVisionProModal = () => {
    if (!showVisionProModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090c12]/88 backdrop-blur-md pointer-events-auto">
        <div className="bg-[#090c12]/96 max-w-xl w-full p-6 rounded-3xl border border-[#d4af37]/50 shadow-2xl text-left">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Glasses className="w-5 h-5 text-[#d4af37]" />
              <h3 className="text-base font-black tracking-wide text-[#f8fafc] uppercase">
                Vision Pro calibration
              </h3>
            </div>
            <button
              onClick={() => setShowVisionProModal(false)}
              className="px-2.5 py-1 rounded-lg bg-[#0f141c] hover:bg-slate-800 text-xs font-bold text-[#94a3b8] hover:text-[#f8fafc] border border-slate-800"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-xs">
            <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-[#94a3b8] uppercase">HTTPS Context</div>
              <div className={`font-mono font-bold mt-0.5 ${isSecure ? 'text-[#f3e5ab]' : 'text-[#d4af37]'}`}>
                {isSecure ? '✓ Secure' : '⚠ HTTP Local'}
              </div>
            </div>
            <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-[#94a3b8] uppercase">navigator.xr</div>
              <div className={`font-mono font-bold mt-0.5 ${hasWebXRAPI ? 'text-[#f3e5ab]' : 'text-[#94a3b8]'}`}>
                {hasWebXRAPI ? '✓ Present' : '✗ Disabled'}
              </div>
            </div>
            <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-[#94a3b8] uppercase">immersive-vr</div>
              <div className={`font-mono font-bold mt-0.5 ${isXRSupported ? 'text-[#f3e5ab]' : 'text-[#d4af37]'}`}>
                {isXRSupported ? '✓ Ready' : 'Enable Flag'}
              </div>
            </div>
            <div className="bg-[#0f141c] p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-[#94a3b8] uppercase">Stereo Draw Calls</div>
              <div className="font-mono font-bold text-[#f3e5ab] mt-0.5">{drawCalls} / 35 max</div>
            </div>
          </div>

          <div className="bg-[#0f141c] border border-slate-800 rounded-2xl p-3.5 mb-4 text-xs text-[#94a3b8] space-y-1.5">
            <div className="font-bold text-[#f3e5ab] uppercase tracking-wider text-[11px]">
              On a real Vision Pro (Safari):
            </div>
            <div>
              1. Open <strong className="text-[#f8fafc]">Settings → Apps → Safari → Advanced → Feature Flags</strong> on Vision Pro.
            </div>
            <div>
              2. Enable <strong className="text-[#f8fafc]">WebXR Device API</strong>, <strong className="text-[#f8fafc]">WebXR Hand Input Module</strong>, and <strong className="text-[#f8fafc]">WebXR VRModule</strong>.
            </div>
            <div>
              3. Look at any chip stack, hole card, or spatial button and <strong className="text-[#f8fafc]">pinch thumb + index finger</strong> (`transient-pointer`) or touch it.
            </div>
          </div>

          <div className="bg-[#0f141c] border border-[#d4af37]/30 rounded-2xl p-3.5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#f3e5ab]">
                Calibration targets
              </span>
              <span className="text-[11px] font-mono text-[#d4af37]">{lastPinchTarget}</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {['Left Rail ($25)', 'Center Pot', 'Right Rail (Peek)'].map((label, idx) => (
                <button
                  key={label}
                  onClick={() => handleCalibrationPinch(idx, label)}
                  className="py-3 px-2 rounded-xl bg-[#090c12] hover:bg-[#d4af37]/15 active:scale-95 border border-[#d4af37]/40 flex flex-col items-center justify-center gap-1 transition-all"
                >
                  <span className="w-6 h-6 rounded-full border-2 border-[#d4af37] flex items-center justify-center text-[11px] font-mono font-bold text-[#f3e5ab]">
                    {pinchCalibrationHits[idx]}
                  </span>
                  <span className="text-[11px] font-bold text-[#f8fafc]">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <a
              rel="ar"
              href="/models/vip_poker_table.usdz"
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#d4af37]/20 hover:bg-[#d4af37]/30 border border-[#d4af37]/50 text-[#f3e5ab] font-bold text-xs flex items-center justify-center gap-2 text-center"
            >
              <img src="/models/vip_poker_table.usdz" alt="" className="hidden" />
              <span>Open table in AR Quick Look (.USDZ)</span>
            </a>
            <a
              href="/models/vision_pro_ergonomics_report.json"
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-4 rounded-xl bg-[#0f141c] hover:bg-slate-800 border border-slate-800 text-[#f8fafc] font-bold text-xs flex items-center justify-center"
            >
              <span>Blender 5.2 Ergonomics JSON</span>
            </a>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // 1. REDESIGNED HOME SCREEN OVERLAY (Sightline-Free Split Dock,
  //    3 Buttons Total, 0% Character Face/Torso Occlusion, Strict 3-Tone Luxury)
  // ==========================================================================
  if (isTitleMode) {
    return (
      <div
        data-ux-layer="title-screen"
        className="absolute inset-0 z-20 flex flex-col justify-between p-5 sm:p-7 pointer-events-none select-none"
      >
        {renderVisionProModal()}

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
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#f8fafc] mt-0.5">
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
              title="Enter VR"
            >
              <Glasses className="w-4 h-4 text-[#d4af37]" />
              <span>{isXRSupported ? 'Enter VR' : 'VR Mode'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }


  // ==========================================================================
  // 2. IN-GAME HUD OVERLAY (Strict 2D vs. 3D Spatial HUD Mutual Exclusivity,
  //    Sightline-Safe Outer-Edge Architecture, <= 6 Buttons, Monochrome + Gold)
  // ==========================================================================
  if (isInXR) {
    // In WebXR / Vision Pro mode, 3D Spatial Rim HUD buttons are exclusively active; 2D DOM HUD is suppressed.
    return null;
  }

  if (!show2DHUD) {
    // In Pure 3D Spatial HUD mode, the 4 3D Spatial Rim buttons are active on the leather armrest;
    // only a single compact switcher badge is rendered in the top-right corner to return to 2D HUD mode.
    return (
      <div
        data-ux-layer="spatial-3d-mode-switcher"
        className="absolute top-3 right-4 z-20 flex items-center gap-2 pointer-events-auto"
      >
        <button
          onClick={onToggle2DHUD}
          className="px-3 py-1.5 rounded-xl bg-[#090c12]/90 hover:bg-[#0f141c] border border-[#d4af37]/50 text-[#f3e5ab] text-xs font-bold tracking-wider uppercase shadow-xl"
        >
          2D HUD 전환 (현재: 3D 공간 HUD)
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
                3D 공간 HUD 전환 (2D 숨김)
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
                  <span className="text-[10px] font-mono text-[#d4af37] font-bold">로드</span>
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
                        : 'Hold Peek or Space to see'
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
                    : 'Peek(스페이스바)으로 확인'}
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

