import { Toast } from '@capacitor/toast';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const UIManager = {
  async toast(text: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Toast.show({ text, duration: 'short', position: 'bottom' });
    } catch {
      /* non-fatal */
    }
  },

  async tap(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Haptics.impact({ style });
    } catch {
      /* device without haptics */
    }
  },
};

export { ImpactStyle };
