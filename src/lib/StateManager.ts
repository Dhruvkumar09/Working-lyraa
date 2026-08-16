import { create } from 'zustand';
import { DEFAULT_SETTINGS, SettingsManager, type LyraaSettings } from './SettingsManager';

export type Phase =
  | 'disconnected'
  | 'connecting'
  | 'reconnecting'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'executing'
  | 'error';

export interface ActivityEntry {
  id: number;
  kind: 'tool' | 'system' | 'error';
  text: string;
  at: number;
}

export interface LyraaState {
  phase: Phase;
  micEnabled: boolean;
  latencyMs: number | null;
  error: string | null;
  inputLevel: number;
  outputLevel: number;
  settings: LyraaSettings;
  settingsLoaded: boolean;
  apiKeySet: boolean;
  activity: ActivityEntry[];
  sessionStartedAt: number | null;
  reconnectAttempt: number;

  setPhase: (phase: Phase) => void;
  setMicEnabled: (enabled: boolean) => void;
  setLatency: (ms: number | null) => void;
  setError: (message: string | null) => void;
  setLevels: (input: number, output: number) => void;
  setSettings: (settings: LyraaSettings) => void;
  patchSettings: (patch: Partial<LyraaSettings>) => void;
  setApiKeySet: (set: boolean) => void;
  pushActivity: (kind: ActivityEntry['kind'], text: string) => void;
  clearActivity: () => void;
  setReconnectAttempt: (n: number) => void;
  hydrate: () => Promise<void>;
}

/** Phases that mean the socket is up. */
export const LIVE_PHASES: readonly Phase[] = ['listening', 'thinking', 'speaking', 'idle', 'executing'];

export function isLive(phase: Phase): boolean {
  return LIVE_PHASES.includes(phase);
}

export const PHASE_LABELS: Record<Phase, string> = {
  disconnected: 'Tap to wake Lyraa',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  idle: 'Here with you',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  executing: 'On it',
  error: 'Something went wrong',
};

let activityId = 0;
const MAX_ACTIVITY = 40;

export const useLyraa = create<LyraaState>((set) => ({
  phase: 'disconnected',
  micEnabled: true,
  latencyMs: null,
  error: null,
  inputLevel: 0,
  outputLevel: 0,
  settings: { ...DEFAULT_SETTINGS },
  settingsLoaded: false,
  apiKeySet: false,
  activity: [],
  sessionStartedAt: null,
  reconnectAttempt: 0,

  setPhase: (phase) =>
    set((state) => ({
      phase,
      error: phase === 'connecting' ? null : state.error,
      sessionStartedAt: isLive(phase) ? (state.sessionStartedAt ?? Date.now()) : null,
      inputLevel: phase === 'disconnected' ? 0 : state.inputLevel,
      outputLevel: phase === 'disconnected' ? 0 : state.outputLevel,
      reconnectAttempt: isLive(phase) ? 0 : state.reconnectAttempt,
    })),

  setMicEnabled: (micEnabled) => set({ micEnabled }),
  setLatency: (latencyMs) => set({ latencyMs }),
  setError: (error) => set({ error }),
  setLevels: (inputLevel, outputLevel) => set({ inputLevel, outputLevel }),
  setSettings: (settings) => set({ settings, settingsLoaded: true }),
  patchSettings: (patch) =>
    set((state) => {
      const settings = { ...state.settings, ...patch };
      void SettingsManager.save(settings);
      return { settings };
    }),
  setApiKeySet: (apiKeySet) => set({ apiKeySet }),

  pushActivity: (kind, text) =>
    set((state) => ({
      activity: [{ id: ++activityId, kind, text, at: Date.now() }, ...state.activity].slice(0, MAX_ACTIVITY),
    })),

  clearActivity: () => set({ activity: [] }),
  setReconnectAttempt: (reconnectAttempt) => set({ reconnectAttempt }),

  hydrate: async () => {
    const settings = await SettingsManager.load();
    set({ settings, settingsLoaded: true });
  },
}));
