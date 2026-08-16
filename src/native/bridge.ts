/**
 * Bridge to the Java `LyraaNativePlugin`. Every method resolves; failures come
 * back as { ok: false, error } instead of throwing.
 *
 * Capacitor treats the first argument to a plugin method as the whole options
 * object and Android reads it with `getJSObject("options")`, so anything passed
 * positionally is dropped on the floor and the native default is used instead.
 * Every call below therefore passes a named object.
 */
import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export type NativeResult = { ok: boolean; error?: string };

export interface ScreenElement {
  label: string;
  editable?: boolean;
  clickable?: boolean;
  scrollable?: boolean;
  checked?: boolean;
}

export interface ScreenSnapshot extends NativeResult {
  app?: string;
  elements?: ScreenElement[];
  truncated?: boolean;
}

export interface InstalledApp {
  package: string;
  label: string;
}

export type MediaAction = 'play' | 'pause' | 'next' | 'previous' | 'toggle';
export type VolumeDirection = 'up' | 'down' | 'mute' | 'unmute';
export type ScrollDirection = 'up' | 'down';
export type GlobalAction = 'back' | 'home' | 'recents' | 'notifications' | 'quickSettings' | 'lockScreen';

export interface NativeBridgePlugin {
  openSettings(options: { pane: string }): Promise<NativeResult>;
  call(options: { number: string }): Promise<NativeResult>;
  sms(options: { number: string; text: string }): Promise<NativeResult>;
  openCamera(): Promise<NativeResult>;
  openGallery(): Promise<NativeResult>;
  media(options: { action: string }): Promise<NativeResult>;
  volume(options: { direction: string; steps: number }): Promise<NativeResult>;
  alarm(options: { hour: number; minute: number; label: string }): Promise<NativeResult>;
  timer(options: { seconds: number }): Promise<NativeResult>;
  calculator(): Promise<NativeResult>;
  flashlight(options: { on: boolean }): Promise<NativeResult>;
  requestIgnoreBatteryOptimization(): Promise<NativeResult>;
  openAutoStartSettings(): Promise<NativeResult>;
  openOverlaySettings(): Promise<NativeResult>;
  openAccessibilitySettings(): Promise<NativeResult>;
  isAccessibilityEnabled(): Promise<{ value: boolean; enabled?: boolean }>;
  startForegroundService(): Promise<NativeResult>;
  stopForegroundService(): Promise<NativeResult>;
  setStatusBarStyle(options: { style: string }): Promise<NativeResult>;

  gestureTap(options: { x: number; y: number }): Promise<NativeResult>;
  gestureLongPress(options: { x: number; y: number }): Promise<NativeResult>;
  gestureSwipe(options: {
    x1: number; y1: number; x2: number; y2: number; duration: number;
  }): Promise<NativeResult>;
  gestureScroll(options: { direction: string }): Promise<NativeResult>;
  globalAction(options: { action: string }): Promise<NativeResult>;
  clickText(options: { label: string; longPress: boolean }): Promise<NativeResult>;
  typeText(options: { text: string; append: boolean }): Promise<NativeResult>;
  readScreen(): Promise<ScreenSnapshot>;
  currentApp(): Promise<NativeResult & { package: string; label: string }>;

  listApps(): Promise<NativeResult & { apps?: InstalledApp[] }>;
  openApp(options: { package?: string; name?: string }): Promise<NativeResult>;
  openUrl(options: { url: string }): Promise<NativeResult>;

  getDefaultAssistant(): Promise<NativeResult & { component: string; isLyraa: boolean }>;
  openAssistantSettings(): Promise<NativeResult>;
  consumeAssistLaunch(): Promise<NativeResult & { value: boolean }>;

  startWakeWord(options: { phrase: string }): Promise<NativeResult>;
  stopWakeWord(): Promise<NativeResult>;
  wakeWordSupported(): Promise<NativeResult & { value: boolean }>;

  overlayPermitted(): Promise<NativeResult & { value: boolean }>;
  overlayRunning(): Promise<NativeResult & { value: boolean }>;
  startOverlay(options: { accentFrom: string; accentTo: string; animated: boolean }): Promise<NativeResult>;
  stopOverlay(): Promise<NativeResult>;

