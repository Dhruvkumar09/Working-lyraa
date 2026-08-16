import { AudioPlayer } from './AudioPlayer';
import { AudioStreamer } from './AudioStreamer';
import { LiveSession } from './LiveSession';
import type { LyraaSettings } from './SettingsManager';
import { useLyraa, type Phase } from './StateManager';
import { createTools } from './tools';
import { NativeTools } from '../native/bridge';

/** Audio-only sessions cap at 15 min; renew a little early. */
const RENEW_AFTER_MS = 13.5 * 60 * 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

export class VoiceEngine {
  private session: LiveSession | null = null;
  private streamer: AudioStreamer;
  private player: AudioPlayer;
  private tools = createTools((text, ok) => {
    useLyraa.getState().pushActivity(ok ? 'tool' : 'error', text);
  });
  private renewTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private stopping = false;
  private lastUserAudioAt = 0;
  private awaitingFirstAudio = false;
  private turnStartedAt = 0;
  private serviceStarted = false;
  /** Latest resumable point, so a renew or a drop continues the same conversation. */
  private resumeHandle: string | null = null;

  constructor() {
    this.streamer = new AudioStreamer(
      (chunk) => {
        this.session?.sendAudio(chunk);
        this.lastUserAudioAt = Date.now();
      },
      (level) => {
        const state = useLyraa.getState();
        useLyraa.setState({ inputLevel: level });
        // Speech while the model is talking means the user is interrupting.
        if (level > 0.08 && state.phase === 'speaking') this.handleLocalInterrupt();
        else if (level > 0.04 && state.phase === 'idle') this.setPhase('listening');
      },
    );

    this.player = new AudioPlayer((level) => useLyraa.setState({ outputLevel: level }));
  }

  private setPhase(phase: Phase): void {
    useLyraa.getState().setPhase(phase);
  }

  private handleLocalInterrupt(): void {
    this.player.stop();
    this.setPhase('listening');
  }

  async start(apiKey: string, settings: LyraaSettings): Promise<void> {
    if (this.session) return;
    this.stopping = false;
    this.setPhase('connecting');

    // Autoplay policy: unlock from the tap that got us here.
    await this.player.unlock();

    if (settings.backgroundMode && !this.serviceStarted) {
      // Android 14 requires the mic FGS to start while the app is visible.
      const result = await NativeTools.startForegroundService();
      this.serviceStarted = result.ok;
    }

    try {
      await this.streamer.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useLyraa.getState().setError(`Microphone unavailable: ${message}`);
      this.setPhase('disconnected');
      await this.teardownService();
      return;
    }

    this.streamer.setMuted(!useLyraa.getState().micEnabled);
    await this.openSession(apiKey, settings);
  }

  private async openSession(apiKey: string, settings: LyraaSettings): Promise<void> {
    this.player.setQuality(settings.audioQuality);
    this.session = new LiveSession(apiKey, settings, this.tools, {
      onOpen: () => {
        useLyraa.getState().setError(null);
        useLyraa.getState().setReconnectAttempt(0);
        this.setPhase('idle');
        this.scheduleRenew(apiKey, settings);
      },

      onAudio: (data, mimeType) => {
        if (this.awaitingFirstAudio) {
          this.awaitingFirstAudio = false;
          useLyraa.getState().setLatency(Date.now() - this.turnStartedAt);
        }
        this.setPhase('speaking');
        void this.player.enqueue(data, mimeType);
      },

      onInterrupted: () => {
        this.player.stop();
        this.setPhase('listening');
      },

      onGenerationComplete: () => {
        this.awaitingFirstAudio = false;
      },

      onTurnComplete: () => {
        this.setPhase(this.player.isPlaying ? 'speaking' : 'idle');
        // Fall back to idle once the queued audio actually drains.
        window.setTimeout(() => {
          if (!this.player.isPlaying && useLyraa.getState().phase === 'speaking') this.setPhase('idle');
        }, 400);
      },

      onToolCall: (calls) => {
        void this.runTools(calls);
      },

      onGoAway: () => {
        void this.renew(apiKey, settings);
      },

      onResumeHandle: (handle) => {
        this.resumeHandle = handle;
      },

      onError: (message) => {
        useLyraa.getState().setError(message);
      },

      onClose: (reason) => {
        if (this.stopping) return;
        this.session = null;
        void this.scheduleReconnect(apiKey, settings, reason);
      },
    }, this.resumeHandle);

    try {
      this.turnStartedAt = Date.now();
      this.awaitingFirstAudio = true;
      await this.session.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.session = null;
      useLyraa.getState().setError(this.friendlyError(message));
      this.setPhase('disconnected');
      await this.streamer.stop();
      await this.teardownService();
    }
  }

