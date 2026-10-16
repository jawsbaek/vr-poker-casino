/**
 * Automated Demo Video Generator for Monte Carlo VIP 3D/WebXR Poker Hackathon Submission
 *
 * Produces a 1920x1080 H.264 MP4 (`demo_video.mp4`) with full synchronized 48kHz stereo audio:
 * - Procedural Monte Carlo Lounge Jazz (0-36s) & High-Stakes Tension (36-74s) soundtrack
 * - Physical Casino Foley SFX (riffle shuffle, card slide/flip, clay chip clinks, burn taps,
 *   Bao's tinny smartphone reel audio leak, and Royal Flush win fanfare)
 * - Multi-Persona Spoken English Voice Lines (VIP Croupier, Viktor, Elena, Bao, Marcus)
 * - Broadcast-style Bilingual (EN + KR) Subtitle & Active Speaker Overlay
 */

import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TMP_DIR = path.join(ROOT_DIR, 'dogfood-captures', 'video-tmp');
const OUTPUT_MP4 = path.join(ROOT_DIR, 'demo_video.mp4');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SAMPLE_RATE = 48000;

/**
 * Starts Vite dev server
 */
async function startViteServer() {
  const server = await createServer({
    root: ROOT_DIR,
    logLevel: 'error',
    server: {
      port: 4188,
      strictPort: false,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 4188;
  return { server, url: `http://localhost:${port}` };
}

/**
 * Generates a spoken WAV file at 48kHz mono float32 using macOS `say` + `ffmpeg`
 */
function synthesizeVoiceClip(id, voice, rateWpm, text) {
  const aiffPath = path.join(TMP_DIR, `${id}.aiff`);
  const rawPath = path.join(TMP_DIR, `${id}.f32le`);
  execFileSync('/usr/bin/say', ['-v', voice, '-r', String(rateWpm), '-o', aiffPath, text]);
  execFileSync('/opt/homebrew/bin/ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    aiffPath,
    '-f',
    'f32le',
    '-acodec',
    'pcm_f32le',
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    rawPath,
  ]);
  const buf = fs.readFileSync(rawPath);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

/**
 * Builds the complete 48kHz stereo soundtrack + Foley SFX + Voice lines matching real recorded timestamps
 */
function buildMasterAudioWav(totalDurationSec, timelineEvents, voiceClips) {
  const totalSamples = Math.ceil(totalDurationSec * SAMPLE_RATE);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const addMono = (startSec, samples, gainL, gainR = gainL) => {
    const startIdx = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
    for (let i = 0; i < samples.length && startIdx + i < totalSamples; i++) {
      left[startIdx + i] += samples[i] * gainL;
      right[startIdx + i] += samples[i] * gainR;
    }
  };

  const addTone = (startSec, durSec, freqStart, freqEnd, type, gainL, gainR = gainL) => {
    const startIdx = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
    const len = Math.floor(durSec * SAMPLE_RATE);
    let phase = 0;
    for (let i = 0; i < len && startIdx + i < totalSamples; i++) {
      const t = i / len;
      const freq = freqStart * Math.pow(freqEnd / freqStart, t);
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;
      let sample = 0;
      if (type === 'sine') sample = Math.sin(phase);
      else if (type === 'triangle') sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
      else if (type === 'sawtooth') sample = 2 * ((phase / (2 * Math.PI)) - Math.floor(0.5 + phase / (2 * Math.PI)));
      else if (type === 'square') sample = Math.sin(phase) >= 0 ? 0.8 : -0.8;

      const env = Math.min(1, i / (0.01 * SAMPLE_RATE)) * Math.exp(-3.8 * t);
      left[startIdx + i] += sample * env * gainL;
      right[startIdx + i] += sample * env * gainR;
    }
  };

  const playRiffleShuffle = (atSec) => {
    for (let i = 0; i < 14; i++) {
      const offset = atSec + i * 0.024;
      addTone(offset, 0.028, 520 + i * 28, 140, 'triangle', 0.14, 0.14);
    }
  };

  const playCardSlide = (atSec, pan = 0) => {
    const dur = 0.16;
    const len = Math.floor(dur * SAMPLE_RATE);
    const buf = new Float32Array(len);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const white = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.4));
      prev = prev * 0.72 + white * 0.28;
      buf[i] = prev * 0.35;
    }
    addMono(atSec, buf, 0.22 * (1 - pan * 0.3), 0.22 * (1 + pan * 0.3));
  };

  const playCardFlip = (atSec) => {
    addTone(atSec, 0.085, 800, 160, 'sine', 0.22, 0.22);
  };

  const playChipClink = (atSec, count = 2, pan = 0) => {
    for (let c = 0; c < count; c++) {
      const offset = atSec + c * 0.042;
      const freqs = [2850 + c * 190, 3720 + c * 230, 5280];
      for (const f of freqs) {
        addTone(
          offset,
          0.055,
          f,
          f * 0.96,
          'triangle',
          0.075 * (1 - pan * 0.3),
          0.075 * (1 + pan * 0.3)
        );
      }
    }
  };

  const playKnock = (atSec) => {
    addTone(atSec, 0.085, 145, 58, 'sine', 0.32, 0.32);
    addTone(atSec + 0.12, 0.085, 140, 55, 'sine', 0.3, 0.3);
  };

  const playBurnTap = (atSec) => {
    addTone(atSec, 0.06, 195, 75, 'sine', 0.24, 0.24);
    addTone(atSec + 0.085, 0.06, 190, 72, 'sine', 0.22, 0.22);
  };

  const playGlassClink = (atSec) => {
    addTone(atSec, 0.32, 3280, 3260, 'sine', 0.035, 0.05);
    addTone(atSec + 0.045, 0.35, 4850, 4830, 'sine', 0.045, 0.035);
  };

  const playPhoneReelLeak = (atSec) => {
    const notes = [1480, 1760, 1975, 1567, 2093, 1760];
    notes.forEach((f, idx) => {
      addTone(atSec + idx * 0.07, 0.06, f, f * 1.02, 'square', 0.018, 0.032);
    });
  };

  const playWinFanfare = (atSec) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      addTone(atSec + idx * 0.11, 0.55, f, f, 'triangle', 0.22, 0.22);
    });
  };

  // Determine voice active intervals so background music ducks cleanly under dialogue
  const voiceIntervals = [];
  for (const vc of voiceClips) {
    const dur = vc.samples.length / SAMPLE_RATE;
    voiceIntervals.push({ start: vc.startSec, end: vc.startSec + dur });
    addMono(vc.startSec, vc.samples, vc.gainL ?? 0.92, vc.gainR ?? 0.92);
  }

  const isVoiceSpeakingAt = (sec) =>
    voiceIntervals.some((iv) => sec >= iv.start - 0.12 && sec <= iv.end + 0.18);

  // 1. Continuous Soundtrack: Lounge Jazz (before tensionStartSec) -> High-Stakes Tension
  const tensionStartSec = timelineEvents.scene5Start || 36.0;
  const jazzChords = [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0], // Am7
    [293.66, 349.23, 440.0, 523.25], // Dm7
    [196.0, 246.94, 293.66, 349.23], // G7
  ];
  const walkingBass = [65.41, 73.42, 82.41, 98.0, 110.0, 98.0, 73.42, 82.41];
  const tensionBass = [55.0, 55.0, 58.27, 55.0, 65.41, 58.27, 55.0, 49.0];

  let step = 0;
  for (let sec = 0.2; sec < totalDurationSec - 0.5; sec += 0.42, step++) {
    const duck = isVoiceSpeakingAt(sec) ? 0.36 : 0.85;
    if (sec < tensionStartSec) {
      if (step % 2 === 0) {
        const bassFreq = walkingBass[(step / 2) % walkingBass.length];
        addTone(sec, 0.62, bassFreq, bassFreq * 0.99, 'triangle', 0.13 * duck, 0.13 * duck);
      }
      if (step % 8 === 0) {
        const chord = jazzChords[Math.floor(step / 8) % jazzChords.length];
        chord.forEach((freq, idx) => {
          addTone(
            sec,
            2.4,
            freq,
            freq,
            'sine',
            0.032 * duck * (idx % 2 === 0 ? 1.1 : 0.8),
            0.032 * duck * (idx % 2 === 1 ? 1.1 : 0.8)
          );
        });
      }
    } else {
      // High-Stakes Tension pulse
      const bassFreq = tensionBass[step % tensionBass.length];
      addTone(sec, 0.34, bassFreq, bassFreq * 0.98, 'sawtooth', 0.12 * duck, 0.12 * duck);
      if (step % 4 === 0) {
        const padFreq = step % 8 === 0 ? 440 : 466.16;
        addTone(sec, 1.35, padFreq, padFreq, 'sine', 0.035 * duck, 0.035 * duck);
      }
    }
  }

  // 2. Choreographed Foley SFX across each scene
  playGlassClink(1.2);
  playRiffleShuffle((timelineEvents.scene1PlayClick || 4.0) + 0.1);
  playChipClink((timelineEvents.scene1PlayClick || 4.0) + 0.45, 3);

  // Scene 2: Preflop Deal & Card Peel
  const s2 = timelineEvents.scene2Start || 8.0;
  playCardSlide(s2 + 0.2, -0.3);
  playCardSlide(s2 + 0.42, 0.3);
  playCardFlip(s2 + 1.1);
  playChipClink(s2 + 2.4, 3, -0.4);

  // Scene 3: Chip Staging & Rim Cast
  const s3 = timelineEvents.scene3Start || 17.0;
  playChipClink(s3 + 0.3, 4, 0);
  playCardSlide(s3 + 1.5, 0.2);
  playGlassClink(s3 + 3.2);
  playChipClink(s3 + 4.8, 3, 0.4);

  // Scene 4: Bao Phone Scroll (with tinny smartphone reel audio leaks!)
  const s4 = timelineEvents.scene4Start || 26.0;
  playPhoneReelLeak(s4 + 0.35);
  playPhoneReelLeak(s4 + 1.8);
  playPhoneReelLeak(s4 + 5.2);
  playChipClink(s4 + 4.2, 2, 0.35);

  // Scene 5: Bao Phone Down Monster Tell
  const s5 = timelineEvents.scene5Start || 36.0;
  playKnock(s5 + 0.25);
  playChipClink(s5 + 0.8, 4, 0.35);
  playCardFlip(s5 + 3.5);

  // Scene 6: GTO Solver Drawer
  const s6 = timelineEvents.scene6Start || 46.0;
  playChipClink(s6 + 0.3, 1, 0);
  playGlassClink(s6 + 4.5);

  // Scene 7: Dramatic All-In Runout
  const s7 = timelineEvents.scene7Start || 56.0;
  playBurnTap(s7 + 0.4);
  playCardFlip(s7 + 0.65);
  playBurnTap(s7 + 2.6);
  playCardFlip(s7 + 2.85);
  playBurnTap(s7 + 4.8);
  playCardFlip(s7 + 5.05);

  // Scene 8: Royal Flush Showdown
  const s8 = timelineEvents.scene8Start || 64.0;
  playWinFanfare(s8 + 0.25);
  playChipClink(s8 + 0.9, 4, -0.2);
  playChipClink(s8 + 1.4, 4, 0.2);
  playRiffleShuffle(s8 + 5.5);

  // Soft limiter & write 16-bit PCM Stereo WAV
  const wavPath = path.join(TMP_DIR, 'master_audio.wav');
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const sl = Math.tanh(left[i]);
    const sr = Math.tanh(right[i]);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sl * 32767))), offset);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sr * 32767))), offset + 2);
    offset += 4;
  }

  fs.writeFileSync(wavPath, buffer);
  return wavPath;
}

