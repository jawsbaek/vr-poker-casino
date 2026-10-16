import React, { useState } from 'react';
import {
  Brain,
  Zap,
  ShieldAlert,
  TrendingUp,
  Grid,
  Award,
  ChevronUp,
  ChevronDown,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  Target,
  X,
} from 'lucide-react';
import {
  GTOAnalysis,
  GTOSolverMode,
  GTOComboCell,
  HandDecisionRecord,
  PlayerAction,
  SessionStats,
  TableState,
  PlayerState,
} from '../types/poker';

interface CompactGTOPillProps {
  analysis: GTOAnalysis;
  solverMode: GTOSolverMode;
  onChangeSolverMode: (mode: GTOSolverMode) => void;
  cardsVisible: boolean;
  isHumanTurn: boolean;
  table: TableState;
  humanPlayer: PlayerState;
  lastDecisionRecord: HandDecisionRecord | null;
  onSelectSizing: (amount: number) => void;
  onExecuteAction: (action: PlayerAction) => void;
  onOpenFullDrawer: () => void;
}

export function getGradeBadgeStyle(grade: HandDecisionRecord['grade']) {
  switch (grade) {
    case 'best':
      return {
        label: '🔥 BEST MOVE',
        bg: 'bg-emerald-500/25 border-emerald-400 text-emerald-200',
        text: 'text-emerald-300',
      };
    case 'good':
      return {
        label: '✅ GOOD LINE',
        bg: 'bg-cyan-500/20 border-cyan-400/70 text-cyan-200',
        text: 'text-cyan-300',
      };
    case 'inaccuracy':
      return {
        label: '⚠️ INACCURACY',
        bg: 'bg-amber-500/25 border-amber-400 text-amber-200',
        text: 'text-amber-300',
      };
    case 'blunder':
      return {
        label: '❌ BLUNDER',
        bg: 'bg-rose-500/30 border-rose-400 text-rose-200',
        text: 'text-rose-300',
      };
  }
}

