package com.lyraa.assistant;

import android.content.Intent;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;

/**
 * Android requires an assistant to name a recognition service before it will
 * offer the assistant role.
 *
 * Lyraa does not transcribe locally — speech goes straight to the Gemini Live
 * session as audio — so this reports "not available" rather than pretending to
 * recognise anything. Any app that binds to it gets an honest error instead of
 * silence.
 */
public class LyraaRecognitionService extends RecognitionService {

    @Override
    protected void onStartListening(Intent recognizerIntent, Callback listener) {
        try {
            listener.error(SpeechRecognizer.ERROR_CLIENT);
        } catch (Exception ignored) {
            // The caller went away before we could answer.
        }
    }

    @Override
    protected void onCancel(Callback listener) {
        // Nothing was started.
    }

    @Override
    protected void onStopListening(Callback listener) {
        // Nothing was started.
    }
}
