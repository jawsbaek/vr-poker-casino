import { GoogleGenAI } from '@google/genai';
import { MusicMood } from '../types/poker';

/**
 * Gemini Media Service for Monte Carlo VIP 3D Poker
 * Integrates:
 * - Gemini 3.8 Flash TTS (`gemini-3.8-flash-tts`) for expressive Dealer & AI Player voices
 * - Lyria 3 (`lyria-3-clip-preview`) for dynamic Lounge Jazz & High-Stakes background soundtracks
 * - Nano Banana (`gemini-3.1-flash-image`) for UI portraits, avatar textures, and VIP lounge artwork
 */
class GeminiMediaService {
  private apiKey: string = '';
  private client: GoogleGenAI | null = null;
  private ttsCache = new Map<string, string>(); // cache key -> base64 WAV audio
  private musicCache = new Map<MusicMood, string>(); // mood -> base64 MP3 audio

  constructor() {
    const envKey =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('GEMINI_API_KEY')) ||
      '';
    if (envKey) {
      this.setApiKey(envKey);
    }
  }

  public setApiKey(key: string) {
    this.apiKey = key.trim();
    if (typeof localStorage !== 'undefined') {
      if (this.apiKey) {
        localStorage.setItem('GEMINI_API_KEY', this.apiKey);
      } else {
        localStorage.removeItem('GEMINI_API_KEY');
      }
    }
    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.client = null;
    }
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public isConfigured(): boolean {
    return Boolean(this.client && this.apiKey);
  }

  /**
   * Synthesizes speech using Gemini 3.8 Flash TTS (`gemini-3.8-flash-tts`)
   * with expressive style annotations and persona voice selection.
   */
  public async synthesizeSpeech(
    transcript: string,
    voiceName: string = 'Charon',
    voiceStyle: string = 'smooth professional Monte Carlo casino dealer'
  ): Promise<string | null> {
    if (!this.client) return null;

    const cacheKey = `${voiceName}:${voiceStyle}:${transcript}`;
    if (this.ttsCache.has(cacheKey)) {
      return this.ttsCache.get(cacheKey)!;
    }

    try {
      const interaction = await (this.client as unknown as {
        interactions: {
          create: (params: Record<string, unknown>) => Promise<{
            output_audio?: { data?: string };
          }>;
        };
      }).interactions.create({
        model: 'gemini-3.8-flash-tts',
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text: transcript,
                annotations: [
                  {
                    type: 'speech_metadata',
                    style: voiceStyle,
                  },
                ],
              },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [{ voice: voiceName }],
        },
      });

      const base64Audio = interaction?.output_audio?.data;
      if (base64Audio) {
        this.ttsCache.set(cacheKey, base64Audio);
        return base64Audio;
      }
      return null;
    } catch (err) {
      console.warn('[GeminiMediaService] gemini-3.8-flash-tts fallback to procedural:', err);
      return null;
    }
  }

  /**
   * Generates a 30-second instrumental casino soundtrack clip via Lyria 3 (`lyria-3-clip-preview`)
   */
  public async generateMusicTrack(mood: MusicMood): Promise<string | null> {
    if (!this.client) return null;
    if (this.musicCache.has(mood)) {
      return this.musicCache.get(mood)!;
    }

    const prompt =
      mood === 'lounge_jazz'
        ? 'Smooth late-night Monte Carlo VIP casino lounge jazz, warm upright bass walking line, brushed snare drums, Rhodes electric piano seventh chords, muted velvet trumpet, sophisticated 88 BPM instrumental.'
        : 'Tense high-stakes poker showdown instrumental, deep pulsing cinematic sub-bass, subtle ticking rimshot percussion, suspenseful minor-key Rhodes chords and strings, 108 BPM instrumental.';

    try {
      const interaction = await (this.client as unknown as {
        interactions: {
          create: (params: Record<string, unknown>) => Promise<{
            output_audio?: { data?: string };
          }>;
        };
      }).interactions.create({
        model: 'lyria-3-clip-preview',
        input: prompt,
      });

      const base64Mp3 = interaction?.output_audio?.data;
      if (base64Mp3) {
        this.musicCache.set(mood, base64Mp3);
        return base64Mp3;
      }
      return null;
    } catch (err) {
      console.warn('[GeminiMediaService] lyria-3-clip-preview fallback to procedural:', err);
      return null;
    }
  }

  /**
   * Generates a Nano Banana (`gemini-3.1-flash-image`) portrait or texture
   */
  public async generateNanoBananaImage(prompt: string): Promise<string | null> {
    if (!this.client) return null;

    try {
      const interaction = await (this.client as unknown as {
        interactions: {
          create: (params: Record<string, unknown>) => Promise<{
            output_image?: { data?: string };
          }>;
        };
      }).interactions.create({
        model: 'gemini-3.1-flash-image',
        input: prompt,
      });

      return interaction?.output_image?.data || null;
    } catch (err) {
      console.warn('[GeminiMediaService] gemini-3.1-flash-image error:', err);
      return null;
    }
  }
}

export const geminiMedia = new GeminiMediaService();
