import { describe, expect, it } from 'vitest';
import { docStatusLabelCore, docStatusColorKeyCore, normalizeDocLinkedUrlCore, docLinkUrlLabelCore } from './docHeader';

describe('docStatusLabelCore', () => {
  it('matches legacy real labels for every status', () => {
    expect(docStatusLabelCore('')).toBe('No status');
    expect(docStatusLabelCore('draft')).toBe('Draft');
    expect(docStatusLabelCore('review')).toBe('Review');
    expect(docStatusLabelCore('approved')).toBe('Approved');
    expect(docStatusLabelCore('rejected')).toBe('Rejected');
  });
});

describe('docStatusColorKeyCore', () => {
  it('maps each real status to its color key, and no-status/unrecognized to null', () => {
    expect(docStatusColorKeyCore('draft')).toBe('fcGray');
    expect(docStatusColorKeyCore('review')).toBe('fcOrange');
    expect(docStatusColorKeyCore('approved')).toBe('fcGreen');
    expect(docStatusColorKeyCore('rejected')).toBe('fcRed');
    expect(docStatusColorKeyCore('')).toBeNull();
  });
});

describe('normalizeDocLinkedUrlCore', () => {
  it('trims whitespace', () => {
    expect(normalizeDocLinkedUrlCore('  https://example.com  ')).toBe('https://example.com');
  });

  it('returns empty string unchanged', () => {
    expect(normalizeDocLinkedUrlCore('')).toBe('');
    expect(normalizeDocLinkedUrlCore('   ')).toBe('');
  });

  it('leaves a URL with a real scheme untouched', () => {
    expect(normalizeDocLinkedUrlCore('https://example.com/PROJ-123')).toBe('https://example.com/PROJ-123');
    expect(normalizeDocLinkedUrlCore('mailto:a@b.com')).toBe('mailto:a@b.com');
  });

  it('prepends https:// to a bare host or tracker-key paste', () => {
    expect(normalizeDocLinkedUrlCore('example.com/PROJ-123')).toBe('https://example.com/PROJ-123');
    expect(normalizeDocLinkedUrlCore('PROJ-123')).toBe('https://PROJ-123');
  });
});

describe('docLinkUrlLabelCore', () => {
  it('derives host + first path segment from a real URL', () => {
    expect(docLinkUrlLabelCore('https://yourteam.atlassian.net/browse/PROJ-123')).toBe('yourteam.atlassian.net/browse');
  });

  it('falls back to just the host when there is no path', () => {
    expect(docLinkUrlLabelCore('https://example.com')).toBe('example.com');
  });

  it('truncates a long unparseable string rather than throwing', () => {
    const raw = 'not a url'.repeat(10);
    const result = docLinkUrlLabelCore(raw);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBe(38);
  });

  it('returns a short unparseable string unchanged', () => {
    expect(docLinkUrlLabelCore('not a url')).toBe('not a url');
  });
});
