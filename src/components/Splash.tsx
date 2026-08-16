import { useEffect } from 'react';

interface SplashProps {
  animated: boolean;
  onDone: () => void;
}

const LETTERS = ['L', 'Y', 'R', 'A', 'A'];

/**
 * The wordmark and the byline are stacked in the same box so the handover
 * between them costs no layout, and every step is transform/opacity only to
 * keep the sequence on the compositor.
 */
const LETTER_STEP_MS = 85;
const WORDMARK_OUT_MS = 1450;
const BYLINE_IN_MS = 1760;
const EXIT_MS = 2560;
const TOTAL_MS = 3080;
const STILL_MS = 620;

export function Splash({ animated, onDone }: SplashProps) {
  useEffect(() => {
    const id = window.setTimeout(onDone, animated ? TOTAL_MS : STILL_MS);
    return () => window.clearTimeout(id);
  }, [animated, onDone]);

  // With motion off, both lines are simply shown together for a beat.
  if (!animated) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#05060f]">
        <span className="accent-text text-5xl font-semibold tracking-[0.3em]">LYRAA</span>
        <span className="text-[11px] tracking-[0.42em] text-white/45 uppercase">Made by Dhruv</span>
      </div>
    );
  }

  return (
    <div
      className="animate-splash-out relative flex h-full items-center justify-center overflow-hidden bg-[#05060f]"
      style={{ animationDelay: `${EXIT_MS}ms` }}
    >
      <span
        className="animate-splash-halo pointer-events-none absolute h-72 w-72 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--accent-from) 0%, transparent 70%)' }}
      />

      <div className="relative flex h-24 w-full items-center justify-center">
        <span
          className="animate-splash-out absolute flex items-center"
          style={{ animationDelay: `${WORDMARK_OUT_MS}ms` }}
        >
          {LETTERS.map((letter, i) => (
            <span
              key={i}
              className="animate-splash-letter accent-text text-5xl font-semibold"
              style={{ animationDelay: `${i * LETTER_STEP_MS}ms`, marginRight: '0.3em' }}
            >
              {letter}
            </span>
          ))}
        </span>

        <span
          className="animate-splash-in absolute text-[11px] tracking-[0.42em] text-white/55 uppercase"
          style={{ animationDelay: `${BYLINE_IN_MS}ms` }}
        >
          Made by Dhruv
        </span>
      </div>
    </div>
  );
}