export const CompactGTOPill: React.FC<CompactGTOPillProps> = ({
  analysis,
  solverMode,
  onChangeSolverMode,
  cardsVisible,
  isHumanTurn,
  table,
  humanPlayer,
  lastDecisionRecord,
  onSelectSizing,
  onExecuteAction,
  onOpenFullDrawer,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const activeRec = solverMode === 'exploit' ? analysis.exploit : analysis.pureGto;
  const activeEquity =
    solverMode === 'exploit' ? analysis.exploitEquityPct : analysis.pureGtoEquityPct;
  const equityDelta = Math.round((analysis.exploitEquityPct - analysis.pureGtoEquityPct) * 10) / 10;

  const recentToast =
    lastDecisionRecord &&
    lastDecisionRecord.handNumber === table.handCount &&
    Date.now() - lastDecisionRecord.timestamp < 7500
      ? lastDecisionRecord
      : null;

  return (
    <div className="glass-panel rounded-2xl border border-cyan-400/40 bg-slate-950/90 px-3.5 py-2.5 shadow-2xl transition-all">
      {/* Top Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-[11px] font-black tracking-wide">
            <Brain className="w-3.5 h-3.5 text-cyan-400" />
            <span>GTO WIZARD HUD</span>
          </div>

          {/* Position & Effective Stack Pill */}
          <span
            className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[11px] font-mono font-bold text-amber-300"
            title={analysis.positionDescription}
          >
            {analysis.position} • {analysis.effectiveStackBB} BB
          </span>

          {/* Core Public Math Telemetry (Always visible even before peeking!) */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono">
            <span className="px-1.5 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-slate-800">
              Pot Odds: <strong className="text-cyan-300">{analysis.potOddsPct}%</strong> ({analysis.potOddsRatio})
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-slate-800">
              SPR: <strong className="text-amber-300">{analysis.spr}</strong>
            </span>
            {table.currentHighBet > humanPlayer.currentBet && (
              <span
                className="px-1.5 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-slate-800"
                title="Minimum Defense Frequency to prevent opponent from profiting with any two cards"
              >
                MDF: <strong className="text-purple-300">{analysis.mdfPct}%</strong>
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-slate-800">
              {analysis.boardTexture}
            </span>
          </div>
        </div>

        {/* Mode Switcher (Exploit vs Pure GTO) + 13x13 Matrix Drawer Button */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
            <button
              onClick={() => onChangeSolverMode('exploit')}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
                solverMode === 'exploit'
                  ? 'bg-amber-500 text-slate-950 font-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Node-Locked Exploitative Solver: Adjusts for AI VPIP/PFR and Live 3D Physical Tells"
            >
              <Zap className="w-3 h-3" />
              <span>Exploit</span>
            </button>
            <button
              onClick={() => onChangeSolverMode('pure_gto')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                solverMode === 'pure_gto'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Pure Theoretical 5-Max Nash Equilibrium GTO"
            >
              Pure GTO
            </button>
          </div>

          <button
            onClick={onOpenFullDrawer}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-[10px] font-extrabold flex items-center gap-1 transition-all"
            title="Open Full 13x13 Range Matrix, Villain Tell-Lock & EV Solver"
          >
            <Grid className="w-3 h-3 text-cyan-400" />
            <span>13×13 Matrix</span>
          </button>

          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
            title={collapsed ? 'Expand GTO Advisor' : 'Collapse GTO Advisor'}
          >
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Instant Decision Grade Feedback Toast when Hero just acted */}
      {recentToast && (
        <div
          className={`mt-2 px-3 py-1.5 rounded-xl border text-xs flex items-center justify-between gap-2 animate-fade-in ${
            getGradeBadgeStyle(recentToast.grade).bg
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-black shrink-0 tracking-wide">
              {getGradeBadgeStyle(recentToast.grade).label}
            </span>
            <span className="truncate text-[11px] opacity-95">{recentToast.coachingNote}</span>
          </div>
          <span className="font-mono font-bold text-[11px] shrink-0">
            {recentToast.evLossBB === 0
              ? `+${recentToast.evEarnedBB.toFixed(2)} BB EV`
              : `-${recentToast.evLossBB.toFixed(2)} BB Loss`}
          </span>
        </div>
      )}

      {!collapsed && (
        <div className="mt-2 pt-2 border-t border-slate-800/90">
          {/* RESPECT CARD PEEK MECHANIC: Hide hole-card spoilers until player peeks or locks peek */}
          {!cardsVisible ? (
            <div className="flex flex-wrap items-center justify-between gap-2 py-0.5 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  Hole cards facedown — Hold <strong className="text-amber-300">Peek (Space)</strong> or{' '}
                  <strong className="text-amber-300">Lock Peek</strong> to unlock live Equity %, Outs & GTO Frequencies.
                </span>
              </div>
              {analysis.primaryVillain?.tellLockTitle && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200">
                  {analysis.primaryVillain.tellLockTitle}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Row 1: Hand Combo, Live Equity %, Outs & Villain Tell Lock */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 font-mono font-black text-[11px]">
                    {analysis.heroCombo} • Top {analysis.heroPercentile}% (Tier {analysis.heroHandTier})
                  </span>

                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 font-mono font-bold text-[11px]">
                    Equity: <strong>{activeEquity}%</strong>
                    {solverMode === 'exploit' && Math.abs(equityDelta) >= 2 && (
                      <span
                        className={`ml-1 text-[10px] ${
                          equityDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        ({equityDelta > 0 ? `+${equityDelta}%` : `${equityDelta}%`} vs GTO)
                      </span>
                    )}
                  </span>

                  {analysis.outs.totalOuts > 0 && (
                    <span
                      className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-400/40 text-purple-200 font-mono text-[11px]"
                      title={analysis.outs.keyOutCards.join(' • ')}
                    >
                      🎯 <strong>{analysis.outs.totalOuts} Outs</strong> ({analysis.outs.byRiverHitPct}% Hit)
                    </span>
                  )}
                </div>

                {/* Best Action Summary Pill */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    Best Move:
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-amber-500/30 to-emerald-500/30 border border-amber-400/60 text-amber-200 font-extrabold text-xs font-mono">
                    {activeRec.bestActionLabel} ({activeRec.bestActionEvBB >= 0 ? '+' : ''}
                    {activeRec.bestActionEvBB.toFixed(2)} BB)
                  </span>
                </div>
              </div>

              {/* Row 2: Visual GTO Mixed-Strategy Frequency Bar (Fold / Call / Raise Small / Raise Big / All-In) */}
              <div className="w-full h-5 rounded-lg overflow-hidden flex bg-slate-900 border border-slate-800 text-[10px] font-mono font-extrabold">
                {activeRec.frequencies.fold > 0 && (
                  <div
                    style={{ width: `${activeRec.frequencies.fold}%` }}
                    className="bg-slate-700/90 text-slate-200 flex items-center justify-center truncate px-1 transition-all"
                    title={`Fold: ${activeRec.frequencies.fold}% (0.00 BB EV)`}
                  >
                    {activeRec.frequencies.fold >= 12 ? `Fold ${activeRec.frequencies.fold}%` : ''}
                  </div>
                )}
                {activeRec.frequencies.checkCall > 0 && (
                  <div
                    style={{ width: `${activeRec.frequencies.checkCall}%` }}
                    className="bg-blue-600/85 text-white flex items-center justify-center truncate px-1 transition-all"
                    title={`Check/Call: ${activeRec.frequencies.checkCall}% (${activeRec.evs.checkCall.toFixed(2)} BB EV)`}
                  >
                    {activeRec.frequencies.checkCall >= 12
                      ? `${table.currentHighBet === humanPlayer.currentBet ? 'Check' : 'Call'} ${
                          activeRec.frequencies.checkCall
                        }%`
                      : ''}
                  </div>
                )}
                {activeRec.frequencies.raiseSmall > 0 && (
                  <div
                    style={{ width: `${activeRec.frequencies.raiseSmall}%` }}
                    className="bg-amber-500/90 text-slate-950 flex items-center justify-center truncate px-1 transition-all"
                    title={`Raise ${activeRec.sizingPresets.smallLabel}: ${activeRec.frequencies.raiseSmall}% (${activeRec.evs.raiseSmall.toFixed(2)} BB EV)`}
                  >
                    {activeRec.frequencies.raiseSmall >= 14
                      ? `${activeRec.sizingPresets.smallLabel} ${activeRec.frequencies.raiseSmall}%`
                      : ''}
                  </div>
                )}
                {activeRec.frequencies.raiseBig > 0 && (
                  <div
                    style={{ width: `${activeRec.frequencies.raiseBig}%` }}
                    className="bg-orange-500 text-slate-950 flex items-center justify-center truncate px-1 transition-all"
                    title={`Raise ${activeRec.sizingPresets.bigLabel}: ${activeRec.frequencies.raiseBig}% (${activeRec.evs.raiseBig.toFixed(2)} BB EV)`}
                  >
                    {activeRec.frequencies.raiseBig >= 14
                      ? `${activeRec.sizingPresets.bigLabel} ${activeRec.frequencies.raiseBig}%`
                      : ''}
                  </div>
                )}
                {activeRec.frequencies.allin > 0 && (
                  <div
                    style={{ width: `${activeRec.frequencies.allin}%` }}
                    className="bg-rose-600 text-white flex items-center justify-center truncate px-1 transition-all"
                    title={`All-In: ${activeRec.frequencies.allin}% (${activeRec.evs.allin.toFixed(2)} BB EV)`}
                  >
                    {activeRec.frequencies.allin >= 12 ? `All-In ${activeRec.frequencies.allin}%` : ''}
                  </div>
                )}
              </div>

              {/* Row 3: Coaching Insight + 1-Click GTO Sizing / Execute Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <p className="text-slate-300 truncate flex-1" title={activeRec.reasoning}>
                  <span className="text-cyan-400 font-bold mr-1">
                    {solverMode === 'exploit' ? '⚡ Exploit:' : '📐 GTO:'}
                  </span>
                  {activeRec.reasoning}
                </p>

                {isHumanTurn && !humanPlayer.folded && table.phase !== 'showdown' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {humanPlayer.chips > Math.max(0, table.currentHighBet - humanPlayer.currentBet) && (
                      <>
                        <button
                          onClick={() => onSelectSizing(activeRec.sizingPresets.smallAmount)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-amber-400/30 text-[10px] font-mono font-bold text-amber-200"
                          title={`Set slider to ${activeRec.sizingPresets.smallLabel} ($${activeRec.sizingPresets.smallAmount})`}
                        >
                          {activeRec.sizingPresets.smallLabel} (${activeRec.sizingPresets.smallAmount})
                        </button>
                        <button
                          onClick={() => onSelectSizing(activeRec.sizingPresets.bigAmount)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-orange-400/30 text-[10px] font-mono font-bold text-orange-200"
                          title={`Set slider to ${activeRec.sizingPresets.bigLabel} ($${activeRec.sizingPresets.bigAmount})`}
                        >
                          {activeRec.sizingPresets.bigLabel} (${activeRec.sizingPresets.bigAmount})
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => onExecuteAction(activeRec.bestAction)}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-md active:scale-95 transition-all"
                      title={`Immediately execute optimal solver action: ${activeRec.bestActionLabel}`}
                    >
                      <Zap className="w-3 h-3" />
                      <span>Play Best</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface GTOSolverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: GTOAnalysis;
  solverMode: GTOSolverMode;
  onChangeSolverMode: (mode: GTOSolverMode) => void;
  cardsVisible: boolean;
  decisionHistory: HandDecisionRecord[];
  stats: SessionStats;
}

export const GTOSolverDrawer: React.FC<GTOSolverDrawerProps> = ({
  isOpen,
  onClose,
  analysis,
  solverMode,
  onChangeSolverMode,
  cardsVisible,
  decisionHistory,
  stats,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'compare' | 'audit'>('matrix');
  const [matrixMode, setMatrixMode] = useState<'hero_gto' | 'villain_range'>('hero_gto');
  const [selectedCell, setSelectedCell] = useState<GTOComboCell | null>(null);

  if (!isOpen) return null;

  const inspectedCell =
    selectedCell ||
    analysis.rangeMatrix.flat().find((c) => c.isHeroHand && cardsVisible) ||
    analysis.rangeMatrix[0][0];

  return (
    <div className="fixed right-3 top-16 bottom-4 w-96 max-w-[94vw] glass-panel rounded-2xl border border-cyan-400/50 bg-slate-950/95 p-4 z-30 pointer-events-auto flex flex-col justify-between shadow-2xl overflow-hidden">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
              GTO Solver & 13×13 Range Matrix
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 mb-3 text-[11px] font-bold">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'matrix'
                ? 'bg-cyan-500 text-slate-950 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>13×13 Grid</span>
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'compare'
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>GTO vs Exploit</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'audit'
                ? 'bg-emerald-500 text-slate-950 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>EV Audit ({stats.gtoAccuracyScore}%)</span>
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto pr-0.5 space-y-3">
        {/* TAB 1: 13x13 HAND RANGE MATRIX */}
        {activeTab === 'matrix' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-300 font-bold">
                Position: <strong className="text-amber-300">{analysis.position}</strong> ({analysis.effectiveStackBB} BB)
              </span>
              <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
                <button
                  onClick={() => setMatrixMode('hero_gto')}
                  className={`px-2 py-0.5 rounded ${
                    matrixMode === 'hero_gto'
                      ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50'
                      : 'text-slate-400'
                  }`}
                >
                  Hero Range
                </button>
                <button
                  onClick={() => setMatrixMode('villain_range')}
                  className={`px-2 py-0.5 rounded ${
                    matrixMode === 'villain_range'
                      ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50'
                      : 'text-slate-400'
                  }`}
                >
                  Villain Lock ({analysis.primaryVillain?.estimatedRangeWidthPct || 28}%)
                </button>
              </div>
            </div>

            {/* 13x13 Interactive Grid */}
            <div
              style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}
              className="grid gap-[2px] bg-slate-900 p-1.5 rounded-xl border border-slate-800 select-none"
            >
              {analysis.rangeMatrix.map((row) =>
                row.map((cell) => {
                  const isHero = cell.isHeroHand && cardsVisible;
                  const isSelected = inspectedCell?.combo === cell.combo;

                  let bgStyle = 'bg-slate-950 text-slate-500';
                  if (matrixMode === 'hero_gto') {
                    if (cell.raiseFreq >= 65) {
                      bgStyle = 'bg-rose-600/85 text-white font-bold';
                    } else if (cell.raiseFreq >= 30) {
                      bgStyle = 'bg-amber-500/80 text-slate-950 font-bold';
                    } else if (cell.callFreq >= 30) {
                      bgStyle = 'bg-blue-600/80 text-white font-semibold';
                    } else if (cell.raiseFreq + cell.callFreq > 0) {
                      bgStyle = 'bg-slate-800 text-slate-300';
                    }
                  } else {
                    if (cell.villainWeight >= 80) {
                      bgStyle = 'bg-amber-500/85 text-slate-950 font-bold';
                    } else if (cell.villainWeight >= 35) {
                      bgStyle = 'bg-amber-500/35 text-amber-200';
                    }
                  }

                  return (
                    <button
                      key={cell.combo}
                      onClick={() => setSelectedCell(cell)}
                      className={`h-6 rounded-[3px] text-[8px] font-mono flex items-center justify-center transition-transform ${bgStyle} ${
                        isHero
                          ? 'ring-2 ring-yellow-300 scale-110 z-10 shadow-lg'
                          : isSelected
                          ? 'ring-1 ring-cyan-300 z-10'
                          : 'hover:opacity-85'
                      }`}
                      title={`${cell.combo} (Top ${cell.percentile}%) • Raise ${cell.raiseFreq}% / Call ${cell.callFreq}% / Fold ${cell.foldFreq}%`}
                    >
                      {cell.combo}
                    </button>
                  );
                })
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 px-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" /> Raise/3B
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Mixed
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" /> Call
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-950 border border-slate-700 inline-block" /> Fold
                </span>
              </div>
              <span>Diagonal = Pairs • Upper = Suited</span>
            </div>

            {/* Selected Combo Inspector Card */}
            {inspectedCell && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-amber-300 text-sm">
                    {inspectedCell.combo}{' '}
                    {inspectedCell.isHeroHand && cardsVisible && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 ml-1">
                        YOUR HAND
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Top {inspectedCell.percentile}% • Tier {inspectedCell.tier}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
                  <div className="bg-rose-950/50 border border-rose-500/30 rounded-lg p-1.5 text-center">
                    <div className="text-[9px] text-rose-300 uppercase">Raise</div>
                    <div className="font-bold text-white">{inspectedCell.raiseFreq}%</div>
                  </div>
                  <div className="bg-blue-950/50 border border-blue-500/30 rounded-lg p-1.5 text-center">
                    <div className="text-[9px] text-blue-300 uppercase">Call</div>
                    <div className="font-bold text-white">{inspectedCell.callFreq}%</div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-center">
                    <div className="text-[9px] text-slate-400 uppercase">Fold</div>
                    <div className="font-bold text-slate-300">{inspectedCell.foldFreq}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PURE GTO VS NODE-LOCKED EXPLOIT COMPARISON */}
        {activeTab === 'compare' && (
          <div className="space-y-3 text-xs">
            {/* Villain Archetype & Active 3D Physical Tell Lock Card */}
            {analysis.primaryVillain && (
              <div className="bg-amber-950/30 border border-amber-400/40 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-amber-300">
                    Target Villain: {analysis.primaryVillain.name} ({analysis.primaryVillain.position})
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-amber-200">
                    Range: Top {analysis.primaryVillain.estimatedRangeWidthPct}%
                  </span>
                </div>

                {analysis.primaryVillain.hudStats && (
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-mono bg-slate-950/80 p-1.5 rounded-lg border border-slate-800 text-center">
                    <div>
                      <span className="text-slate-400 block">VPIP</span>
                      <strong className="text-emerald-300">
                        {analysis.primaryVillain.hudStats.vpipPct}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">PFR</span>
                      <strong className="text-amber-300">
                        {analysis.primaryVillain.hudStats.pfrPct}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">3-Bet</span>
                      <strong className="text-purple-300">
                        {analysis.primaryVillain.hudStats.threeBetPct}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">AF</span>
                      <strong className="text-cyan-300">
                        {analysis.primaryVillain.hudStats.aggressionFactor}
                      </strong>
                    </div>
                  </div>
                )}

                {analysis.primaryVillain.tellLockTitle && (
                  <div className="text-[11px] text-amber-100 font-semibold pt-1">
                    <div>{analysis.primaryVillain.tellLockTitle}</div>
                    <div className="text-[10px] text-slate-300 font-normal mt-0.5">
                      {analysis.primaryVillain.tellLockImpact}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Side-by-Side Pure GTO vs Exploit Card */}
            {cardsVisible ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-2.5 space-y-1.5">
                  <div className="text-[10px] font-black uppercase text-cyan-300">
                    📐 Pure GTO Baseline
                  </div>
                  <div className="text-lg font-mono font-black text-white">
                    {analysis.pureGtoEquityPct}% <span className="text-[10px] text-slate-400">Eq</span>
                  </div>
                  <div className="text-[11px] font-bold text-cyan-200">
                    {analysis.pureGto.bestActionLabel}
                  </div>
                  <div className="text-[10px] font-mono text-emerald-400">
                    EV: {analysis.pureGto.bestActionEvBB >= 0 ? '+' : ''}
                    {analysis.pureGto.bestActionEvBB.toFixed(2)} BB
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {analysis.pureGto.reasoning}
                  </p>
                </div>

                <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-2.5 space-y-1.5">
                  <div className="text-[10px] font-black uppercase text-amber-300">
                    ⚡ Tell-Locked Exploit
                  </div>
                  <div className="text-lg font-mono font-black text-white">
                    {analysis.exploitEquityPct}% <span className="text-[10px] text-slate-400">Eq</span>
                  </div>
                  <div className="text-[11px] font-bold text-amber-200">
                    {analysis.exploit.bestActionLabel}
                  </div>
                  <div className="text-[10px] font-mono text-emerald-400">
                    EV: {analysis.exploit.bestActionEvBB >= 0 ? '+' : ''}
                    {analysis.exploit.bestActionEvBB.toFixed(2)} BB
                  </div>
                  <p className="text-[10px] text-slate-300 leading-relaxed">
                    {analysis.exploit.reasoning}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-center text-slate-400">
                Hold <strong>Peek (Space)</strong> or <strong>Lock Peek</strong> to compare Pure GTO vs. Tell-Locked Exploit EVs for your hole cards.
              </div>
            )}

            {/* Outs & Draw Probability Breakdown */}
            {cardsVisible && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-purple-300">
                    Clean Outs & Draw Math
                  </span>
                  <span className="font-mono font-bold text-purple-200">
                    {analysis.outs.totalOuts} Clean Outs
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {analysis.outs.drawLabels.map((lbl, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded bg-purple-950/60 border border-purple-400/30 text-purple-200"
                    >
                      {lbl}
                    </span>
                  ))}
                </div>
                {analysis.outs.totalOuts > 0 && (
                  <div className="flex justify-between text-[11px] font-mono text-slate-300 pt-1">
                    <span>Next Street Hit: {analysis.outs.nextStreetHitPct}%</span>
                    <span>By River Hit: {analysis.outs.byRiverHitPct}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SESSION GTO ACCURACY & STREET DECISION AUDIT */}
        {activeTab === 'audit' && (
          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                <div className="text-[9px] text-slate-400 uppercase">GTO Score</div>
                <div className="text-sm font-black text-emerald-400">
                  {stats.gtoAccuracyScore}%
                </div>
              </div>
              <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                <div className="text-[9px] text-slate-400 uppercase">Optimal</div>
                <div className="text-sm font-black text-cyan-300">
                  {stats.gtoOptimalCount}/{stats.gtoDecisionsTotal}
                </div>
              </div>
              <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                <div className="text-[9px] text-slate-400 uppercase">EV Loss</div>
                <div className="text-sm font-black text-rose-400">
                  -{stats.gtoCumulativeEvLossBB.toFixed(2)} BB
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Recent Street Decisions
              </div>
              {decisionHistory.length === 0 ? (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center text-slate-400">
                  Play a street to see your live GTO decision grades and EV loss analysis.
                </div>
              ) : (
                decisionHistory
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((rec) => {
                    const style = getGradeBadgeStyle(rec.grade);
                    return (
                      <div
                        key={rec.id}
                        className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-slate-300">
                            Hand #{rec.handNumber} • {rec.phase.toUpperCase()} ({rec.position} •{' '}
                            <strong className="text-amber-300">{rec.heroCombo}</strong>)
                          </span>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${style.bg}`}
                          >
                            {style.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-white">
                            Played: <strong>{rec.chosenActionLabel}</strong>
                          </span>
                          <span className="text-cyan-300">
                            Best: <strong>{rec.optimalActionLabel}</strong>
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 leading-snug">
                          {rec.coachingNote}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Solver Mode Switch */}
      <div className="pt-2.5 mt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Active Grader Mode:</span>
        <div className="flex gap-1">
          <button
            onClick={() => onChangeSolverMode('exploit')}
            className={`px-2.5 py-1 rounded-lg font-bold ${
              solverMode === 'exploit'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-400'
            }`}
          >
            ⚡ Exploit (Tell-Locked)
          </button>
          <button
            onClick={() => onChangeSolverMode('pure_gto')}
            className={`px-2.5 py-1 rounded-lg font-bold ${
              solverMode === 'pure_gto'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 text-slate-400'
            }`}
          >
            📐 Pure GTO
          </button>
        </div>
      </div>
    </div>
  );
};
