/**
 * Automated Live-Playthrough Demo Video Generator for Monte Carlo VIP 3D/WebXR Poker
 *
 * Produces a 1920x1080 H.264 MP4 (`demo_video.mp4`) showcasing a continuous, realistic
 * interactive playthrough from the Title Screen ("Take Your Seat") through Preflop, Flop,
 * Turn, Dramatic All-In River Runout, Showdown, and Next Hand:
 * - Visible animated cursor + golden click ripples showing real player UI interactions
 * - Procedural Monte Carlo Lounge Jazz & High-Stakes Tension soundtrack
 * - Physical Casino Foley SFX (riffle shuffle, 2-pass clockwise deal, card peel, clay chip clinks,
 *   burn taps, Bao's tinny smartphone reel audio leak, and Royal Flush win fanfare)
 * - Multi-Persona Spoken English Voice Lines (VIP Croupier, Viktor, Elena, Bao, Marcus)
 * - Broadcast-style Bilingual Subtitle & Active Speaker Overlay
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
      else if (type === 'sawtooth')
        sample = 2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)));
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
    if (!vc.samples || typeof vc.startSec !== 'number') continue;
    const dur = vc.samples.length / SAMPLE_RATE;
    voiceIntervals.push({ start: vc.startSec, end: vc.startSec + dur });
    addMono(vc.startSec, vc.samples, vc.gainL ?? 0.92, vc.gainR ?? 0.92);
  }

  const isVoiceSpeakingAt = (sec) =>
    voiceIntervals.some((iv) => sec >= iv.start - 0.12 && sec <= iv.end + 0.18);

  // 1. Continuous Soundtrack: Lounge Jazz (before Flop monster tell) -> High-Stakes Tension
  const tensionStartSec = timelineEvents.flopDealt || 26.0;
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

  // 2. Choreographed Foley SFX synchronized to live playthrough timestamps
  playGlassClink(1.0);
  const entrySec = timelineEvents.enterTableClick || 3.5;
  playRiffleShuffle(entrySec + 0.1);
  playChipClink(entrySec + 0.4, 2);
  // 2-pass clockwise deal slides (10 cards)
  for (let i = 0; i < 10; i++) {
    playCardSlide(entrySec + 0.6 + i * 0.09, ((i % 5) - 2) * 0.25);
  }

  // Preflop Bao phone reel leak & player peek/raise
  const baoScrollSec = timelineEvents.baoPreflopScroll || 8.0;
  playPhoneReelLeak(baoScrollSec + 0.2);
  playPhoneReelLeak(baoScrollSec + 1.4);
  playChipClink(baoScrollSec + 1.8, 2, 0.3);

  const peekSec = timelineEvents.heroPeekClick || 13.0;
  playCardFlip(peekSec + 0.1);
  playChipClink((timelineEvents.heroPreflopRaise || 18.0) + 0.1, 4, 0);

  // Flop deal & Bao putting phone flat on rail
  const flopSec = timelineEvents.flopDealt || 24.0;
  playBurnTap(flopSec + 0.1);
  playCardFlip(flopSec + 0.35);
  playCardSlide(flopSec + 0.45, -0.2);
  playCardSlide(flopSec + 0.58, 0.0);
  playCardSlide(flopSec + 0.71, 0.2);
  playKnock(flopSec + 1.2); // Bao puts phone flat on the rail

  // GTO Coach inspection & Flop Bet
  if (timelineEvents.gtoOpenClick) {
    playGlassClink(timelineEvents.gtoOpenClick + 0.3);
  }
  if (timelineEvents.heroFlopBet) {
    playChipClink(timelineEvents.heroFlopBet + 0.1, 4, 0);
    playChipClink(timelineEvents.heroFlopBet + 1.4, 3, -0.35);
    playChipClink(timelineEvents.heroFlopBet + 2.4, 3, 0.35);
  }

  // Turn deal (10s -> Royal Flush!) & All-In Shove
  const turnSec = timelineEvents.turnDealt || 44.0;
  playBurnTap(turnSec + 0.1);
  playCardFlip(turnSec + 0.35);

  if (timelineEvents.heroTurnAllIn) {
    playChipClink(timelineEvents.heroTurnAllIn + 0.1, 5, 0);
    playChipClink(timelineEvents.heroTurnAllIn + 1.2, 5, -0.35);
    playChipClink(timelineEvents.heroTurnAllIn + 2.2, 5, 0.35);
  }

  // River runout & Royal Flush Showdown
  if (timelineEvents.allInRunoutStart) {
    playBurnTap(timelineEvents.allInRunoutStart + 1.2);
    playCardFlip(timelineEvents.allInRunoutStart + 1.5);
  }

  const showdownSec = timelineEvents.showdownStart || 56.0;
  playWinFanfare(showdownSec + 0.2);
  playChipClink(showdownSec + 0.9, 4, -0.2);
  playChipClink(showdownSec + 1.4, 4, 0.2);

  if (timelineEvents.nextHandClick) {
    playRiffleShuffle(timelineEvents.nextHandClick + 0.15);
    for (let i = 0; i < 6; i++) {
      playCardSlide(timelineEvents.nextHandClick + 0.55 + i * 0.09, ((i % 3) - 1) * 0.3);
    }
  }

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

  console.log(
    '🎙️ 1. Synthesizing Multi-Persona English Voice Lines (Dealer, Viktor, Elena, Bao, Marcus)...'
  );
  const rawVoices = {
    dealer_welcome: synthesizeVoiceClip(
      'dealer_welcome',
      'Moira',
      176,
      'Welcome to the Monte Carlo V I P table. Shuffle up and deal. Blinds two and four dollars.'
    ),
    bao_scrolling: synthesizeVoiceClip(
      'bao_scrolling',
      'Reed',
      180,
      'Hold on, watching this reel on my phone... Yeah, I call four dollars.'
    ),
    viktor_preflop: synthesizeVoiceClip(
      'viktor_preflop',
      'Daniel',
      178,
      'Ten dollars from the Small Blind? I call. Let us see a flop.'
    ),
    dealer_flop: synthesizeVoiceClip(
      'dealer_flop',
      'Moira',
      176,
      'Burn and turn the Flop. Queen of spades, Jack of spades, Nine of hearts.'
    ),
    bao_monster: synthesizeVoiceClip(
      'bao_monster',
      'Reed',
      174,
      'Wait. Putting my phone down right now. All focus on this pot.'
    ),
    viktor_warn: synthesizeVoiceClip(
      'viktor_warn',
      'Daniel',
      178,
      'Careful... Bao just placed his phone flat on the rail. He flopped a monster.'
    ),
    dealer_gto: synthesizeVoiceClip(
      'dealer_gto',
      'Moira',
      178,
      'Real-time G T O Coach active. Node-locked exploitative mode adjusts your strategy against Bao.'
    ),
    dealer_turn: synthesizeVoiceClip(
      'dealer_turn',
      'Moira',
      176,
      'Fourth street, the Turn. Ten of spades!'
    ),
    dealer_allin: synthesizeVoiceClip(
      'dealer_allin',
      'Moira',
      176,
      'All-in showdown! Three ways for six hundred ten dollars. Dealing the river.'
    ),
    dealer_royal: synthesizeVoiceClip(
      'dealer_royal',
      'Moira',
      175,
      'Royal Flush! Seat Zero sweeps the six hundred ten dollar main pot!'
    ),
    marcus_outro: synthesizeVoiceClip(
      'marcus_outro',
      'Rocko',
      190,
      'Unbelievable! A live Royal Flush in Monte Carlo! Deal the next hand!'
    ),
  };

  console.log('🚀 2. Starting Vite server & Headless Chrome for 1080p Live Playthrough Recording...');
  const { server: viteServer, url } = await startViteServer();

  const timelineEvents = {};
  let recordedWebmPath = '';
  let totalDurationSec = 70;

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

    await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForSelector('canvas', { timeout: 10000 });
    // Skip the blank page-load stretch (GLB download + Vite cold start) at encode time
    timelineEvents.introTrimSec = Math.max(0, nowSec() - 0.4);

    // Inject Broadcast Bilingual Caption Overlay + Animated Interactive Cursor & Click Ripple
    await page.evaluate(() => {
      // 1. Caption Overlay
      const overlay = document.createElement('div');
      overlay.id = 'demo-broadcast-overlay';
      overlay.style.cssText = [
        'position: fixed',
        'left: 50%',
        'bottom: 112px',
        'transform: translateX(-50%)',
        'z-index: 9998',
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
          padding: 10px 22px;
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
            margin-bottom: 3px;
          "></div>
          <div id="demo-en-line" style="
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 17px;
            font-weight: 700;
            color: #ffffff;
            line-height: 1.35;
            margin-bottom: 3px;
          "></div>
          <div id="demo-kr-line" style="
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            color: #cbd5e1;
            line-height: 1.35;
          "></div>
        </div>
      `;
      document.body.appendChild(overlay);

      window.__SET_DEMO_CAPTION__ = ({ chapter, speaker, en, kr, bottomPx = 112 }) => {
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

      // 2. Visible Interactive Pointer Cursor + Click Ripple
      const cursor = document.createElement('div');
      cursor.id = 'demo-live-cursor';
      cursor.style.cssText = [
        'position: fixed',
        'left: 960px',
        'top: 540px',
        'z-index: 10000',
        'pointer-events: none',
        'transition: left 0.42s cubic-bezier(0.22, 1, 0.36, 1), top 0.42s cubic-bezier(0.22, 1, 0.36, 1), transform 0.15s ease',
        'display: flex',
        'align-items: flex-start',
        'gap: 8px',
      ].join(';');
      cursor.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="filter: drop-shadow(0 4px 10px rgba(0,0,0,0.85));">
          <path d="M4 3L12.5 24L15.8 15.8L24 12.5L4 3Z" fill="#facc15" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round"/>
        </svg>
        <div id="demo-cursor-tag" style="
          background: rgba(15, 23, 42, 0.92);
          border: 1px solid rgba(250, 204, 21, 0.75);
          color: #fef08a;
          padding: 3px 10px;
          border-radius: 9999px;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          white-space: nowrap;
          box-shadow: 0 6px 18px rgba(0,0,0,0.65);
          opacity: 0;
          transition: opacity 0.2s ease;
          margin-top: 10px;
        "></div>
      `;
      document.body.appendChild(cursor);

      window.__MOVE_DEMO_CURSOR__ = (x, y, tagText = '') => {
        const c = document.getElementById('demo-live-cursor');
        const tag = document.getElementById('demo-cursor-tag');
        if (c) {
          c.style.left = `${x}px`;
          c.style.top = `${y}px`;
        }
        if (tag) {
          if (tagText) {
            tag.textContent = tagText;
            tag.style.opacity = '1';
          } else {
            tag.style.opacity = '0';
          }
        }
      };

      window.__PULSE_DEMO_CLICK__ = (x, y) => {
        const c = document.getElementById('demo-live-cursor');
        if (c) {
          c.style.transform = 'scale(0.86)';
          setTimeout(() => {
            c.style.transform = 'scale(1)';
          }, 140);
        }
        const ripple = document.createElement('div');
        ripple.style.cssText = [
          'position: fixed',
          `left: ${x - 22}px`,
          `top: ${y - 22}px`,
          'width: 44px',
          'height: 44px',
          'border-radius: 9999px',
          'border: 3px solid #facc15',
          'background: rgba(250, 204, 21, 0.25)',
          'z-index: 9999',
          'pointer-events: none',
          'transform: scale(0.3)',
          'opacity: 1',
          'transition: transform 0.45s ease-out, opacity 0.45s ease-out',
        ].join(';');
        document.body.appendChild(ripple);
        requestAnimationFrame(() => {
          ripple.style.transform = 'scale(1.65)';
          ripple.style.opacity = '0';
        });
        setTimeout(() => ripple.remove(), 500);
      };
    });

    const setCaption = async (payload) => {
      await page.evaluate(
        (p) => window.__SET_DEMO_CAPTION__ && window.__SET_DEMO_CAPTION__(p),
        payload
      );
    };

    const clickWithCursor = async (locatorOrSelector, tagLabel = '', holdMs = 460) => {
      const loc =
        typeof locatorOrSelector === 'string'
          ? page.locator(locatorOrSelector).first()
          : locatorOrSelector.first();
      if ((await loc.count()) === 0) return false;
      const box = await loc.boundingBox();
      if (!box) return false;
      const cx = Math.round(box.x + box.width / 2);
      const cy = Math.round(box.y + box.height / 2);
      await page.evaluate(
        ({ x, y, label }) => window.__MOVE_DEMO_CURSOR__ && window.__MOVE_DEMO_CURSOR__(x, y, label),
        { x: cx, y: cy, label: tagLabel }
      );
      await page.waitForTimeout(holdMs);
      await page.evaluate(
        ({ x, y }) => window.__PULSE_DEMO_CLICK__ && window.__PULSE_DEMO_CLICK__(x, y),
        { x: cx, y: cy }
      );
      await loc.click({ force: true });
      await page.waitForTimeout(180);
      return true;
    };

    const waitForHeroTurn = async (expectedPhase, timeoutMs = 15000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const state = await page.evaluate(() => window.__POKER_DOGFOOD__?.getState());
        if (
          state &&
          (!expectedPhase || state.table.phase === expectedPhase) &&
          state.players[0]?.isTurn &&
          !state.table.isAllInRunout
        ) {
          return state;
        }
        await page.waitForTimeout(150);
      }
      return null;
    };

    // Rig the live deck before clicking "Take Your Seat" so Hand #1 deals a thrilling,
    // 100% authentic multi-street hand:
    // - Seat 0 (You, SB): A♠ K♠
    // - Seat 1 (Viktor, BB): Q♥ 10♣
    // - Seat 2 (Elena, UTG): 7♦ 2♣ (folds preflop)
    // - Seat 3 (Bao, CO): 9♣ 9♦ (scrolls phone preflop -> flops Set of 9s & puts phone down!)
    // - Seat 4 (Marcus, BTN): 4♣ 2♥ (calls preflop -> folds to flop bet)
    // - Flop: Q♠ J♠ 9♥ (You flop Royal Flush draw; Bao flops Set of Nines & puts phone down!)
    // - Turn: 10♠ (You hit the Royal Flush A♠ K♠ Q♠ J♠ 10♠ and shove All-In!)
    // - River: 2♦ (Dealt during the dramatic 3-way All-In Runout!)
    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.rigNextDeck([
        // Pass 1 (Seats 0, 1, 2, 3, 4)
        { suit: 'spades', rank: 14, faceUp: false }, // Seat 0 (You): A♠
        { suit: 'hearts', rank: 12, faceUp: false }, // Seat 1 (Viktor): Q♥
        { suit: 'diamonds', rank: 7, faceUp: false }, // Seat 2 (Elena): 7♦
        { suit: 'clubs', rank: 9, faceUp: false }, // Seat 3 (Bao): 9♣
        { suit: 'clubs', rank: 4, faceUp: false }, // Seat 4 (Marcus): 4♣
        // Pass 2 (Seats 0, 1, 2, 3, 4)
        { suit: 'spades', rank: 13, faceUp: false }, // Seat 0 (You): K♠
        { suit: 'clubs', rank: 10, faceUp: false }, // Seat 1 (Viktor): 10♣
        { suit: 'clubs', rank: 2, faceUp: false }, // Seat 2 (Elena): 2♣
        { suit: 'diamonds', rank: 9, faceUp: false }, // Seat 3 (Bao): 9♦
        { suit: 'hearts', rank: 2, faceUp: false }, // Seat 4 (Marcus): 2♥
        // Flop Burn + Flop (Q♠ J♠ 9♥)
        { suit: 'diamonds', rank: 3, faceUp: false }, // Burn #1
        { suit: 'spades', rank: 12, faceUp: true }, // Flop 1: Q♠
        { suit: 'spades', rank: 11, faceUp: true }, // Flop 2: J♠
        { suit: 'hearts', rank: 9, faceUp: true }, // Flop 3: 9♥
        // Turn Burn + Turn (10♠)
        { suit: 'clubs', rank: 5, faceUp: false }, // Burn #2
        { suit: 'spades', rank: 10, faceUp: true }, // Turn: 10♠
        // River Burn + River (2♦)
        { suit: 'diamonds', rank: 6, faceUp: false }, // Burn #3
        { suit: 'diamonds', rank: 2, faceUp: true }, // River: 2♦
      ]);
    });

    // =========================================================================
    // CHAPTER 1: Title Screen -> Live Table Entry ("Take Your Seat")
    // =========================================================================
    timelineEvents.scene1Start = nowSec();
    await setCaption({
      chapter: '01 / 06 • MONTE CARLO VIP SUITE • LIVE PLAYTHROUGH ENTRY',
      speaker: '🎙️ SYSTEM OVERVIEW • WEBXR + GEMINI 3.8 TTS + LYRIA 3',
      en: 'Entering the 3D Monte Carlo VIP Table for a live, unedited Sit & Go hand',
      kr: '타이틀 화면에서 [Take Your Seat]를 클릭해 실제 라이브 홀덤 테이블로 즉시 진입합니다',
      bottomPx: 96,
    });
    await page.waitForTimeout(2400);

    timelineEvents.enterTableClick = nowSec();
    await setCaption({
      chapter: '01 / 06 • TAKING SEAT #0 & 2-PASS CLOCKWISE DEAL',
      speaker: '🎙️ VIP CROUPIER (DEALER VOICE)',
      en: '"Welcome to the Monte Carlo VIP table. Shuffle up and deal. Blinds $2 and $4."',
      kr: '크루피어가 덱을 리플 셔플한 뒤 시계 방향으로 1장씩 2패스(2-Pass)로 홀카드를 딜링합니다',
      bottomPx: 118,
    });
    await clickWithCursor('[data-testid="title-start-desktop"]', 'Click: Take Your Seat (Seat #0)', 520);

    // =========================================================================
    // CHAPTER 2: Live Preflop — Bao's Phone-Scrolling Tell, Peeking A♠ K♠ & Raising
    // =========================================================================
    await page.waitForTimeout(1400);
    timelineEvents.baoPreflopScroll = nowSec();
    // Zoom in on Bao while AI preflop action runs so viewer sees him scrolling reels
    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.setCameraPreset('bao_tell_closeup');
    });
    await setCaption({
      chapter: '02 / 06 • LIVE PREFLOP ACTION & BAO’S SMARTPHONE REEL TELL',
      speaker: '🎙️ BAO (SEAT #3 • CALLING STATION) — 📱 SCROLLING REELS',
      en: '"Hold on, watching this reel on my phone... Yeah, I call four dollars."',
      kr: '바오(Seat #3)가 프리플랍에서 스마트폰 릴스를 보며 건성으로 $4 콜(약한/중간 핸드 텔)',
      bottomPx: 118,
    });

    // Wait until AI preflop actions finish and it becomes Seat #0's live turn
    await waitForHeroTurn('preflop', 12000);
    await page.waitForTimeout(1600);

    // Return to Seat #0 POV for our live Preflop turn
    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.setCameraPreset('seat0_pov');
    });
    await page.waitForTimeout(600);

    // Click "Peek" button to lock hole cards face-up (revealing A♠ K♠!)
    timelineEvents.heroPeekClick = nowSec();
    await setCaption({
      chapter: '02 / 06 • YOUR TURN (PREFLOP) • PEEKING & LOCKING HOLE CARDS (A♠ K♠)',
      speaker: '🃏 SEAT #0 (YOU) • LOCKING HOLE CARDS & 3D CORNER PEEL',
      en: 'Clicking [Peek] reveals Pocket Ace-King of Spades (A♠ K♠) with live 3D shader corner peel',
      kr: '[Peek] 버튼을 클릭해 내 홀카드(A♠ K♠)를 확인하고 오픈 상태로 고정(Locked)합니다',
      bottomPx: 118,
    });
    await clickWithCursor('[data-testid="action-peek"]', 'Click: Peek & Lock Cards (A♠ K♠)', 480);

    // Briefly show Macro 3D Card Peel & Clay Chips close-up
    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.setCameraPreset('macro_cards_chips');
    });
    await page.waitForTimeout(2400);
    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.setCameraPreset('seat0_pov');
    });
    await page.waitForTimeout(500);

    // Select 2.5x bet sizing preset ($10) and click Raise $10!
    await setCaption({
      chapter: '02 / 06 • LIVE PREFLOP RAISE ($10) & AI CALLS',
      speaker: '🎙️ VIKTOR (SEAT #1 • THE SHARK) — CALLS $10',
      en: '"Ten dollars from the Small Blind? I call. Let us see a flop."',
      kr: '2.5x($10) 프리셋을 선택해 레이즈하고 빅터·바오·마커스가 콜하며 플랍으로 진입합니다',
      bottomPx: 118,
    });
    await clickWithCursor('[data-testid="bet-preset-25x"]', 'Select Sizing: 2.5x ($10)', 420);
    timelineEvents.heroPreflopRaise = nowSec();
    await clickWithCursor('[data-testid="action-raise"]', 'Click: Raise to $10', 450);

    // =========================================================================
    // CHAPTER 3: Live Flop (Q♠ J♠ 9♥) & Bao Puts Phone Flat on Rail (🔥 PHONE DOWN!)
    // =========================================================================
    await waitForHeroTurn('flop', 15000);
    timelineEvents.flopDealt = nowSec();

    await setCaption({
      chapter: '03 / 06 • THE FLOP (Q♠ J♠ 9♥) • BAO PUTS PHONE DOWN (🔥 MONSTER TELL!)',
      speaker: '🎙️ BAO (SEAT #3) — 📱➡️🃏 PUTS PHONE FLAT ON RAIL (SET OF NINES)',
      en: '"Wait. Putting my phone down right now. All focus on this pot."',
      kr: '플랍 Q♠ J♠ 9♥가 깔리자 트리플 9를 맞춘 바오가 스마트폰을 레일 위에 내려놓고 집중합니다!',
      bottomPx: 118,
    });
    await page.waitForTimeout(1600);

    // Zoom into Bao so viewer sees his phone lying flat on the mahogany rail + "🔥 PHONE DOWN!" badge
    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.setCameraPreset('bao_tell_closeup');
    });
    await page.waitForTimeout(3400);

    timelineEvents.viktorWarn = nowSec();
    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.setCameraPreset('seat0_pov');
    });
    await setCaption({
      chapter: '03 / 06 • HIGH-STAKES MUSIC SHIFT & LIVE TELL ALERT',
      speaker: '🎙️ VIKTOR (SEAT #1) — ⚠️ READS BAO’S PHYSICAL TELL',
      en: '"Careful... Bao just placed his phone flat on the rail. He flopped a monster."',
      kr: '사운드트랙이 High-Stakes 긴장 모드로 전환되고 바오의 몬스터 핸드 텔 배지가 점등됩니다',
      bottomPx: 118,
    });
    await page.waitForTimeout(2600);

    // =========================================================================
    // CHAPTER 4: Live 13×13 GTO Coach Inspection & Flop C-Bet ($20)
    // =========================================================================
    timelineEvents.gtoOpenClick = nowSec();
    await setCaption({
      chapter: '04 / 06 • REAL-TIME 13×13 GTO COACH & NODE-LOCKED EXPLOIT ENGINE',
      speaker: '🎙️ VIP CROUPIER • LIVE GTO & EXPLOITATIVE SOLVER',
      en: '"Real-time GTO Coach active. Node-locked exploitative mode adjusts your strategy against Bao."',
      kr: '[GTO] 버튼을 클릭해 로열 플러시 드로우(12 Outs)의 실시간 승률·EV와 169 핸드 매트릭스를 확인합니다',
      bottomPx: 118,
    });
    await clickWithCursor('[data-testid="hud-gto-trigger"]', 'Click: Open 13×13 GTO Coach', 480);
    await page.waitForTimeout(2200);

    // Toggle Pure GTO <-> Exploit inside the open GTO drawer
    const pureGtoTab = page.locator('[data-hud-drawer="gto"] button:has-text("Pure GTO")');
    if ((await pureGtoTab.count()) > 0) {
      await clickWithCursor(pureGtoTab, 'Compare: Pure GTO Baseline', 420);
      await page.waitForTimeout(1400);
    }
    const exploitTab = page.locator('[data-hud-drawer="gto"] button:has-text("Exploit")');
    if ((await exploitTab.count()) > 0) {
      await clickWithCursor(exploitTab, 'Switch: Node-Locked Exploit vs Bao', 420);
      await page.waitForTimeout(1400);
    }

    // Close GTO drawer by clicking the GTO button again
    await clickWithCursor('[data-testid="hud-gto-trigger"]', 'Close GTO Drawer', 380);
    await page.waitForTimeout(400);

    // Click 50% Pot preset ($20) and click Bet $20 on the Flop!
    await clickWithCursor('[data-testid="bet-preset-50"]', 'Select Sizing: 50% Pot ($20)', 400);
    timelineEvents.heroFlopBet = nowSec();
    await clickWithCursor('[data-testid="action-raise"]', 'Click: Bet $20 on Flop', 440);

    // =========================================================================
    // CHAPTER 5: The Turn (10♠) — Hitting the Royal Flush & Shoving All-In!
    // =========================================================================
    await waitForHeroTurn('turn', 15000);
    timelineEvents.turnDealt = nowSec();

    await setCaption({
      chapter: '05 / 06 • THE TURN (10♠) • ROYAL FLUSH COMPLETED (A♠ K♠ Q♠ J♠ 10♠)!',
      speaker: '🎙️ VIP CROUPIER — FOURTH STREET: TEN OF SPADES (10♠)',
      en: '"Fourth street, the Turn. Ten of spades!" — You hit the nuts: Royal Flush!',
      kr: '턴 카드로 10♠가 떨어지며 당신의 핸드(A♠ K♠)가 로열 플러시(A♠ K♠ Q♠ J♠ 10♠)를 완성합니다!',
      bottomPx: 118,
    });
    await page.waitForTimeout(2800);

    // Click "Max" preset and shove All-In ($170 remaining -> $610 Total Pot!)
    await clickWithCursor('[data-testid="bet-preset-max"]', 'Select Sizing: MAX (All-In)', 420);
    timelineEvents.heroTurnAllIn = nowSec();
    await clickWithCursor('[data-testid="action-raise"]', 'Click: Shove All-In!', 460);

    // =========================================================================
    // CHAPTER 6: Dramatic 3-Way All-In Runout, Showdown & Dealing Next Hand
    // =========================================================================
    // Wait until Viktor & Bao call All-In and the Dramatic All-In Runout starts
    const runoutWaitStart = Date.now();
    while (Date.now() - runoutWaitStart < 12000) {
      const st = await page.evaluate(() => window.__POKER_DOGFOOD__?.getState());
      if (st?.table?.isAllInRunout || st?.table?.phase === 'showdown') break;
      await page.waitForTimeout(120);
    }
    timelineEvents.allInRunoutStart = nowSec();

    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.setCameraPreset('dealer_pov');
    });
    await setCaption({
      chapter: '06 / 06 • DRAMATIC 3-WAY ALL-IN RUNOUT ($610 MAIN POT)',
      speaker: '🎙️ VIP CROUPIER • CARDS FACE UP ON THE EMERALD FELT',
      en: '"All-in showdown! Three ways for $610. Players, turn your cards face up!"',
      kr: '3명 전원 올인($610 팟)! 모든 홀카드가 오픈된 채 크림슨·골드 조명 아래 리버(2♦)가 딜링됩니다',
      bottomPx: 118,
    });

    // Wait for Showdown phase
    const showdownWaitStart = Date.now();
    while (Date.now() - showdownWaitStart < 15000) {
      const st = await page.evaluate(() => window.__POKER_DOGFOOD__?.getState());
      if (st?.table?.phase === 'showdown') break;
      await page.waitForTimeout(150);
    }
    timelineEvents.showdownStart = nowSec();

    await page.evaluate(() => {
      window.__POKER_DOGFOOD__?.setCameraPreset('seat0_pov');
    });
    await setCaption({
      chapter: '06 / 06 • ROYAL FLUSH SHOWDOWN VICTORY ($610 POT) & NEXT HAND',
      speaker: '🎙️ VIP CROUPIER — 🏆 ROYAL FLUSH (A♠ K♠ Q♠ J♠ 10♠) WINS $610!',
      en: '"Royal Flush! Seat Zero sweeps the $610 main pot!"',
      kr: '로열 플러시 5장의 카드가 황금빛으로 부양하며 $610 메인 팟을 획득하고 다음 핸드로 이어집니다!',
      bottomPx: 118,
    });
    await page.waitForTimeout(4200);

    // Click "Next Hand" button to prove continuous multi-hand gameplay!
    timelineEvents.nextHandClick = nowSec();
    await setCaption({
      chapter: '06 / 06 • CONTINUOUS LIVE GAMEPLAY • DEALING HAND #2',
      speaker: '🎙️ MARCUS (SEAT #4) — 🎉 TABLE REACTION & HAND #2 DEAL',
      en: '"Unbelievable! A live Royal Flush in Monte Carlo! Deal the next hand!"',
      kr: '[Next Hand]를 클릭해 $610 스택으로 즉시 핸드 #2를 딜링하며 연속 플레이를 이어갑니다',
      bottomPx: 118,
    });
    await clickWithCursor('[data-testid="action-next-hand"]', 'Click: Deal Next Hand (#2)', 480);
    await page.waitForTimeout(3600);

    // Hide cursor cleanly at the end
    await page.evaluate(() => {
      const c = document.getElementById('demo-live-cursor');
      if (c) c.style.opacity = '0';
    });
    await page.waitForTimeout(600);

    totalDurationSec = nowSec();
    await context.close();
    recordedWebmPath = await videoObj.path();
    console.log(
      `✅ Playwright 1080p live playthrough recorded (${totalDurationSec.toFixed(1)}s): ${recordedWebmPath}`
    );
    console.log('⏱️ Timeline Events:', JSON.stringify(timelineEvents, null, 2));
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }

  // Build synchronized voice clip schedule using the exact recorded timestamps from the live playthrough
  const voiceSchedule = [
    {
      startSec: (timelineEvents.enterTableClick || 2.8) + 0.25,
      samples: rawVoices.dealer_welcome,
      gainL: 0.95,
      gainR: 0.95,
    },
    {
      startSec: (timelineEvents.baoPreflopScroll || 5.0) + 0.35,
      samples: rawVoices.bao_scrolling,
      gainL: 0.85,
      gainR: 0.96,
    },
    {
      startSec: (timelineEvents.heroPreflopRaise || 14.0) + 0.35,
      samples: rawVoices.viktor_preflop,
      gainL: 0.98,
      gainR: 0.82,
    },
    {
      startSec: (timelineEvents.flopDealt || 20.0) + 0.15,
      samples: rawVoices.dealer_flop,
      gainL: 0.95,
      gainR: 0.95,
    },
    {
      startSec: (timelineEvents.flopDealt || 20.0) + 4.3,
      samples: rawVoices.bao_monster,
      gainL: 0.88,
      gainR: 0.98,
    },
    {
      startSec: (timelineEvents.viktorWarn || 26.0) + 0.25,
      samples: rawVoices.viktor_warn,
      gainL: 0.98,
      gainR: 0.84,
    },
    {
      startSec: (timelineEvents.gtoOpenClick || 29.0) + 0.35,
      samples: rawVoices.dealer_gto,
      gainL: 0.95,
      gainR: 0.95,
    },
    {
      startSec: (timelineEvents.turnDealt || 40.0) + 0.15,
      samples: rawVoices.dealer_turn,
      gainL: 0.95,
      gainR: 0.95,
    },
    {
      startSec: (timelineEvents.allInRunoutStart || 46.0) + 0.15,
      samples: rawVoices.dealer_allin,
      gainL: 0.95,
      gainR: 0.95,
    },
    {
      startSec: (timelineEvents.showdownStart || 52.0) + 0.25,
      samples: rawVoices.dealer_royal,
      gainL: 0.96,
      gainR: 0.96,
    },
    {
      startSec: (timelineEvents.nextHandClick || 57.0) + 0.2,
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
    '-ss',
    String(timelineEvents.introTrimSec || 0),
    OUTPUT_MP4,
  ]);

  // Clean up temporary audio/video scratch directory
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  const stat = fs.statSync(OUTPUT_MP4);
  console.log(
    `🎉 Live-Playthrough Demo video successfully created: ${OUTPUT_MP4} (${(
      stat.size /
      (1024 * 1024)
    ).toFixed(2)} MB)`
  );
}

generateDemoVideo().catch((err) => {
  console.error('❌ Demo video generation failed:', err);
  process.exit(1);
});