  private friendlyError(message: string): string {
    if (/API key|API_KEY|401|403|PERMISSION/i.test(message)) return 'That API key was rejected. Check it in Settings.';
    if (/not found|404|NOT_FOUND/i.test(message)) return 'That model is not available on your key. Try another in Settings.';
    if (/quota|429|RESOURCE_EXHAUSTED/i.test(message)) return 'Rate limited by the API. Give it a moment.';
    if (/network|fetch|ENOTFOUND|offline/i.test(message)) return 'No connection to the Live API.';
    return message;
  }

  private async runTools(calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>): Promise<void> {
    const responses = [];
    const wasPhase = useLyraa.getState().phase;
    this.setPhase('executing');
    for (const call of calls) {
      if (!call.name) continue;
      const result = await this.tools.dispatch(call.name, call.args ?? {});
      responses.push({ id: call.id, name: call.name, response: result });
    }
    // The model replies next, so hand back to whatever it was doing rather than
    // leaving the orb stuck mid-action.
    if (useLyraa.getState().phase === 'executing') {
      this.setPhase(wasPhase === 'executing' ? 'idle' : wasPhase);
    }
    this.session?.sendToolResponses(responses);
  }

  private scheduleRenew(apiKey: string, settings: LyraaSettings): void {
    this.clearRenew();
    this.renewTimer = window.setTimeout(() => void this.renew(apiKey, settings), RENEW_AFTER_MS);
  }

  private clearRenew(): void {
    if (this.renewTimer !== null) {
      window.clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }
  }

  /** Reconnect before the session limit so the conversation is not cut off. */
  private async renew(apiKey: string, settings: LyraaSettings): Promise<void> {
    if (this.stopping || !this.session) return;
    useLyraa.getState().pushActivity('system', 'Refreshing the session');
    const previous = this.session;
    this.session = null;
    previous.close();
    await this.openSession(apiKey, settings);
  }

  private async scheduleReconnect(apiKey: string, settings: LyraaSettings, reason: string): Promise<void> {
    const state = useLyraa.getState();
    const attempt = state.reconnectAttempt + 1;

    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      state.setError(`Connection lost: ${reason}`);
      this.setPhase('disconnected');
      await this.streamer.stop();
      await this.teardownService();
      return;
    }

    state.setReconnectAttempt(attempt);
    this.setPhase('reconnecting');
    const delay = Math.min(8000, 400 * 2 ** (attempt - 1));
    this.reconnectTimer = window.setTimeout(() => void this.openSession(apiKey, settings), delay);
  }

  setMicEnabled(enabled: boolean): void {
    this.streamer.setMuted(!enabled);
    if (!enabled) {
      this.session?.sendAudioStreamEnd();
      this.player.stop();
    }
  }

  /** Time since the user last produced audio, used by the UI for silence hints. */
  get msSinceUserAudio(): number {
    return this.lastUserAudioAt === 0 ? 0 : Date.now() - this.lastUserAudioAt;
  }

  private async teardownService(): Promise<void> {
    if (this.serviceStarted) {
      await NativeTools.stopForegroundService();
      this.serviceStarted = false;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.clearRenew();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.session?.close();
    this.session = null;
    // Hanging up ends the conversation: the next start must not resume this one.
    this.resumeHandle = null;
    // Closing releases audio focus on Android; stop() alone leaves the context open.
    await this.player.close();
    await this.streamer.stop();
    await this.teardownService();
    useLyraa.getState().setLevels(0, 0);
    useLyraa.getState().setReconnectAttempt(0);
    this.setPhase('disconnected');
  }
}

export const voiceEngine = new VoiceEngine();
