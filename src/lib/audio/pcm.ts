/** PCM helpers for the Live API wire format: raw 16-bit little-endian mono. */

export const INPUT_SAMPLE_RATE = 16000;
export const DEFAULT_OUTPUT_SAMPLE_RATE = 24000;

export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function pcm16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff);
  }
  return out;
}

/** Linear resampler. Adequate for speech and cheap enough for the audio thread. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || input.length === 0) return input;
  const ratio = from / to;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Int16Array view over bytes, tolerating odd lengths and unaligned offsets. */
export function bytesToPcm16(bytes: Uint8Array): Int16Array {
  const usable = bytes.length - (bytes.length % 2);
  const copy = new Uint8Array(usable);
  copy.set(bytes.subarray(0, usable));
  return new Int16Array(copy.buffer);
}

/** Reads the sample rate out of mime strings like `audio/pcm;rate=24000`. */
export function sampleRateFromMimeType(mimeType: string | undefined, fallback = DEFAULT_OUTPUT_SAMPLE_RATE): number {
  if (!mimeType) return fallback;
  const match = /rate=(\d+)/i.exec(mimeType);
  if (!match) return fallback;
  const rate = Number.parseInt(match[1], 10);
  return Number.isFinite(rate) && rate > 0 ? rate : fallback;
}

/** Peak amplitude in 0..1, used to drive the waveform and orb reactivity. */
export function peakAmplitude(input: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < input.length; i++) {
    const abs = Math.abs(input[i]);
    if (abs > peak) peak = abs;
  }
  return Math.min(1, peak);
}

export function rms(input: Float32Array): number {
  if (input.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.min(1, Math.sqrt(sum / input.length));
}
