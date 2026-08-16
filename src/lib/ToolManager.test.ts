import { Type } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { ToolManager, num, objectSchema, str, stringProp } from './ToolManager';

function manager(onActivity?: (text: string, ok: boolean) => void) {
  return new ToolManager(onActivity).register({
    name: 'ping',
    description: 'Ping back.',
    parameters: objectSchema({ value: stringProp('anything') }),
    summary: (a) => `ping ${str(a, 'value')}`,
    run: async (args) => ({ ok: true, echoed: args.value }),
  });
}

describe('ToolManager', () => {
  it('exposes declarations in the Live API shape', () => {
    const declarations = manager().declarations();
    expect(declarations).toHaveLength(1);
    expect(declarations[0].name).toBe('ping');
    expect(declarations[0].parameters?.type).toBe(Type.OBJECT);
  });

  it('omits parameters for tools that take none', () => {
    const tools = new ToolManager().register({
      name: 'flash',
      description: 'Toggle.',
      summary: () => 'flash',
      run: async () => ({ ok: true }),
    });
    expect(tools.declarations()[0]).not.toHaveProperty('parameters');
  });

  it('dispatches to the handler and reports activity', async () => {
    const onActivity = vi.fn();
    const result = await manager(onActivity).dispatch('ping', { value: 'hi' });
    expect(result).toEqual({ ok: true, echoed: 'hi' });
    expect(onActivity).toHaveBeenCalledWith('ping hi', true);
  });

  it('returns an error result for unknown tools instead of throwing', async () => {
    const result = await manager().dispatch('nope');
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('nope');
  });

  it('converts a thrown handler into an error result', async () => {
    const onActivity = vi.fn();
    const tools = new ToolManager(onActivity).register({
      name: 'boom',
      description: 'Fails.',
      summary: () => 'boom',
      run: async () => {
        throw new Error('device busy');
      },
    });
    const result = await tools.dispatch('boom');
    expect(result).toEqual({ ok: false, error: 'device busy' });
    expect(onActivity).toHaveBeenCalledWith('boom failed: device busy', false);
  });

  it('marks ok:false results as failed activity', async () => {
    const onActivity = vi.fn();
    const tools = new ToolManager(onActivity).register({
      name: 'bad',
      description: 'Rejects.',
      summary: () => 'bad',
      run: async () => ({ ok: false, error: 'nope' }),
    });
    await tools.dispatch('bad');
    expect(onActivity).toHaveBeenCalledWith('bad', false);
  });
});

describe('confirmation', () => {
  function risky(onActivity?: (text: string, ok: boolean) => void) {
    const run = vi.fn(async () => ({ ok: true, dialled: true }));
    const tools = new ToolManager(onActivity).register({
      name: 'dial',
      description: 'Dial a number.',
      parameters: objectSchema({ number: stringProp('who') }),
      summary: (a) => `dialling ${str(a, 'number')}`,
      confirm: (a) => `Call ${str(a, 'number')}?`,
      run,
    });
    return { tools, run };
  }

  it('holds a sensitive tool and asks instead of running it', async () => {
    const { tools, run } = risky();
    const result = await tools.dispatch('dial', { number: '123' });
    expect(result.needsConfirmation).toBe(true);
    expect(result.question).toBe('Call 123?');
    expect(result.ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(tools.pendingQuestion()).toBe('Call 123?');
  });

  it('runs the held tool with its original arguments once confirmed', async () => {
    const { tools, run } = risky();
    await tools.dispatch('dial', { number: '123' });
    const result = await tools.confirmPending();
    expect(result).toEqual({ ok: true, dialled: true });
    expect(run).toHaveBeenCalledWith({ number: '123' });
    expect(tools.pendingQuestion()).toBeNull();
  });

  it('does not run the tool when cancelled', async () => {
    const { tools, run } = risky();
    await tools.dispatch('dial', { number: '123' });
    expect(tools.cancelPending().cancelled).toBe(true);
    expect(tools.pendingQuestion()).toBeNull();
    const result = await tools.confirmPending();
    expect(result.ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses to confirm when nothing is pending', async () => {
    const { tools } = risky();
    const result = await tools.confirmPending();
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('nothing waiting');
  });

  it('expires a stale request rather than acting on a late yes', async () => {
    vi.useFakeTimers();
    try {
      const { tools, run } = risky();
      await tools.dispatch('dial', { number: '123' });
      vi.advanceTimersByTime(91_000);
      expect(tools.pendingQuestion()).toBeNull();
      const result = await tools.confirmPending();
      expect(result.ok).toBe(false);
      expect(run).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports the pending question as activity', async () => {
    const onActivity = vi.fn();
    const { tools } = risky(onActivity);
    await tools.dispatch('dial', { number: '123' });
    expect(onActivity).toHaveBeenCalledWith('Waiting on you: Call 123?', true);
  });

  it('leaves tools without a confirm hook running immediately', async () => {
    const result = await manager().dispatch('ping', { value: 'hi' });
    expect(result).toEqual({ ok: true, echoed: 'hi' });
  });
});

describe('arg coercion', () => {
  it('reads strings with a fallback', () => {
    expect(str({ a: 'x' }, 'a')).toBe('x');
    expect(str({ a: 5 }, 'a', 'fallback')).toBe('fallback');
    expect(str({}, 'missing')).toBe('');
  });

  it('reads numbers, including numeric strings the model sends', () => {
    expect(num({ n: 7 }, 'n', 0)).toBe(7);
    expect(num({ n: '12' }, 'n', 0)).toBe(12);
    expect(num({ n: 'abc' }, 'n', 3)).toBe(3);
    expect(num({}, 'n', 42)).toBe(42);
    expect(num({ n: Number.NaN }, 'n', 1)).toBe(1);
  });
});
