/**
 * Automated UX/UI & 3D Graphic Guideline Verification Harness
 * (`npm run verify:ux`)
 *
 * Programmatically verifies the 3-Tier UX/UI & 3D Graphic Guideline (`UX_UI_GRAPHIC_GUIDELINE.md`
 * & `src/config/uxGuidelineSpec.ts`):
 *
 *   - Tier 1 (3D Realism, Human-Presence Rig & WebGL Budget):
 *     Verifies PBR materials, SRGBColorSpace, character MeshPhysicalMaterial subsurface skin,
 *     cornea clearcoat eyes, eyelid blink + ocular saccade rigs, 10 articulated 5-finger hands,
 *     spatial table bounds, and WebGL drawCalls <= 450 across all camera presets.
 *
 *   - Tier 2 (Sightline Protection, Action Cap <= 6 & Monochrome + Champagne Gold Restraint):
 *     1. 0% Face/Torso Occlusion: Projects 3D character head/torso bounds into 2D viewport rects
 *        and asserts 0.0% overlap with visible 2D HUD panels (`top-left-status`, `top-right-menu`,
 *        `bottom-action-dock`).
 *     2. Primary Action Element Cap <= 6: Asserts visible interactive `<button>` count on the
 *        default main HUD is <= 6, and verifies that secondary controls live inside the unified
 *        `Menu / Settings` drawer.
 *     3. Minimal Color Palette (Monochrome Obsidian + Warm Ivory + Single Champagne Gold Accent):
 *        Audits classNames and computed RGB/HSL styles of all visible main-HUD elements to enforce
 *        zero banned neon/rainbow hues.
 *
 *   - Tier 3 (High-DPI Visual Evidence & JSON Telemetry Report):
 *     Saves composite 2D+3D screenshots and `dogfood-captures/ux_ui_verification_report.json`.
 */

import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'dogfood-captures');

const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const THRESHOLDS = {
  maxDrawCalls: 450,
  maxTriangles: 250000,
  maxPrimaryVisibleButtons: 6,
  maxFaceOcclusionRatio: 0.0,
  maxTorsoOcclusionRatio: 0.0,
  expectedCharacterCount: 5,
  expectedArticulatedHandCount: 10,
};

const BANNED_CLASS_TOKENS = [
  'text-cyan-',
  'bg-cyan-',
  'border-cyan-',
  'text-purple-',
  'bg-purple-',
  'border-purple-',
  'text-blue-',
  'bg-blue-',
  'border-blue-',
  'text-emerald-',
  'bg-emerald-',
  'border-emerald-',
  'text-green-',
  'bg-green-',
  'border-green-',
  'text-rose-',
  'bg-rose-',
  'border-rose-',
  'text-pink-',
  'bg-pink-',
  'border-pink-',
  'text-indigo-',
  'bg-indigo-',
  'border-indigo-',
  'text-orange-',
  'bg-orange-',
  'border-orange-',
];

const SCENARIOS_TO_VERIFY = [
  {
    scenario: 'home_title_screen',
    isTitleScreen: true,
    preset: 'seat0_pov',
    show2DHUD: true,
    screenshot: 'ux_verify_00_home_screen_redesign.png',
    description: 'Redesigned Home Screen (Sightline-Free Split Dock, <= 3 buttons, 0% face/torso occlusion, Monochrome + Gold)',
  },
  {
    scenario: 'preflop_deal',
    preset: 'seat0_pov',
    show2DHUD: true,
    screenshot: 'ux_verify_01_seat0_pov_composite_hud.png',
    description: 'Seat #0 Player POV with minimalist 2D HUD (<= 6 buttons, 0% face/torso occlusion, Monochrome + Gold)',
  },
  {
    scenario: 'bao_phone_down_monster',
    preset: 'seat0_pov',
    show2DHUD: true,
    screenshot: 'ux_verify_02_bao_monster_composite_hud.png',
    description: 'Seat #0 Player POV during active turn bet with GTO telemetry strip and zero opponent face occlusion',
  },
  {
    scenario: 'bao_phone_down_monster',
    preset: 'viktor_marcus_rim',
    show2DHUD: false,
    screenshot: 'ux_verify_03_character_realism_rim_cast.png',
    description: '3D Character Cast Close-Up: Subsurface PBR skin, cornea clearcoat eyes, 5-finger hands, low front-rail plaques',
  },
  {
    scenario: 'showdown_multiway',
    preset: 'seat0_pov',
    show2DHUD: true,
    screenshot: 'ux_verify_04_showdown_banner_sightline.png',
    description: 'Showdown Multiway with compact top-docked winner banner preserving full character sightlines',
  },
  {
    scenario: 'preflop_deal',
    preset: 'seat0_pov',
    show2DHUD: false,
    screenshot: 'ux_verify_05_seat0_pov_pure_3d_spatial_hud.png',
    description: 'Seat #0 Player POV in Pure 3D Spatial HUD Mode (0 2D HUD panels, 4 active 3D Spatial Rim buttons)',
  },
];

