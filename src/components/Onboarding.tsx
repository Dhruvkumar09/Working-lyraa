import { useState } from 'react';
import { PERMISSIONS, PermissionManager, type PermissionId } from '../lib/PermissionManager';
import { APIManager } from '../lib/APIManager';
import { StorageManager } from '../lib/StorageManager';
import { useLyraa } from '../lib/StateManager';
import { Button } from './ui';

/** Three steps: what she is, the key, then permissions with reasons. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [keyInput, setKeyInput] = useState('');
  const [granted, setGranted] = useState<Partial<Record<PermissionId, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const setApiKeySet = useLyraa((s) => s.setApiKeySet);

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setBusy(true);
    await APIManager.saveKey(keyInput.trim());
    setApiKeySet(true);
    setBusy(false);
    setStep(2);
  };

  const request = async (id: PermissionId) => {
    const ok = await PermissionManager.request(id);
    setGranted((prev) => ({ ...prev, [id]: ok }));
  };

  return (
    <div className="safe-top safe-bottom relative flex h-full flex-col overflow-hidden px-6">
      <div
        className="animate-aurora pointer-events-none absolute inset-0 opacity-45"
        style={{
          background:
            'radial-gradient(circle at 20% 12%, var(--accent-from), transparent 45%), radial-gradient(circle at 82% 78%, var(--accent-to), transparent 46%)',
        }}
      />

      <div className="scroll-area relative flex min-h-0 flex-1 flex-col justify-center py-8">
        {step === 0 && (
          <div className="animate-rise">
            <h1 className="text-4xl font-semibold tracking-tight">
              Hi, I'm <span className="accent-text">Lyraa</span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              I'm a voice companion. You talk, I talk back — no typing, no waiting for text to appear. Interrupt me any
              time, I'll stop and listen.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/45">
              I run on your own Google AI Studio key, so your conversations go straight from this phone to Google. Nothing
              routes through anyone else.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="animate-rise">
            <h2 className="text-2xl font-semibold">Your API key</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Get a free key from Google AI Studio, then paste it here. It stays on this device.
            </p>
            <input
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="AIza…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="glass-flat mt-5 w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-white/25"
            />
            <p className="mt-3 text-xs leading-relaxed text-white/40">
              {StorageManager.secureStorageAvailable
                ? 'Saved to the Android keystore.'
                : 'Browser preview: saved to localStorage.'}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="animate-rise">
            <h2 className="text-2xl font-semibold">What I need access to</h2>
            <p className="mt-2 text-sm text-white/55">Only the microphone is required. Skip anything else.</p>
            <div className="mt-5 space-y-2">
              {PERMISSIONS.filter((spec) => ['microphone', 'notifications', 'battery'].includes(spec.id)).map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => void request(spec.id)}
                  className="glass-flat flex w-full items-start gap-3 rounded-2xl p-4 text-left active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {spec.title}
                      {spec.required && <span className="text-[10px] tracking-wide text-rose-300 uppercase">required</span>}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/50">{spec.why}</p>
                  </div>
                  <span className={`shrink-0 text-xs ${granted[spec.id] ? 'text-emerald-300' : 'text-white/40'}`}>
                    {granted[spec.id] ? 'Granted' : 'Allow'}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/40">
              You can change any of this later in Settings. I only ever act after you ask.
            </p>
          </div>
        )}
      </div>

      <div className="relative flex gap-2 pb-6">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step === 0 && (
          <Button full onClick={() => setStep(1)}>
            Get started
          </Button>
        )}
        {step === 1 && (
          <>
            <Button variant="ghost" onClick={() => setStep(2)}>
              Later
            </Button>
            <Button full disabled={!keyInput.trim() || busy} onClick={() => void saveKey()}>
              Save and continue
            </Button>
          </>
        )}
        {step === 2 && (
          <Button full onClick={onDone}>
            {granted.microphone ? "Let's talk" : 'Continue'}
          </Button>
        )}
      </div>
    </div>
  );
}