async function generateDemoVideo() {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  console.log('🎙️ 1. Synthesizing Multi-Persona English Voice Lines (Dealer, Viktor, Elena, Bao, Marcus)...');
  const rawVoices = {
    dealer_welcome: synthesizeVoiceClip(
      'dealer_welcome',
      'Moira',
      175,
      'Welcome to the Monte Carlo V I P table. Shuffle up and deal. Blinds two and four dollars.'
    ),
    viktor_preflop: synthesizeVoiceClip(
      'viktor_preflop',
      'Daniel',
      178,
      'Ten dollars to play. Let us see how you navigate this street.'
    ),
    elena_fold: synthesizeVoiceClip(
      'elena_fold',
      'Samantha',
      180,
      'Too rich for my blood right now. I fold.'
    ),
    marcus_maniac: synthesizeVoiceClip(
      'marcus_maniac',
      'Rocko',
      192,
      'Haha! Scared money never wins in Monte Carlo! Count me in!'
    ),
    bao_scrolling: synthesizeVoiceClip(
      'bao_scrolling',
      'Reed',
      178,
      'Hold on, watching this reel on my phone... Yeah, I call eight dollars.'
    ),
    bao_monster: synthesizeVoiceClip(
      'bao_monster',
      'Reed',
      172,
      'Wait. Putting the phone down. All focus now. Raise to forty-five dollars.'
    ),
    viktor_warn: synthesizeVoiceClip(
      'viktor_warn',
      'Daniel',
      178,
      'Careful... Bao just put his phone flat on the rail. He has a monster hand.'
    ),
    dealer_gto: synthesizeVoiceClip(
      'dealer_gto',
      'Moira',
      178,
      'Real-time G T O Solver active. Node-locked exploitative mode adjusts your optimal strategy against Bao.'
    ),
    dealer_allin: synthesizeVoiceClip(
      'dealer_allin',
      'Moira',
      176,
      'All-in showdown! Players, turn your cards face up. Dealing the turn and river.'
    ),
    dealer_royal: synthesizeVoiceClip(
      'dealer_royal',
      'Moira',
      175,
      'Royal Flush! Seat Zero wins the four hundred twenty dollar main pot!'
    ),
    marcus_outro: synthesizeVoiceClip(
      'marcus_outro',
      'Rocko',
      190,
      'Unbelievable! A Royal Flush under the Monte Carlo lights! Nice hand!'
    ),
  };

  console.log('🚀 2. Starting Vite server & Headless Chrome for 1080p Recording...');
  const { server: viteServer, url } = await startViteServer();

  const timelineEvents = {};
  let recordedWebmPath = '';
  let totalDurationSec = 72;

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
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: TMP_DIR,
        size: { width: 1920, height: 1080 },
      },
    });

    const page = await context.newPage();
    const videoObj = page.video();
    const recordStartMs = Date.now();
    const nowSec = () => (Date.now() - recordStartMs) / 1000;

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Inject sleek Broadcast Bilingual Caption & Speaker Overlay helper
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.id = 'demo-broadcast-overlay';
      overlay.style.cssText = [
        'position: fixed',
        'left: 50%',
        'bottom: 108px',
        'transform: translateX(-50%)',
        'z-index: 9999',
        'pointer-events: none',
        'display: flex',
        'flex-direction: column',
        'align-items: center',
        'gap: 6px',
        'max-width: 960px',
        'width: 92%',
        'transition: opacity 0.25s ease, bottom 0.25s ease',
      ].join(';');

      overlay.innerHTML = `
        <div id="demo-chapter-pill" style="
          background: rgba(9, 12, 18, 0.9);
          border: 1px solid rgba(212, 175, 55, 0.65);
          color: #f3e5ab;
          padding: 4px 14px;
          border-radius: 9999px;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          box-shadow: 0 8px 24px rgba(0,0,0,0.65);
        "></div>
        <div id="demo-caption-box" style="
          background: rgba(6, 9, 17, 0.92);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(212, 175, 55, 0.55);
          border-radius: 16px;
          padding: 12px 22px;
          text-align: center;
          box-shadow: 0 16px 40px rgba(0,0,0,0.75);
          width: 100%;
        ">
          <div id="demo-speaker-line" style="
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 13px;
            font-weight: 800;
            color: #facc15;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 4px;
          "></div>
          <div id="demo-en-line" style="
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 18px;
            font-weight: 700;
            color: #ffffff;
            line-height: 1.35;
            margin-bottom: 4px;
          "></div>
          <div id="demo-kr-line" style="
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 15px;
            font-weight: 600;
            color: #cbd5e1;
            line-height: 1.35;
          "></div>
        </div>
      `;
      document.body.appendChild(overlay);

      window.__SET_DEMO_CAPTION__ = ({ chapter, speaker, en, kr, bottomPx = 108 }) => {
        const el = document.getElementById('demo-broadcast-overlay');
        const chapEl = document.getElementById('demo-chapter-pill');
        const spkEl = document.getElementById('demo-speaker-line');
        const enEl = document.getElementById('demo-en-line');
        const krEl = document.getElementById('demo-kr-line');
        if (el) el.style.bottom = `${bottomPx}px`;
        if (chapEl) chapEl.textContent = chapter || '';
        if (spkEl) spkEl.textContent = speaker || '';
        if (enEl) enEl.textContent = en || '';
        if (krEl) krEl.textContent = kr || '';
      };
    });

    const setCaption = async (payload) => {
      await page.evaluate((p) => window.__SET_DEMO_CAPTION__ && window.__SET_DEMO_CAPTION__(p), payload);
    };

    // =========================================================================
    // SCENE 1 (0s - 8s): Title Screen, Vision Pro Modal, & Table Entry
    // =========================================================================
    timelineEvents.scene1Start = nowSec();
    await setCaption({
      chapter: '01 / 08 • MONTE CARLO VIP SUITE & APPLE VISION PRO (WebXR)',
      speaker: '🎙️ SYSTEM OVERVIEW • GEMINI 3.8 TTS + LYRIA 3 + NANO BANANA',
      en: 'Realistic 3D WebXR Texas Hold’em Casino with Spatial Hand Tracking & AI Personas',
      kr: '공간 핸드 트래킹·AI 페르소나·실시간 GTO 코칭을 결합한 3D WebXR 텍사스 홀덤 카지노',
      bottomPx: 96,
    });
    await page.waitForTimeout(2200);

    // Briefly showcase the Vision Pro Calibration & USDZ Modal
    const vpBtn = page.locator('button:has-text("Vision Pro Test")');
    if ((await vpBtn.count()) > 0) {
      await vpBtn.click();
      await page.waitForTimeout(1800);
      const closeVpBtn = page.locator('button:has-text("Close")');
      if ((await closeVpBtn.count()) > 0) await closeVpBtn.click();
      await page.waitForTimeout(400);
    }

    // Click "Play in 3D Desktop Mode"
    timelineEvents.scene1PlayClick = nowSec();
    await setCaption({
      chapter: '01 / 08 • ENTERING THE MONTE CARLO VIP SUITE',
      speaker: '🎙️ VIP CROUPIER (DEALER VOICE)',
      en: '"Welcome to the Monte Carlo VIP table. Shuffle up and deal. Blinds $2 and $4."',
      kr: '딜러: "몬테카를로 VIP 테이블에 오신 것을 환영합니다. 카드를 셔플하고 딜링합니다."',
      bottomPx: 118,
    });
    const playBtn = page
      .locator(
        '[data-testid="title-start-desktop"], button:has-text("Take Your Seat"), button:has-text("Play in 3D Desktop Mode")'
      )
      .first();
    if ((await playBtn.count()) > 0) {
      await playBtn.click();
    }
    await page.waitForTimeout(3800);

    // =========================================================================
    // SCENE 2 (8s - 17s): Seat #0 POV Preflop Deal & Macro 3D Hole Card Peel
    // =========================================================================
    timelineEvents.scene2Start = nowSec();
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('preflop_deal');
      api.setCameraPreset('seat0_pov');
      api.setShow2DHUD(true);
    });
    await setCaption({
      chapter: '02 / 08 • SEAT #0 POV & PHYSICAL 3D HOLE CARD PEEK',
      speaker: '🎙️ VIKTOR (SEAT #1 • THE SHARK) — ⌚ GLANCES AT GOLD WATCH',
      en: '"Ten dollars to play. Let’s see how you navigate this street."',
      kr: '빅터 (샤크 AI): "$10 베팅입니다. 이번 스트리트를 어떻게 풀어나갈지 보죠." (손목시계 확인 텔)',
      bottomPx: 118,
    });
    await page.waitForTimeout(4200);

    // Macro close-up of 3D Hole Card Corner Peel (A♠ J♠)
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('card_peel');
      api.setCameraPreset('macro_cards_chips');
      api.setShow2DHUD(false);
    });
    await setCaption({
      chapter: '02 / 08 • TACTILE 3D CORNER PEEL & CLAY CHIP STACKS',
      speaker: '🃏 MACRO VIEW • HOLE CARDS (A♠ J♠) & 4 DENOMINATION STACKS',
      en: 'Shader-driven 3D card corner peel and physically stacked clay poker chips ($1, $5, $25, $100)',
      kr: '물리적 3D 카드 모서리 피킹(A♠ J♠) 및 4종 클레이 포커 칩 스택·공간 액션 버튼',
      bottomPx: 42,
    });
    await page.waitForTimeout(4400);

    // =========================================================================
    // SCENE 3 (17s - 26s): 3D Chip Staging & Rim Cast AI Personalities
    // =========================================================================
    timelineEvents.scene3Start = nowSec();
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('chip_drag_stage');
      api.setCameraPreset('macro_cards_chips');
      api.setShow2DHUD(false);
    });
    await setCaption({
      chapter: '03 / 08 • GOLDEN BETTING RING & AI TABLE BANTER',
      speaker: '🎙️ ELENA (SEAT #2 • THE ROCK)',
      en: '"Too rich for my blood right now. I fold."',
      kr: '엘레나 (타이트 AI): "지금 제게는 너무 높은 베팅이네요. 폴드하겠습니다."',
      bottomPx: 42,
    });
    await page.waitForTimeout(3800);

    timelineEvents.scene3MarcusVoice = nowSec();
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.setCameraPreset('viktor_marcus_rim');
      api.setShow2DHUD(false);
    });
    await setCaption({
      chapter: '03 / 08 • ARTICULATED 3D VIP CAST & NANO BANANA PORTRAITS',
      speaker: '🎙️ MARCUS (SEAT #4 • THE MANIAC) — 🎲 CHIP FIDGET BLUFF TELL',
      en: '"Haha! Scared money never wins in Monte Carlo! Count me in!"',
      kr: '마커스 (매니악 AI): "하하! 겁먹은 돈으로는 몬테카를로에서 절대 못 이기죠! 저도 갑니다!"',
      bottomPx: 42,
    });
    await page.waitForTimeout(4800);

    // =========================================================================
    // SCENE 4 (26s - 36s): Bao's Distracted Smartphone Tell (Scrolling Reels)
    // =========================================================================
    timelineEvents.scene4Start = nowSec();
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('bao_phone_scroll');
      api.setCameraPreset('bao_tell_closeup');
      api.setShow2DHUD(false);
    });
    await setCaption({
      chapter: '04 / 08 • LIVE BEHAVIORAL TELL #1: BAO SCROLLING SMARTPHONE REELS',
      speaker: '🎙️ BAO (SEAT #3 • CALLING STATION) — 📱 TINNY PHONE AUDIO LEAK',
      en: '"Hold on, watching this reel on my phone... Yeah, I call eight dollars."',
      kr: '바오 (콜링 스테이션 AI): "잠깐만요, 폰으로 릴스 영상 좀 보면서... 네, $8 콜할게요." (약하거나 평범한 핸드 텔)',
      bottomPx: 42,
    });
    await page.waitForTimeout(9200);

    // =========================================================================
    // SCENE 5 (36s - 46s): Bao's Monster Hand Tell (🔥 PHONE DOWN!)
    // =========================================================================
    timelineEvents.scene5Start = nowSec();
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('bao_phone_down_monster');
      api.setCameraPreset('bao_tell_closeup');
      api.setShow2DHUD(false);
    });
    await setCaption({
      chapter: '05 / 08 • LIVE BEHAVIORAL TELL #2: BAO PUTS PHONE FLAT ON RAIL (🔥 MONSTER HAND!)',
      speaker: '🎙️ BAO (SEAT #3) — 📱➡️🃏 LOCKS PHONE & LEANS FORWARD WITH POCKET ACES',
      en: '"Wait. Putting the phone down. All focus now. Raise to forty-five dollars."',
      kr: '바오: "잠깐, 이제 휴대폰 내려놓습니다. 완전 집중 모드예요. $45로 레이즈합니다." (몬스터 핸드 텔!)',
      bottomPx: 42,
    });
    await page.waitForTimeout(5400);

    timelineEvents.scene5ViktorWarn = nowSec();
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.setCameraPreset('seat0_pov');
      api.setShow2DHUD(true);
    });
    await setCaption({
      chapter: '05 / 08 • HIGH-STAKES SOUNDTRACK SHIFT & HUD TELL ALERT BADGE',
      speaker: '🎙️ VIKTOR (SEAT #1) — ⚠️ WARNING ABOUT BAO’S TELL',
      en: '"Careful... Bao just put his phone flat on the rail. He has a monster hand."',
      kr: '빅터: "조심하세요... 바오가 방금 휴대폰을 테이블 레일에 내려놓았습니다. 엄청난 핸드입니다."',
      bottomPx: 118,
    });
    await page.waitForTimeout(4800);

    // =========================================================================
    // SCENE 6 (46s - 56s): Real-Time 13x13 GTO Solver & Exploitative Node-Lock
    // =========================================================================
    timelineEvents.scene6Start = nowSec();
    const menuTrigger = page.locator('[data-testid="hud-menu-trigger"]');
    if ((await menuTrigger.count()) > 0) {
      await menuTrigger.click();
      await page.waitForTimeout(600);
      const gtoBtn = page.locator('button:has-text("13×13 GTO 솔버")');
      if ((await gtoBtn.count()) > 0) {
        await gtoBtn.click();
      }
    }
    await setCaption({
      chapter: '06 / 08 • REAL-TIME 169-HAND GTO SOLVER & NODE-LOCKED EXPLOIT ENGINE',
      speaker: '🎙️ VIP CROUPIER • GTO & EXPLOITATIVE COACH',
      en: '"Real-time GTO Solver active. Node-locked exploitative mode adjusts your optimal strategy against Bao."',
      kr: '실시간 13×13 GTO 매트릭스·에퀴티·팟 오즈 분석 및 바오의 행동 텔을 반영한 익스플로잇 코칭',
      bottomPx: 28,
    });
    await page.waitForTimeout(8800);

    // Close GTO Drawer before Scene 7
    const closeGtoBtn = page.locator('button:has-text("Close"), button:has-text("닫기")').first();
    if ((await closeGtoBtn.count()) > 0) {
      await closeGtoBtn.click().catch(() => {});
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);

    // =========================================================================
    // SCENE 7 (56s - 64s): Dramatic Multi-Way All-In Runout (Dealer POV)
    // =========================================================================
    timelineEvents.scene7Start = nowSec();
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('all_in_runout');
      api.setCameraPreset('dealer_pov');
      api.setShow2DHUD(false);
    });
    await setCaption({
      chapter: '07 / 08 • DRAMATIC MULTI-WAY ALL-IN RUNOUT (MAIN POT $260 • SIDE POT $240)',
      speaker: '🎙️ VIP CROUPIER • CRIMSON & GOLD SPOTLIGHT CHOREOGRAPHY',
      en: '"All-in showdown! Players, turn your cards face up. Dealing the turn and river."',
      kr: '딜러: "올인 쇼다운! 모든 플레이어의 카드를 오픈합니다. 턴과 리버 카드를 딜링합니다."',
      bottomPx: 42,
    });
    await page.waitForTimeout(7800);

    // =========================================================================
    // SCENE 8 (64s - 74s): Royal Flush Showdown & Live Auto-Pilot Finale
    // =========================================================================
    timelineEvents.scene8Start = nowSec();
    await page.evaluate(() => {
      const api = window.__POKER_DOGFOOD__;
      api.loadScenario('showdown_multiway');
      api.setCameraPreset('seat0_pov');
      api.setShow2DHUD(true);
    });
    await setCaption({
      chapter: '08 / 08 • ROYAL FLUSH SHOWDOWN & POT SWEEP CELEBRATION',
      speaker: '🎙️ VIP CROUPIER — 🏆 ROYAL FLUSH (A♠ K♠ Q♠ J♠ 10♠) WINS $420!',
      en: '"Royal Flush! Seat Zero wins the four hundred twenty dollar main pot!"',
      kr: '딜러: "로얄 플러쉬! 좌석 #0 플레이어가 $420 메인 팟을 차지합니다!"',
      bottomPx: 118,
    });
    await page.waitForTimeout(5200);

    timelineEvents.scene8MarcusOutro = nowSec();
    await setCaption({
      chapter: '08 / 08 • MONTE CARLO VIP 3D POKER • DEPLOYED ON GOOGLE CLOUD RUN',
      speaker: '🎙️ MARCUS (SEAT #4) — 🎉 TABLE REACTION',
      en: '"Unbelievable! A Royal Flush under the Monte Carlo lights! Nice hand!"',
      kr: '마커스: "믿을 수 없군요! 몬테카를로 조명 아래서 로얄 플러쉬라니! 나이스 핸드!"',
      bottomPx: 118,
    });
    await page.waitForTimeout(4800);

    totalDurationSec = nowSec();
    await context.close();
    recordedWebmPath = await videoObj.path();
    console.log(`✅ Playwright 1080p video recorded (${totalDurationSec.toFixed(1)}s): ${recordedWebmPath}`);
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }

  // Build synchronized voice clip schedule using the exact recorded timestamps
  const voiceSchedule = [
    {
      startSec: (timelineEvents.scene1PlayClick || 4.0) + 0.15,
      samples: rawVoices.dealer_welcome,
      gainL: 0.95,
      gainR: 0.95,
    },
    {
      startSec: (timelineEvents.scene2Start || 8.0) + 0.35,
      samples: rawVoices.viktor_preflop,
      gainL: 0.98,
      gainR: 0.82,
    },
    {
      startSec: (timelineEvents.scene3Start || 17.0) + 0.25,
      samples: rawVoices.elena_fold,
      gainL: 0.92,
      gainR: 0.92,
    },
    {
      startSec: (timelineEvents.scene3MarcusVoice || 21.0) + 0.2,
      samples: rawVoices.marcus_maniac,
      gainL: 0.82,
      gainR: 0.98,
    },
    {
      startSec: (timelineEvents.scene4Start || 26.0) + 0.8,
      samples: rawVoices.bao_scrolling,
      gainL: 0.85,
      gainR: 0.96,
    },
    {
      startSec: (timelineEvents.scene5Start || 36.0) + 0.35,
      samples: rawVoices.bao_monster,
      gainL: 0.88,
      gainR: 0.98,
    },
    {
      startSec: (timelineEvents.scene5ViktorWarn || 41.5) + 0.2,
      samples: rawVoices.viktor_warn,
      gainL: 0.98,
      gainR: 0.84,
    },
    {
      startSec: (timelineEvents.scene6Start || 46.5) + 0.5,
      samples: rawVoices.dealer_gto,
      gainL: 0.95,
      gainR: 0.95,
    },
    {
      startSec: (timelineEvents.scene7Start || 56.0) + 0.35,
      samples: rawVoices.dealer_allin,
      gainL: 0.95,
      gainR: 0.95,
    },
    {
      startSec: (timelineEvents.scene8Start || 64.0) + 0.35,
      samples: rawVoices.dealer_royal,
      gainL: 0.96,
      gainR: 0.96,
    },
    {
      startSec: (timelineEvents.scene8MarcusOutro || 69.2) + 0.2,
      samples: rawVoices.marcus_outro,
      gainL: 0.84,
      gainR: 0.98,
    },
  ];

  console.log('🎵 3. Mixing 48kHz Stereo Soundtrack + Foley SFX + AI/Dealer Voices...');
  const wavPath = buildMasterAudioWav(totalDurationSec + 1.0, timelineEvents, voiceSchedule);

  console.log('🎬 4. Encoding final 1080p H.264 + AAC MP4 (`demo_video.mp4`)...');
  execFileSync('/opt/homebrew/bin/ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    recordedWebmPath,
    '-i',
    wavPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'fast',
    '-crf',
    '19',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    OUTPUT_MP4,
  ]);

  // Clean up temporary audio/video scratch directory
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  const stat = fs.statSync(OUTPUT_MP4);
  console.log(
    `🎉 Demo video successfully created: ${OUTPUT_MP4} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`
  );
}

generateDemoVideo().catch((err) => {
  console.error('❌ Demo video generation failed:', err);
  process.exit(1);
});
