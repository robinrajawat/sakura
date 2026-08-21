import { describe, it, expect } from 'vitest';
import { normalizeDecisionLogCore } from '../../src/state/decisionLog';

describe('normalizeDecisionLogCore', () => {
  it('returns null for null/undefined input', () => {
    expect(normalizeDecisionLogCore(null)).toBeNull();
    expect(normalizeDecisionLogCore(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(normalizeDecisionLogCore('a string' as unknown as null)).toBeNull();
    expect(normalizeDecisionLogCore(42 as unknown as null)).toBeNull();
  });

  it('defaults every string field to empty string when missing', () => {
    const result = normalizeDecisionLogCore({});
    expect(result).toEqual({
      context: '',
      decision: '',
      rationale: '',
      alternatives: '',
      impact: '',
      status: 'proposed',
      author: '',
      timestamp: null
    });
  });

  it('defaults a non-string field to empty string rather than throwing', () => {
    const result = normalizeDecisionLogCore({ context: 42, decision: null, rationale: {} } as unknown as Record<string, unknown>);
    expect(result?.context).toBe('');
    expect(result?.decision).toBe('');
    expect(result?.rationale).toBe('');
  });

  it('preserves valid string fields unchanged', () => {
    const result = normalizeDecisionLogCore({
      context: 'the context',
      decision: 'the decision',
      rationale: 'the rationale',
      alternatives: 'the alternatives',
      impact: 'the impact',
      author: 'Robin'
    });
    expect(result?.context).toBe('the context');
    expect(result?.decision).toBe('the decision');
    expect(result?.rationale).toBe('the rationale');
    expect(result?.alternatives).toBe('the alternatives');
    expect(result?.impact).toBe('the impact');
    expect(result?.author).toBe('Robin');
  });

  it('accepts a whitelisted status, case-insensitively', () => {
    expect(normalizeDecisionLogCore({ status: 'approved' })?.status).toBe('approved');
    expect(normalizeDecisionLogCore({ status: 'REJECTED' })?.status).toBe('rejected');
    expect(normalizeDecisionLogCore({ status: 'Proposed' })?.status).toBe('proposed');
  });

  it('defaults an unrecognized or missing status to "proposed"', () => {
    expect(normalizeDecisionLogCore({ status: 'archived' })?.status).toBe('proposed');
    expect(normalizeDecisionLogCore({})?.status).toBe('proposed');
    expect(normalizeDecisionLogCore({ status: null } as unknown as Record<string, unknown>)?.status).toBe('proposed');
  });

  it('preserves a genuine finite timestamp', () => {
    expect(normalizeDecisionLogCore({ timestamp: 1700000000000 })?.timestamp).toBe(1700000000000);
  });

  it('defaults a non-finite or missing timestamp to null', () => {
    expect(normalizeDecisionLogCore({ timestamp: NaN } as unknown as Record<string, unknown>)?.timestamp).toBeNull();
    expect(normalizeDecisionLogCore({ timestamp: Infinity } as unknown as Record<string, unknown>)?.timestamp).toBeNull();
    expect(normalizeDecisionLogCore({ timestamp: 'not a number' } as unknown as Record<string, unknown>)?.timestamp).toBeNull();
    expect(normalizeDecisionLogCore({})?.timestamp).toBeNull();
  });

  it('never throws on a genuinely malformed input object', () => {
    expect(() => normalizeDecisionLogCore({ context: [1, 2, 3], status: {}, timestamp: 'x' } as unknown as Record<string, unknown>)).not.toThrow();
  });
});