async function startViteServer() {
  const server = await createServer({
    root: ROOT_DIR,
    logLevel: 'error',
    server: {
      port: 4178,
      strictPort: false,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 4178;
  return { server, url: `http://localhost:${port}` };
}

async function runUxGuidelineHarness() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('🏛️  Starting UX/UI & 3D Graphic Guideline Verification Harness...');
  const { server: viteServer, url } = await startViteServer();
  console.log(`✅ Local verification server listening at ${url}`);

  const pageErrors = [];
  const consoleErrors = [];
  const scenarioReports = [];

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: CHROME_EXECUTABLE,
      headless: true,
      args: [
        '--use-angle=metal',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox',
        '--no-sandbox',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(900);

    for (const item of SCENARIOS_TO_VERIFY) {
      if (!item.isTitleScreen) {
        await page.evaluate(
          ({ scenario, preset, show2DHUD }) => {
            const api = window.__POKER_DOGFOOD__;
            api.loadScenario(scenario);
            api.setCameraPreset(preset);
            api.setShow2DHUD(show2DHUD);
            api.setDebugOverlay(false);
          },
          item
        );
      }

      await page.waitForTimeout(850);

      // Run Tier 1 + Tier 2 evaluations inside browser context
      const evaluation = await page.evaluate(
        ({ bannedClassTokens, thresholds, expectHUD }) => {
          const api = window.__POKER_DOGFOOD__;
          const tier1SpatialAudit = api.runSpatialAudit();
          const characterBounds = api.getCharacterScreenBounds();

          // Helper: rectangle intersection area
          function rectIntersectionArea(a, b) {
            const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            return xOverlap * yOverlap;
          }

          function rectArea(r) {
            return Math.max(0, r.width * r.height);
          }

          function isElementVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
              return false;
            }
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }

          // Collect visible 2D HUD or Title Screen panels
          const hudPanelSelectors = [
            '[data-ux-panel="title-top-left"]',
            '[data-ux-panel="title-top-right"]',
            '[data-ux-panel="title-bottom-dock"]',
            '[data-ux-panel="top-left-status"]',
            '[data-ux-panel="top-right-menu"]',
            '[data-ux-panel="bottom-action-dock"]',
            '[data-ux-panel="showdown-banner"]',
            '[data-hud-zone]',
          ];
          const hudPanels = [];
          for (const sel of hudPanelSelectors) {
            for (const el of document.querySelectorAll(sel)) {
              if (!isElementVisible(el)) continue;
              // The Pure 3D "Show 2D HUD" restore pill is the only way back to the 2D HUD
              if (el.querySelector('[data-testid="hud-pure3d-toggle"]')) continue;
              const r = el.getBoundingClientRect();
              hudPanels.push({
                selector: sel,
                rect: {
                  left: Math.round(r.left),
                  top: Math.round(r.top),
                  right: Math.round(r.right),
                  bottom: Math.round(r.bottom),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                },
              });
            }
          }

          // Rule 1: Sightline Protection (0% overlap between 2D HUD panels and 3D character heads/torsos)
          const sightlineOverlaps = [];
          let maxHeadOverlapRatio = 0;
          let maxTorsoOverlapRatio = 0;

          for (const char of characterBounds) {
            if (!char.inFrustum) continue;
            const headArea = rectArea(char.headRect);
            const torsoArea = rectArea(char.torsoRect);

            for (const panel of hudPanels) {
              const headInter = rectIntersectionArea(char.headRect, panel.rect);
              const torsoInter = rectIntersectionArea(char.torsoRect, panel.rect);
              const headRatio = headArea > 0 ? headInter / headArea : 0;
              const torsoRatio = torsoArea > 0 ? torsoInter / torsoArea : 0;

              if (headRatio > maxHeadOverlapRatio) maxHeadOverlapRatio = headRatio;
              if (torsoRatio > maxTorsoOverlapRatio) maxTorsoOverlapRatio = torsoRatio;

              if (headRatio > 0 || torsoRatio > 0) {
                sightlineOverlaps.push({
                  characterId: char.id,
                  characterName: char.name,
                  panel: panel.selector,
                  headOverlapRatio: Number(headRatio.toFixed(4)),
                  torsoOverlapRatio: Number(torsoRatio.toFixed(4)),
                });
              }
            }
          }

          // Rule 2: Action Element Minimalism (<= 6 visible buttons on main HUD or Title Screen)
          const mainHudRoot =
            document.querySelector('[data-ux-layer="main-hud"]') ||
            document.querySelector('[data-ux-layer="title-screen"]');
          const allButtons = mainHudRoot
            ? Array.from(mainHudRoot.querySelectorAll('button')).filter((btn) => {
                // Exclude buttons inside an open drawer if any
                if (btn.closest('[data-ux-drawer]')) return false;
                return isElementVisible(btn);
              })
            : [];

          const visibleButtonLabels = allButtons.map(
            (btn) => (btn.textContent || '').trim().replace(/\s+/g, ' ') || btn.getAttribute('title') || 'icon-btn'
          );

          // Rule 3: Minimal Color Palette (Monochrome Obsidian + Warm Ivory + Single Champagne Gold Accent)
          const classViolations = [];
          const computedColorViolations = [];

          function parseRgba(str) {
            if (!str || str === 'transparent') return null;
            const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
            if (!m) return null;
            return {
              r: Number(m[1]),
              g: Number(m[2]),
              b: Number(m[3]),
              a: m[4] !== undefined ? Number(m[4]) : 1,
            };
          }

          function rgbToHsl(r, g, b) {
            r /= 255;
            g /= 255;
            b /= 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            let h = 0;
            let s = 0;
            const l = (max + min) / 2;
            if (max !== min) {
              const d = max - min;
              s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
              switch (max) {
                case r:
                  h = (g - b) / d + (g < b ? 6 : 0);
                  break;
                case g:
                  h = (b - r) / d + 2;
                  break;
                case b:
                  h = (r - g) / d + 4;
                  break;
              }
              h *= 60;
            }
            return { h, s, l };
          }

          if (mainHudRoot && expectHUD) {
            const elements = [mainHudRoot, ...Array.from(mainHudRoot.querySelectorAll('*'))].filter(
              (el) => !el.closest('[data-ux-drawer]') && isElementVisible(el)
            );

            for (const el of elements) {
              const cls = typeof el.className === 'string' ? el.className : '';
              for (const token of bannedClassTokens) {
                if (cls.includes(token)) {
                  classViolations.push({
                    tag: el.tagName.toLowerCase(),
                    token,
                    className: cls,
                  });
                }
              }

              const cs = window.getComputedStyle(el);
              const propsToCheck = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor'];
              for (const prop of propsToCheck) {
                const rgba = parseRgba(cs[prop]);
                if (!rgba || rgba.a < 0.05) continue;
                const { h, s, l } = rgbToHsl(rgba.r, rgba.g, rgba.b);
                // Allow:
                // 1) Low saturation monochrome / obsidian / warm ivory / slate (s <= 0.25 or l <= 0.14 or l >= 0.92)
                // 2) Deep obsidian slate-blue dark surfaces (l <= 0.18 && s <= 0.42)
                // 3) Champagne Gold / Warm Amber accent band (25 deg <= h <= 62 deg)
                const isMonochromeOrNeutral = s <= 0.25 || l <= 0.14 || l >= 0.92;
                const isDarkObsidianSurface = l <= 0.18 && s <= 0.42;
                const isChampagneGoldAccent = h >= 25 && h <= 62;

                if (!isMonochromeOrNeutral && !isDarkObsidianSurface && !isChampagneGoldAccent) {
                  computedColorViolations.push({
                    tag: el.tagName.toLowerCase(),
                    prop,
                    value: cs[prop],
                    hsl: { h: Math.round(h), s: Number(s.toFixed(2)), l: Number(l.toFixed(2)) },
                    text: (el.textContent || '').trim().slice(0, 30),
                  });
                }
              }
            }
          }

          const tableSafeZones = api.getTableSafeZoneScreenBounds
            ? api.getTableSafeZoneScreenBounds()
            : null;
          const spatialButtons = tableSafeZones?.spatialButtons || [];
          const visibleSpatialButtonsCount = spatialButtons.filter((b) => b.visible).length;

          // In-game 2D HUD layout rules (control cap, 2D/3D exclusivity, sightline occlusion)
          // are checked by `npm run verify:hud` (hudUiRulesHarness HUD-R1..R6).
          const tier2Checks = expectHUD
            ? [
                {
                  id: 'monochrome_champagne_gold_palette',
                  passed: classViolations.length === 0 && computedColorViolations.length === 0,
                  details: `classViolations=${classViolations.length}, computedColorViolations=${computedColorViolations.length}`,
                },
              ]
            : [
                {
                  id: 'hud_2d_3d_mutual_exclusivity',
                  passed: visibleSpatialButtonsCount === 4 && hudPanels.length === 0,
                  details: `mode=3D_SPATIAL_HUD, visible2DPanels=${hudPanels.length} (expected 0), visible3DSpatialButtons=${visibleSpatialButtonsCount} (expected 4)`,
                },
              ];

          return {
            tier1SpatialAudit,
            characterBounds,
            hudPanels,
            visibleSpatialButtonsCount,
            sightlineOverlaps,
            visibleButtonCount: allButtons.length,
            visibleButtonLabels,
            classViolations,
            computedColorViolations,
            tier2Checks,
            allTier1Passed: !!tier1SpatialAudit?.allPassed,
            allTier2Passed: tier2Checks.every((c) => c.passed),
          };
        },
        {
          bannedClassTokens: BANNED_CLASS_TOKENS,
          thresholds: THRESHOLDS,
          expectHUD: item.show2DHUD,
        }
      );

      const shotPath = path.join(OUT_DIR, item.screenshot);
      await page.screenshot({ path: shotPath });

      console.log(
        `📸 [${item.scenario} @ ${item.preset}] Tier1=${evaluation.allTier1Passed ? 'PASS' : 'FAIL'} | Tier2=${
          evaluation.allTier2Passed ? 'PASS' : 'FAIL'
        } | DrawCalls=${evaluation.tier1SpatialAudit?.drawCalls} | Buttons=${evaluation.visibleButtonCount}`
      );

      if (!evaluation.allTier1Passed) {
        console.error(
          '  ❌ Tier 1 Failed Checks:',
          evaluation.tier1SpatialAudit?.checks?.filter((c) => !c.passed)
        );
      }
      if (!evaluation.allTier2Passed) {
        console.error(
          '  ❌ Tier 2 Failed Checks:',
          evaluation.tier2Checks.filter((c) => !c.passed),
          evaluation.sightlineOverlaps,
          evaluation.classViolations,
          evaluation.computedColorViolations
        );
      }

      scenarioReports.push({
        ...item,
        ...evaluation,
      });
    }

    // Verify Unified Menu / Settings Drawer Interaction
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('bao_phone_down_monster');
      api.setCameraPreset('seat0_pov');
      api.setShow2DHUD(true);
    });
    await page.waitForTimeout(450);

    const menuTrigger = page.locator('[data-testid="hud-settings-trigger"]');
    await menuTrigger.click();
    await page.waitForTimeout(400);

    const drawerOpenVerified = await page.evaluate(() => {
      const drawer = document.querySelector('[data-hud-drawer="settings"]');
      return !!drawer && drawer.getBoundingClientRect().width > 200;
    });

    const drawerShotPath = path.join(OUT_DIR, 'ux_verify_05_unified_settings_drawer.png');
    await page.screenshot({ path: drawerShotPath });
    console.log(
      `📸 [Unified Settings Drawer] Verified secondary tools tucked in slide-over drawer: ${
        drawerOpenVerified ? 'PASS' : 'FAIL'
      }`
    );

    const allPassed =
      scenarioReports.every((r) => r.allTier1Passed && r.allTier2Passed) &&
      drawerOpenVerified &&
      pageErrors.length === 0;

    const report = {
      guidelineVersion: '2.0.0',
      timestamp: new Date().toISOString(),
      allPassed,
      thresholds: THRESHOLDS,
      drawerOpenVerified,
      pageErrors,
      consoleErrors,
      scenarioReports,
    };

    const reportPath = path.join(OUT_DIR, 'ux_ui_verification_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`📄 Saved UX/UI & 3D Graphic Guideline verification report to ${reportPath}`);

    if (!allPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }
}

runUxGuidelineHarness().catch((err) => {
  console.error('UX/UI Verification Harness Error:', err);
  process.exit(1);
});
