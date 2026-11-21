import { describe, it, expect } from 'vitest';
import {
  loadingStage,
  msUntilNextLoadingStage,
  LOADING_SHOW_AFTER_MS,
  LOADING_SLOW_AFTER_MS,
  LOADING_STALLED_AFTER_MS,
} from '../../src/utils/loadingStage';

describe('loadingStage', () => {
  it('shows nothing for a short wait', () => {
    expect(loadingStage(0)).toBe('quiet');
    expect(loadingStage(LOADING_SHOW_AFTER_MS - 1)).toBe('quiet');
  });
  it('steps through loading, slow and stalled at the edges', () => {
    expect(loadingStage(LOADING_SHOW_AFTER_MS)).toBe('loading');
    expect(loadingStage(LOADING_SLOW_AFTER_MS - 1)).toBe('loading');
    expect(loadingStage(LOADING_SLOW_AFTER_MS)).toBe('slow');
    expect(loadingStage(LOADING_STALLED_AFTER_MS - 1)).toBe('slow');
    expect(loadingStage(LOADING_STALLED_AFTER_MS)).toBe('stalled');
    expect(loadingStage(10 * 60 * 1000)).toBe('stalled');
  });
  it('says offline straight away, whatever the wait', () => {
    expect(loadingStage(0, false)).toBe('offline');
    expect(loadingStage(LOADING_STALLED_AFTER_MS, false)).toBe('offline');
  });
  it('treats a bad elapsed time as just started', () => {
    expect(loadingStage(NaN)).toBe('quiet');
  });
});

describe('msUntilNextLoadingStage', () => {
  it('counts down to the next edge', () => {
    expect(msUntilNextLoadingStage(0)).toBe(LOADING_SHOW_AFTER_MS);
    expect(msUntilNextLoadingStage(LOADING_SHOW_AFTER_MS)).toBe(LOADING_SLOW_AFTER_MS - LOADING_SHOW_AFTER_MS);
    expect(msUntilNextLoadingStage(LOADING_SLOW_AFTER_MS + 1)).toBe(LOADING_STALLED_AFTER_MS - LOADING_SLOW_AFTER_MS - 1);
  });
  it('has nothing to wait for once stalled or offline', () => {
    expect(msUntilNextLoadingStage(LOADING_STALLED_AFTER_MS)).toBeNull();
    expect(msUntilNextLoadingStage(0, false)).toBeNull();
  });
  it('agrees with loadingStage: the stage changes exactly when it says', () => {
    for (let t = 0; t < LOADING_STALLED_AFTER_MS; t += 137) {
      const wait = msUntilNextLoadingStage(t)!;
      expect(loadingStage(t + wait - 1)).toBe(loadingStage(t));
      expect(loadingStage(t + wait)).not.toBe(loadingStage(t));
    }
  });
});
