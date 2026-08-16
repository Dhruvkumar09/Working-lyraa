import { useEffect, useRef } from 'react';
import type { Phase } from '../lib/StateManager';
import type { LyraaSettings } from '../lib/SettingsManager';

interface WaveformProps {
  phase: Phase;
  inputLevel: number;
  outputLevel: number;
  style: LyraaSettings['waveformStyle'];
  accent: { from: string; to: string };
  animated: boolean;
}

const BARS = 48;

/**
 * Canvas waveform. Levels are smoothed toward the live value each frame so the
 * bars glide instead of snapping between audio callbacks.
 */
export function Waveform({ phase, inputLevel, outputLevel, style, accent, animated }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>(new Array(BARS).fill(0));
  const target = useRef({ input: 0, output: 0, phase: 'disconnected' as Phase });

  target.current = { input: inputLevel, output: outputLevel, phase };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let time = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      if (!running) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const { input, output, phase: current } = target.current;
      const live = Math.max(input, output);
      const idle = current === 'disconnected' ? 0 : 0.06;
      time += 0.05;

      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, accent.from);
      gradient.addColorStop(1, accent.to);

      for (let i = 0; i < BARS; i++) {
        const centre = 1 - Math.abs(i / (BARS - 1) - 0.5) * 2;
        const wobble = animated ? (Math.sin(time + i * 0.45) * 0.5 + 0.5) * 0.35 : 0.2;
        const goal = Math.max(idle, live * (0.35 + centre * 0.65) * (0.65 + wobble));
        levels.current[i] += (goal - levels.current[i]) * 0.25;
      }

      ctx.fillStyle = gradient;
      ctx.strokeStyle = gradient;
      ctx.shadowColor = accent.from;
      ctx.shadowBlur = live > 0.05 ? 14 : 4;

      if (style === 'bars') {
        const gap = 3;
        const barWidth = Math.max(2, w / BARS - gap);
        for (let i = 0; i < BARS; i++) {
          const value = Math.min(1, levels.current[i]);
          const barHeight = Math.max(3, value * h * 0.92);
          const x = i * (barWidth + gap);
          const y = (h - barHeight) / 2;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
          ctx.fill();
        }
      } else if (style === 'wave') {
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < BARS; i++) {
          const value = Math.min(1, levels.current[i]);
          const x = (i / (BARS - 1)) * w;
          const y = h / 2 - Math.sin(time * 1.5 + i * 0.5) * value * h * 0.42;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        const value = Math.min(1, levels.current[Math.floor(BARS / 2)]);
        const radius = Math.max(6, value * Math.min(w, h) * 0.45);
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    // Stop burning frames while the app is backgrounded.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [style, accent.from, accent.to, animated]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}
