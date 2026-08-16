import { base64ToBytes, bytesToPcm16, pcm16ToFloat, sampleRateFromMimeType } from './audio/pcm';

/**
 * Plays the model's streamed PCM by scheduling each chunk back to back.
 *
 * Interruption is the hard requirement here: `stop()` must silence output
 * within a frame, so scheduled sources are tracked and killed individually
 * rather than waiting for the queue to drain.
 */

/**
 * Lead time before the first chunk of a run. Consecutive chunks are scheduled
 * exactly where the previous one ended, so this is the only slack absorbing
 * network jitter — long enough that a hiccup does not tear a hole in a word,
 * short enough not to be heard as lag. The Audio quality setting picks between
 * the two: `high` buys smoother speech on a weak connection with ~70 ms more
 * delay before she starts talking.
 */
const LEAD_BALANCED_S = 0.09;
const LEAD_HIGH_S = 0.16;

/** Long enough to kill a click at a waveform discontinuity, short enough to read as instant. */
const FADE_S = 0.008;

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData = new Float32Array(0);
  private playHead = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private raf: number | null = null;
  private smoothed = 0;
  private lead = LEAD_BALANCED_S;

  constructor(private onLevel: (level: number) => void) {}

  setQuality(quality: 'balanced' | 'high'): void {
    this.lead = quality === 'high' ? LEAD_HIGH_S : LEAD_BALANCED_S;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      // Tap the real output so the orb tracks the actual voice, not a guess.
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.gain.connect(this.analyser);
      this.playHead = this.ctx.currentTime;
    }
    return this.ctx;
  }

  /** Must be called from a user gesture so autoplay policy lets audio through. */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  get isPlaying(): boolean {
    return this.sources.size > 0;
  }

  async enqueue(base64: string, mimeType?: string): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const pcm = bytesToPcm16(base64ToBytes(base64));
    if (pcm.length === 0) return;

    const samples = pcm16ToFloat(pcm);
    const rate = sampleRateFromMimeType(mimeType);

    const buffer = ctx.createBuffer(1, samples.length, rate);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // A run that has fallen behind the clock is starting mid-waveform, so it gets
    // the jitter buffer and a fade. Chunks inside a run join sample-exactly and
    // must not be faded, or every boundary would warble.
    const fresh = this.playHead <= ctx.currentTime;
    const startAt = fresh ? ctx.currentTime + this.lead : this.playHead;

    if (fresh) {
      const ramp = ctx.createGain();
      ramp.gain.setValueAtTime(0, startAt);
      ramp.gain.linearRampToValueAtTime(1, startAt + FADE_S);
      ramp.connect(this.gain!);
      source.connect(ramp);
    } else {
      source.connect(this.gain!);
    }

    source.start(startAt);
    this.playHead = startAt + buffer.duration;

    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      try {
        source.disconnect();
      } catch {
        /* already torn down */
      }
      if (this.sources.size === 0) this.setLevel(0);
    };

    this.pump();
  }

  /**
   * Reads the real output envelope once per frame. Decay is asymmetric so the orb
   * jumps with the voice and settles gently instead of strobing on every syllable.
   */
  private pump(): void {
    if (this.raf !== null) return;
    const tick = () => {
      if (!this.analyser || this.sources.size === 0) {
        this.raf = null;
        this.smoothed = 0;
        this.setLevel(0);
        return;
      }
      this.analyser.getFloatTimeDomainData(this.timeData);
      let peak = 0;
      for (let i = 0; i < this.timeData.length; i += 1) {
        const amplitude = Math.abs(this.timeData[i]);
        if (amplitude > peak) peak = amplitude;
      }
      this.smoothed = Math.max(peak, this.smoothed * 0.82);
      this.setLevel(Math.min(1, this.smoothed));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private setLevel(level: number): void {
    this.onLevel(level);
  }

  /**
   * Immediate silence, used when Dhruv interrupts. The gain ramp and the
   * scheduled stop share the same instant, so the voice is cut off cleanly
   * rather than clipped into a click.
   */
  stop(): void {
    const ctx = this.ctx;
    if (ctx && this.gain) {
      const now = ctx.currentTime;
      const cutoff = now + FADE_S;
      const gain = this.gain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, cutoff);
      gain.setValueAtTime(1, cutoff + 0.001);

      for (const source of this.sources) {
        try {
          source.onended = null;
          source.stop(cutoff);
        } catch {
          /* already finished */
        }
      }
      this.playHead = cutoff;
    }

    this.sources.clear();
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.smoothed = 0;
    this.setLevel(0);
  }

  async close(): Promise<void> {
    this.stop();
    if (this.ctx) {
      await this.ctx.close().catch(() => {});
      this.ctx = null;
      this.gain = null;
      this.analyser = null;
    }
  }
}
