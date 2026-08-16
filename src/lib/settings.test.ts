import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from './SettingsManager';
import { buildSystemInstruction } from './persona';
import { PHASE_LABELS, isLive, useLyraa } from './StateManager';

describe('mergeSettings', () => {
  it('falls back to defaults for junk input', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps known keys and drops unknown ones', () => {
    const merged = mergeSettings({ voiceName: 'Kore', bogus: true });
    expect(merged.voiceName).toBe('Kore');
    expect(merged).not.toHaveProperty('bogus');
  });

  it('ignores values of the wrong type', () => {
    const merged = mergeSettings({ humor: 'loads', warmth: 10 });
    expect(merged.humor).toBe(DEFAULT_SETTINGS.humor);
    expect(merged.warmth).toBe(10);
  });

  it('leaves the orb off until it is asked for, since it needs a granted overlay', () => {
    expect(DEFAULT_SETTINGS.floatingOrb).toBe(false);
    expect(mergeSettings({ floatingOrb: true }).floatingOrb).toBe(true);
  });
});

describe('buildSystemInstruction', () => {
  it('describes the persona and tool policy', () => {
    const prompt = buildSystemInstruction(DEFAULT_SETTINGS);
    expect(prompt).toContain('Lyraa');
    expect(prompt).toContain('Only use a tool when Dhruv actually asked');
    expect(prompt).toContain('stop immediately and listen');
  });

  it('names Dhruv as the owner and rules out every other form of address', () => {
    const prompt = buildSystemInstruction(DEFAULT_SETTINGS);
    expect(prompt).toContain('His name is Dhruv');
    expect(prompt).toContain('Never call him sir, boss, bro, master, user, friend');
  });

  it('spells out the confirmation protocol for sensitive actions', () => {
    const prompt = buildSystemInstruction(DEFAULT_SETTINGS);
    expect(prompt).toContain('call confirmAction');
    expect(prompt).toContain('cancelAction');
  });

  it('refuses to work around authentication', () => {
    const prompt = buildSystemInstruction(DEFAULT_SETTINGS);
    expect(prompt).toContain('CAPTCHA');
  });

  it('reflects the humour and greeting settings', () => {
    const dry = buildSystemInstruction({ ...DEFAULT_SETTINGS, humor: 0, greetingStyle: 'none' });
    const silly = buildSystemInstruction({ ...DEFAULT_SETTINGS, humor: 100, greetingStyle: 'playful' });
    expect(dry).toContain('humour reads barely');
    expect(dry).toContain('Do not greet');
    expect(silly).toContain('humour reads intensely');
    expect(silly).toContain('playful');
  });

  it('reflects the personality preset', () => {
    expect(buildSystemInstruction({ ...DEFAULT_SETTINGS, personality: 'calm' })).toContain('calm and grounding');
  });

  it('describes pacing from the speaking speed, and says nothing at her natural pace', () => {
    expect(buildSystemInstruction({ ...DEFAULT_SETTINGS, speakingSpeed: 60 })).toContain('Speak slowly');
    expect(buildSystemInstruction({ ...DEFAULT_SETTINGS, speakingSpeed: 140 })).toContain('Speak briskly');
    expect(buildSystemInstruction({ ...DEFAULT_SETTINGS, speakingSpeed: 100 })).not.toContain('Speak slowly');
    expect(buildSystemInstruction({ ...DEFAULT_SETTINGS, speakingSpeed: 100 })).not.toContain('Speak briskly');
  });

  it('leaves no blank bullet when a dial contributes no line', () => {
    const prompt = buildSystemInstruction({ ...DEFAULT_SETTINGS, speakingSpeed: 100 });
    expect(prompt).not.toContain('\n\n\n');
  });
});

describe('phase state', () => {
  it('treats only connected phases as live', () => {
    expect(isLive('listening')).toBe(true);
    expect(isLive('speaking')).toBe(true);
    expect(isLive('idle')).toBe(true);
    expect(isLive('executing')).toBe(true);
    expect(isLive('connecting')).toBe(false);
    expect(isLive('reconnecting')).toBe(false);
    expect(isLive('error')).toBe(false);
    expect(isLive('disconnected')).toBe(false);
  });

  it('labels every phase', () => {
    for (const phase of Object.keys(PHASE_LABELS)) {
      expect(PHASE_LABELS[phase as keyof typeof PHASE_LABELS].length).toBeGreaterThan(0);
    }
  });

  it('stamps the session start when going live and clears it on disconnect', () => {
    const { setPhase } = useLyraa.getState();
    setPhase('idle');
    const started = useLyraa.getState().sessionStartedAt;
    expect(started).not.toBeNull();

    setPhase('speaking');
    expect(useLyraa.getState().sessionStartedAt).toBe(started);

    setPhase('disconnected');
    expect(useLyraa.getState().sessionStartedAt).toBeNull();
  });

  it('clears levels and errors appropriately', () => {
    const state = useLyraa.getState();
    state.setLevels(0.5, 0.5);
    state.setError('boom');
    state.setPhase('connecting');
    expect(useLyraa.getState().error).toBeNull();

    state.setLevels(0.5, 0.5);
    state.setPhase('disconnected');
    expect(useLyraa.getState().inputLevel).toBe(0);
    expect(useLyraa.getState().outputLevel).toBe(0);
  });

  it('caps the activity feed', () => {
    const { pushActivity, clearActivity } = useLyraa.getState();
    clearActivity();
    for (let i = 0; i < 60; i++) pushActivity('system', `entry ${i}`);
    const activity = useLyraa.getState().activity;
    expect(activity.length).toBe(40);
    expect(activity[0].text).toBe('entry 59');
  });
});
