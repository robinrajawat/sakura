import { describe, it, expect } from 'vitest';
import { shouldApplyIncomingSyncCore } from './syncApply';

describe('shouldApplyIncomingSyncCore', () => {
  it('applies a genuinely newer update when there is no echo and no local record', () => {
    expect(shouldApplyIncomingSyncCore(100, null, undefined)).toBe(true);
  });

  it('applies when the cloud timestamp is strictly newer than the local one', () => {
    expect(shouldApplyIncomingSyncCore(200, 100, undefined)).toBe(true);
  });

  it('rejects when the cloud timestamp equals the local one (not strictly newer)', () => {
    expect(shouldApplyIncomingSyncCore(100, 100, undefined)).toBe(false);
  });

  it('rejects when the cloud timestamp is older than the local one', () => {
    expect(shouldApplyIncomingSyncCore(50, 100, undefined)).toBe(false);
  });

  it('rejects when lastPushedTsForKey exactly equals the coerced cloud timestamp (our own echo)', () => {
    expect(shouldApplyIncomingSyncCore(100, null, 100)).toBe(false);
  });

  it('applies when lastPushedTsForKey is a different value from the cloud timestamp', () => {
    expect(shouldApplyIncomingSyncCore(100, null, 99)).toBe(true);
  });

  it('coerces a missing/non-numeric cloudUpdatedAt to 0, same as the original Number(x)||0', () => {
    expect(shouldApplyIncomingSyncCore(undefined, null, undefined)).toBe(true);
    expect(shouldApplyIncomingSyncCore('not-a-number', null, undefined)).toBe(true);
    // Coerced to 0, and 0 matches a lastPushedTsForKey of 0 (real echo case).
    expect(shouldApplyIncomingSyncCore(undefined, null, 0)).toBe(false);
  });

  it('localUpdatedAt: null unconditionally bypasses the staleness check (applyIncomingDocData/applyIncomingTemplateData\'s "new item" behavior)', () => {
    // Even a cloud timestamp of 0 (missing/invalid updatedAt) is applied when there's no local
    // record at all — matches the original's `if(localEntry && cloudTs<=localTsDoc)` structure,
    // which only ever rejects when a local entry genuinely exists.
    expect(shouldApplyIncomingSyncCore(0, null, undefined)).toBe(true);
  });

  it('a real numeric localUpdatedAt of 0 (not null) always compares, no bypass (applyIncomingMetaData\'s own behavior — a real, preserved difference from the other two callers)', () => {
    // This is the behavioral distinction found during investigation: applyIncomingMetaData
    // never treats "key never set before" as a bypass the way the other two functions do — it
    // always compares against a default-zero local timestamp, so a cloud update with a
    // falsy/zero updatedAt for a brand-new key is genuinely rejected, not applied.
    expect(shouldApplyIncomingSyncCore(0, 0, undefined)).toBe(false);
  });

  it('a positive cloud timestamp against a real numeric localUpdatedAt of 0 still applies (no bypass needed since it is genuinely newer)', () => {
    expect(shouldApplyIncomingSyncCore(50, 0, undefined)).toBe(true);
  });
});
