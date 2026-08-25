import { describe, expect, it } from 'vitest';
import { isAudienceWindow } from './audienceMode';

describe('isAudienceWindow', () => {
  it('is true for a bare ?sakuraAudience=1', () => {
    expect(isAudienceWindow('?sakuraAudience=1')).toBe(true);
  });

  it('is true when combined with other query params', () => {
    expect(isAudienceWindow('?foo=bar&sakuraAudience=1')).toBe(true);
    expect(isAudienceWindow('?sakuraAudience=1&foo=bar')).toBe(true);
  });

  it('is false for an empty query string', () => {
    expect(isAudienceWindow('')).toBe(false);
  });

  it('is false when the param is absent', () => {
    expect(isAudienceWindow('?foo=bar')).toBe(false);
  });

  it('is false for any value other than the literal "1"', () => {
    expect(isAudienceWindow('?sakuraAudience=true')).toBe(false);
    expect(isAudienceWindow('?sakuraAudience=0')).toBe(false);
    expect(isAudienceWindow('?sakuraAudience=')).toBe(false);
    expect(isAudienceWindow('?sakuraAudience')).toBe(false);
  });
});
