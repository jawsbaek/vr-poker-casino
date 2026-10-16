/**
 * Automated 3D Visual Feedback & Dogfooding Loop for Monte Carlo VIP 3D/WebXR Poker
 *
 * Launches Vite + Headless Chrome (WebGL enabled), exercises all 7 deterministic 3D poker
 * scenarios across all 6 camera presets (in both Pure 3D Canvas and Composite 2D+3D HUD modes),
 * runs the Auto-Pilot Bot at 5x speed, verifies all 6 Programmatic 3D Spatial Assertions,
 * and saves high-DPI visual captures + JSON audit telemetry.
 *
 * Usage:
 *   npm run dogfood
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

/**
 * Starts a local Vite dev server in-process and resolves with { server, url }
 */
async function startViteServer() {
  const server = await createServer({
    root: ROOT_DIR,
    logLevel: 'error',
    server: {
      port: 4177,
      strictPort: false,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 4177;
  return { server, url: `http://localhost:${port}` };
}

const CAPTURE_MATRIX = [
  {
    scenario: 'preflop_deal',
    preset: 'seat0_pov',
    show2DHUD: false,
    debugOverlay: false,
    filename: '01_preflop_deal_seat0_pov_pure3d.png',
    description: 'Seat #0 POV (Pure 3D): Preflop deal, hole cards, 4 bank chip stacks, elevated 3D rim buttons, and 4 AI players + Dealer.',
  },
  {
    scenario: 'preflop_deal',
    preset: 'top_down',
    show2DHUD: false,
    debugOverlay: true,
    filename: '02_top_down_felt_and_rim_wireframes.png',
    description: 'Top-Down Orthographic-Style Angle with 3D Debug Colliders: Verifies all 4 AI avatars + Dealer sit cleanly outside the mahogany armrest rim and all chip stacks sit inside the emerald felt.',
  },
  {
    scenario: 'card_peel',
    preset: 'macro_cards_chips',
    show2DHUD: false,
    debugOverlay: false,
    filename: '03_macro_card_peel_and_chips.png',
    description: 'Macro Close-Up on Seat #0 Hole Cards & Bank Chips: Physical 3D corner peel revealing A♠ J♠, 4 denomination stacks, and 3D spatial rim buttons.',
  },
  {
    scenario: 'chip_drag_stage',
    preset: 'macro_cards_chips',
    show2DHUD: false,
    debugOverlay: false,
    filename: '04_chip_stage_golden_ring_and_badges.png',
    description: 'Macro Close-Up on Golden Betting Ring: $35 staged bet inside the glowing ring, on-felt 3D street bet badges, and CONFIRM BET / CLEAR CHIP spatial rim buttons.',
  },
  {
    scenario: 'bao_phone_scroll',
    preset: 'bao_tell_closeup',
    show2DHUD: false,
    debugOverlay: false,
    filename: '05_bao_phone_scroll_closeup.png',
    description: 'Bao (Seat #3) Close-Up — Scrolling Tell: 3D smartphone held in right hand with emissive Reels screen, cyan face glow, soda can, and 3D plaque with circular portrait medallion.',
  },
  {
    scenario: 'bao_phone_down_monster',
    preset: 'bao_tell_closeup',
    show2DHUD: false,
    debugOverlay: false,
    filename: '06_bao_phone_down_monster_closeup.png',
    description: 'Bao (Seat #3) Close-Up — Phone Down Monster Tell: Smartphone placed flat on the mahogany rail, forward alert posture, $45 street bet badge, and "🔥 PHONE DOWN!" badge.',
  },
  {
    scenario: 'bao_phone_down_monster',
    preset: 'viktor_marcus_rim',
    show2DHUD: false,
    debugOverlay: false,
    filename: '07_viktor_elena_marcus_rim_cast.png',
    description: 'Rim Cast View (Viktor, Elena, Marcus & Dealer): Sculpted 3D heads, hair, tailored attire, props, and circular Nano Banana portrait medallions on floating plaques.',
  },
  {
    scenario: 'all_in_runout',
    preset: 'dealer_pov',
    show2DHUD: false,
    debugOverlay: false,
    filename: '08_all_in_runout_dealer_pov.png',
    description: 'Dealer Shoe POV — Dramatic All-In Runout: Crimson/Gold spotlight choreography, face-up hole cards, Main + Side Pot stacks, and burn cards.',
  },
  {
    scenario: 'showdown_multiway',
    preset: 'seat0_pov',
    show2DHUD: true,
    debugOverlay: false,
    filename: '09_showdown_royal_flush_composite_hud.png',
    description: 'Showdown Multiway (Composite 2D + 3D HUD): Royal Flush winning 5-card levitation with gold emissive glow and celebratory gold spotlight choreography.',
  },
];

async function runDogfoodLoop() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('🚀 Starting Vite server for 3D Visual Dogfooding Loop...');
  const { server: viteServer, url } = await startViteServer();
  console.log(`✅ Vite server listening at ${url}`);

  const pageErrors = [];
  const consoleErrors = [];
  const auditResults = [];

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
    page.on('pageerror', (err) => {
      console.error('[PAGE ERROR]', err.stack || err.message);
      pageErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[CONSOLE ERROR]', msg.text());
        consoleErrors.push(msg.text());
      }
    });

    console.log('🌐 Navigating to 3D Poker table...');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(900); // Allow portrait textures & initial 3D frame to settle

    // 0. Capture Title Screen
    const titleShotPath = path.join(OUT_DIR, '00_title_screen_3d_orbit.png');
    await page.screenshot({ path: titleShotPath });
    console.log(`📸 Captured: ${path.basename(titleShotPath)}`);

    // 1. Iterate through the 7 deterministic scenarios & 6 camera presets
    for (const item of CAPTURE_MATRIX) {
      await page.evaluate(
        ({ scenario, preset, show2DHUD, debugOverlay }) => {
          const api = window.__POKER_DOGFOOD__;
          api.loadScenario(scenario);
          api.setCameraPreset(preset);
          api.setShow2DHUD(show2DHUD);
          api.setDebugOverlay(debugOverlay);
        },
        item
      );

      // Let parabolic card-pitch / chip-toss animations settle for crisp inspection
      await page.waitForTimeout(850);

      const audit = await page.evaluate(() => window.__POKER_DOGFOOD__.runSpatialAudit());
      auditResults.push({
        capture: item.filename,
        scenario: item.scenario,
        preset: item.preset,
        audit,
      });

      const shotPath = path.join(OUT_DIR, item.filename);
      await page.screenshot({ path: shotPath });
      console.log(
        `📸 Captured: ${item.filename} | Audit allPassed=${audit?.allPassed} | DrawCalls=${audit?.drawCalls} | Triangles=${audit?.triangles}`
      );

      if (!audit || !audit.allPassed) {
        const failed = audit?.checks?.filter((c) => !c.passed) || [];
        console.error(`❌ Spatial Audit Failed on ${item.filename}:`, failed);
      }
    }

    // 2. Open the in-app "3D Visual & Dogfood Inspector" drawer and capture it
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('bao_phone_down_monster');
      api.setCameraPreset('seat0_pov');
      api.setShow2DHUD(true);
      api.setDebugOverlay(false);
    });
    await page.waitForTimeout(500);
    const inspectorBtn = page.locator('[data-testid="hud-menu-trigger"]');
    if ((await inspectorBtn.count()) > 0) {
      await inspectorBtn.click();
      await page.waitForTimeout(450);
      const inspectorShotPath = path.join(OUT_DIR, '10_in_app_3d_dogfood_inspector_drawer.png');
      await page.screenshot({ path: inspectorShotPath });
      console.log(`📸 Captured: ${path.basename(inspectorShotPath)}`);
    }

    // 3. Exercise the Auto-Pilot Bot at 5x speed for live autonomous gameplay dogfooding
    console.log('🤖 Running Auto-Pilot Bot at 5x speed for 3.5 seconds of live gameplay...');
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('preflop_deal');
      api.setCameraPreset('seat0_pov');
      api.setAutoPilot(true, 5);
    });
    await page.waitForTimeout(3500);
    const postBotAudit = await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.setAutoPilot(false, 1);
      return {
        audit: api.runSpatialAudit(),
        state: api.getState(),
      };
    });
    console.log(
      `✅ Auto-Pilot Bot completed | Current Phase=${postBotAudit.state.table.phase} | Pot=$${postBotAudit.state.table.pot} | Audit allPassed=${postBotAudit.audit?.allPassed}`
    );

    const summaryReport = {
      timestamp: new Date().toISOString(),
      totalCaptures: CAPTURE_MATRIX.length + 2,
      allSpatialAuditsPassed:
        auditResults.every((r) => r.audit?.allPassed) && !!postBotAudit.audit?.allPassed,
      pageErrors,
      consoleErrors,
      postBotPhase: postBotAudit.state.table.phase,
      auditResults,
    };

    const reportPath = path.join(OUT_DIR, 'dogfood_audit_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(summaryReport, null, 2), 'utf-8');
    console.log(`📄 Saved full audit report to ${reportPath}`);

    if (!summaryReport.allSpatialAuditsPassed || pageErrors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }
}

runDogfoodLoop().catch((err) => {
  console.error('Dogfood loop error:', err);
  process.exit(1);
});
