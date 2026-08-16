import { describe, expect, it } from 'vitest';
import {
  bytesToPcm16,
  floatToPcm16,
  pcm16ToFloat,
  peakAmplitude,
  resample,
  rms,
  sampleRateFromMimeType,
} from './pcm';

describe('pcm conversion', () => {
  it('round-trips float to pcm16 within quantisation error', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]);
    const restored = pcm16ToFloat(floatToPcm16(input));
    for (let i = 0; i < input.length; i++) {
      expect(restored[i]).toBeCloseTo(input[i], 4);
    }
  });

  it('clamps out-of-range samples', () => {
    const pcm = floatToPcm16(new Float32Array([2, -2]));
    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32768);
  });

  it('reads pcm16 from a byte buffer little-endian', () => {
    // 0x0100 = 256, 0xFFFF = -1
    const pcm = bytesToPcm16(new Uint8Array([0x00, 0x01, 0xff, 0xff]));
    expect([...pcm]).toEqual([256, -1]);
  });

  it('tolerates an odd trailing byte', () => {
    const pcm = bytesToPcm16(new Uint8Array([0x00, 0x01, 0x7f]));
    expect(pcm.length).toBe(1);
    expect(pcm[0]).toBe(256);
  });
});

describe('resample', () => {
  it('returns the same array when rates match', () => {
    const input = new Float32Array([1, 2, 3]);
    expect(resample(input, 16000, 16000)).toBe(input);
  });

  it('downsamples 48k to 16k by a third', () => {
    const input = new Float32Array(300).fill(0.5);
    const out = resample(input, 48000, 16000);
    expect(out.length).toBe(100);
    expect(out[50]).toBeCloseTo(0.5, 5);
  });

  it('upsamples 24k to 48k by doubling', () => {
    const out = resample(new Float32Array([0, 1]), 24000, 48000);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0, 5);
  });

  it('handles empty input', () => {
    expect(resample(new Float32Array(0), 48000, 16000).length).toBe(0);
  });
});

describe('sampleRateFromMimeType', () => {
  it('parses the rate parameter', () => {
    expect(sampleRateFromMimeType('audio/pcm;rate=24000')).toBe(24000);
    expect(sampleRateFromMimeType('audio/pcm;rate=16000')).toBe(16000);
  });

  it('falls back when absent or malformed', () => {
    expect(sampleRateFromMimeType(undefined)).toBe(24000);
    expect(sampleRateFromMimeType('audio/pcm')).toBe(24000);
    expect(sampleRateFromMimeType('audio/pcm;rate=abc')).toBe(24000);
  });
});

describe('levels', () => {
  it('reports peak amplitude', () => {
    expect(peakAmplitude(new Float32Array([0.1, -0.7, 0.3]))).toBeCloseTo(0.7, 5);
  });

  it('reports rms and handles empty input', () => {
    expect(rms(new Float32Array([1, 1, 1]))).toBeCloseTo(1, 5);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});
