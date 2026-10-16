import { AIPersona, MusicMood } from '../types/poker';
import { geminiMedia } from '../services/geminiMediaService';

/**
 * Monte Carlo VIP Casino Audio Engine
 * Combines:
 * 1. Gemini 3.8 Flash TTS (`gemini-3.8-flash-tts`) for Dealer & AI Persona voices (with Web Speech & formant fallback)
 * 2. Lyria 3 (`lyria-3-clip-preview`) + Procedural Two-State Soundtrack (`lounge_jazz` <-> `high_stakes`)
 * 3. Layered VIP Casino Room Ambience (distant crowd murmur, crystal glass clinks, and Bao's tinny phone video leak)
 * 4. Physical Foley SFX (riffle shuffle, card pitch/slide, chip clinks, check knock, burn tap)
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;

  public isMuted: boolean = false;
  public isMusicEnabled: boolean = true;
  public isVoiceEnabled: boolean = true;
  public currentMood: MusicMood = 'lounge_jazz';
  public isBaoWatchingPhone: boolean = true;

  private volume: number = 0.65;
  private musicInterval: number | null = null;
  private ambienceInterval: number | null = null;
  private stepCounter: number = 0;
  private activeLyriaAudio: HTMLAudioElement | null = null;

  private voiceQueue: Array<{
    text: string;
    role: 'dealer' | 'player';
    persona?: AIPersona;
    voiceName?: string;
    voiceStyle?: string;
  }> = [];
  private isVoicePlaying: boolean = false;
  private activeVoiceAudio: HTMLAudioElement | null = null;
  private voiceGenerationId: number = 0;
  private voiceIdleResolvers: Array<() => void> = [];

  private updateMusicDucking() {
    const targetMusicGain = !this.isMusicEnabled || this.isMuted ? 0 : this.isVoicePlaying ? 0.11 : 0.24;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(targetMusicGain, this.ctx.currentTime, 0.12);
    }
    if (this.activeLyriaAudio) {
      this.activeLyriaAudio.volume = this.isVoicePlaying ? 0.13 : 0.28;
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.isMusicEnabled ? 0.24 : 0, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      this.ambienceGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
    if (this.activeLyriaAudio) {
      this.activeLyriaAudio.muted = muted || !this.isMusicEnabled;
    }
    if (muted) {
      this.clearVoiceQueue(true);
    }
  }

  public setMusicEnabled(enabled: boolean) {
    this.isMusicEnabled = enabled;
    this.updateMusicDucking();
    if (this.activeLyriaAudio) {
      this.activeLyriaAudio.muted = !enabled || this.isMuted;
    }
  }

  public setVoiceEnabled(enabled: boolean) {
    this.isVoiceEnabled = enabled;
    if (!enabled) {
      this.clearVoiceQueue(true);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Switches between 'lounge_jazz' and 'high_stakes' Lyria/procedural soundtrack states
   */
  public setMusicMood(mood: MusicMood) {
    if (this.currentMood === mood) return;
    this.currentMood = mood;

    // If Gemini API key is configured, request Lyria 3 clip for the new mood
    if (geminiMedia.isConfigured() && this.isMusicEnabled && !this.isMuted) {
      geminiMedia.generateMusicTrack(mood).then((base64Mp3) => {
        if (base64Mp3 && this.currentMood === mood) {
          this.playLyriaLoop(base64Mp3);
        }
      });
    }
  }

  private playLyriaLoop(base64Mp3: string) {
    try {
      if (this.activeLyriaAudio) {
        this.activeLyriaAudio.pause();
      }
      const audio = new Audio(`data:audio/mp3;base64,${base64Mp3}`);
      audio.loop = true;
      audio.volume = 0.28;
      audio.muted = this.isMuted || !this.isMusicEnabled;
      audio.play().catch(() => {});
      this.activeLyriaAudio = audio;
    } catch {
      // Ignore audio element errors
    }
  }

  /**
   * Starts the continuous Monte Carlo Lounge Jazz / High-Stakes pulse + VIP room ambience
   */
  public startMusicAndAmbience() {
    this.initContext();
    if (this.musicInterval !== null) return;

    // Try loading Lyria 3 track if API key is present
    if (geminiMedia.isConfigured() && this.isMusicEnabled) {
      geminiMedia.generateMusicTrack(this.currentMood).then((base64Mp3) => {
        if (base64Mp3) this.playLyriaLoop(base64Mp3);
      });
    }

    // Procedural Lounge Jazz & High-Stakes Tension Sequencer (steps every 420ms)
    const jazzChords = [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [293.66, 349.23, 440.0, 523.25], // Dm7
      [196.0, 246.94, 293.66, 349.23], // G7
    ];
    const walkingBass = [65.41, 73.42, 82.41, 98.0, 110.0, 98.0, 73.42, 82.41];
    const tensionBass = [55.0, 55.0, 58.27, 55.0, 65.41, 58.27, 55.0, 49.0];

    this.musicInterval = window.setInterval(() => {
      if (this.isMuted || !this.isMusicEnabled || !this.ctx || !this.musicGain) return;
      // If Lyria MP3 is actively playing, keep procedural synth subtle as harmonic reinforcement
      const scale = this.activeLyriaAudio && !this.activeLyriaAudio.paused ? 0.25 : 1.0;

      const now = this.ctx.currentTime;
      const step = this.stepCounter++;

      if (this.currentMood === 'lounge_jazz') {
        // Walking upright bass on even steps
        if (step % 2 === 0) {
          const bassFreq = walkingBass[(step / 2) % walkingBass.length];
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(bassFreq, now);
          gain.gain.setValueAtTime(0.16 * scale, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
          osc.connect(gain);
          gain.connect(this.musicGain);
          osc.start(now);
          osc.stop(now + 0.68);
        }

        // Warm Rhodes seventh chord pad every 8 steps
        if (step % 8 === 0) {
          const chord = jazzChords[Math.floor(step / 8) % jazzChords.length];
          chord.forEach((freq) => {
            if (!this.ctx || !this.musicGain) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.038 * scale, now + 0.18);
            gain.gain.exponentialRampToValueAtTime(0.0008, now + 2.8);
            osc.connect(gain);
            gain.connect(this.musicGain);
            osc.start(now);
            osc.stop(now + 2.9);
          });
        }

        // Brushed jazz hi-hat swing
        if (step % 2 === 1) {
          this.playBrushHat(0.025 * scale);
        }
      } else {
        // HIGH STAKES MOOD: Tense heartbeat sub-bass pulse + minor suspense
        const bassFreq = tensionBass[step % tensionBass.length];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(240, now);

        osc.frequency.setValueAtTime(bassFreq, now);
        gain.gain.setValueAtTime(0.2 * scale, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.35);

        if (step % 4 === 0) {
          // Suspenseful high string/pad harmonic
          const padOsc = this.ctx.createOscillator();
          const padGain = this.ctx.createGain();
          padOsc.type = 'sine';
          padOsc.frequency.setValueAtTime(step % 8 === 0 ? 440 : 466.16, now); // A4 / Bb4 tension
          padGain.gain.setValueAtTime(0.001, now);
          padGain.gain.linearRampToValueAtTime(0.045 * scale, now + 0.15);
          padGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
          padOsc.connect(padGain);
          padGain.connect(this.musicGain);
          padOsc.start(now);
          padOsc.stop(now + 1.45);
        }
      }
    }, 420);

    // Layered VIP Room Ambience (distant glass clinks, soft murmur, and Bao's phone audio leak)
    this.ambienceInterval = window.setInterval(() => {
      if (this.isMuted || !this.ctx || !this.ambienceGain) return;
      const roll = Math.random();
      if (roll < 0.35) {
        this.playDistantGlassClink();
      } else if (roll < 0.72 && this.isBaoWatchingPhone) {
        this.playPhoneReelLeak();
      }
    }, 3400);
  }

  private playBrushHat(vol: number) {
    if (!this.ctx || !this.musicGain) return;
    const dur = 0.06;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(5500, this.ctx.currentTime);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.musicGain);
    src.start();
  }

  /**
   * Distant crystal whiskey/champagne glass clink in the Monte Carlo VIP lounge
   */
  public playDistantGlassClink() {
    if (this.isMuted || !this.ctx || !this.ambienceGain) return;
    const now = this.ctx.currentTime;
    const base = 3100 + Math.random() * 600;
    [base, base * 1.48].forEach((freq, i) => {
      if (!this.ctx || !this.ambienceGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);
      gain.gain.setValueAtTime(0.045, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + i * 0.04 + 0.32);
      osc.connect(gain);
      gain.connect(this.ambienceGain);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.35);
    });
  }

  /**
   * Faint, tinny high-passed smartphone video/reel sound leaking from Seat #3 (Bao's phone)
   */
  public playPhoneReelLeak() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.ambienceGain) return;
      const now = this.ctx.currentTime;

      // Tiny high-passed melodic/chirp snippet like a sped-up mobile short video
      const notes = [1480, 1760, 1975, 1567];
      notes.forEach((f, idx) => {
        if (!this.ctx || !this.ambienceGain) return;
        const osc = this.ctx.createOscillator();
        const hp = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        hp.type = 'bandpass';
        hp.frequency.setValueAtTime(2400, now);
        hp.Q.setValueAtTime(4.5, now); // Tinny phone speaker EQ

        osc.type = 'square';
        osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 80, now + idx * 0.065);

        gain.gain.setValueAtTime(0.022, now + idx * 0.065);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.065 + 0.055);

        osc.connect(hp);
        hp.connect(gain);
        gain.connect(this.ambienceGain);

        osc.start(now + idx * 0.065);
        osc.stop(now + idx * 0.065 + 0.06);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Dealer riffle shuffle + bridge cascade on new hand
   */
  public playRiffleShuffle() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const flutterCount = 14;
      for (let i = 0; i < flutterCount; i++) {
        const offset = i * 0.022 + Math.random() * 0.006;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520 + i * 28, now + offset);
        osc.frequency.exponentialRampToValueAtTime(140, now + offset + 0.024);

        gain.gain.setValueAtTime(0.11, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.025);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.028);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Dealer burn-card table tap before dealing Flop / Turn / River
   */
  public playBurnTap() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      [0, 0.085].forEach((offset) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(190, now + offset);
        osc.frequency.exponentialRampToValueAtTime(75, now + offset + 0.05);
        gain.gain.setValueAtTime(0.22, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.055);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.06);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Clears pending voice lines and optionally stops active playback (e.g., on new hand or mute)
   */
  public clearVoiceQueue(cancelActive: boolean = true) {
    this.voiceQueue = [];
    if (cancelActive) {
      this.voiceGenerationId++;
      if (this.activeVoiceAudio) {
        try {
          this.activeVoiceAudio.pause();
          this.activeVoiceAudio.src = '';
        } catch {
          // Ignore
        }
        this.activeVoiceAudio = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }
      this.isVoicePlaying = false;
      this.updateMusicDucking();
      this.flushVoiceIdleResolvers();
    }
  }

  private flushVoiceIdleResolvers() {
    if (this.voiceIdleResolvers.length === 0) return;
    const resolvers = [...this.voiceIdleResolvers];
    this.voiceIdleResolvers = [];
    resolvers.forEach((resolve) => resolve());
  }

  /**
   * Returns true if a voice clip is currently speaking or waiting in the queue
   */
  public isSpeakingOrQueued(): boolean {
    return this.isVoicePlaying || this.voiceQueue.length > 0;
  }

  /**
   * Resolves once the active voice and any queued utterances finish playing
   */
  public waitForVoiceIdle(maxWaitMs: number = 4200): Promise<void> {
    if (this.isMuted || !this.isVoiceEnabled || !this.isSpeakingOrQueued()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(done, maxWaitMs);
      this.voiceIdleResolvers.push(done);
    });
  }

  /**
   * Enqueues a Dealer announcement using Gemini 3.8 Flash TTS (`gemini-3.8-flash-tts`)
   * with automatic fallback to Web Speech synthesis.
   * Drops stale pending AI banter if the queue is backed up so Dealer callouts stay synchronized.
   */
  public async speakDealer(text: string) {
    if (this.isMuted || !this.isVoiceEnabled) return;

    // Keep at most 1 pending item before a Dealer announcement; drop stale queued AI banter
    if (this.voiceQueue.length > 0) {
      this.voiceQueue = this.voiceQueue.filter((item) => item.role === 'dealer').slice(-1);
    }

    this.voiceQueue.push({
      text,
      role: 'dealer',
    });
    this.processVoiceQueue();
  }

  /**
   * Enqueues an AI Player chit-chat line using Gemini 3.8 Flash TTS (`gemini-3.8-flash-tts`)
   * with persona-matched voice & style, falling back to persona-tuned Web Speech synthesis.
   */
  public async speakPlayer(
    text: string,
    persona: AIPersona,
    voiceName?: string,
    voiceStyle?: string
  ) {
    if (this.isMuted || !this.isVoiceEnabled) return;

    // Prevent AI banter backlog: replace any unplayed player banter in the queue
    this.voiceQueue = this.voiceQueue.filter((item) => item.role === 'dealer');
    if (this.voiceQueue.length >= 2) return;

    this.voiceQueue.push({
      text,
      role: 'player',
      persona,
      voiceName,
      voiceStyle,
    });
    this.processVoiceQueue();
  }

  private async processVoiceQueue() {
    if (this.isVoicePlaying) return;
    if (this.isMuted || !this.isVoiceEnabled || this.voiceQueue.length === 0) {
      this.flushVoiceIdleResolvers();
      return;
    }

    this.isVoicePlaying = true;
    this.updateMusicDucking();
    const genId = this.voiceGenerationId;

    while (this.voiceQueue.length > 0 && genId === this.voiceGenerationId) {
      if (this.isMuted || !this.isVoiceEnabled) break;

      const item = this.voiceQueue.shift()!;
      await this.playSingleVoiceItem(item, genId);

      // Brief natural breathing pause between consecutive queued utterances
      if (this.voiceQueue.length > 0 && genId === this.voiceGenerationId) {
        await new Promise<void>((r) => window.setTimeout(r, 150));
      }
    }

    if (genId === this.voiceGenerationId) {
      this.isVoicePlaying = false;
      this.updateMusicDucking();
      this.flushVoiceIdleResolvers();
    }
  }

  private async playSingleVoiceItem(
    item: {
      text: string;
      role: 'dealer' | 'player';
      persona?: AIPersona;
      voiceName?: string;
      voiceStyle?: string;
    },
    genId: number
  ): Promise<void> {
    if (geminiMedia.isConfigured()) {
      const targetVoice =
        item.role === 'dealer' ? 'Aoede' : item.voiceName || 'Charon';
      const targetStyle =
        item.role === 'dealer'
          ? 'composed, welcoming, authoritative Monte Carlo VIP casino dealer'
          : item.voiceStyle || 'confident poker player';

      const base64Wav = await geminiMedia.synthesizeSpeech(
        item.text,
        targetVoice,
        targetStyle
      );
      if (genId !== this.voiceGenerationId || this.isMuted || !this.isVoiceEnabled) {
        return;
      }
      if (base64Wav) {
        await this.playBase64AudioPromise(base64Wav, 'audio/wav', item.text);
        return;
      }
    }

    if (genId !== this.voiceGenerationId || this.isMuted || !this.isVoiceEnabled) {
      return;
    }

    if (item.role === 'dealer') {
      await this.speakWebFallbackPromise(item.text, 1.02, 1.0);
      return;
    }

    // Persona-specific pitch & rate fallback
    let pitch = 1.0;
    let rate = 1.0;
    switch (item.persona) {
      case 'general_man': // Viktor (Shark)
        pitch = 0.84;
        rate = 0.95;
        break;
      case 'woman': // Elena (Rock)
        pitch = 1.24;
        rate = 0.98;
        break;
      case 'heavy_phone': // Bao (Station)
        pitch = 0.91;
        rate = 0.96;
        break;
      case 'flashy_maniac': // Marcus (Maniac)
        pitch = 1.08;
        rate = 1.14;
        break;
    }
    await this.speakWebFallbackPromise(item.text, pitch, rate);
  }

  private estimateSpeechDurationMs(text: string, rate: number = 1.0): number {
    const wordCount = Math.max(1, text.trim().split(/\s+/).length);
    return Math.min(4600, Math.max(1100, Math.round((wordCount * 340) / Math.max(0.75, rate)) + 350));
  }

  private playBase64AudioPromise(
    base64Data: string,
    mimeType: string,
    textForFallbackDuration: string
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (this.activeVoiceAudio === audio) {
          this.activeVoiceAudio = null;
        }
        resolve();
      };

      const maxMs = this.estimateSpeechDurationMs(textForFallbackDuration, 1.0) + 800;
      const fallbackTimer = window.setTimeout(finish, maxMs);

      let audio: HTMLAudioElement | null = null;
      try {
        audio = new Audio(`data:${mimeType};base64,${base64Data}`);
        this.activeVoiceAudio = audio;
        audio.volume = Math.min(1, this.volume * 1.15);
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
      } catch {
        finish();
      }
    });
  }

  private speakWebFallbackPromise(text: string, pitch: number, rate: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const estimatedMs = this.estimateSpeechDurationMs(text, rate);
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safetyTimer);
        resolve();
      };

      const safetyTimer = window.setTimeout(finish, estimatedMs);

      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const utter = new SpeechSynthesisUtterance(text);
          utter.pitch = pitch;
          utter.rate = rate;
          utter.volume = Math.min(1, this.volume);

          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            if (pitch > 1.15) {
              const female = voices.find((v) =>
                /samantha|victoria|karen|moira|fiona|female|zira/i.test(v.name)
              );
              if (female) utter.voice = female;
            } else if (pitch < 0.9) {
              const male = voices.find((v) =>
                /daniel|alex|fred|tom|oliver|david|male/i.test(v.name)
              );
              if (male) utter.voice = male;
            }
          }
          utter.onend = finish;
          utter.onerror = finish;
          window.speechSynthesis.speak(utter);
        } else {
          finish();
        }
      } catch {
        finish();
      }
    });
  }

  /**
   * Card sliding over felt (filtered noise burst)
   */
  public playCardSlide() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const duration = 0.16;
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + duration);
      filter.Q.setValueAtTime(2.5, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start();
    } catch {
      // Audio fallback silent
    }
  }

  /**
   * Card snap / flip onto table
   */
  public playCardFlip() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(160, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Realistic Clay Poker Chip clink / stack clatter
   */
  public playChipClink(count: number = 1) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;
      const numClicks = Math.min(count, 4);

      for (let i = 0; i < numClicks; i++) {
        const offset = i * (0.03 + Math.random() * 0.02);

        const freqs = [
          2800 + Math.random() * 300,
          3600 + Math.random() * 400,
          5200 + Math.random() * 500,
        ];

        freqs.forEach((freq) => {
          if (!this.ctx || !this.masterGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + offset);

          gain.gain.setValueAtTime(0.12 / freqs.length, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.05);

          osc.connect(gain);
          gain.connect(this.masterGain);

          osc.start(now + offset);
          osc.stop(now + offset + 0.06);
        });
      }
    } catch {
      // Audio fallback
    }
  }

  /**
   * Felt knock when Checking
   */
  public playKnock() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;
      [0, 0.12].forEach((offset) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now + offset);
        osc.frequency.exponentialRampToValueAtTime(60, now + offset + 0.08);

        gain.gain.setValueAtTime(0.35, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now + offset);
        osc.stop(now + offset + 0.09);
      });
    } catch {
      // Audio fallback
    }
  }

  /**
   * Winner celebration chime / pot sweep
   */
  public playWinFanfare() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const noteStart = now + idx * 0.11;
        const noteDuration = 0.45;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.2, noteStart + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDuration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(noteStart);
        osc.stop(noteStart + noteDuration);
      });
    } catch {
      // Audio fallback
    }
  }

  /**
   * Soft friction sweep when sliding a stack of chips across the emerald felt
   */
  public playChipSlide() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const duration = 0.22;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        const env = Math.sin((i / bufferSize) * Math.PI);
        data[i] = (Math.random() * 2 - 1) * env * 0.5;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, this.ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(1100, this.ctx.currentTime + duration);
      filter.Q.setValueAtTime(1.8, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start();
      this.playChipClink(2);
    } catch {
      // Audio fallback
    }
  }

  /**
   * Subtle luxury brass chime when tournament blind level increases
   */
  public playBlindUp() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const now = this.ctx.currentTime;
      [440, 659.25].forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        gain.gain.setValueAtTime(0.15, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.55);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.56);
      });
    } catch {
      // Audio fallback
    }
  }

  /**
   * Bet slider / tick interaction
   */
  public playTick() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.02);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.02);
    } catch {
      // Audio fallback
    }
  }
}

export const pokerAudio = new SoundEngine();
