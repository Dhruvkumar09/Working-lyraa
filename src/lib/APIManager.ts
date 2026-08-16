import { GoogleGenAI, Modality } from '@google/genai';
import { StorageManager } from './StorageManager';
import type { LyraaSettings } from './SettingsManager';

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

const TEST_TIMEOUT_MS = 15000;

export const APIManager = {
  loadKey: () => StorageManager.getApiKey(),
  saveKey: (key: string) => StorageManager.setApiKey(key.trim()),
  clearKey: () => StorageManager.clearApiKey(),

  /**
   * Opens a real Live session and measures time to first audio byte. This is
   * the only honest check: a key can be valid yet lack Live API access, and
   * only an actual connect surfaces that.
   */
  async testConnection(key: string, settings: LyraaSettings): Promise<TestResult> {
    if (!key.trim()) return { ok: false, error: 'No API key set' };

    const startedAt = Date.now();

    return new Promise<TestResult>((resolve) => {
      let settled = false;
      let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;

      const finish = (result: TestResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        try {
          session?.close();
        } catch {
          /* ignore */
        }
        resolve(result);
      };

      const timeout = window.setTimeout(
        () => finish({ ok: false, error: 'Timed out waiting for audio' }),
        TEST_TIMEOUT_MS,
      );

      const ai = new GoogleGenAI({ apiKey: key.trim() });

      ai.live
        .connect({
          model: settings.model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: 'Reply with exactly: Hi, I am Lyraa. Nothing else.',
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName } },
              languageCode: settings.language,
            },
          },
          callbacks: {
            onopen: () => {},
            onmessage: (message) => {
              const parts = message.serverContent?.modelTurn?.parts ?? [];
              if (parts.some((part) => part.inlineData?.data)) {
                finish({ ok: true, latencyMs: Date.now() - startedAt });
              }
            },
            onerror: (event: ErrorEvent) => finish({ ok: false, error: event.message || 'Connection error' }),
            onclose: (event: CloseEvent) => {
              if (!settled) finish({ ok: false, error: event.reason || 'Closed before audio arrived' });
            },
          },
        })
        .then((live) => {
          session = live;
          // Seeding history is the only allowed use of sendClientContent on 3.1.
          live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Say hello.' }] }], turnComplete: true });
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          finish({ ok: false, error: message });
        });
    });
  },
};
