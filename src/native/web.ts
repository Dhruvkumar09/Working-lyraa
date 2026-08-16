/** Web fallback for LyraaNative — used when running in a plain browser. */

import type { NativeBridgePlugin } from './bridge';

const NO_PHONE = 'That only works on the phone';

export const webNative: NativeBridgePlugin = {
  openSettings: async () => ({ ok: true }),
  call: async () => ({ ok: true }),
  sms: async () => ({ ok: true }),
  openCamera: async () => ({ ok: true }),
  openGallery: async () => ({ ok: true }),
  media: async () => ({ ok: true }),
  volume: async () => ({ ok: true }),
  alarm: async () => ({ ok: true }),
  timer: async () => ({ ok: true }),
  calculator: async () => ({ ok: true }),
  flashlight: async () => ({ ok: true }),
  requestIgnoreBatteryOptimization: async () => ({ ok: true }),
  openAutoStartSettings: async () => ({ ok: true }),
  openOverlaySettings: async () => ({ ok: true }),
  openAccessibilitySettings: async () => ({ ok: true }),
  isAccessibilityEnabled: async () => ({ value: false, enabled: false }),
  startForegroundService: async () => ({ ok: true }),
  stopForegroundService: async () => ({ ok: true }),
  setStatusBarStyle: async () => ({ ok: true }),

  gestureTap: async () => ({ ok: false, error: NO_PHONE }),
  gestureLongPress: async () => ({ ok: false, error: NO_PHONE }),
  gestureSwipe: async () => ({ ok: false, error: NO_PHONE }),
  gestureScroll: async () => ({ ok: false, error: NO_PHONE }),
  globalAction: async () => ({ ok: false, error: NO_PHONE }),
  clickText: async () => ({ ok: false, error: NO_PHONE }),
  typeText: async () => ({ ok: false, error: NO_PHONE }),
  readScreen: async () => ({ ok: false, error: NO_PHONE, elements: [] }),
  currentApp: async () => ({ ok: true, package: '', label: '' }),

  listApps: async () => ({ ok: true, apps: [] }),
  openApp: async () => ({ ok: false, error: NO_PHONE }),
  openUrl: async () => ({ ok: true }),

  getDefaultAssistant: async () => ({ ok: true, component: '', isLyraa: false }),
  openAssistantSettings: async () => ({ ok: true }),
  consumeAssistLaunch: async () => ({ ok: true, value: false }),

  startWakeWord: async () => ({ ok: false, error: NO_PHONE }),
  stopWakeWord: async () => ({ ok: true }),
  wakeWordSupported: async () => ({ ok: true, value: false }),

  overlayPermitted: async () => ({ ok: true, value: false }),
  overlayRunning: async () => ({ ok: true, value: false }),
  startOverlay: async () => ({ ok: false, error: NO_PHONE }),
  stopOverlay: async () => ({ ok: true }),

  addListener: async () => ({ remove: async () => {} }),
};
