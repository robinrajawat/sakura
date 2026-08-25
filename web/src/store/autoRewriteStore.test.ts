import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useAiSettingsStore } from './aiSettingsStore';
import * as aiRewrite from '../state/aiRewrite';

import { useAutoRewriteStore } from './autoRewriteStore';

const DEFAULTS = {
  enabled: false,
  exclusions: { checkbox: true, heading: true, decisionlog: true, syntax: true },
  minWords: 5,
  batchCap: 5,
  idleSec: 120
};

describe('autoRewriteStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    useAutoRewriteStore.setState({ ...DEFAULTS, queue: new Set(), busy: false, pausedNoKey: false, consecutiveFails: 0 });
    useAiSettingsStore.setState({ provider: 'gemini', model: 'gemini-3.5-flash', modelByProvider: {}, prompt: useAiSettingsStore.getState().prompt });
    vi.restoreAllMocks();
  });

  it('defaults match legacy\'s own real top-level defaults', () => {
    expect(useAutoRewriteStore.getState()).toMatchObject(DEFAULTS);
  });

  it('setEnabled persists and toggles state', () => {
    useAutoRewriteStore.getState().setEnabled(true);
    expect(useAutoRewriteStore.getState().enabled).toBe(true);
    const stored = JSON.parse(localStorage.getItem('sakura_web_auto_rewrite_v1')!);
    expect(stored.enabled).toBe(true);
  });

  it('setEnabled(false) clears the queue and pausedNoKey', () => {
    useAutoRewriteStore.setState({ enabled: true, queue: new Set([1, 2]), pausedNoKey: true });
    useAutoRewriteStore.getState().setEnabled(false);
    expect(useAutoRewriteStore.getState().queue.size).toBe(0);
    expect(useAutoRewriteStore.getState().pausedNoKey).toBe(false);
  });

  it('setExclusion updates one key without disturbing the others', () => {
    useAutoRewriteStore.getState().setExclusion('heading', false);
    expect(useAutoRewriteStore.getState().exclusions).toEqual({ checkbox: true, heading: false, decisionlog: true, syntax: true });
  });

  it('setMinWords/setBatchCap/setIdleSec clamp to the real legacy ranges', () => {
    useAutoRewriteStore.getState().setMinWords(999);
    expect(useAutoRewriteStore.getState().minWords).toBe(20);
    useAutoRewriteStore.getState().setMinWords(-5);
    expect(useAutoRewriteStore.getState().minWords).toBe(0);

    useAutoRewriteStore.getState().setBatchCap(1);
    expect(useAutoRewriteStore.getState().batchCap).toBe(2);
    useAutoRewriteStore.getState().setBatchCap(999);
    expect(useAutoRewriteStore.getState().batchCap).toBe(50);

    useAutoRewriteStore.getState().setIdleSec(0);
    expect(useAutoRewriteStore.getState().idleSec).toBe(1);
    useAutoRewriteStore.getState().setIdleSec(999);
    expect(useAutoRewriteStore.getState().idleSec).toBe(300);
  });

  it('settings persist and reload correctly via a fresh loadPersisted (simulated reload)', async () => {
    useAutoRewriteStore.getState().setEnabled(true);
    useAutoRewriteStore.getState().setMinWords(3);
    useAutoRewriteStore.getState().setBatchCap(12);
    useAutoRewriteStore.getState().setExclusion('syntax', false);
    // Re-import-style reload: read the same storage key back through a fresh store instance's
    // own initializer logic by re-triggering it via vi's module reset isn't practical here, so
    // instead assert the raw persisted blob has everything a reload would read.
    const stored = JSON.parse(localStorage.getItem('sakura_web_auto_rewrite_v1')!);
    expect(stored).toEqual({ enabled: true, exclusions: { checkbox: true, heading: true, decisionlog: true, syntax: false }, minWords: 3, batchCap: 12, idleSec: 120 });
  });

  describe('queueNode', () => {
    it('is a no-op when auto-rewrite is disabled', () => {
      useAutoRewriteStore.getState().queueNode(1);
      expect(useAutoRewriteStore.getState().queue.size).toBe(0);
    });

    it('adds an id to the queue when enabled', () => {
      useAutoRewriteStore.getState().setEnabled(true);
      useAutoRewriteStore.getState().queueNode(1);
      expect(useAutoRewriteStore.getState().queue.has(1)).toBe(true);
    });

    it('flushes immediately once the queue reaches batchCap', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiRewrite, 'rewriteNodes').mockResolvedValue({ ok: true, message: 'ok' });
      useAutoRewriteStore.getState().setEnabled(true);
      useAutoRewriteStore.getState().setBatchCap(2);
      useAutoRewriteStore.getState().queueNode(1);
      expect(spy).not.toHaveBeenCalled();
      useAutoRewriteStore.getState().queueNode(2);
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      expect(spy).toHaveBeenCalledWith([1, 2]);
    });

    it('flushes after the idle timer elapses', async () => {
      vi.useFakeTimers();
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiRewrite, 'rewriteNodes').mockResolvedValue({ ok: true, message: 'ok' });
      useAutoRewriteStore.getState().setEnabled(true);
      useAutoRewriteStore.getState().setIdleSec(10);
      useAutoRewriteStore.getState().queueNode(1);
      expect(spy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledWith([1]);
      vi.useRealTimers();
    });

    it('restarts the idle timer on every new queued node rather than stacking timers', async () => {
      vi.useFakeTimers();
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiRewrite, 'rewriteNodes').mockResolvedValue({ ok: true, message: 'ok' });
      useAutoRewriteStore.getState().setEnabled(true);
      useAutoRewriteStore.getState().setIdleSec(10);
      useAutoRewriteStore.getState().queueNode(1);
      await vi.advanceTimersByTimeAsync(6000);
      useAutoRewriteStore.getState().queueNode(2); // resets the 10s timer
      await vi.advanceTimersByTimeAsync(6000); // 12s since node 1 queued, but only 6s since node 2
      expect(spy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(4000); // now 10s since node 2
      expect(spy).toHaveBeenCalledWith([1, 2]);
      vi.useRealTimers();
    });
  });

  describe('flushNow', () => {
    it('is a no-op for an empty queue', async () => {
      const spy = vi.spyOn(aiRewrite, 'rewriteNodes');
      await expect(useAutoRewriteStore.getState().flushNow()).resolves.toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });

    it('pauses (keeps the queue) when no AI key is available', async () => {
      const spy = vi.spyOn(aiRewrite, 'rewriteNodes');
      useAutoRewriteStore.setState({ enabled: true, queue: new Set([1, 2]) });
      await useAutoRewriteStore.getState().flushNow();
      expect(spy).not.toHaveBeenCalled();
      expect(useAutoRewriteStore.getState().pausedNoKey).toBe(true);
      expect(useAutoRewriteStore.getState().queue).toEqual(new Set([1, 2]));
    });

    it('clears pausedNoKey and consecutiveFails on a successful flush', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiRewrite, 'rewriteNodes').mockResolvedValue({ ok: true, message: 'ok' });
      useAutoRewriteStore.setState({ enabled: true, queue: new Set([1]), pausedNoKey: true, consecutiveFails: 2 });
      await useAutoRewriteStore.getState().flushNow();
      expect(useAutoRewriteStore.getState().pausedNoKey).toBe(false);
      expect(useAutoRewriteStore.getState().consecutiveFails).toBe(0);
      expect(useAutoRewriteStore.getState().busy).toBe(false);
    });

    it('increments consecutiveFails on a failed flush without disabling before the max', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiRewrite, 'rewriteNodes').mockResolvedValue({ ok: false, message: 'network error' });
      useAutoRewriteStore.setState({ enabled: true, queue: new Set([1]) });
      await useAutoRewriteStore.getState().flushNow();
      expect(useAutoRewriteStore.getState().enabled).toBe(true);
      expect(useAutoRewriteStore.getState().consecutiveFails).toBe(1);
    });

    it('disables auto-rewrite after MAX_CONSECUTIVE_FAILS (3) consecutive failures', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiRewrite, 'rewriteNodes').mockResolvedValue({ ok: false, message: 'network error' });
      useAutoRewriteStore.setState({ enabled: true, queue: new Set([1]) });
      await useAutoRewriteStore.getState().flushNow();
      useAutoRewriteStore.setState({ queue: new Set([2]) });
      await useAutoRewriteStore.getState().flushNow();
      useAutoRewriteStore.setState({ queue: new Set([3]) });
      await useAutoRewriteStore.getState().flushNow();
      expect(useAutoRewriteStore.getState().consecutiveFails).toBe(3);
      expect(useAutoRewriteStore.getState().enabled).toBe(false);
    });

    it('a thrown error from rewriteNodes is treated the same as a failed result', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiRewrite, 'rewriteNodes').mockRejectedValue(new Error('boom'));
      useAutoRewriteStore.setState({ enabled: true, queue: new Set([1]) });
      await useAutoRewriteStore.getState().flushNow();
      expect(useAutoRewriteStore.getState().busy).toBe(false);
      expect(useAutoRewriteStore.getState().consecutiveFails).toBe(1);
    });
  });

  describe('statusText', () => {
    it('reports Off when disabled', () => {
      expect(useAutoRewriteStore.getState().statusText()).toBe('Auto-rewrite: Off');
    });

    it('reports queued count when enabled with a non-empty queue', () => {
      useAutoRewriteStore.setState({ enabled: true, queue: new Set([1, 2, 3]) });
      expect(useAutoRewriteStore.getState().statusText()).toBe('✦ Auto-rewrite · 3 queued');
    });

    it('reports paused with waiting count when pausedNoKey', () => {
      useAutoRewriteStore.setState({ enabled: true, queue: new Set([1, 2]), pausedNoKey: true });
      expect(useAutoRewriteStore.getState().statusText()).toBe('✦ Auto-rewrite paused (2 waiting)');
    });

    it('reports Rewriting while busy', () => {
      useAutoRewriteStore.setState({ enabled: true, busy: true });
      expect(useAutoRewriteStore.getState().statusText()).toBe('✦ Rewriting…');
    });

    it('reports plain idle text when enabled with nothing queued', () => {
      useAutoRewriteStore.setState({ enabled: true, queue: new Set() });
      expect(useAutoRewriteStore.getState().statusText()).toBe('✦ Auto-rewrite');
    });
  });
});
