import {
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  ThinkingLevel,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import type { LyraaSettings } from './SettingsManager';
import { buildSystemInstruction } from './persona';
import type { ToolManager } from './ToolManager';
import { INPUT_SAMPLE_RATE } from './audio/pcm';

export interface LiveSessionCallbacks {
  onOpen: () => void;
  onAudio: (base64: string, mimeType?: string) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onGenerationComplete: () => void;
  onToolCall: (calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>) => void;
  onGoAway: (timeLeft?: string) => void;
  onResumeHandle: (handle: string) => void;
  onError: (message: string) => void;
  onClose: (reason: string) => void;
}

/**
 * The API exposes only HIGH and LOW for each end of the turn — there is no
 * MEDIUM — so three distinct feels come from pairing them rather than from three
 * values. Start sensitivity decides how readily Lyraa believes Dhruv has begun;
 * end sensitivity decides how quickly she believes he has finished.
 *
 *   low    patient at both ends: needs a clear start, waits before answering
 *   medium picks up quickly but still waits, which is the least interrupting mix
 *   high   quickest to both hear and reply, at the cost of clipping a pause
 */
const SENSITIVITY_START: Record<LyraaSettings['vadSensitivity'], StartSensitivity> = {
  low: StartSensitivity.START_SENSITIVITY_LOW,
  medium: StartSensitivity.START_SENSITIVITY_HIGH,
  high: StartSensitivity.START_SENSITIVITY_HIGH,
};

const SENSITIVITY_END: Record<LyraaSettings['vadSensitivity'], EndSensitivity> = {
  low: EndSensitivity.END_SENSITIVITY_LOW,
  medium: EndSensitivity.END_SENSITIVITY_LOW,
  high: EndSensitivity.END_SENSITIVITY_HIGH,
};

/**
 * Thin wrapper over `ai.live.connect`. Owns the socket and nothing else, so
 * VoiceEngine can drop and rebuild it without touching the audio graph.
 */
export class LiveSession {
  private session: Session | null = null;
  private closed = false;

  constructor(
    private apiKey: string,
    private settings: LyraaSettings,
    private tools: ToolManager,
    private callbacks: LiveSessionCallbacks,
    /** Handed back by a previous socket so a dropped call picks up mid-conversation. */
    private resumeHandle: string | null = null,
  ) {}

  get isOpen(): boolean {
    return this.session !== null && !this.closed;
  }

  async connect(): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    this.session = await ai.live.connect({
      model: this.settings.model,
      config: {
        // Audio only: Lyraa never returns text to the user.
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildSystemInstruction(this.settings),
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: this.settings.voiceName } },
          languageCode: this.settings.language,
        },
        // 3.1 Flash Live uses thinkingLevel, not thinkingBudget. MINIMAL keeps
        // first-audio latency down, which matters more than depth in speech.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: SENSITIVITY_START[this.settings.vadSensitivity],
            endOfSpeechSensitivity: SENSITIVITY_END[this.settings.vadSensitivity],
            prefixPaddingMs: 120,
            silenceDurationMs: this.settings.vadSilenceMs,
          },
        },
        contextWindowCompression: { slidingWindow: {} },
        // Session memory: asking for resumption is what makes the server issue
        // handles at all, so it is only requested when the setting is on.
        ...(this.settings.sessionMemory
          ? { sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {} }
          : {}),
        tools: [{ functionDeclarations: this.tools.declarations() }],
      },
      callbacks: {
        onopen: () => this.callbacks.onOpen(),
        onmessage: (message: LiveServerMessage) => this.handleMessage(message),
        onerror: (event: ErrorEvent) => this.callbacks.onError(event.message || 'Live connection error'),
        onclose: (event: CloseEvent) => {
          this.closed = true;
          this.callbacks.onClose(event.reason || 'closed');
        },
      },
    });
  }

  private handleMessage(message: LiveServerMessage): void {
    // A single serverContent can carry audio and signals together on 3.1, so
    // every branch is checked rather than switched.
    const content = message.serverContent;
    if (content) {
      for (const part of content.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data) this.callbacks.onAudio(data, part.inlineData?.mimeType);
      }
      if (content.interrupted) this.callbacks.onInterrupted();
      if (content.generationComplete) this.callbacks.onGenerationComplete();
      if (content.turnComplete) this.callbacks.onTurnComplete();
    }

    if (message.toolCall?.functionCalls?.length) {
      this.callbacks.onToolCall(
        message.toolCall.functionCalls.map((call) => ({
          id: call.id,
          name: call.name,
          args: call.args as Record<string, unknown> | undefined,
        })),
      );
    }

    if (message.goAway) this.callbacks.onGoAway(message.goAway.timeLeft);

    // Only kept when the server says this point is resumable; a handle taken
    // mid-generation would come back missing part of the turn.
    const resume = message.sessionResumptionUpdate;
    if (resume?.resumable && resume.newHandle) this.callbacks.onResumeHandle(resume.newHandle);
  }

  sendAudio(base64: string): void {
    if (!this.isOpen) return;
    try {
      this.session!.sendRealtimeInput({
        audio: { data: base64, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
      });
    } catch {
      /* socket closed mid-chunk; VoiceEngine handles reconnect via onclose */
    }
  }

  sendAudioStreamEnd(): void {
    if (!this.isOpen) return;
    try {
      this.session!.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      /* ignore */
    }
  }

  sendToolResponses(responses: Array<{ id?: string; name?: string; response: Record<string, unknown> }>): void {
    if (!this.isOpen || responses.length === 0) return;
    try {
      this.session!.sendToolResponse({ functionResponses: responses });
    } catch {
      /* ignore */
    }
  }

  close(): void {
    this.closed = true;
    try {
      this.session?.close();
    } catch {
      /* already gone */
    }
    this.session = null;
  }
}
