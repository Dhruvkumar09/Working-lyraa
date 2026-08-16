package com.lyraa.assistant;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    /** Set by {@link LyraaVoiceSession} when the assist gesture brought us here. */
    public static final String EXTRA_FROM_ASSIST = "lyraa.fromAssist";

    /**
     * The web layer starts well after the intent arrives, so the flag waits here
     * until {@code LyraaNative.consumeAssistLaunch} collects it. Reading it clears
     * it, so one gesture only ever opens one conversation.
     */
    private static volatile boolean assistPending = false;

    static boolean consumeAssistLaunch() {
        boolean pending = assistPending;
        assistPending = false;
        return pending;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LyraaNativePlugin.class);
        super.onCreate(savedInstanceState);
        noteAssist(getIntent());
        requestVoicePermissions();
        getBridge().getWebView().setWebChromeClient(new MicWebChromeClient(getBridge()));
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        noteAssist(intent);
        if (assistPending) {
            LyraaNativePlugin.notifyAssistLaunch();
        }
    }

    private void noteAssist(Intent intent) {
        if (intent != null && intent.getBooleanExtra(EXTRA_FROM_ASSIST, false)) {
            assistPending = true;
        }
    }

    /**
     * getUserMedia inside the WebView only succeeds once the app itself holds
     * RECORD_AUDIO, so ask up front rather than mid-conversation.
     */
    private void requestVoicePermissions() {
        java.util.ArrayList<String> needed = new java.util.ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), 9001);
        }
    }

    /** Grants the WebView the mic it already has at the OS level. */
    private class MicWebChromeClient extends BridgeWebChromeClient {
        MicWebChromeClient(com.getcapacitor.Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            boolean hasMic = ContextCompat.checkSelfPermission(
                MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            if (hasMic) {
                runOnUiThread(() -> request.grant(request.getResources()));
            } else {
                requestVoicePermissions();
                super.onPermissionRequest(request);
            }
        }
    }
}
