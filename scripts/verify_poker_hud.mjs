import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Focused gameplay regressions. Run with: npm run verify:hud
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__POKER_DOGFOOD__);
  const scenario = async id => {
    await page.evaluate(id => {
      window.__POKER_DOGFOOD__.loadScenario(id);
      window.__POKER_DOGFOOD__.setCameraPreset('seat0_pov');
      window.__POKER_DOGFOOD__.setShow2DHUD(true);
    }, id);
    await page.waitForFunction(id => window.__POKER_DOGFOOD__.getState().activeScenario === id, id);
    await page.locator('[data-hud-zone="bottom-dock"]').waitFor();
  };
  const presets = () => page.locator('[data-testid^="bet-preset-"]').allTextContents();
  const amount = () => page.getByRole('slider', { name: 'Bet or raise total' }).inputValue();
  await scenario('preflop_deal');
  assert.deepEqual(await presets(), ['Min', '2.5x', '3x', '4x', 'Pot', 'Max']);
  await page.waitForTimeout(500); // Let the camera and billboard transforms settle.
  const plaques = await page.evaluate(() => window.__POKER_DOGFOOD__.getTableSafeZoneScreenBounds().aiPlaques);
  assert.equal(plaques.length, 4);
  assert.ok(plaques.every(p => p.visible && p.inFrustum));
  for (const p of plaques.filter(p => [1, 4].includes(p.seatIndex))) {
    assert.ok(Math.min(p.rect.left, 1280 - p.rect.right) >= 98, `${p.name} edge clearance`);
  }
  const preflopState = await page.evaluate(() => window.__POKER_DOGFOOD__.getState());
  const hudAudit = await page.evaluate(() => window.__POKER_DOGFOOD__.runHudUiAudit());
  assert.ok(hudAudit.allPassed, JSON.stringify(hudAudit.checks.filter(c => !c.passed)));

  await scenario('card_peel');
  assert.deepEqual(await presets(), ['Min', '33%', '50%', '75%', 'Pot', 'Max']);
  await page.getByTestId('bet-preset-pot').click();
  assert.equal(await amount(), '115'); // $10 + ($95 pot + $10 call).
  await page.keyboard.press('3');
  assert.equal(await amount(), '63'); // $10 + 50% of $105, rounded to a whole chip.
  const cards = await page.getByTestId('hud-community-strip').locator('span').evaluateAll(els =>
    els.map(el => ({ text: el.textContent, color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }))
  );
  assert.deepEqual(cards.map(c => c.text), ['K♠', 'Q♦', '10♣', '·', '·']);
  assert.ok(cards.slice(0, 3).every(c => c.background === 'rgb(255, 255, 255)'));
  assert.equal(new Set(cards.slice(0, 3).map(c => c.color)).size, 3);
  await page.getByTestId('hud-unit-toggle').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.getByTestId('hud-unit-toggle').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('[data-hud-zone="top-bar"]').textContent(), /Pot 47.5 BB/);
  await page.getByTestId('hud-settings-trigger').click();
  assert.equal(await page.getByTestId('toggle-bb-display').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => window.__POKER_DOGFOOD__.getState().players[0].folded), false);
  await page.getByTestId('toggle-bb-display').click();
  await page.getByTestId('toggle-four-color-deck').click();
  const twoColor = await page.getByTestId('hud-community-strip').locator('span').evaluateAll(els => els.slice(0, 3).map(el => getComputedStyle(el).color));
  assert.equal(twoColor[0], twoColor[2]);
  assert.notEqual(twoColor[0], twoColor[1]);
  await page.getByTestId('toggle-four-color-deck').click();
  await page.getByTestId('hud-settings-trigger').click();
  await page.screenshot({ path: '/tmp/poker-hud-desktop.png' });

  for (const input of ['click', 'keyboard', 'slider']) {
    await scenario('chip_drag_stage');
    assert.ok(await page.evaluate(() => window.__POKER_DOGFOOD__.getState().table.stagedBet > 0));
    await page.waitForFunction(() => document.querySelector('input[aria-label="Bet or raise total"]')?.value === '35');
    if (input === 'click') await page.getByTestId('bet-preset-pot').click();
    else if (input === 'keyboard') {
      await page.locator('body').click({ position: { x: 10, y: 120 } });
      await page.keyboard.press('5');
    } else await page.getByRole('slider', { name: 'Bet or raise total' }).fill('100');
    await page.waitForFunction(() => window.__POKER_DOGFOOD__.getState().table.stagedBet === 0).catch(error => {
      throw new Error(`Staged chips were not cleared by ${input}`, { cause: error });
    });
    assert.equal(await amount(), input === 'slider' ? '100' : '98'); // $12 + ($74 + $12).
  }
  await scenario('preflop_deal');
  await page.getByTestId('bet-preset-pot').focus();
  await page.keyboard.press('Space');
  assert.equal(await amount(), '17');
  assert.equal(await page.getByTestId('action-peek').textContent(), 'Peek');
  await page.locator('body').click({ position: { x: 10, y: 120 } });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('[data-testid="action-peek"]')?.querySelector('.lucide-eye'));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => document.querySelector('[data-testid="action-peek"]')?.querySelector('.lucide-eye-off'));
  await page.keyboard.up('Space');

  await scenario('showdown_multiway');
  assert.match(await page.getByTestId('showdown-dock-summary').textContent(), /You Win!/);
  assert.equal(await page.locator('[data-hud-bet-action]').count(), 0);
  assert.equal(await page.locator('[data-ux-component="gto-telemetry-strip"]').count(), 0);
  assert.equal(await page.getByTestId('hud-community-strip').locator('span').count(), 5);
  await page.screenshot({ path: '/tmp/poker-hud-showdown.png' });

  // Render the actual HUD separately for states the deterministic 3D scenarios do not cover.
  const fixture = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  fixture.on('pageerror', error => errors.push(error.message));
  await fixture.route('**/hud-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="fixture"></div></body></html>' }));
  await fixture.goto(`${url}/hud-fixture`);
  await fixture.evaluate(async state => {
    const RefreshRuntime = (await import('/@react-refresh')).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { PokerHUD } = await import('/src/components/PokerHUD.tsx');
    const { computeGTOAnalysis } = await import('/src/logic/gtoEngine.ts');
    await import('/src/index.css');
    const root = createRoot(document.getElementById('fixture'));
    window.hudActions = [];
    window.renderHud = (tableChanges = {}, playerChanges = {}, extraProps = {}) => {
      const table = { ...state.table, ...tableChanges };
      const players = state.players.map(p => p.isHuman ? { ...p, ...playerChanges } : p);
      const props = {
        table, players, humanPlayer: players[0], isTitleMode: false, show2DHUD: true,
        stats: {}, gtoAnalysis: computeGTOAnalysis(table, players), solverMode: 'pure_gto',
        chatMessages: [], decisionHistory: [], lastDecisionRecord: null, cameraPreset: 'seat0_pov',
        onAction: action => window.hudActions.push(action), ...extraProps,
      };
      root.render(React.createElement(PokerHUD, props));
    };
    window.renderHud({ currentHighBet: 2, minRaise: 2, pot: 3 }, { currentBet: 1, chips: 199 });
  }, preflopState);
  await fixture.getByTestId('bet-preset-22x').waitFor();
  assert.deepEqual(await fixture.locator('[data-testid^="bet-preset-"]').allTextContents(), ['Min', '2.2x', '2.5x', '3x', 'Pot', 'Max']);
  for (const [key, expected] of [['1', '4'], ['2', '4'], ['3', '5'], ['4', '6'], ['5', '6']]) {
    await fixture.keyboard.press(key);
    assert.equal(await fixture.getByRole('slider', { name: 'Bet or raise total' }).inputValue(), expected);
  }
  await fixture.keyboard.press('r');
  await fixture.keyboard.press('b');
  await fixture.keyboard.press('c');
  await fixture.keyboard.press('f');
  assert.deepEqual(await fixture.evaluate(() => window.hudActions), [
    { type: 'raise', amount: 6 }, { type: 'raise', amount: 6 }, { type: 'call' }, { type: 'fold' },
  ]);
  await fixture.evaluate(() => { window.hudActions = []; window.renderHud({ currentHighBet: 20 }, { currentBet: 0, chips: 5 }); });
  await fixture.getByTestId('action-raise').waitFor({ state: 'detached' });
  await fixture.keyboard.press('r');
  await fixture.keyboard.press('b');
  assert.deepEqual(await fixture.evaluate(() => window.hudActions), []);
  await fixture.keyboard.press('c');
  assert.deepEqual(await fixture.evaluate(() => window.hudActions), [{ type: 'call' }]);
  await fixture.evaluate(() => { window.hudActions = []; window.renderHud({ phase: 'flop', currentHighBet: 0 }, { currentBet: 0 }); });
  await fixture.getByTestId('action-check-call').getByText('Check', { exact: true }).waitFor();
  await fixture.keyboard.press('c');
  assert.deepEqual(await fixture.evaluate(() => window.hudActions), [{ type: 'check' }]);
  await fixture.setViewportSize({ width: 390, height: 844 });
  const clippedControls = await fixture.locator('[data-hud-zone="bottom-dock"] button, [data-hud-zone="bottom-dock"] [role="button"], [data-hud-zone="bottom-dock"] input').evaluateAll(els =>
    els.filter(el => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; }).map(el => el.textContent)
  );
  assert.deepEqual(clippedControls, [], 'Betting controls fit the mobile viewport');
  await fixture.screenshot({ path: '/tmp/poker-hud-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: plaque clearance, street presets, pot-after-call math, staged-chip selection, card colors, unit toggles, keyboard focus/actions, short stacks, and showdown.');
} finally {
  await browser?.close();
  await server.close();
}
