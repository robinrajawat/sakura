import { describe, expect, it } from 'vitest';
import { syncDotVisualForStatus } from './syncStatusDot';

describe('syncDotVisualForStatus', () => {
  it('maps syncing straight through', () => {
    expect(syncDotVisualForStatus('syncing')).toBe('syncing');
  });

  it('maps error straight through', () => {
    expect(syncDotVisualForStatus('error')).toBe('error');
  });

  it('maps synced straight through (the caller owns the 4000ms fade-to-idle-ok timer)', () => {
    expect(syncDotVisualForStatus('synced')).toBe('synced');
  });

  it("maps idle to idle-ok -- the dot's baseline presence once signed in, matching legacy's real wireAccountUI behavior", () => {
    expect(syncDotVisualForStatus('idle')).toBe('idle-ok');
  });
});
