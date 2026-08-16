import { StorageManager } from './StorageManager';

export interface LyraaSettings {
  // Voice
  voiceName: string;
  speakingSpeed: number;
  emotion: number;
  warmth: number;
  humor: number;
  // Conversation
  sessionMemory: boolean;
  greetingStyle: 'warm' | 'playful' | 'professional' | 'none';
  wakeWord: string;
  wakeWordEnabled: boolean;
  language: string;
  personality: 'companion' | 'focused' | 'bubbly' | 'calm';
  // Assistant
  backgroundMode: boolean;
  floatingOrb: boolean;
  vadSilenceMs: number;
  vadSensitivity: 'low' | 'medium' | 'high';
  // Appearance
  accent: 'violet' | 'cyan' | 'rose' | 'amber' | 'emerald';
  glass: boolean;
  animations: boolean;
  waveformStyle: 'bars' | 'wave' | 'pulse';
  particles: boolean;
  // API
  model: string;
  audioQuality: 'balanced' | 'high';
}

export const DEFAULT_SETTINGS: LyraaSettings = {
  voiceName: 'Aoede',
  speakingSpeed: 100,
  emotion: 75,
  warmth: 80,
  humor: 60,
  sessionMemory: true,
  greetingStyle: 'warm',
  wakeWord: 'Hey Lyraa',
  wakeWordEnabled: false,
  language: 'en-US',
  personality: 'companion',
  backgroundMode: true,
  floatingOrb: false,
  vadSilenceMs: 550,
  vadSensitivity: 'medium',
  accent: 'violet',
  glass: true,
  animations: true,
  waveformStyle: 'bars',
  particles: true,
  model: 'gemini-3.1-flash-live-preview',
  audioQuality: 'balanced',
};

const KEY = 'lyraa.settings';

/** Drops unknown keys and keeps defaults for anything missing or the wrong type. */
export function mergeSettings(stored: unknown): LyraaSettings {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS };
  const input = stored as Record<string, unknown>;
  const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = input[key];
    if (value !== undefined && typeof value === typeof DEFAULT_SETTINGS[key as keyof LyraaSettings]) {
      merged[key] = value;
    }
  }
  return merged as unknown as LyraaSettings;
}

export const SettingsManager = {
  async load(): Promise<LyraaSettings> {
    const raw = await StorageManager.get(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    try {
      return mergeSettings(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  async save(settings: LyraaSettings): Promise<void> {
    await StorageManager.set(KEY, JSON.stringify(settings));
  },
};

export const ACCENTS: Record<LyraaSettings['accent'], { from: string; to: string; glow: string; hue: number }> = {
  violet: { from: '#8b5cf6', to: '#d946ef', glow: 'rgba(139,92,246,0.55)', hue: 265 },
  cyan: { from: '#22d3ee', to: '#3b82f6', glow: 'rgba(34,211,238,0.55)', hue: 190 },
  rose: { from: '#fb7185', to: '#f472b6', glow: 'rgba(251,113,133,0.55)', hue: 345 },
  amber: { from: '#fbbf24', to: '#fb923c', glow: 'rgba(251,191,36,0.55)', hue: 40 },
  emerald: { from: '#34d399', to: '#22d3ee', glow: 'rgba(52,211,153,0.55)', hue: 160 },
};
