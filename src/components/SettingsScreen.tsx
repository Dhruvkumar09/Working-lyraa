import { useCallback, useEffect, useState } from 'react';
import { ACCENTS, type LyraaSettings } from '../lib/SettingsManager';
import { MODELS, VOICES } from '../lib/persona';
import { APIManager } from '../lib/APIManager';
import { PERMISSIONS, PermissionManager, type PermissionId } from '../lib/PermissionManager';
import { AccessibilityManager } from '../lib/AccessibilityManager';
import { NativeTools } from '../native/bridge';
import { StorageManager } from '../lib/StorageManager';
import { useLyraa } from '../lib/StateManager';
import { Button, Choice, Row, Section, Segmented, Sheet, Slider, StatusPill, Toggle } from './ui';

type Tab = 'voice' | 'talk' | 'device' | 'look' | 'api';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'voice', label: 'Voice' },
  { id: 'talk', label: 'Talk' },
  { id: 'device', label: 'Device' },
  { id: 'look', label: 'Look' },
  { id: 'api', label: 'API' },
];

export function SettingsScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useLyraa((s) => s.settings);
  const patch = useLyraa((s) => s.patchSettings);
  const apiKeySet = useLyraa((s) => s.apiKeySet);
  const setApiKeySet = useLyraa((s) => s.setApiKeySet);

  const [tab, setTab] = useState<Tab>('voice');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [granted, setGranted] = useState<Partial<Record<PermissionId, boolean>>>({});
  const [screenControl, setScreenControl] = useState(false);
  const [isAssistant, setIsAssistant] = useState(false);
  const [wakeWordSupported, setWakeWordSupported] = useState(false);
  const [orbPermitted, setOrbPermitted] = useState(false);

  /**
   * In a browser the phone-only rows have nothing behind them. Saying so is the
   * honest answer; a dead toggle reads as a feature that was never finished.
   */
  const onPhone = NativeTools.available;

  const set = <K extends keyof LyraaSettings>(key: K, value: LyraaSettings[K]) => patch({ [key]: value } as Partial<LyraaSettings>);

  const refresh = useCallback(async () => {
    const results: Partial<Record<PermissionId, boolean>> = {};
    for (const spec of PERMISSIONS) results[spec.id] = await PermissionManager.check(spec.id);
    setGranted(results);
    setScreenControl(await AccessibilityManager.isEnabled());
    setIsAssistant((await NativeTools.getDefaultAssistant()).isLyraa);
    setWakeWordSupported(await NativeTools.wakeWordSupported());
    setOrbPermitted(await NativeTools.overlayPermitted());
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  // Every special-access grant happens in Android's own Settings, so coming back
  // to Lyraa is the only moment these can have changed.
  useEffect(() => {
    if (!open) return;
    const listener = NativeTools.onAppInForeground(() => void refresh());
    return () => void listener?.then((handle) => handle.remove());
  }, [open, refresh]);

  const saveKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    await APIManager.saveKey(trimmed);
    setApiKeySet(true);
    setKeyInput('');
    setTestResult('Key saved.');
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const key = keyInput.trim() || (await APIManager.loadKey()) || '';
    const result = await APIManager.testConnection(key, settings);
    setTesting(false);
    setTestResult(result.ok ? `Connected. First audio in ${result.latencyMs} ms.` : `Failed: ${result.error}`);
    if (result.ok) useLyraa.getState().setLatency(result.latencyMs ?? null);
  };

  const forget = async () => {
    await APIManager.clearKey();
    setApiKeySet(false);
    setTestResult('Key removed from this device.');
  };

  /**
   * Turning the orb on without the overlay grant would be a lie, so the switch
   * sends Dhruv to grant it and waits for him to come back instead of flipping.
   */
  const toggleOrb = async (next: boolean) => {
    if (!next) {
      set('floatingOrb', false);
      return;
    }
    if (!(await NativeTools.overlayPermitted())) {
      await NativeTools.openOverlaySettings();
      return;
    }
    setOrbPermitted(true);
    set('floatingOrb', true);
  };

  return (
    <Sheet open={open} title="Settings" onClose={onClose}>
      <div className="glass-flat sticky top-0 z-10 mb-1 flex gap-1 rounded-xl p-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${tab === entry.id ? 'text-white' : 'text-white/50'}`}
            style={tab === entry.id ? { background: 'linear-gradient(120deg, var(--accent-from), var(--accent-to))' } : undefined}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'voice' && (
        <>
          <Section
            title="Her voice"
            note="The dials are written into her instructions at connect time, so changes land on the next session."
          >
            <Row label="Voice" stack>
              <div className="grid grid-cols-2 gap-2">
                {VOICES.map((voice) => {
                  const active = voice.name === settings.voiceName;
                  return (
                    <button
                      key={voice.name}
                      type="button"
                      aria-pressed={active}
                      onClick={() => set('voiceName', voice.name)}
                      className={`rounded-xl px-3 py-2 text-left transition active:scale-[0.98] ${active ? 'text-white' : 'bg-white/6 text-white/70'}`}
                      style={active ? { background: 'linear-gradient(120deg, var(--accent-from), var(--accent-to))' } : undefined}
                    >
                      <div className="text-sm font-medium">{voice.label}</div>
                      <div className={`text-[11px] ${active ? 'text-white/80' : 'text-white/40'}`}>{voice.note}</div>
                    </button>
                  );
                })}
              </div>
            </Row>
            <Row label="Speaking speed" hint="Guides her pacing" stack>
              <Slider label="Speaking speed" min={60} max={140} value={settings.speakingSpeed} onChange={(v) => set('speakingSpeed', v)} />
            </Row>
          </Section>

          <Section title="Personality dials">
            <Row label="Emotion" hint="How expressive she is" stack>
              <Slider label="Emotion" value={settings.emotion} onChange={(v) => set('emotion', v)} />
            </Row>
            <Row label="Warmth" hint="How close and caring she sounds" stack>
              <Slider label="Warmth" value={settings.warmth} onChange={(v) => set('warmth', v)} />
            </Row>
            <Row label="Humour" hint="How often she jokes" stack>
              <Slider label="Humour" value={settings.humor} onChange={(v) => set('humor', v)} />
            </Row>
          </Section>
        </>
      )}

      {tab === 'talk' && (
        <>
          <Section title="Conversation">
            <Row label="Personality" stack>
              <Segmented
                label="Personality"
                value={settings.personality}
                onChange={(value) => set('personality', value)}
                options={[
                  { value: 'companion', label: 'Companion' },
                  { value: 'focused', label: 'Focused' },
                  { value: 'bubbly', label: 'Bubbly' },
                  { value: 'calm', label: 'Calm' },
                ]}
              />
            </Row>
            <Row label="Greeting" stack>
              <Segmented
                label="Greeting"
                value={settings.greetingStyle}
                onChange={(value) => set('greetingStyle', value)}
                options={[
                  { value: 'warm', label: 'Warm' },
                  { value: 'playful', label: 'Playful' },
                  { value: 'professional', label: 'Formal' },
                  { value: 'none', label: 'None' },
                ]}
              />
            </Row>
            <Row label="Language">
              <Choice
                label="Language"
                value={settings.language}
                onChange={(value) => set('language', value)}
                options={[
                  { value: 'en-US', label: 'English (US)' },
                  { value: 'en-GB', label: 'English (UK)' },
                  { value: 'en-IN', label: 'English (India)' },
                  { value: 'hi-IN', label: 'Hindi' },
                  { value: 'es-ES', label: 'Spanish' },
                  { value: 'fr-FR', label: 'French' },
                  { value: 'de-DE', label: 'German' },
                  { value: 'ja-JP', label: 'Japanese' },
                ]}
              />
            </Row>
            <Row label="Remember this session" hint="She keeps context until you disconnect">
              <Toggle label="Session memory" on={settings.sessionMemory} onChange={(v) => set('sessionMemory', v)} />
            </Row>
          </Section>

          <Section title="Turn taking">
            <Row label="Pause before she replies" hint="How much silence ends your turn" stack>
              <Slider
                label="Silence duration"
                min={200}
                max={1500}
                step={50}
                suffix=" ms"
                value={settings.vadSilenceMs}
                onChange={(v) => set('vadSilenceMs', v)}
              />
            </Row>
            <Row label="Mic sensitivity" stack>
              <Segmented
                label="Sensitivity"
                value={settings.vadSensitivity}
                onChange={(value) => set('vadSensitivity', value)}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </Row>
          </Section>

          <Section title="Wake word">
            <Row
              label="Listen for a phrase"
              hint={
                !onPhone
                  ? 'Runs in the installed app, where Android has a recogniser to lend her.'
                  : wakeWordSupported
                    ? 'Only while Lyraa is open and not already in a conversation. Android reserves true always-on listening for the built-in assistant.'
                    : 'This device has no speech recogniser, so there is nothing to listen with.'
              }
            >
              {onPhone ? (
                <Toggle
                  label="Wake word"
                  on={settings.wakeWordEnabled && wakeWordSupported}
                  onChange={(v) => set('wakeWordEnabled', v && wakeWordSupported)}
                />
              ) : (
                <StatusPill on={false} label="On the phone" />
              )}
            </Row>
            {onPhone && settings.wakeWordEnabled && wakeWordSupported && (
              <Row label="Phrase" hint="Short and distinctive works best" stack>
                <Segmented
                  label="Phrase"
                  value={settings.wakeWord}
                  onChange={(value) => set('wakeWord', value)}
                  options={[
                    { value: 'Hey Lyraa', label: 'Hey Lyraa' },
                    { value: 'Lyraa', label: 'Lyraa' },
                    { value: 'Okay Lyraa', label: 'Okay Lyraa' },
                  ]}
                />
              </Row>
            )}
          </Section>
        </>
      )}

      {tab === 'device' && (
        <>
          <Section title="Permissions" note="Tap any row to grant it. The ones Android keeps behind Settings open the right page.">
            {PERMISSIONS.map((spec) => (
              <Row
                key={spec.id}
                label={spec.title}
                hint={spec.why}
                onClick={async () => {
                  const ok = await PermissionManager.request(spec.id);
                  setGranted((prev) => ({ ...prev, [spec.id]: ok || prev[spec.id] }));
                }}
              >
                <StatusPill
                  on={!!granted[spec.id]}
                  label={granted[spec.id] ? 'Granted' : spec.viaSettings ? 'Open' : 'Grant'}
                />
              </Row>
            ))}
          </Section>

          <Section
            title="Reach her from anywhere"
            note="Both routes open the same conversation, so whichever you use she starts listening straight away."
          >
            <Row
              label="Default assistant"
              hint="Hold the home gesture or the power button to call her from any app."
              onClick={
                onPhone
                  ? async () => {
                      await NativeTools.openAssistantSettings();
                      setIsAssistant((await NativeTools.getDefaultAssistant()).isLyraa);
                    }
                  : undefined
              }
            >
              <StatusPill on={isAssistant} label={!onPhone ? 'On the phone' : isAssistant ? 'Lyraa' : 'Set'} />
            </Row>
            <Row
              label="Floating orb"
              hint={
                !onPhone
                  ? 'A bubble over your other apps, with the overlay permission Android only has on a phone.'
                  : orbPermitted
                    ? 'A bubble over your other apps. Tap it to talk, drag it anywhere, hold it to put it away. It steps aside while Lyraa is open.'
                    : 'Needs "Display over other apps". Tapping this opens that page; come back and switch it on.'
              }
            >
              {onPhone ? (
                <Toggle label="Floating orb" on={settings.floatingOrb && orbPermitted} onChange={(v) => void toggleOrb(v)} />
              ) : (
                <StatusPill on={false} label="On the phone" />
              )}
            </Row>
          </Section>

          <Section title="Screen control">
            <Row
              label="On-screen actions"
              hint={
                !onPhone
                  ? 'Tapping, scrolling, typing and reading the screen, through the accessibility service in the installed app.'
                  : screenControl
                    ? 'She can tap, scroll, type and read what is on screen.'
                    : 'Switch Lyraa on under Accessibility so she can tap, scroll, type and read the screen.'
              }
              onClick={
                onPhone
                  ? async () => {
                      await AccessibilityManager.openSettings();
                      setScreenControl(await AccessibilityManager.isEnabled());
                    }
                  : undefined
              }
            >
              <StatusPill on={screenControl} label={!onPhone ? 'On the phone' : screenControl ? 'On' : 'Turn on'} />
            </Row>
          </Section>

          <Section
            title="Background"
            note="Android only lets a microphone service start while the app is open. Lyraa keeps a session alive once started, but she cannot begin listening from the background."
          >
            <Row label="Keep the session alive" hint="Runs a foreground service with an ongoing notification while you talk">
              <Toggle label="Background mode" on={settings.backgroundMode} onChange={(v) => set('backgroundMode', v)} />
            </Row>
          </Section>
        </>
      )}

      {tab === 'look' && (
        <>
          <Section title="Accent">
            <div className="flex flex-wrap gap-2 px-4 py-3">
              {(Object.keys(ACCENTS) as Array<LyraaSettings['accent']>).map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={settings.accent === name}
                  onClick={() => set('accent', name)}
                  className={`h-9 w-9 rounded-full transition active:scale-90 ${settings.accent === name ? 'ring-2 ring-white/80' : 'opacity-70'}`}
                  style={{ background: `linear-gradient(135deg, ${ACCENTS[name].from}, ${ACCENTS[name].to})` }}
                />
              ))}
            </div>
          </Section>
          <Section title="Effects">
            <Row label="Glass" hint="Frosted panels">
              <Toggle label="Glass" on={settings.glass} onChange={(v) => set('glass', v)} />
            </Row>
            <Row label="Animations" hint="Turn off to save battery">
              <Toggle label="Animations" on={settings.animations} onChange={(v) => set('animations', v)} />
            </Row>
            <Row label="Particles">
              <Toggle label="Particles" on={settings.particles} onChange={(v) => set('particles', v)} />
            </Row>
            <Row label="Waveform" stack>
              <Segmented
                label="Waveform"
                value={settings.waveformStyle}
                onChange={(value) => set('waveformStyle', value)}
                options={[
                  { value: 'bars', label: 'Bars' },
                  { value: 'wave', label: 'Wave' },
                  { value: 'pulse', label: 'Pulse' },
                ]}
              />
            </Row>
          </Section>
        </>
      )}

      {tab === 'api' && (
        <>
          <Section title="Google AI Studio key">
            <div className="px-4 py-3">
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  placeholder={apiKeySet ? 'Key saved. Paste a new one to replace.' : 'Paste your Gemini API key'}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="glass-flat min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="glass-flat shrink-0 rounded-xl px-3 text-xs text-white/70"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => void saveKey()} disabled={!keyInput.trim()}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => void test()} disabled={testing || (!keyInput.trim() && !apiKeySet)}>
                  {testing ? 'Testing…' : 'Test connection'}
                </Button>
                {apiKeySet && (
                  <Button variant="danger" onClick={() => void forget()}>
                    Forget
                  </Button>
                )}
              </div>
              {testResult && <p className="mt-3 text-xs leading-relaxed text-white/60">{testResult}</p>}
              <p className="mt-3 text-xs leading-relaxed text-white/40">
                {StorageManager.secureStorageAvailable
                  ? 'Stored in the Android keystore on this device only. It is never bundled into the app.'
                  : 'Browser preview: the key sits in localStorage. Only the installed app uses secure storage.'}
              </p>
            </div>
          </Section>

          <Section title="Model">
            <Row label="Model" hint={MODELS.find((m) => m.id === settings.model)?.note} stack>
              <Segmented
                label="Model"
                value={settings.model}
                onChange={(value) => set('model', value)}
                options={MODELS.map((m) => ({ value: m.id, label: m.label }))}
              />
            </Row>
            <Row label="Audio quality" hint="Balanced keeps latency lowest" stack>
              <Segmented
                label="Audio quality"
                value={settings.audioQuality}
                onChange={(value) => set('audioQuality', value)}
                options={[
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </Row>
          </Section>
        </>
      )}
    </Sheet>
  );
}