  addListener(eventName: 'appInForeground', listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'appInBackground', listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'assistLaunch', listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'wakeWord', listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'wakeWordUnavailable', listener: (data: { reason: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'overlayDismissed', listener: () => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<NativeBridgePlugin>('LyraaNative', {
  web: () => import('./web').then((m) => m.webNative),
});

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/** Off-device, every call reports success so the web build stays usable. */
const OFFLINE: NativeResult = { ok: true };

export const NativeTools = {
  get available(): boolean {
    return Capacitor.isNativePlatform();
  },

  async openSettings(pane = 'main'): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.openSettings({ pane });
    } catch (e) {
      return fail(e);
    }
  },

  async call(number: string): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.call({ number });
    } catch (e) {
      return fail(e);
    }
  },

  async sms(number: string, text: string): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.sms({ number, text });
    } catch (e) {
      return fail(e);
    }
  },

  async openCamera(): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.openCamera();
    } catch (e) {
      return fail(e);
    }
  },

  async openGallery(): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.openGallery();
    } catch (e) {
      return fail(e);
    }
  },

  async media(action: MediaAction): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.media({ action });
    } catch (e) {
      return fail(e);
    }
  },

  async volume(direction: VolumeDirection, steps = 1): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.volume({ direction, steps });
    } catch (e) {
      return fail(e);
    }
  },

  async alarm(hour: number, minute: number, label: string): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.alarm({ hour, minute, label });
    } catch (e) {
      return fail(e);
    }
  },

  async timer(seconds: number): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.timer({ seconds });
    } catch (e) {
      return fail(e);
    }
  },

  async calculator(): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.calculator();
    } catch (e) {
      return fail(e);
    }
  },

  async flashlight(on: boolean): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.flashlight({ on });
    } catch (e) {
      return fail(e);
    }
  },

  async requestIgnoreBatteryOptimization(): Promise<boolean> {
    if (!this.available) return true;
    try {
      const r = await plugin.requestIgnoreBatteryOptimization();
      return r.ok;
    } catch {
      return false;
    }
  },

  async openAutoStartSettings(): Promise<void> {
    if (!this.available) return;
    try {
      await plugin.openAutoStartSettings();
    } catch {
      /* best effort */
    }
  },

  async openOverlaySettings(): Promise<void> {
    if (!this.available) return;
    try {
      await plugin.openOverlaySettings();
    } catch {
      /* best effort */
    }
  },

  async openAccessibilitySettings(): Promise<void> {
    if (!this.available) return;
    try {
      await plugin.openAccessibilitySettings();
    } catch {
      /* best effort */
    }
  },

  /** True only when the service is bound and able to act this instant. */
  async isAccessibilityEnabled(): Promise<boolean> {
    if (!this.available) return false;
    try {
      const r = await plugin.isAccessibilityEnabled();
      return r.value;
    } catch {
      return false;
    }
  },

  async startForegroundService(): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.startForegroundService();
    } catch (e) {
      return fail(e);
    }
  },

  async stopForegroundService(): Promise<void> {
    if (!this.available) return;
    try {
      await plugin.stopForegroundService();
    } catch {
      /* best effort */
    }
  },

  async setStatusBarStyle(style: 'LIGHT' | 'DARK'): Promise<void> {
    if (!this.available) return;
    try {
      await plugin.setStatusBarStyle({ style });
    } catch {
      /* best effort */
    }
  },

  // ---- Screen control ----------------------------------------------------
  // Coordinates at or below 1 are read as a fraction of the screen, so callers
  // can say "middle" without knowing the pixel size of Dhruv's phone.

  async tap(x: number, y: number): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.gestureTap({ x, y });
    } catch (e) {
      return fail(e);
    }
  },

  async longPress(x: number, y: number): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.gestureLongPress({ x, y });
    } catch (e) {
      return fail(e);
    }
  },

  async swipe(
    x1: number, y1: number, x2: number, y2: number, duration = 260,
  ): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.gestureSwipe({ x1, y1, x2, y2, duration });
    } catch (e) {
      return fail(e);
    }
  },

  async scroll(direction: ScrollDirection = 'down'): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.gestureScroll({ direction });
    } catch (e) {
      return fail(e);
    }
  },

  async globalAction(action: GlobalAction): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.globalAction({ action });
    } catch (e) {
      return fail(e);
    }
  },

  async clickText(label: string, longPress = false): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.clickText({ label, longPress });
    } catch (e) {
      return fail(e);
    }
  },

  async typeText(text: string, append = false): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.typeText({ text, append });
    } catch (e) {
      return fail(e);
    }
  },

  async readScreen(): Promise<ScreenSnapshot> {
    if (!this.available) return { ok: false, error: 'Screen reading only works on the phone' };
    try {
      return await plugin.readScreen();
    } catch (e) {
      return fail(e);
    }
  },

  async currentApp(): Promise<{ package: string; label: string }> {
    if (!this.available) return { package: '', label: '' };
    try {
      const r = await plugin.currentApp();
      return { package: r.package ?? '', label: r.label ?? '' };
    } catch {
      return { package: '', label: '' };
    }
  },

  // ---- Apps --------------------------------------------------------------

  async listApps(): Promise<InstalledApp[]> {
    if (!this.available) return [];
    try {
      const r = await plugin.listApps();
      return r.apps ?? [];
    } catch {
      return [];
    }
  },

  async openApp(target: { package?: string; name?: string }): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.openApp(target);
    } catch (e) {
      return fail(e);
    }
  },

  async openUrl(url: string): Promise<NativeResult> {
    if (!this.available) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return OFFLINE;
    }
    try {
      return await plugin.openUrl({ url });
    } catch (e) {
      return fail(e);
    }
  },

  // ---- Assistant role ----------------------------------------------------

  async getDefaultAssistant(): Promise<{ component: string; isLyraa: boolean }> {
    if (!this.available) return { component: '', isLyraa: false };
    try {
      const r = await plugin.getDefaultAssistant();
      return { component: r.component ?? '', isLyraa: !!r.isLyraa };
    } catch {
      return { component: '', isLyraa: false };
    }
  },

  async openAssistantSettings(): Promise<void> {
    if (!this.available) return;
    try {
      await plugin.openAssistantSettings();
    } catch {
      /* best effort */
    }
  },

  async consumeAssistLaunch(): Promise<boolean> {
    if (!this.available) return false;
    try {
      const r = await plugin.consumeAssistLaunch();
      return !!r.value;
    } catch {
      return false;
    }
  },

  onAppInForeground(listener: () => void): Promise<PluginListenerHandle> | null {
    if (!this.available) return null;
    try {
      return plugin.addListener('appInForeground', listener);
    } catch {
      return null;
    }
  },

  onAppInBackground(listener: () => void): Promise<PluginListenerHandle> | null {
    if (!this.available) return null;
    try {
      return plugin.addListener('appInBackground', listener);
    } catch {
      return null;
    }
  },

  onAssistLaunch(listener: () => void): Promise<PluginListenerHandle> | null {
    if (!this.available) return null;
    try {
      return plugin.addListener('assistLaunch', listener);
    } catch {
      return null;
    }
  },

  // ---- Wake word ---------------------------------------------------------

  async wakeWordSupported(): Promise<boolean> {
    if (!this.available) return false;
    try {
      return !!(await plugin.wakeWordSupported()).value;
    } catch {
      return false;
    }
  },

  async startWakeWord(phrase: string): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.startWakeWord({ phrase });
    } catch (e) {
      return fail(e);
    }
  },

  async stopWakeWord(): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.stopWakeWord();
    } catch (e) {
      return fail(e);
    }
  },

  onWakeWord(listener: () => void): Promise<PluginListenerHandle> | null {
    if (!this.available) return null;
    try {
      return plugin.addListener('wakeWord', listener);
    } catch {
      return null;
    }
  },

  onWakeWordUnavailable(listener: (data: { reason: string }) => void): Promise<PluginListenerHandle> | null {
    if (!this.available) return null;
    try {
      return plugin.addListener('wakeWordUnavailable', listener);
    } catch {
      return null;
    }
  },

  // ---- Floating orb -------------------------------------------------------

  /** Only true once Dhruv has granted "Display over other apps" by hand. */
  async overlayPermitted(): Promise<boolean> {
    if (!this.available) return false;
    try {
      return !!(await plugin.overlayPermitted()).value;
    } catch {
      return false;
    }
  },

  async overlayRunning(): Promise<boolean> {
    if (!this.available) return false;
    try {
      return !!(await plugin.overlayRunning()).value;
    } catch {
      return false;
    }
  },

  async startOverlay(accentFrom: string, accentTo: string, animated: boolean): Promise<NativeResult> {
    if (!this.available) return { ok: false, error: 'The orb only exists on the phone' };
    try {
      return await plugin.startOverlay({ accentFrom, accentTo, animated });
    } catch (e) {
      return fail(e);
    }
  },

  async stopOverlay(): Promise<NativeResult> {
    if (!this.available) return OFFLINE;
    try {
      return await plugin.stopOverlay();
    } catch (e) {
      return fail(e);
    }
  },

  onOverlayDismissed(listener: () => void): Promise<PluginListenerHandle> | null {
    if (!this.available) return null;
    try {
      return plugin.addListener('overlayDismissed', listener);
    } catch {
      return null;
    }
  },
};
