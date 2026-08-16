import { useCallback, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { Orb } from './components/Orb';
import { Waveform } from './components/Waveform';
import { SettingsScreen } from './components/SettingsScreen';
import { Onboarding } from './components/Onboarding';
import { Splash } from './components/Splash';
import { PHASE_LABELS, isLive, useLyraa } from './lib/StateManager';
import { ACCENTS } from './lib/SettingsManager';
import { APIManager } from './lib/APIManager';
import { StorageManager } from './lib/StorageManager';
import { voiceEngine } from './lib/VoiceEngine';
import { UIManager, ImpactStyle } from './lib/UIManager';
import { NativeTools } from './native/bridge';

export default function App() {
  const settings = useLyraa((s) => s.settings);
  const phase = useLyraa((s) => s.phase);
  const inputLevel = useLyraa((s) => s.inputLevel);
  const outputLevel = useLyraa((s) => s.outputLevel);
  const error = useLyraa((s) => s.error);
  const latency = useLyraa((s) => s.latencyMs);
  const activity = useLyraa((s) => s.activity);
  const micEnabled = useLyraa((s) => s.micEnabled);
  const apiKeySet = useLyraa((s) => s.apiKeySet);
  const reconnectAttempt = useLyraa((s) => s.reconnectAttempt);
  const hydrate = useLyraa((s) => s.hydrate);

  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [onboarded, setOnboarded] = useState(true);

  const accent = ACCENTS[settings.accent];

  useEffect(() => {
    void (async () => {
      try {
        await hydrate();
        const [key, seen] = await Promise.all([APIManager.loadKey(), StorageManager.getOnboarded()]);
        useLyraa.getState().setApiKeySet(Boolean(key));
        setOnboarded(seen);
      } catch {
        // Defaults are already in the store; never trap the user on a blank screen.
        useLyraa.getState().setError('Could not read saved settings. Using defaults.');
      } finally {
        setReady(true);
      }
    })();
  }, [hydrate]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-from', accent.from);
    document.documentElement.style.setProperty('--accent-to', accent.to);
    document.documentElement.style.setProperty('--accent-glow', `${accent.from}8c`);
  }, [accent]);

  useEffect(() => {
    document.body.classList.toggle('no-anim', !settings.animations);
  }, [settings.animations]);

  useEffect(() => {
    document.body.classList.toggle('no-glass', !settings.glass);
  }, [settings.glass]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  }, []);

  // Hardware back closes the sheet before it closes the app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapApp.addListener('backButton', () => {
      if (showSettings) setShowSettings(false);
      else void CapApp.minimizeApp();
    });
    return () => void listener.then((handle) => handle.remove());
  }, [showSettings]);

  useEffect(() => () => void voiceEngine.stop(), []);

  // Shared by the assist gesture and the wake word, both of which start a
  // conversation without a tap.
  const beginSession = useCallback(async () => {
    const state = useLyraa.getState();
    if (isLive(state.phase) || state.phase === 'connecting' || state.phase === 'reconnecting') return;
    const key = await APIManager.loadKey();
    if (!key) {
      state.setError('Add your API key in Settings first.');
      setShowSettings(true);
      return;
    }
    await voiceEngine.start(key, state.settings);
  }, []);

  // Launched by holding the home gesture or the power button. The cold-start flag
  // is consumed once the app is ready; the listener covers a warm relaunch.
  useEffect(() => {
    if (!ready || !onboarded) return;

    void NativeTools.consumeAssistLaunch().then((pending) => {
      if (pending) void beginSession();
    });
    const listener = NativeTools.onAssistLaunch(() => void beginSession());

    return () => void listener?.then((handle) => handle.remove());
  }, [ready, onboarded, beginSession]);

  // Wake word only runs between conversations: the live session owns the mic, and
  // the recogniser cannot share it.
  useEffect(() => {
    if (!ready || !onboarded) return;
    if (!settings.wakeWordEnabled || phase !== 'disconnected') {
      void NativeTools.stopWakeWord();
      return;
    }

    const heard = NativeTools.onWakeWord(() => void beginSession());
    const unavailable = NativeTools.onWakeWordUnavailable(({ reason }) => {
      useLyraa.getState().patchSettings({ wakeWordEnabled: false });
      useLyraa.getState().setError(`Wake word off: ${reason.toLowerCase()}.`);
    });
    void NativeTools.startWakeWord(settings.wakeWord);

    return () => {
      void NativeTools.stopWakeWord();
      void heard?.then((handle) => handle.remove());
      void unavailable?.then((handle) => handle.remove());
    };
  }, [ready, onboarded, settings.wakeWordEnabled, settings.wakeWord, phase, beginSession]);

  // The orb is a native window so it can stay up while other apps are in front.
  // This only mirrors the setting onto it, and follows a dismissal back.
  useEffect(() => {
    if (!ready || !onboarded) return;
    if (!settings.floatingOrb) {
      void NativeTools.stopOverlay();
      return;
    }

    const dismissed = NativeTools.onOverlayDismissed(() => {
      useLyraa.getState().patchSettings({ floatingOrb: false });
    });
    void NativeTools.startOverlay(accent.from, accent.to, settings.animations).then((result) => {
      if (result.ok) return;
      useLyraa.getState().patchSettings({ floatingOrb: false });
      useLyraa.getState().setError(result.error ?? 'Could not show the orb.');
    });

    return () => void dismissed?.then((handle) => handle.remove());
  }, [ready, onboarded, settings.floatingOrb, settings.animations, accent.from, accent.to]);

  const toggleSession = async () => {
    void UIManager.tap(ImpactStyle.Medium);
    if (isLive(phase) || phase === 'connecting' || phase === 'reconnecting') {
      await voiceEngine.stop();
      return;
    }
    const key = await APIManager.loadKey();
    if (!key) {
      useLyraa.getState().setError('Add your API key in Settings first.');
      setShowSettings(true);
      return;
    }
    await voiceEngine.start(key, settings);
  };

  const toggleMic = () => {
    void UIManager.tap();
    const next = !micEnabled;
    useLyraa.getState().setMicEnabled(next);
    voiceEngine.setMicEnabled(next);
  };

  if (!ready || !splashDone) {
    return <Splash animated={settings.animations} onDone={() => setSplashDone(true)} />;
  }

  if (!onboarded) {
    return (
      <Onboarding
        onDone={async () => {
          await StorageManager.setOnboarded();
          setOnboarded(true);
        }}
      />
    );
  }

  const live = isLive(phase);
  const connecting = phase === 'connecting' || phase === 'reconnecting';

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        className={`pointer-events-none absolute inset-0 ${settings.animations ? 'animate-aurora' : ''}`}
        style={{
          background: `radial-gradient(circle at 18% 8%, ${accent.from}55, transparent 42%), radial-gradient(circle at 86% 88%, ${accent.to}44, transparent 44%)`,
          opacity: live ? 0.6 : 0.32,
          transition: 'opacity 600ms',
        }}
      />

      <header className="safe-top relative flex items-center justify-between px-5 pt-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: live ? '#34d399' : connecting ? '#fbbf24' : '#6b7280',
              boxShadow: live ? '0 0 10px #34d399' : 'none',
            }}
          />
          <span className="text-xs tracking-wide text-white/60">
            {phase === 'reconnecting' && reconnectAttempt > 0
              ? `Reconnecting (${reconnectAttempt})`
              : PHASE_LABELS[phase]}
          </span>
          {latency !== null && live && <span className="text-xs text-white/35">· {latency} ms</span>}
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          className="glass-flat rounded-full px-3 py-1.5 text-xs text-white/70 active:scale-95"
        >
          Settings
        </button>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6">
        <Orb
          phase={phase}
          level={phase === 'speaking' ? outputLevel : inputLevel}
          accent={accent}
          animated={settings.animations}
          particles={settings.particles}
          onTap={() => void toggleSession()}
          label={live ? 'End session' : 'Start session'}
        />

        <div className="h-16 w-full max-w-sm">
          <Waveform
            phase={phase}
            inputLevel={inputLevel}
            outputLevel={outputLevel}
            style={settings.waveformStyle}
            accent={accent}
            animated={settings.animations}
          />
        </div>

        <p className="min-h-10 max-w-xs text-center text-sm leading-relaxed text-white/55">
          {error
            ? error
            : !apiKeySet
              ? 'Add your Google AI Studio key in Settings to start.'
              : phase === 'disconnected'
                ? 'Tap the orb and just start talking.'
                : phase === 'reconnecting'
                  ? 'The line dropped. Getting her back…'
                  : phase === 'connecting'
                    ? 'Opening the line…'
                    : phase === 'executing'
                      ? 'Working on your phone.'
                      : phase === 'speaking'
                        ? 'Talk over her whenever you like.'
                        : phase === 'listening'
                          ? 'Listening.'
                          : 'Go ahead, she is listening.'}
        </p>
      </main>

      {activity.length > 0 && (
        <div className="relative px-5">
          <div className="scroll-area glass-flat max-h-24 rounded-2xl px-3.5 py-2.5">
            {activity.slice(0, 6).map((entry) => (
              <div key={entry.id} className="flex items-baseline gap-2 py-0.5 text-xs">
                <span className={entry.kind === 'error' ? 'text-rose-300' : entry.kind === 'tool' ? 'text-emerald-300' : 'text-white/35'}>
                  {entry.kind === 'error' ? '!' : entry.kind === 'tool' ? '>' : '·'}
                </span>
                <span className="min-w-0 flex-1 truncate text-white/60">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="safe-bottom relative flex flex-col items-center gap-2.5 px-6 pt-4 pb-6">
        <div className="flex w-full items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            disabled={!live}
            aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
            className="glass flex h-14 w-14 items-center justify-center rounded-full text-lg transition active:scale-95 disabled:opacity-35"
            style={micEnabled && live ? { boxShadow: `0 0 22px ${accent.from}66` } : undefined}
          >
            <span className={micEnabled ? 'text-white' : 'text-rose-300'}>{micEnabled ? '●' : '✕'}</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleSession()}
            className="flex h-16 flex-1 items-center justify-center rounded-2xl text-sm font-semibold tracking-wide text-white shadow-xl transition active:scale-[0.98]"
            style={{
              background: live || connecting ? 'rgba(255,255,255,0.09)' : `linear-gradient(120deg, ${accent.from}, ${accent.to})`,
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {connecting ? 'Connecting…' : live ? 'End conversation' : 'Start talking'}
          </button>
        </div>

        <span className="text-[10px] tracking-[0.34em] text-white/25 uppercase">Made by Dhruv</span>
      </footer>

      <SettingsScreen open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
