package com.lyraa.assistant;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

/** Hands each assist invocation to {@link LyraaVoiceSession}. */
public class LyraaVoiceSessionService extends VoiceInteractionSessionService {

    @Override
    public VoiceInteractionSession onNewSession(Bundle args) {
        return new LyraaVoiceSession(this);
    }
}
