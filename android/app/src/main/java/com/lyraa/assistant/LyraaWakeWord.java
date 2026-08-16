package com.lyraa.assistant;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognitionService;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Phrase spotting with the platform recogniser.
 *
 * Android reserves real always-on hotwords for the pre-installed assistant, so
 * this is the honest version of the feature: it only listens while Lyraa is open
 * and idle, and it hands the microphone straight back the moment a session
 * starts. It restarts itself after every result because SpeechRecognizer ends
 * the utterance on its own; the backoff keeps a device that always errors from
 * spinning.
 */
class LyraaWakeWord {

    interface Callback {
        void onHeard();
        void onUnavailable(String reason);
    }

    /** Long enough to release the mic between attempts, short enough to feel continuous. */
    private static final long RESTART_MS = 350;
    private static final long ERROR_BACKOFF_MS = 1200;
    /** A device with no recogniser fails instantly and forever; stop rather than loop. */
    private static final int MAX_CONSECUTIVE_ERRORS = 5;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Callback callback;
    private final List<String> phrases;

    private SpeechRecognizer recognizer;
    private boolean wanted = false;
    private int consecutiveErrors = 0;

    LyraaWakeWord(Context context, String phrase, Callback callback) {
        this.context = context;
        this.callback = callback;
        this.phrases = variantsOf(phrase);
    }

    /** Leading fillers the recogniser drops or adds freely. */
    private static final String[] FILLERS = {"hey ", "ok ", "okay ", "hi ", "yo "};

    /**
     * "Hey Lyraa" comes back spelt a dozen ways, so the bare name is matched too
     * and the common mishearings are accepted rather than fought.
     */
    private static List<String> variantsOf(String phrase) {
        List<String> out = new ArrayList<>();
        String base = normalise(phrase);
        if (base.isEmpty()) return out;
        out.add(base);

        String tail = base;
        for (String filler : FILLERS) {
            if (tail.startsWith(filler)) {
                tail = tail.substring(filler.length());
                break;
            }
        }
        if (!tail.isEmpty() && !out.contains(tail)) out.add(tail);

        if (tail.equals("lyraa") || tail.equals("lyra")) {
            for (String heard : new String[] {"lyra", "lyrae", "laira"}) {
                if (!out.contains(heard)) out.add(heard);
            }
        }
        return out;
    }

    private static String normalise(String value) {
        if (value == null) return "";
        return value.toLowerCase(Locale.US).replaceAll("[^a-z ]", " ").replaceAll("\\s+", " ").trim();
    }

    /**
     * Lyraa ships her own RecognitionService so she can hold the assistant role,
     * and it deliberately does not transcribe. `isRecognitionAvailable` would count
     * it and report a working recogniser on a device that has none, so anything in
     * this package is excluded.
     */
    static boolean available(Context context) {
        Intent intent = new Intent(RecognitionService.SERVICE_INTERFACE);
        List<ResolveInfo> services = context.getPackageManager().queryIntentServices(intent, 0);
        for (ResolveInfo info : services) {
            if (info.serviceInfo != null && !context.getPackageName().equals(info.serviceInfo.packageName)) {
                return true;
            }
        }
        return false;
    }

    void start() {
        if (wanted) return;
        wanted = true;
        consecutiveErrors = 0;
        if (!available(context)) {
            wanted = false;
            callback.onUnavailable("No speech recogniser on this device");
            return;
        }
        handler.post(this::listen);
    }

    void stop() {
        wanted = false;
        handler.removeCallbacksAndMessages(null);
        handler.post(() -> {
            if (recognizer != null) {
                try {
                    recognizer.cancel();
                    recognizer.destroy();
                } catch (Exception ignored) {
                    // Already torn down by the framework.
                }
                recognizer = null;
            }
        });
    }

    private void listen() {
        if (!wanted) return;
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(context);
            recognizer.setRecognitionListener(new Listener());
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.getPackageName());
        try {
            recognizer.startListening(intent);
        } catch (Exception e) {
            scheduleRestart(ERROR_BACKOFF_MS);
        }
    }

    private void scheduleRestart(long delayMs) {
        if (!wanted) return;
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::listen, delayMs);
    }

    private boolean matches(Bundle results) {
        if (results == null) return false;
        ArrayList<String> heard = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (heard == null) return false;
        for (String candidate : heard) {
            String text = normalise(candidate);
            if (text.isEmpty()) continue;
            for (String phrase : phrases) {
                if (text.contains(phrase)) return true;
            }
        }
        return false;
    }

    private void fire() {
        // The session is about to take the microphone, so let go of it first.
        stop();
        callback.onHeard();
    }

    private class Listener implements RecognitionListener {
        @Override
        public void onPartialResults(Bundle partialResults) {
            if (matches(partialResults)) fire();
        }

        @Override
        public void onResults(Bundle results) {
            consecutiveErrors = 0;
            if (matches(results)) fire();
            else scheduleRestart(RESTART_MS);
        }

        @Override
        public void onError(int error) {
            // Silence and timeouts are the normal outcome of waiting for a phrase.
            boolean benign = error == SpeechRecognizer.ERROR_NO_MATCH
                    || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
            if (benign) {
                consecutiveErrors = 0;
                scheduleRestart(RESTART_MS);
                return;
            }
            consecutiveErrors += 1;
            if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                wanted = false;
                callback.onUnavailable("Microphone permission is off");
                return;
            }
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                wanted = false;
                callback.onUnavailable("The speech recogniser keeps failing");
                return;
            }
            scheduleRestart(ERROR_BACKOFF_MS);
        }

        @Override
        public void onReadyForSpeech(Bundle params) {}

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onEvent(int eventType, Bundle params) {}
    }
}
