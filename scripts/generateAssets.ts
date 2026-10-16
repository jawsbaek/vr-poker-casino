/**
 * CLI Asset Generator for Monte Carlo VIP 3D Poker
 * Uses @google/genai to pre-generate:
 *  - Nano Banana (`gemini-3.1-flash-image`) character portraits & VIP wall art
 *  - Lyria 3 (`lyria-3-clip-preview`) Lounge Jazz & High-Stakes audio loops
 *  - Gemini 3.8 Flash TTS (`gemini-3.8-flash-tts`) Dealer voice callouts
 *
 * Usage:
 *   GEMINI_API_KEY="your-key" npx tsx scripts/generateAssets.ts
 */
import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: Set GEMINI_API_KEY environment variable to run generateAssets.ts');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey });
const outDir = path.resolve(process.cwd(), 'public/assets');
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log('Generating Lyria 3 Lounge Jazz & High-Stakes soundtracks...');
  const tracks = [
    {
      file: 'lyria_lounge_jazz.mp3',
      prompt:
        'Smooth late-night Monte Carlo VIP casino lounge jazz, warm upright bass walking line, brushed snare drums, Rhodes electric piano seventh chords, muted velvet trumpet, 88 BPM instrumental.',
    },
    {
      file: 'lyria_high_stakes.mp3',
      prompt:
        'Tense high-stakes poker showdown instrumental, deep pulsing cinematic sub-bass, subtle ticking rimshot percussion, suspenseful minor-key Rhodes chords and strings, 108 BPM instrumental.',
    },
  ];

  for (const t of tracks) {
    const res = await (client as any).interactions.create({
      model: 'lyria-3-clip-preview',
      input: t.prompt,
    });
    if (res?.output_audio?.data) {
      fs.writeFileSync(path.join(outDir, t.file), Buffer.from(res.output_audio.data, 'base64'));
      console.log(`Saved ${t.file}`);
    }
  }

  console.log('Generating Gemini 3.8 Flash TTS dealer callouts...');
  const callouts = [
    { file: 'dealer_new_hand.wav', text: 'Place your bets. Shuffle up and deal.' },
    { file: 'dealer_all_in.wav', text: 'Player is All-In. Cards on their backs.' },
  ];

  for (const c of callouts) {
    const res = await (client as any).interactions.create({
      model: 'gemini-3.8-flash-tts',
      input: [
        {
          type: 'user_input',
          content: [
            {
              type: 'text',
              text: c.text,
              annotations: [
                {
                  type: 'speech_metadata',
                  style: 'smooth, composed Monte Carlo VIP croupier',
                },
              ],
            },
          ],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [{ voice: 'Aoede' }],
      },
    });
    if (res?.output_audio?.data) {
      fs.writeFileSync(path.join(outDir, c.file), Buffer.from(res.output_audio.data, 'base64'));
      console.log(`Saved ${c.file}`);
    }
  }
}

run().catch(console.error);
