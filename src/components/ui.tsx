import type { CSSProperties, ReactNode } from 'react';

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/72 backdrop-blur-sm">
      <button type="button" aria-label="Close" onClick={onClose} className="h-14 w-full shrink-0" />
      <div className="glass animate-rise flex min-h-0 flex-1 flex-col rounded-t-3xl">
        <div className="safe-top flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="glass-flat rounded-full px-3.5 py-1.5 text-sm text-white/75 active:scale-95"
          >
            Done
          </button>
        </div>
        <div className="scroll-area min-h-0 flex-1 px-5 pb-6">{children}</div>
        {footer && <div className="safe-bottom border-t border-white/10 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-1">
      <h3 className="mb-2 text-xs font-semibold tracking-[0.18em] text-white/45 uppercase">{title}</h3>
      <div className="glass-flat divide-y divide-white/8 rounded-2xl">{children}</div>
      {note && <p className="mt-2 px-1 text-xs leading-relaxed text-white/35">{note}</p>}
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
  onClick,
  stack,
}: {
  label: string;
  hint?: string;
  children?: ReactNode;
  onClick?: () => void;
  /** Puts the control on its own full-width line, for anything too wide to sit beside the label. */
  stack?: boolean;
}) {
  const text = (
    <div className="min-w-0 flex-1 pr-3">
      <div className="text-sm font-medium text-white/90">{label}</div>
      {hint && <div className="mt-0.5 text-xs leading-snug text-white/45">{hint}</div>}
    </div>
  );

  if (stack) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center">{text}</div>
        <div className="mt-2.5">{children}</div>
      </div>
    );
  }

  const content = (
    <>
      {text}
      {children}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center px-4 py-3 text-left active:bg-white/5">
        {content}
      </button>
    );
  }
  return <div className="flex items-center px-4 py-3">{content}</div>;
}

/** Live state on the right of a row: granted, on, off. */
export function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        on ? 'bg-emerald-400/12 text-emerald-300' : 'bg-white/6 text-white/45'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-white/35'}`} />
      {label}
    </span>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6.5 w-11 shrink-0 rounded-full transition-colors ${on ? '' : 'bg-white/15'}`}
      style={on ? { background: 'linear-gradient(120deg, var(--accent-from), var(--accent-to))' } : undefined}
    >
      <span
        className="absolute top-0.75 h-5 w-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? 'translateX(22px)' : 'translateX(3px)' }}
      />
    </button>
  );
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  suffix,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  suffix?: string;
}) {
  const filled = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1"
        style={
          {
            // The filled half of the track is the accent; the rest stays neutral.
            '--fill': `${filled}%`,
          } as CSSProperties
        }
      />
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-white/60">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** Inline options as pills. Reads far better than a dropdown for short lists. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full gap-1 rounded-xl bg-white/6 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition active:scale-[0.97] ${
              active ? 'text-white shadow' : 'text-white/50'
            }`}
            style={active ? { background: 'linear-gradient(120deg, var(--accent-from), var(--accent-to))' } : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="glass-flat max-w-[52%] shrink-0 rounded-xl px-3 py-1.5 text-sm text-white/90 outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#12142a]">
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  full,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  full?: boolean;
}) {
  const base = `rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40 ${full ? 'w-full' : ''}`;
  if (variant === 'primary') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${base} text-white shadow-lg`}
        style={{ background: 'linear-gradient(120deg, var(--accent-from), var(--accent-to))' }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} glass-flat ${variant === 'danger' ? 'text-rose-300' : 'text-white/80'}`}
    >
      {children}
    </button>
  );
}
