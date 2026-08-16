import { Browser } from '@capacitor/browser';
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { ToolManager, num, objectSchema, str, stringProp, type ToolDefinition } from '../ToolManager';
import { NativeTools, type GlobalAction, type MediaAction, type VolumeDirection } from '../../native/bridge';
import { AccessibilityManager, GestureManager } from '../AccessibilityManager';
import { AppManager } from '../AppManager';

export function createTools(onActivity: (text: string, ok: boolean) => void): ToolManager {
  // Built first so confirmAction and cancelAction can reach the pending action.
  const tools = new ToolManager(onActivity);

  const toolsList: ToolDefinition[] = [
    {
      name: 'openWebsite',
      description: 'Open a website in the device browser.',
      parameters: objectSchema({ url: stringProp('The full URL, including https://') }, ['url']),
      summary: (a) => `Opening ${str(a, 'url')}`,
      run: async (args) => {
        const url = str(args, 'url');
        if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'URL must start with https://' };
        await Browser.open({ url });
        return { ok: true, url };
      },
    },

    {
      name: 'searchGoogle',
      description: 'Search the web with Google.',
      parameters: objectSchema({ query: stringProp('The search query') }, ['query']),
      summary: (a) => `Searching for ${str(a, 'query')}`,
      run: async (args) => {
        await Browser.open({ url: `https://www.google.com/search?q=${encodeURIComponent(str(args, 'query'))}` });
        return { ok: true };
      },
    },

    {
      name: 'openYouTube',
      description: 'Open YouTube, optionally searching for something or playing a specific video.',
      parameters: objectSchema({
        query: stringProp('Optional search term'),
        videoId: stringProp('Optional YouTube video ID'),
      }),
      summary: (a) => {
        const query = str(a, 'query');
        return query ? `Opening YouTube: ${query}` : 'Opening YouTube';
      },
      run: async (args) => {
        const videoId = str(args, 'videoId');
        const query = str(args, 'query');
        let url = 'https://www.youtube.com';
        if (videoId) url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
        else if (query) url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        await Browser.open({ url });
        return { ok: true };
      },
    },

    {
      name: 'openMaps',
      description: 'Open Google Maps at a place, address, or search term.',
      parameters: objectSchema({ place: stringProp('Address, place name, or search term') }, ['place']),
      summary: (a) => `Opening Maps for ${str(a, 'place')}`,
      run: async (args) => {
        await Browser.open({ url: `https://www.google.com/maps/search/${encodeURIComponent(str(args, 'place'))}` });
        return { ok: true };
      },
    },

    {
      name: 'openSettings',
      description: 'Open the Android settings app, optionally at a specific pane.',
      parameters: objectSchema({
        pane: stringProp('Which settings screen', ['main', 'wifi', 'bluetooth', 'battery', 'apps', 'sound', 'display']),
      }),
      summary: (a) => `Opening ${str(a, 'pane', 'settings')} settings`,
      run: (args) => NativeTools.openSettings(str(args, 'pane', 'main')),
    },

    {
      name: 'callContact',
      description: 'Open the phone dialer with a number filled in. The user presses call themselves.',
      parameters: objectSchema({ number: stringProp('The phone number to dial') }, ['number']),
      summary: (a) => `Dialer ready for ${str(a, 'number')}`,
      confirm: (a) => `Should I open the dialer for ${str(a, 'number')}?`,
      run: (args) => NativeTools.call(str(args, 'number')),
    },

    {
      name: 'sendMessage',
      description: 'Open the messaging app with a draft SMS. The user presses send themselves.',
      parameters: objectSchema(
        { number: stringProp('Recipient phone number'), text: stringProp('Message body') },
        ['number', 'text'],
      ),
      summary: (a) => `Message drafted to ${str(a, 'number')}`,
      confirm: (a) => `Should I draft this to ${str(a, 'number')}: ${str(a, 'text')}?`,
      run: (args) => NativeTools.sms(str(args, 'number'), str(args, 'text')),
    },

    {
      name: 'createReminder',
      description: 'Schedule a reminder notification a number of minutes from now.',
      parameters: objectSchema(
        { text: stringProp('What to be reminded about'), minutes: stringProp('Minutes from now') },
        ['text', 'minutes'],
      ),
      summary: (a) => `Reminder in ${str(a, 'minutes')} min`,
      run: async (args) => {
        const minutes = Math.max(0, num(args, 'minutes', 5));
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display !== 'granted') return { ok: false, error: 'Notification permission denied' };
        const id = Date.now() % 2_147_483_647;
        await LocalNotifications.schedule({
          notifications: [
            { id, title: 'Lyraa reminder', body: str(args, 'text'), schedule: { at: new Date(Date.now() + minutes * 60_000) } },
          ],
        });
        return { ok: true, minutes };
      },
    },

    {
      name: 'openCamera',
      description: 'Open the camera app.',
      summary: () => 'Opening the camera',
      run: () => NativeTools.openCamera(),
    },

    {
      name: 'takePhoto',
      description: 'Take a photo from inside Lyraa.',
      summary: () => 'Taking a photo',
      run: async () => {
        const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 90 });
        return { ok: true, path: photo.webPath ?? null };
      },
    },

    {
      name: 'openGallery',
      description: 'Open the photo gallery.',
      summary: () => 'Opening your gallery',
      run: async () => {
        if (Capacitor.isNativePlatform()) return NativeTools.openGallery();
        const photo = await Camera.getPhoto({ source: CameraSource.Photos, resultType: CameraResultType.Uri, quality: 90 });
        return { ok: true, path: photo.webPath ?? null };
      },
    },

    {
      name: 'controlMusic',
      description: 'Control media playback on the device.',
      parameters: objectSchema(
        { action: stringProp('Playback control', ['play', 'pause', 'next', 'previous', 'toggle']) },
        ['action'],
      ),
      summary: (a) => `Music: ${str(a, 'action', 'toggle')}`,
      run: (args) => NativeTools.media(str(args, 'action', 'toggle') as MediaAction),
    },

    {
      name: 'setVolume',
      description: 'Raise, lower, mute, or unmute the media volume.',
      parameters: objectSchema(
        { direction: stringProp('Which way', ['up', 'down', 'mute', 'unmute']), steps: stringProp('How many steps, default 1') },
        ['direction'],
      ),
      summary: (a) => `Volume ${str(a, 'direction')}`,
      run: (args) => NativeTools.volume(str(args, 'direction', 'up') as VolumeDirection, Math.round(num(args, 'steps', 1))),
    },

    {
      name: 'setAlarm',
      description: 'Set an alarm for a specific time of day.',
      parameters: objectSchema(
        { hour: stringProp('Hour, 0 to 23'), minute: stringProp('Minute, 0 to 59'), label: stringProp('Optional label') },
        ['hour', 'minute'],
      ),
      summary: (a) => `Alarm at ${str(a, 'hour')}:${str(a, 'minute').padStart(2, '0')}`,
      run: (args) =>
        NativeTools.alarm(Math.round(num(args, 'hour', 7)), Math.round(num(args, 'minute', 0)), str(args, 'label')),
    },

    {
      name: 'setTimer',
      description: 'Start a countdown timer.',
      parameters: objectSchema({ seconds: stringProp('Length of the timer in seconds') }, ['seconds']),
      summary: (a) => `Timer for ${str(a, 'seconds')}s`,
      run: (args) => NativeTools.timer(Math.max(1, Math.round(num(args, 'seconds', 60)))),
    },

    {
      name: 'openCalculator',
      description: 'Open the calculator app.',
      summary: () => 'Opening the calculator',
      run: () => NativeTools.calculator(),
    },

    {
      name: 'flashlightOn',
      description: 'Turn the flashlight on.',
      summary: () => 'Flashlight on',
      run: () => NativeTools.flashlight(true),
    },

    {
      name: 'flashlightOff',
      description: 'Turn the flashlight off.',
      summary: () => 'Flashlight off',
      run: () => NativeTools.flashlight(false),
    },

    {
      name: 'copyToClipboard',
      description: 'Copy text to the clipboard.',
      parameters: objectSchema({ text: stringProp('The text to copy') }, ['text']),
      summary: () => 'Copied to clipboard',
      run: async (args) => {
        await Clipboard.write({ string: str(args, 'text') });
        return { ok: true };
      },
    },

    {
      name: 'shareText',
      description: 'Open the Android share sheet with some text.',
      parameters: objectSchema({ text: stringProp('The text to share'), title: stringProp('Optional title') }, ['text']),
      summary: () => 'Opening the share sheet',
      run: async (args) => {
        await Share.share({ text: str(args, 'text'), title: str(args, 'title') || undefined });
        return { ok: true };
      },
    },

    // ---- Apps ------------------------------------------------------------

    {
      name: 'openApp',
      description:
        'Open an installed app by the name the user says, such as WhatsApp, Instagram or Spotify. '
        + 'Verifies afterwards that the app actually came to the foreground.',
      parameters: objectSchema({ name: stringProp('The app name as the user said it') }, ['name']),
      summary: (a) => `Opening ${str(a, 'name')}`,
      run: async (args) => {
        const name = str(args, 'name');
        if (!name.trim()) return { ok: false, error: 'No app name given' };
        const opened = await AppManager.open(name);
        if (!opened.ok) return opened;

        // Launching is asynchronous, so give the window a moment to change.
        await new Promise((resolve) => setTimeout(resolve, 700));
        const current = await AccessibilityManager.currentApp();
        return {
          ok: true,
          app: opened.label ?? name,
          foreground: current.label || current.package || 'unknown',
        };
      },
    },

    {
      name: 'listInstalledApps',
      description: 'List the apps installed on the phone, to check whether one is available.',
      summary: () => 'Checking installed apps',
      run: async () => {
        const apps = await AppManager.list(true);
        return { ok: true, count: apps.length, apps: apps.map((app) => app.label) };
      },
    },

    // ---- Screen control --------------------------------------------------
    // All of these need the accessibility service, which returns a clear error
    // when it is switched off. Never claim an action worked without checking.

    {
      name: 'readScreen',
      description:
        'Read the labels of what is currently on screen, to decide what to tap or to describe it to the user. '
        + 'Password fields are never included.',
      summary: () => 'Reading the screen',
      run: async () => {
        const snapshot = await AccessibilityManager.readScreen();
        if (!snapshot.ok) return { ok: false, error: snapshot.error ?? 'Could not read the screen' };
        return {
          ok: true,
          app: snapshot.app ?? '',
          elements: snapshot.elements,
          truncated: snapshot.truncated ?? false,
        };
      },
    },

    {
      name: 'tapLabel',
      description:
        'Tap the on-screen element with this visible label or description. '
        + 'Prefer this over coordinates, since it survives different screen sizes.',
      parameters: objectSchema({ label: stringProp('The visible text of the thing to tap') }, ['label']),
      summary: (a) => `Tapping ${str(a, 'label')}`,
      run: (args) => AccessibilityManager.clickText(str(args, 'label')),
    },

    {
      name: 'tapScreen',
      description:
        'Tap an exact point. Values between 0 and 1 are read as a fraction of the screen, '
        + 'so 0.5, 0.5 is the middle. Use tapLabel instead when the target has a label.',
      parameters: objectSchema(
        { x: stringProp('Horizontal position'), y: stringProp('Vertical position') },
        ['x', 'y'],
      ),
      summary: (a) => `Tapping ${str(a, 'x')}, ${str(a, 'y')}`,
      run: (args) => GestureManager.tap(num(args, 'x', 0.5), num(args, 'y', 0.5)),
    },

    {
      name: 'longPressScreen',
      description: 'Press and hold a point on screen, the same as a long press.',
      parameters: objectSchema(
        { x: stringProp('Horizontal position'), y: stringProp('Vertical position') },
        ['x', 'y'],
      ),
      summary: () => 'Long pressing',
      run: (args) => GestureManager.longPress(num(args, 'x', 0.5), num(args, 'y', 0.5)),
    },

    {
      name: 'swipeScreen',
      description: 'Swipe from one point to another. Values between 0 and 1 are fractions of the screen.',
      parameters: objectSchema(
        {
          x1: stringProp('Start horizontal'), y1: stringProp('Start vertical'),
          x2: stringProp('End horizontal'), y2: stringProp('End vertical'),
          duration: stringProp('Milliseconds, default 260'),
        },
        ['x1', 'y1', 'x2', 'y2'],
      ),
      summary: () => 'Swiping',
      run: (args) => GestureManager.swipe(
        num(args, 'x1', 0.5), num(args, 'y1', 0.7),
        num(args, 'x2', 0.5), num(args, 'y2', 0.3),
        Math.round(num(args, 'duration', 260)),
      ),
    },

    {
      name: 'scrollScreen',
      description: 'Scroll the current screen up or down.',
      parameters: objectSchema({ direction: stringProp('Which way', ['up', 'down']) }, ['direction']),
      summary: (a) => `Scrolling ${str(a, 'direction', 'down')}`,
      run: (args) => GestureManager.scroll(str(args, 'direction', 'down') === 'up' ? 'up' : 'down'),
    },

    {
      name: 'typeText',
      description:
        'Type text into the field that currently has focus. Tap the field first. '
        + 'This refuses to type into password fields.',
      parameters: objectSchema(
        { text: stringProp('The text to type'), append: stringProp('true to add to what is there') },
        ['text'],
      ),
      summary: (a) => `Typing ${str(a, 'text').slice(0, 40)}`,
      run: (args) => AccessibilityManager.typeText(str(args, 'text'), str(args, 'append') === 'true'),
    },

    {
      name: 'pressNavigation',
      description: 'Use a system navigation control: back, home, recents, notifications or quickSettings.',
      parameters: objectSchema(
        { action: stringProp('Which control', ['back', 'home', 'recents', 'notifications', 'quickSettings']) },
        ['action'],
      ),
      summary: (a) => `Pressing ${str(a, 'action', 'back')}`,
      run: (args) => {
        const action = str(args, 'action', 'back');
        const allowed: GlobalAction[] = ['back', 'home', 'recents', 'notifications', 'quickSettings'];
        const chosen = allowed.find((candidate) => candidate === action) ?? 'back';
        return AccessibilityManager.navigate(chosen);
      },
    },

    {
      name: 'lockScreen',
      description: 'Lock the phone screen. Needs Android 9 or newer.',
      summary: () => 'Locking the screen',
      confirm: () => 'Do you want me to lock the phone?',
      run: () => AccessibilityManager.navigate('lockScreen'),
    },

    {
      name: 'checkScreenControl',
      description:
        'Check whether Lyraa is allowed to control the screen. Call this before any tapping, '
        + 'swiping or typing if an earlier attempt failed.',
      summary: () => 'Checking screen control',
      run: async () => {
        const enabled = await AccessibilityManager.isEnabled();
        if (enabled) return { ok: true, enabled: true };
        await AccessibilityManager.openSettings();
        return {
          ok: true,
          enabled: false,
          note: 'Accessibility settings are now open. Lyraa has to be switched on there by hand.',
        };
      },
    },

    // ---- Confirmation ----------------------------------------------------

    {
      name: 'confirmAction',
      description:
        'Carry out the action you last asked the user to confirm. Only call this after they have clearly agreed.',
      summary: () => 'Confirmed',
      run: () => tools.confirmPending(),
    },

    {
      name: 'cancelAction',
      description: 'Drop the action awaiting confirmation because the user declined.',
      summary: () => 'Cancelled',
      run: async () => tools.cancelPending(),
    },
  ];

  return tools.registerAll(toolsList);
}
