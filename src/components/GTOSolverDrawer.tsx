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
        label: 'BEST MOVE',
        bg: 'bg-[#d4af37]/20 border-[#d4af37] text-[#f3e5ab]',
        text: 'text-[#f3e5ab]',
      };
    case 'good':
      return {
        label: 'SOLID LINE',
        bg: 'bg-[#0f141c] border-[#d4af37]/50 text-[#f8fafc]',
        text: 'text-[#f8fafc]',
      };
    case 'inaccuracy':
      return {
        label: 'INACCURACY',
        bg: 'bg-[#090c12] border-slate-600 text-[#94a3b8]',
        text: 'text-[#94a3b8]',
      };
    case 'blunder':
      return {
        label: 'EV LOSS',
        bg: 'bg-[#090c12] border-slate-700 text-[#94a3b8]',
        text: 'text-[#94a3b8]',
      };
  }
}

export const CompactGTOPill: React.FC<CompactGTOPillProps> = ({
  analysis,
  solverMode,
  cardsVisible,
  table,
  humanPlayer,
  lastDecisionRecord,
  onOpenFullDrawer,
}) => {
  const activeRec = solverMode === 'exploit' ? analysis.exploit : analysis.pureGto;
  const activeEquity =
    solverMode === 'exploit' ? analysis.exploitEquityPct : analysis.pureGtoEquityPct;

  const recentToast =
    lastDecisionRecord &&
    lastDecisionRecord.handNumber === table.handCount &&
    Date.now() - lastDecisionRecord.timestamp < 6500
      ? lastDecisionRecord
      : null;

  return (
    <div
      data-ux-component="gto-telemetry-strip"
      onClick={onOpenFullDrawer}
      className="cursor-pointer rounded-xl border border-[#d4af37]/35 bg-[#090c12]/92 px-3 py-1.5 shadow-xl transition-all hover:border-[#d4af37]/70"
      title="Click to open 13×13 GTO Range Matrix & Detailed Solver"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#d4af37]/15 border border-[#d4af37]/45 text-[#f3e5ab] font-bold tracking-wider uppercase text-[10px]">
            <Brain className="w-3 h-3 text-[#d4af37]" />
            <span>{solverMode === 'exploit' ? 'GTO · EXPLOIT' : 'GTO · NASH'}</span>
          </span>

          <span className="font-mono font-bold text-[#f8fafc]">
            {analysis.position} · {analysis.effectiveStackBB} BB
          </span>

          <span className="hidden sm:inline text-[#94a3b8] font-mono">
            Pot Odds <strong className="text-[#f3e5ab]">{analysis.potOddsPct}%</strong> · SPR{' '}
            <strong className="text-[#f8fafc]">{analysis.spr}</strong>
            {table.currentHighBet > humanPlayer.currentBet ? ` · MDF ${analysis.mdfPct}%` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono">
          {!cardsVisible ? (
            <span className="inline-flex items-center gap-1 text-[#94a3b8] text-[10px]">
              <Lock className="w-3 h-3 text-[#d4af37]" />
              <span>Hold Peek to view real-time equity & optimal frequencies</span>
            </span>
          ) : (
            <>
              <span className="px-2 py-0.5 rounded bg-[#0f141c] border border-slate-800 text-[#f8fafc] font-bold">
                {analysis.heroCombo} · Eq <strong className="text-[#f3e5ab]">{activeEquity}%</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-[#d4af37]/20 border border-[#d4af37]/55 text-[#f3e5ab] font-extrabold">
                Best: {activeRec.bestActionLabel} ({activeRec.bestActionEvBB >= 0 ? '+' : ''}
                {activeRec.bestActionEvBB.toFixed(2)} BB)
              </span>
            </>
          )}
          {recentToast && (
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0f141c] border border-[#d4af37]/40 text-[#f3e5ab] text-[10px] font-bold">
              {getGradeBadgeStyle(recentToast.grade).label}
            </span>
          )}
        </div>
      </div>
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
    <div
      data-hud-drawer="gto"
      className="fixed right-3 top-16 bottom-4 w-96 max-w-[94vw] glass-panel rounded-2xl border border-cyan-400/50 bg-slate-950/95 p-4 z-30 pointer-events-auto flex flex-col justify-between shadow-2xl overflow-hidden"
    >
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
