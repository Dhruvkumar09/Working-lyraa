// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { StorageManager } from './lib/StorageManager';

vi.mock('./lib/VoiceEngine', () => ({
  voiceEngine: { start: vi.fn(), stop: vi.fn(), setMicEnabled: vi.fn() },
}));

let root: Root | null = null;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
});

function render() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

/** The splash holds the screen for its full run, so tests fast-forward past it. */
async function mount() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const host = render();
  await act(async () => {
    root = createRoot(host);
    root.render(<App />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3400);
  });
  return host;
}

it('opens on the splash, wordmark first', async () => {
  vi.spyOn(StorageManager, 'getOnboarded').mockResolvedValue(true);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const host = render();
  await act(async () => {
    root = createRoot(host);
    root.render(<App />);
  });
  expect(host.textContent).toContain('LYRAA');
  expect(host.textContent).toContain('Made by Dhruv');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3400);
  });
  expect(host.textContent).toContain('Start talking');
});

it('shows onboarding on a fresh install', async () => {
  vi.spyOn(StorageManager, 'getOnboarded').mockResolvedValue(false);
  const host = await mount();
  expect(host.textContent).toContain("Hi, I'm Lyraa");
  expect(host.textContent).toContain('Get started');
});

it('reaches the home screen once onboarding is done', async () => {
  vi.spyOn(StorageManager, 'getOnboarded').mockResolvedValue(true);
  const host = await mount();
  expect(host.textContent).toContain('Settings');
  expect(host.textContent).toContain('Start talking');
});

it('keeps the byline on the home screen', async () => {
  vi.spyOn(StorageManager, 'getOnboarded').mockResolvedValue(true);
  const host = await mount();
  expect(host.textContent).toContain('Made by Dhruv');
});

it('prompts for an API key when none is stored', async () => {
  vi.spyOn(StorageManager, 'getOnboarded').mockResolvedValue(true);
  vi.spyOn(StorageManager, 'getApiKey').mockResolvedValue(null);
  const host = await mount();
  expect(host.textContent).toContain('Add your Google AI Studio key in Settings to start.');
});

/** Nothing in Settings may advertise a feature that does not exist. */
it('offers the orb on the device tab rather than an unbuilt-feature notice', async () => {
  vi.spyOn(StorageManager, 'getOnboarded').mockResolvedValue(true);
  const host = await mount();

  const click = async (text: string) => {
    const target = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === text);
    await act(async () => target?.click());
  };

  await click('Settings');
  await click('Device');

  expect(host.textContent).toContain('Floating orb');
  expect(host.textContent).not.toContain('Not built yet');
  expect(host.textContent).not.toContain('Deferred');
});
