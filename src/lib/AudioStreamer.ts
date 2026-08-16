import { INPUT_SAMPLE_RATE, bytesToBase64, floatToPcm16, resample, rms } from './audio/pcm';

const CHUNK_MS = 100;

/**
 * Captures the mic and emits 100 ms base64 PCM16/16 kHz chunks.
 *
 * Uses ScriptProcessor rather than AudioWorklet: the worklet needs a separate
 * module file served at a stable URL, which the Capacitor bundle makes awkward,
 * and at 16 kHz mono the main-thread cost is negligible.
 */
export class AudioStreamer {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private buffer: Float32Array[] = [];
  private buffered = 0;
  private muted = false;

  constructor(
    private onChunk: (base64: string) => void,
    private onLevel: (level: number) => void,
  ) {}

  get active(): boolean {
    return this.ctx !== null;
  }

  async start(): Promise<void> {
    if (this.ctx) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.ctx = new AudioContext();
    await this.ctx.resume();

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(2048, 1, 1);
    // Silent sink: ScriptProcessor only fires while connected to a destination.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;

    const targetSamples = Math.round((INPUT_SAMPLE_RATE * CHUNK_MS) / 1000);

    this.processor.onaudioprocess = (event) => {
      if (!this.ctx) return;
      const input = event.inputBuffer.getChannelData(0);
      this.onLevel(this.muted ? 0 : rms(input));
      if (this.muted) return;

      const down = resample(input, this.ctx.sampleRate, INPUT_SAMPLE_RATE);
      this.buffer.push(new Float32Array(down));
      this.buffered += down.length;

      while (this.buffered >= targetSamples) {
        const merged = new Float32Array(targetSamples);
        let filled = 0;
        while (filled < targetSamples && this.buffer.length > 0) {
          const head = this.buffer[0];
          const take = Math.min(head.length, targetSamples - filled);
          merged.set(head.subarray(0, take), filled);
          filled += take;
          if (take === head.length) this.buffer.shift();
          else this.buffer[0] = head.subarray(take);
        }
        this.buffered -= targetSamples;
        const pcm = floatToPcm16(merged);
        this.onChunk(bytesToBase64(new Uint8Array(pcm.buffer)));
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.sink);
    this.sink.connect(this.ctx.destination);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.buffer = [];
      this.buffered = 0;
      this.onLevel(0);
    }
  }

  async stop(): Promise<void> {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.sink?.disconnect();
    this.sink = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.ctx) {
      await this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.buffer = [];
    this.buffered = 0;
    this.onLevel(0);
  }
}
