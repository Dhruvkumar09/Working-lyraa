import { NativeTools, type GlobalAction, type ScreenElement, type ScrollDirection } from '../native/bridge';

/**
 * Screen control, backed by `LyraaAccessibilityService`.
 *
 * Dhruv has to switch the service on by hand under Accessibility — there is no
 * API to grant it — so every method here can legitimately come back with
 * "screen control is off". Callers should surface that rather than retrying.
 *
 * Coordinates at or below 1 are read as a fraction of the screen, so callers can
 * aim for the middle of the display without knowing its pixel size.
 */
export const AccessibilityManager = {
  get implemented(): boolean {
    return true;
  },

  isEnabled(): Promise<boolean> {
    return NativeTools.isAccessibilityEnabled();
  },

  openSettings(): Promise<void> {
    return NativeTools.openAccessibilitySettings();
  },

  /** Reads visible labels. Password fields are skipped by the service itself. */
  async readScreen(): Promise<{ ok: boolean; app?: string; elements: ScreenElement[]; truncated?: boolean; error?: string }> {
    const snapshot = await NativeTools.readScreen();
    return {
      ok: snapshot.ok,
      app: snapshot.app,
      elements: snapshot.elements ?? [],
      truncated: snapshot.truncated,
      error: snapshot.error,
    };
  },

  /** Types into whatever field holds input focus. Refuses password fields. */
  typeText(text: string, append = false) {
    return NativeTools.typeText(text, append);
  },

  clickText(label: string) {
    return NativeTools.clickText(label, false);
  },

  longPressText(label: string) {
    return NativeTools.clickText(label, true);
  },

  navigate(action: GlobalAction) {
    return NativeTools.globalAction(action);
  },

  back() {
    return NativeTools.globalAction('back');
  },

  home() {
    return NativeTools.globalAction('home');
  },

  recents() {
    return NativeTools.globalAction('recents');
  },

  currentApp() {
    return NativeTools.currentApp();
  },
};

/** Raw gestures, for when there is nothing on screen worth naming. */
export const GestureManager = {
  get implemented(): boolean {
    return true;
  },

  tap(x: number, y: number) {
    return NativeTools.tap(x, y);
  },

  longPress(x: number, y: number) {
    return NativeTools.longPress(x, y);
  },

  swipe(x1: number, y1: number, x2: number, y2: number, duration = 260) {
    return NativeTools.swipe(x1, y1, x2, y2, duration);
  },

  scroll(direction: ScrollDirection = 'down') {
    return NativeTools.scroll(direction);
  },
};
