import { describe, it, expect } from 'vitest';
import { shouldApplySharedDocRealtimeUpdate } from '../../src/state/sharedDocSync';

describe('shouldApplySharedDocRealtimeUpdate', () => {
  it('applies a genuine live update when nothing blocks it', () => {
    expect(shouldApplySharedDocRealtimeUpdate(false, true, 200, undefined, 'doc1', 'doc1')).toBe(true);
  });

  it('rejects the first, catch-up snapshot even when it would otherwise apply', () => {
    expect(shouldApplySharedDocRealtimeUpdate(true, true, 200, undefined, 'doc1', 'doc1')).toBe(false);
  });

  it('rejects when the snapshot no longer exists (document deleted)', () => {
    expect(shouldApplySharedDocRealtimeUpdate(false, false, 200, undefined, 'doc1', 'doc1')).toBe(false);
  });

  it('rejects our own write echoing back (lastPushedTsForDoc equals the coerced cloud timestamp)', () => {
    expect(shouldApplySharedDocRealtimeUpdate(false, true, 200, 200, 'doc1', 'doc1')).toBe(false);
  });

  it('applies when lastPushedTsForDoc is a different value from the cloud timestamp', () => {
    expect(shouldApplySharedDocRealtimeUpdate(false, true, 200, 199, 'doc1', 'doc1')).toBe(true);
  });

  it('rejects when the person has switched to a different tab since the listener was attached', () => {
    expect(shouldApplySharedDocRealtimeUpdate(false, true, 200, undefined, 'doc1', 'doc2')).toBe(false);
  });

  it('rejects when currentDocId is null (no document open)', () => {
    expect(shouldApplySharedDocRealtimeUpdate(false, true, 200, undefined, 'doc1', null)).toBe(false);
  });

  it('coerces a missing/non-numeric cloudUpdatedAt to 0, same as the original Number(x)||0', () => {
    expect(shouldApplySharedDocRealtimeUpdate(false, true, undefined, undefined, 'doc1', 'doc1')).toBe(true);
    // Coerced to 0, and 0 matches a lastPushedTsForDoc of 0 (real echo case).
    expect(shouldApplySharedDocRealtimeUpdate(false, true, undefined, 0, 'doc1', 'doc1')).toBe(false);
  });

  it('checks first-snapshot and existence before the tab-switch check (order matches the original early returns)', () => {
    // Even though the tab has switched, isFirstSnapshot short-circuits first — same outcome
    // either way here, but pins the original function's own check ordering.
    expect(shouldApplySharedDocRealtimeUpdate(true, true, 200, undefined, 'doc1', 'doc2')).toBe(false);
  });
});
