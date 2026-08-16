import { Preferences } from '@capacitor/preferences';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { Capacitor } from '@capacitor/core';

const SECURE_KEY = 'gemini_api_key';
const ONBOARDED_KEY = 'lyraa_onboarded';

/**
 * Plain settings go to Preferences; the API key goes to the platform keystore.
 * On the web build there is no keystore, so the key lives in localStorage and
 * the UI says so.
 */
/** Undefined in non-browser hosts, and throws outright when cookies are blocked. */
function webStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const StorageManager = {
  async get(key: string): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  },

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  },

  get secureStorageAvailable(): boolean {
    return Capacitor.isNativePlatform();
  },

  async getApiKey(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return webStore()?.getItem(SECURE_KEY) ?? null;
    }
    try {
      const { value } = await SecureStoragePlugin.get({ key: SECURE_KEY });
      return value || null;
    } catch {
      // The plugin throws rather than returning null when the item is absent.
      return null;
    }
  },

  async setApiKey(value: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      webStore()?.setItem(SECURE_KEY, value);
      return;
    }
    await SecureStoragePlugin.set({ key: SECURE_KEY, value });
  },

  async clearApiKey(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      webStore()?.removeItem(SECURE_KEY);
      return;
    }
    try {
      await SecureStoragePlugin.remove({ key: SECURE_KEY });
    } catch {
      /* already gone */
    }
  },

  async getOnboarded(): Promise<boolean> {
    return (await this.get(ONBOARDED_KEY)) === '1';
  },

  async setOnboarded(): Promise<void> {
    await this.set(ONBOARDED_KEY, '1');
  },
};
