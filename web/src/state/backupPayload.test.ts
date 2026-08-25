import { describe, expect, it } from 'vitest';
import { buildBackupPayloadCore, SAKURA_EXPORT_FORMAT_VERSION } from './backupPayload';

describe('buildBackupPayloadCore', () => {
  it('wraps a localStorage snapshot in the real export envelope, matching legacy\'s own shape', () => {
    const entries = { 'sakura_web_docs_index': '[]', 'sakura_web_theme': 'dark' };
    const result = buildBackupPayloadCore(entries, 12345);
    expect(result).toEqual({
      _sakuraExport: true,
      formatVersion: SAKURA_EXPORT_FORMAT_VERSION,
      exportedAt: 12345,
      data: entries
    });
  });

  it('handles an empty snapshot (nothing in localStorage yet)', () => {
    const result = buildBackupPayloadCore({}, 999);
    expect(result.data).toEqual({});
    expect(result._sakuraExport).toBe(true);
  });
});
