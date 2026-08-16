package com.lyraa.assistant;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;

/**
 * What happens when Dhruv triggers the assist gesture — long-press home, the
 * power button shortcut, or a "Hey Google"-style hand-off on devices that route
 * it to the selected assistant.
 *
 * Lyraa does her listening inside the main activity, where the microphone and
 * the Live session already live, so the session brings that forward and steps
 * out of the way rather than drawing its own overlay.
 */
public class LyraaVoiceSession extends VoiceInteractionSession {

    public LyraaVoiceSession(Context context) {
        super(context);
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);

        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra(MainActivity.EXTRA_FROM_ASSIST, true);
        getContext().startActivity(intent);

        hide();
    }
}
