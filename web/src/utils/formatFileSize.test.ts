import { describe, it, expect } from 'vitest';
import { formatFileSize } from './formatFileSize';

describe('formatFileSize', () => {
  it('formats sub-1024-byte sizes as whole bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats 1024 bytes and up (below 1 MB) as KB, one decimal place', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1023)).toBe('1023.0 KB');
  });

  it('formats 1 MB and up as MB, one decimal place', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1024 * 1024 * 5)).toBe('5.0 MB');
    expect(formatFileSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
  });
});
