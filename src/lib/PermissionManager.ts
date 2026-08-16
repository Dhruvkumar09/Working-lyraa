import { Camera } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { NativeTools } from '../native/bridge';

export type PermissionId =
  | 'microphone'
  | 'notifications'
  | 'battery'
  | 'autostart'
  | 'overlay'
  | 'camera'
  | 'accessibility';

export interface PermissionSpec {
  id: PermissionId;
  title: string;
  why: string;
  required: boolean;
  /** Special-access grants open a Settings screen instead of a system prompt. */
  viaSettings: boolean;
}

export const PERMISSIONS: PermissionSpec[] = [
  {
    id: 'microphone',
    title: 'Microphone',
    why: 'Lyraa streams your voice to the Live API while you are talking to her. Without this, nothing works.',
    required: true,
    viaSettings: false,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    why: 'Shows the ongoing badge while a conversation is running, and delivers any reminders you ask for.',
    required: false,
    viaSettings: false,
  },
  {
    id: 'battery',
    title: 'Ignore battery optimisation',
    why: 'Stops Android from freezing the session while you are mid-conversation.',
    required: false,
    viaSettings: true,
  },
  {
    id: 'autostart',
    title: 'Autostart',
    why: 'Some manufacturers (Xiaomi, Oppo, Vivo) kill apps aggressively. Only needed on those devices.',
    required: false,
    viaSettings: true,
  },
  {
    id: 'overlay',
    title: 'Display over other apps',
    why: 'Lets the floating orb sit on top of whatever you are doing, so Lyraa is one tap away.',
    required: false,
    viaSettings: true,
  },
  {
    id: 'camera',
    title: 'Camera and photos',
    why: 'Only used at the moment you ask Lyraa to take a photo or open your gallery.',
    required: false,
    viaSettings: false,
  },
  {
    id: 'accessibility',
    title: 'Accessibility service',
    why: 'How she taps, scrolls, types and reads the screen for you. Android has no other way to allow it.',
    required: false,
    viaSettings: true,
  },
];

export const PermissionManager = {
  async check(id: PermissionId): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return id === 'microphone' ? await this.checkWebMic() : false;

    switch (id) {
      case 'microphone':
        return this.checkWebMic();
      case 'notifications': {
        const status = await LocalNotifications.checkPermissions();
        return status.display === 'granted';
      }
      case 'camera': {
        const status = await Camera.checkPermissions();
        return status.camera === 'granted';
      }
      case 'accessibility':
        return NativeTools.isAccessibilityEnabled();
      case 'overlay':
        return NativeTools.overlayPermitted();
      default:
        // Battery and autostart have no readable state; treat as unknown.
        return false;
    }
  },

  async checkWebMic(): Promise<boolean> {
    if (!navigator.permissions) return false;
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return status.state === 'granted';
    } catch {
      return false;
    }
  },

  async request(id: PermissionId): Promise<boolean> {
    switch (id) {
      case 'microphone': {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          return true;
        } catch {
          return false;
        }
      }
      case 'notifications': {
        const status = await LocalNotifications.requestPermissions();
        return status.display === 'granted';
      }
      case 'camera': {
        const status = await Camera.requestPermissions();
        return status.camera === 'granted';
      }
      case 'battery':
        return NativeTools.requestIgnoreBatteryOptimization();
      case 'autostart':
        await NativeTools.openAutoStartSettings();
        return false;
      case 'overlay':
        await NativeTools.openOverlaySettings();
        return false;
      case 'accessibility':
        await NativeTools.openAccessibilitySettings();
        return false;
    }
  },
};
