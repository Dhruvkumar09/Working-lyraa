import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lyraa.assistant',
  appName: 'Lyraa',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#05060f',
      overlaysWebView: true,
    },
  },
};

export default config;
