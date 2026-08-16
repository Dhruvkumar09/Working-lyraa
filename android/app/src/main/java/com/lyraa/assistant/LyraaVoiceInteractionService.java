package com.lyraa.assistant;

import android.service.voice.VoiceInteractionService;

/**
 * Registers Lyraa as a candidate for Android's "Digital assistant app" role.
 *
 * The role itself is granted by Dhruv in system settings; declaring this service
 * only makes Lyraa appear in that list. Nothing here assumes the role was given
 * — {@link LyraaNativePlugin#getDefaultAssistant} reads the real setting back.
 */
public class LyraaVoiceInteractionService extends VoiceInteractionService {

    @Override
    public void onReady() {
        super.onReady();
    }
}
