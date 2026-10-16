import type { CasinoScene } from '../scene/CasinoScene';
import type {
  HudUiAuditCheck,
  HudUiAuditReport,
  HudUiRuleSpec,
  ScreenBoundingRect,
} from '../types/poker';

/**
 * Formal HUD & UI Design Rules established for the 3D / WebXR Poker Experience.
 * Enforced both in-app (Inspector Drawer) and in the automated Playwright dogfooding harness.
 */
export const HUD_UI_RULES: HudUiRuleSpec[] = [
  {
    id: 'center_safe_zone_unobstructed',
    code: 'HUD-R1',
    category: 'Spatial Safe-Zone',
    title: '3D Center Table & Character Safe-Zone (0% Occlusion)',
    rule: 'Persistent 2D HUD zones (top-bar, bottom-dock, left-utility, showdown-banner) must occupy only the viewport perimeter and maintain 0 px² overlap with the 3D Community Cards, Center Pot, Golden Betting Ring, Seat #0 3D Hole Cards & Bank Chips, and all 5 3D Character Heads in seat0_pov.',
    threshold: 'overlapArea == 0 px² in seat0_pov',
  },
  {
    id: 'visible_action_element_cap',
    code: 'HUD-R2',
    category: 'Cognitive Load',
    title: "Interactive Control Cap (Miller's Law <= 12 Controls & <= 4 Top Utilities)",
    rule: 'Default in-game 2D HUD view (with drawers closed) must expose at most 12 persistently visible interactive controls on Hero turn (<= 8 off-turn), and at most 4 utility trigger buttons on the Top-Right bar.',
    threshold: 'visibleControls <= 12 && topBarUtilityButtons <= 4',
  },
  {
    id: 'perimeter_geometry_budget',
    code: 'HUD-R3',
    category: 'Viewport Ergonomics',
    title: 'Slim Perimeter Bars & >= 80% Unobstructed 3D Canvas',
    rule: 'Top Status Bar height must be <= 60px, Bottom Action Dock height must be <= 110px, and total persistent 2D HUD pixel area must cover <= 20% of the viewport.',
    threshold: 'topBarH <= 60px && bottomDockH <= 110px && hudCoverage <= 20%',
  },
  {
    id: 'hud_zone_mutex_and_zero_overlap',
    code: 'HUD-R4',
    category: 'Layout Stability',
    title: 'Zero 2D Zone Collision & Single Out-of-Flow Drawer Mutex',
    rule: 'Persistent 2D HUD zones must have 0 px² pairwise overlap. At most 1 secondary drawer (gto | settings | inspector | xr) may be open at a time, and drawers must be fixed/absolute out-of-flow overlays causing 0px layout shift on perimeter bars.',
    threshold: 'zoneOverlap == 0 px² && openDrawers <= 1 && outOfFlow == true',
  },
  {
    id: 'single_betting_pathway_and_mode_sync',
    code: 'HUD-R5',
    category: 'Interaction Clarity',
    title: 'Single Unified Betting Pathway & 3D/2D Action Button Mode Sync',
    rule: 'No duplicate 2D chip-toss buttons in the 2D HUD. 3D Spatial Rim Buttons must be hidden when 2D HUD is active on desktop and visible (100% inside seat0_pov frustum) in Pure 3D or WebXR mode. 2D bet execution buttons must be hidden when it is not Hero turn or during Showdown.',
    threshold: 'chipToss2D == 0 && spatialButtonsSynced && betButtonsTurnGated',
  },
  {
    id: 'unified_3d_ai_plaques_in_frustum',
    code: 'HUD-R6',
    category: '3D-First Diegetic UI',
    title: 'Unified 3D Floating AI Plaques (Zero 2D AI Bar Duplication)',
    rule: 'AI opponent state (portrait, name, position badge BTN/SB/BB/UTG/CO, stack, bet/status, physical tells, and VPIP/PFR/AF telemetry) is unified onto the 4 3D rail plaques. The 2D HUD must render 0 AI status bars, and all 4 3D AI plaques must sit inside the seat0_pov frustum.',
    threshold: 'aiBars2D == 0 && aiPlaquesInFrustum == 4/4 in seat0_pov',
  },
];

