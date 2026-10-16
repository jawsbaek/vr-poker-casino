/**
 * UX / UI & 3D Spatial Graphic Guideline Specification
 * Single Source of Truth for runtime visual styling, 3D human-presence realism,
 * sightline protection, action element minimalism, and automated verification thresholds.
 */

export interface UXGuidelineTokens {
  palette: {
    /** Deep Obsidian Matte surface for 2D HUD & 3D spatial plaques */
    surfaceObsidian: string;
    surfaceObsidianGlass: string;
    surfaceElevated: string;
    /** Warm Ivory primary typography */
    textPrimaryIvory: string;
    /** Muted Slate secondary metadata typography */
    textSecondarySlate: string;
    /** Brushed Champagne Gold single accent */
    accentGold: string;
    accentGoldLight: string;
    accentGoldBorder: string;
    accentGoldGlow: string;
  };
  budgets: {
    /** Maximum WebGL draw calls per frame across all camera views */
    maxDrawCalls: number;
    /** Maximum visible interactive buttons on the primary gameplay HUD (outside menu drawer) */
    maxVisiblePrimaryButtons: number;
    /** Maximum allowed 2D HUD overlap ratio (0 = 0% overlap) with 3D character head/torso sightlines */
    maxCharacterSightlineOcclusionRatio: number;
    /** Minimum character anatomical rig parts (sculpted head, eyes with eyelids/cornea, articulated hands/fingers) */
    minCharacterAnatomicalParts: number;
    /** Strict mutual exclusivity between 2D DOM HUD and 3D Spatial Rim HUD buttons (never rendered simultaneously) */
    enforce2D3DHudMutualExclusivity: boolean;
  };
}

export const UX_GUIDELINE_SPEC: UXGuidelineTokens = {
  palette: {
    surfaceObsidian: '#090c12',
    surfaceObsidianGlass: 'rgba(9, 12, 18, 0.88)',
    surfaceElevated: 'rgba(15, 20, 28, 0.92)',
    textPrimaryIvory: '#f8fafc',
    textSecondarySlate: '#94a3b8',
    accentGold: '#d4af37',
    accentGoldLight: '#f3e5ab',
    accentGoldBorder: 'rgba(212, 175, 55, 0.42)',
    accentGoldGlow: 'rgba(212, 175, 55, 0.18)',
  },
  budgets: {
    maxDrawCalls: 450,
    maxVisiblePrimaryButtons: 6,
    maxCharacterSightlineOcclusionRatio: 0,
    minCharacterAnatomicalParts: 14,
    enforce2D3DHudMutualExclusivity: true,
  },
};
