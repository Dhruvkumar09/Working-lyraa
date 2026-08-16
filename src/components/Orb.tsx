import { useMemo } from 'react';
import type { Phase } from '../lib/StateManager';

interface OrbProps {
  phase: Phase;
  level: number;
  accent: { from: string; to: string };
  animated: boolean;
  particles: boolean;
  onTap: () => void;
  label: string;
}

/** Short enough to sit inside the orb at wide letter-spacing. */
const ORB_WORD: Record<Phase, string> = {
  disconnected: 'off',
  connecting: 'connecting',
  reconnecting: 'reconnecting',
  idle: 'lyraa',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  executing: 'on it',
  error: 'error',
};

/**
 * The centrepiece. Breathing is CSS-driven and the audio-reactive scale is
 * inline, so they live on separate elements: a CSS animation overwrites any
 * inline transform on the same node, which would otherwise cancel the reaction
 * to Lyraa's voice.
 */
export function Orb({ phase, level, accent, animated, particles, onTap, label }: OrbProps) {
  const isThinking = phase === 'thinking' || phase === 'connecting' || phase === 'reconnecting';
  const isSpeaking = phase === 'speaking';
  const isListening = phase === 'listening';
  const isOff = phase === 'disconnected';

  const scale = 1 + Math.min(level, 1) * (isSpeaking ? 0.13 : 0.08);
  const glow = isOff ? 0.1 : 0.35 + Math.min(level, 1) * 0.65;

  const dots = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const radius = 46 + (i % 4) * 7;
        return {
          angle,
          radius,
          size: 2 + (i % 3),
          delay: (i * 0.42).toFixed(2),
          duration: (6 + (i % 5)).toFixed(1),
          // Drifts outward along its own spoke, so the ring breathes apart.
          dx: `${(Math.cos(angle) * 12).toFixed(1)}px`,
          dy: `${(Math.sin(angle) * 12).toFixed(1)}px`,
        };
      }),
    [],
  );

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      className="relative flex h-64 w-64 items-center justify-center rounded-full outline-none transition-transform duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-white/40"
    >
      {particles &&
        !isOff &&
        dots.map((dot, i) => (
          <span
            key={i}
            className="absolute"
            style={{
              transform: `translate(${Math.cos(dot.angle) * dot.radius * 2}%, ${Math.sin(dot.angle) * dot.radius * 2}%)`,
            }}
          >
            <span
              className={animated ? 'block rounded-full animate-drift' : 'block rounded-full'}
              style={{
                width: dot.size,
                height: dot.size,
                background: i % 2 === 0 ? accent.from : accent.to,
                opacity: animated ? undefined : 0.5,
                animationDelay: `${dot.delay}s`,
                animationDuration: `${dot.duration}s`,
                boxShadow: `0 0 8px ${accent.from}`,
                ['--dx' as string]: dot.dx,
                ['--dy' as string]: dot.dy,
              }}
            />
          </span>
        ))}

      <span
        className="absolute inset-0 rounded-full blur-3xl transition-opacity duration-500"
        style={{
          background: `radial-gradient(circle, ${accent.from} 0%, transparent 68%)`,
          opacity: glow * 0.55,
        }}
      />

      {isListening && (
        <span
          className="absolute inset-3 rounded-full border"
          style={{ borderColor: accent.to, opacity: 0.25 + Math.min(level, 1) * 0.5 }}
        />
      )}

      {isThinking && (
        <span
          className={`absolute inset-1 rounded-full border-2 border-transparent ${animated ? 'animate-spin-slow' : ''}`}
          style={{ borderTopColor: accent.to, borderRightColor: accent.from, opacity: 0.75 }}
        />
      )}

      <span
        className={`relative flex h-44 w-44 items-center justify-center ${animated && !isOff ? 'animate-breathe' : ''}`}
      >
        <span
          className="absolute inset-0 flex items-center justify-center rounded-full"
          style={{
            transform: `scale(${scale})`,
            transition: 'transform 90ms linear',
            background: `radial-gradient(circle at 32% 28%, ${accent.from}, ${accent.to} 62%, #10091f 100%)`,
            boxShadow: `0 0 ${28 + glow * 52}px ${glow * 0.85}rem ${accent.from}55, inset 0 0 60px rgba(255,255,255,0.16)`,
            filter: isOff ? 'saturate(0.25) brightness(0.55)' : 'none',
          }}
        >
          <span
            className="absolute inset-0 rounded-full opacity-70 mix-blend-screen"
            style={{ background: 'radial-gradient(circle at 68% 74%, rgba(255,255,255,0.28), transparent 55%)' }}
          />
          <span className="relative text-sm font-medium tracking-[0.32em] text-white/85 uppercase">
            {ORB_WORD[phase]}
          </span>
        </span>
      </span>
    </button>
  );
}
