import { describe, expect, it } from 'vitest';
import { splitLeadingIconCore } from './iconText';

describe('splitLeadingIconCore (pure)', () => {
  it('splits a plain leading emoji and a single space', () => {
    expect(splitLeadingIconCore('🛒 Webshop checkout flow')).toEqual({ icon: '🛒', rest: 'Webshop checkout flow' });
  });

  it('splits a leading emoji followed by a tab', () => {
    expect(splitLeadingIconCore('🚀\tDeploy pipeline')).toEqual({ icon: '🚀', rest: 'Deploy pipeline' });
  });

  it('handles a variation-selector emoji (e.g. printer)', () => {
    expect(splitLeadingIconCore('🖨️ Hardware notes')).toEqual({ icon: '🖨️', rest: 'Hardware notes' });
  });

  it('handles a ZWJ-sequence emoji (e.g. person in suit)', () => {
    expect(splitLeadingIconCore('🧑‍💼 Recruitment pipeline')).toEqual({ icon: '🧑‍💼', rest: 'Recruitment pipeline' });
  });

  it('returns an empty icon and the original text when there is no leading emoji', () => {
    expect(splitLeadingIconCore('Just plain text')).toEqual({ icon: '', rest: 'Just plain text' });
  });

  it('does not treat an emoji with no following whitespace as a leading icon', () => {
    expect(splitLeadingIconCore('🛒Webshop')).toEqual({ icon: '', rest: '🛒Webshop' });
  });

  it('handles empty/null-ish input', () => {
    expect(splitLeadingIconCore('')).toEqual({ icon: '', rest: '' });
  });
});