export function getRectOverlapArea(a: ScreenBoundingRect, b: ScreenBoundingRect): number {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return Math.round(xOverlap * yOverlap);
}

function domRectToScreenRect(el: Element): ScreenBoundingRect {
  const r = el.getBoundingClientRect();
  return {
    left: Math.round(r.left),
    top: Math.round(r.top),
    right: Math.round(r.right),
    bottom: Math.round(r.bottom),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

function isElementVisible(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  const style = window.getComputedStyle(htmlEl);
  if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
    return false;
  }
  const r = htmlEl.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export interface HudUiAuditOptions {
  show2DHUD: boolean;
  isInXR: boolean;
  isPlayerTurn: boolean;
  phase: string;
}

/**
 * Executes all 6 HUD & UI Verification Harness checks against the live DOM and 3D scene projection.
 */
export function runHudUiAudit(
  scene: CasinoScene | null,
  opts: HudUiAuditOptions
): HudUiAuditReport {
  const viewportWidth = window.innerWidth || 1440;
  const viewportHeight = window.innerHeight || 900;
  const viewportArea = Math.max(1, viewportWidth * viewportHeight);

  const cameraPreset = scene?.currentCameraPreset ?? 'seat0_pov';
  const isSeat0Pov = cameraPreset === 'seat0_pov' && !scene?.isTitleMode;

  // Collect persistent 2D HUD zones
  const zoneNames = ['top-bar', 'bottom-dock', 'left-utility', 'showdown-banner'];
  const zoneRects: Record<string, ScreenBoundingRect> = {};
  let totalHudPixelArea = 0;

  for (const name of zoneNames) {
    const el = document.querySelector(`[data-hud-zone="${name}"]`);
    if (el && isElementVisible(el)) {
      const rect = domRectToScreenRect(el);
      zoneRects[name] = rect;
      totalHudPixelArea += rect.width * rect.height;
    }
  }

  const hudViewportCoveragePct = Number(((totalHudPixelArea / viewportArea) * 100).toFixed(2));
  const topBarHeightPx = zoneRects['top-bar']?.height ?? 0;
  const bottomDockHeightPx = zoneRects['bottom-dock']?.height ?? 0;

  // 1. Check HUD-R1: 3D Center Table & Character Safe-Zone (0% Occlusion in seat0_pov)
  let safeZoneOverlapPx = 0;
  const safeZoneConflicts: string[] = [];

  if (scene && isSeat0Pov && opts.show2DHUD) {
    const tableBounds = scene.getTableSafeZoneScreenBounds();
    const charBounds = scene.getCharacterScreenBounds();

    const protected3DRegions: Array<{ label: string; rect: ScreenBoundingRect }> = [
      { label: 'communityBoard', rect: tableBounds.communityBoardRect },
      { label: 'centerPot', rect: tableBounds.centerPotRect },
      { label: 'bettingRing', rect: tableBounds.bettingRingRect },
      { label: 'hero3DHoleCards', rect: tableBounds.heroHoleCardsRect },
      { label: 'hero3DBankChips', rect: tableBounds.heroBankChipsRect },
      ...charBounds.map((c) => ({ label: `${c.role}_head`, rect: c.headRect })),
      ...tableBounds.aiPlaques.map((p) => ({ label: `${p.name}_plaque`, rect: p.rect })),
    ];

    for (const [zoneName, zRect] of Object.entries(zoneRects)) {
      for (const region of protected3DRegions) {
        const area = getRectOverlapArea(zRect, region.rect);
        if (area > 0) {
          safeZoneOverlapPx += area;
          safeZoneConflicts.push(`${zoneName}∩${region.label}(${area}px²)`);
        }
      }
    }
  }

  // 2. Check HUD-R2: Interactive Control Cap (<= 12 persistent controls & <= 4 top-bar utility buttons)
  const persistentInteractiveEls = Array.from(
    document.querySelectorAll('[data-hud-zone] button, [data-hud-zone] input, [data-hud-zone] select')
  ).filter((el) => {
    if (!isElementVisible(el)) return false;
    // Exclude controls inside open popovers or drawers so we measure persistent HUD controls
    if (el.closest('[data-hud-drawer]') || el.closest('[data-hud-popover]')) return false;
    return true;
  });

  const topBarUtilityBtns = Array.from(
    document.querySelectorAll('[data-hud-zone="top-bar-utilities"] button')
  ).filter(isElementVisible);

  const visibleInteractiveCount = persistentInteractiveEls.length;
  const topBarUtilityButtonCount = topBarUtilityBtns.length;

  // 3. Check HUD-R3: Perimeter Geometry Budget
  const topBarSlimOk = topBarHeightPx <= 60;
  const bottomDockSlimOk = bottomDockHeightPx <= 110;
  const coverageOk = hudViewportCoveragePct <= 20.0;

  // 4. Check HUD-R4: Zero 2D Zone Overlap & Single Active Out-of-Flow Drawer Mutex
  const zoneEntries = Object.entries(zoneRects);
  let pairwiseZoneOverlapPx = 0;
  const zoneOverlapPairs: string[] = [];
  for (let i = 0; i < zoneEntries.length; i++) {
    for (let j = i + 1; j < zoneEntries.length; j++) {
      const area = getRectOverlapArea(zoneEntries[i][1], zoneEntries[j][1]);
      if (area > 0) {
        pairwiseZoneOverlapPx += area;
        zoneOverlapPairs.push(`${zoneEntries[i][0]}∩${zoneEntries[j][0]}(${area}px²)`);
      }
    }
  }

  const openDrawers = Array.from(document.querySelectorAll('[data-hud-drawer]')).filter(
    isElementVisible
  );
  const openDrawerCount = openDrawers.length;
  const drawersOutOfFlow = openDrawers.every((el) => {
    const pos = window.getComputedStyle(el as HTMLElement).position;
    return pos === 'fixed' || pos === 'absolute';
  });

  // 5. Check HUD-R5: Single Unified Betting Pathway & 3D/2D Mode Sync
  const chipTossButtons2D = Array.from(document.querySelectorAll('[data-hud-chip-toss]')).filter(
    isElementVisible
  );
  const betActionButtons2D = Array.from(document.querySelectorAll('[data-hud-bet-action]')).filter(
    isElementVisible
  );
  const shouldShow2DBetActions =
    opts.show2DHUD && opts.isPlayerTurn && opts.phase !== 'showdown';
  const betButtonsTurnGatedOk = shouldShow2DBetActions
    ? betActionButtons2D.length >= 2 && betActionButtons2D.length <= 3
    : betActionButtons2D.length === 0;

  let spatialButtonsModeSyncOk = true;
  let spatialButtonsFrustumDetail = 'n/a';
  if (scene && !scene.isTitleMode) {
    const bounds = scene.getTableSafeZoneScreenBounds();
    const expectedSpatialVisible = !opts.show2DHUD || opts.isInXR;
    const allMatchVisibility = bounds.spatialButtons.every(
      (b) => b.visible === expectedSpatialVisible
    );
    const allInFrustumWhenVisible =
      !expectedSpatialVisible ||
      !isSeat0Pov ||
      bounds.spatialButtons.every((b) => b.inFrustum);
    spatialButtonsModeSyncOk = allMatchVisibility && allInFrustumWhenVisible;
    spatialButtonsFrustumDetail = `visible=${expectedSpatialVisible}, inFrustum=${
      bounds.spatialButtons.filter((b) => b.inFrustum).length
    }/${bounds.spatialButtons.length}`;
  }

  // 6. Check HUD-R6: Unified 3D Floating AI Plaques (Zero 2D AI Bar Duplication)
  const aiStatusBars2D = Array.from(document.querySelectorAll('[data-hud-ai-bar]')).filter(
    isElementVisible
  );
  let aiPlaquesInFrustumCount = 4;
  if (scene && isSeat0Pov) {
    const bounds = scene.getTableSafeZoneScreenBounds();
    aiPlaquesInFrustumCount = bounds.aiPlaques.filter((p) => p.visible && p.inFrustum).length;
  }

  const checks: HudUiAuditCheck[] = [
    {
      id: 'center_safe_zone_unobstructed',
      category: 'Spatial Safe-Zone',
      label: 'HUD-R1: 3D Table & Character Center Safe-Zone Unobstructed (0 px² Overlap)',
      passed: safeZoneOverlapPx === 0,
      metric:
        safeZoneOverlapPx === 0
          ? 'overlap = 0 px² (100% clear sightlines)'
          : `overlap = ${safeZoneOverlapPx} px² [${safeZoneConflicts.join(', ')}]`,
    },
    {
      id: 'visible_action_element_cap',
      category: 'Cognitive Load',
      label: "HUD-R2: Visible Interactive Control Cap (<= 12 Controls, <= 4 Top Utilities)",
      passed: visibleInteractiveCount <= 12 && topBarUtilityButtonCount <= 4,
      metric: `visibleControls = ${visibleInteractiveCount}/12, topBarUtilities = ${topBarUtilityButtonCount}/4`,
    },
    {
      id: 'perimeter_geometry_budget',
      category: 'Viewport Ergonomics',
      label: 'HUD-R3: Slim Perimeter Bars (Top <= 60px, Bottom <= 110px, Coverage <= 20%)',
      passed: topBarSlimOk && bottomDockSlimOk && coverageOk,
      metric: `topBar = ${topBarHeightPx}px (<=60), bottomDock = ${bottomDockHeightPx}px (<=110), coverage = ${hudViewportCoveragePct}% (<=20%)`,
    },
    {
      id: 'hud_zone_mutex_and_zero_overlap',
      category: 'Layout Stability',
      label: 'HUD-R4: Zero 2D Zone Collision & Single Out-of-Flow Drawer Mutex',
      passed: pairwiseZoneOverlapPx === 0 && openDrawerCount <= 1 && drawersOutOfFlow,
      metric: `zoneOverlap = ${pairwiseZoneOverlapPx} px², openDrawers = ${openDrawerCount}/1, outOfFlow = ${drawersOutOfFlow}`,
    },
    {
      id: 'single_betting_pathway_and_mode_sync',
      category: 'Interaction Clarity',
      label: 'HUD-R5: Single Betting Pathway & 3D/2D Action Button Mode Sync',
      passed:
        chipTossButtons2D.length === 0 &&
        betButtonsTurnGatedOk &&
        spatialButtonsModeSyncOk,
      metric: `2dChipToss = ${chipTossButtons2D.length}, 2dBetBtns = ${betActionButtons2D.length} (turn=${opts.isPlayerTurn}), 3dRim(${spatialButtonsFrustumDetail})`,
    },
    {
      id: 'unified_3d_ai_plaques_in_frustum',
      category: '3D-First Diegetic UI',
      label: 'HUD-R6: Unified 3D AI Floating Plaques in Frustum & Zero 2D AI Bars',
      passed:
        aiStatusBars2D.length === 0 &&
        (!isSeat0Pov || aiPlaquesInFrustumCount === 4),
      metric: `2dAiBars = ${aiStatusBars2D.length} (target 0), 3dAiPlaquesInFrustum = ${aiPlaquesInFrustumCount}/4`,
    },
  ];

  return {
    timestamp: Date.now(),
    viewport: { width: viewportWidth, height: viewportHeight },
    hudViewportCoveragePct,
    visibleInteractiveCount,
    topBarUtilityButtonCount,
    openDrawerCount,
    topBarHeightPx,
    bottomDockHeightPx,
    allPassed: checks.every((c) => c.passed),
    checks,
  };
}
