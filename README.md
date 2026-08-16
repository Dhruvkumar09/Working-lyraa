# Lyraa

A real-time, voice-to-voice AI assistant for Android. You talk, she talks back — no
typing, no waiting for text. Built on Google's Gemini Live API, wrapped in Capacitor,
and shipped as a sideloadable APK.

## What it does

- **Voice-to-voice only.** Audio in, audio out. The model never sends text replies to
  the user; it speaks.
- **Interruptible.** Talk over her and playback stops within a frame.
- **Automatic turn-taking.** Server-side voice activity detection decides when you have
  finished speaking, so there is no push-to-talk.
- **Device tools.** She can open websites, search, launch YouTube and Maps, draft a text,
  bring up the dialer, set alarms and timers, control music and volume, toggle the
  flashlight, take photos, copy to the clipboard, and open the share sheet.
- **Your key, your data.** You paste your own Google AI Studio key. It is stored in the
  Android keystore and audio goes straight from the phone to Google.

## Requirements

- A Google AI Studio API key — https://aistudio.google.com/apikey
- Android 7.0 (API 24) or newer

## Run it locally

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173 and paste your API key in **Settings → API**.

The browser build is a genuine, working client: microphone capture, streaming, playback,
and interruption all run in the browser. Only the native tools are inert on the web —
they resolve successfully but do nothing, because there is no Android to act on. On the
web the API key falls back to `localStorage`, and the Settings screen says so.

```bash
npm run build     # typecheck + production bundle
npm test          # unit tests + an App mount smoke test
```

## Get the APK

This repo builds its own APK in CI, because a phone-based dev environment has no JDK or
Android SDK.

1. Push to `main` (or run the **Build APK** workflow by hand from the Actions tab).
2. Open the finished run and download the `lyraa-debug-apk` artifact.
3. Tagging a release (`git tag v1.0.0 && git push --tags`) also attaches
   `app-debug.apk` to the GitHub Release, which is the easier link to open on a phone.

To install: on the phone, allow "install unknown apps" for your browser or file manager,
open the APK, and install. It is a debug-signed build, so Play Protect will warn you
once; that is expected for a sideload.

### Building it yourself

If you do have a JDK 21 and the Android SDK:

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

## First run on the phone

1. Grant the microphone permission when asked. Nothing works without it.
2. Paste your API key in **Settings → API** and hit **Test connection** — you should hear
   her voice.
3. Tap the orb and start talking.

Allowing notifications lets reminders fire, and exempting Lyraa from battery optimization
keeps a session alive when the screen goes off. Both are optional and both are explained
on the onboarding screen before anything is requested.

## How it fits together

```
src/lib/
  AudioStreamer.ts   mic -> 16 kHz mono PCM16, 100 ms chunks
  AudioPlayer.ts     streamed PCM -> gapless playback, instant stop on interrupt
  LiveSession.ts     @google/genai live connection
  VoiceEngine.ts     session lifecycle: connect, reconnect, renew, dispatch tools
  ToolManager.ts     tool registry; schemas are typechecked against the SDK
  tools/index.ts     the tool implementations
  StateManager.ts    zustand store; six phases drive the whole UI
src/native/
  bridge.ts          typed facade over the Java plugin, no-ops on web
android/app/src/main/java/com/lyraa/assistant/
  MainActivity.java      registers the plugin, grants the WebView the mic
  LyraaNativePlugin.java device actions a WebView cannot reach
  VoiceService.java      foreground service that keeps the mic session alive
```

Adding a tool is one entry in `src/lib/tools/index.ts`: a name, a description, a
parameter schema, a one-line summary for the activity feed, and a handler. The model sees
it on the next connection.

## Deliberate limits

- **No wake word.** "Hey Lyraa" needs always-on native audio processing; you start a
  session by tapping.
- **No accessibility automation.** She cannot tap buttons in other apps. The settings
  deep link is present, but no AccessibilityService ships in this version.
- **No screen reading**, and no floating overlay bubble.
- **Background = fast resume, not continuous listening.** The foreground service keeps a
  live session alive, but Android will not let the app start listening from the
  background on its own.
- **Sessions renew about every 15 minutes.** The Live API caps audio sessions, so the app
  reconnects. You may notice a brief pause.

## Privacy

The API key is never hardcoded and is not in this repository or the APK binary. On device
it is held by `capacitor-secure-storage-plugin`, which uses the Android keystore. Audio
streams directly from the phone to Google's API — there is no intermediate server.
Camera, photos, and notification permissions are only requested at the moment a tool
needs them.

Tools that reach other people never act on their own: `callContact` opens the dialer
prefilled and `sendMessage` opens a draft. You press call, and you press send.
