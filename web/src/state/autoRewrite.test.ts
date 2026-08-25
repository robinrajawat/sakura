import { describe, it, expect } from 'vitest';
import { shouldAutoRewriteNode, type AutoRewriteExclusions } from './autoRewrite';

const ALL_ON: AutoRewriteExclusions = { checkbox: true, heading: true, decisionlog: true, syntax: true };
const ALL_OFF: AutoRewriteExclusions = { checkbox: false, heading: false, decisionlog: false, syntax: false };

describe('shouldAutoRewriteNode', () => {
  it('excludes text shorter than minWords', () => {
    expect(shouldAutoRewriteNode('too short', {}, ALL_OFF, 5)).toBe(false);
  });

  it('allows text meeting the minWords threshold', () => {
    expect(shouldAutoRewriteNode('this text has exactly five', {}, ALL_OFF, 5)).toBe(true);
  });

  it('excludes a checkbox node when the checkbox exclusion is on', () => {
    expect(shouldAutoRewriteNode('a checkbox node with enough words', { isCheckbox: true }, ALL_ON, 5)).toBe(false);
  });

  it('allows a checkbox node when the checkbox exclusion is off', () => {
    expect(shouldAutoRewriteNode('a checkbox node with enough words', { isCheckbox: true }, ALL_OFF, 5)).toBe(true);
  });

  it('excludes a heading node when the heading exclusion is on', () => {
    expect(shouldAutoRewriteNode('a heading node with enough words', { styles: { heading: 2 } }, ALL_ON, 5)).toBe(false);
  });

  it('does not exclude a node with heading explicitly 0/null (body text)', () => {
    expect(shouldAutoRewriteNode('a body text node with enough words', { styles: { heading: 0 } }, ALL_ON, 5)).toBe(true);
    expect(shouldAutoRewriteNode('a body text node with enough words', { styles: { heading: null } }, ALL_ON, 5)).toBe(true);
  });

  it.each(['Decision Log: something happened here', 'Context: the situation we found', 'Decision: what we chose to do', 'Rationale: why we chose it', 'Alternatives: what else we considered', 'Impact: what changes because of it', 'Status · resolved recently'])(
    'excludes decision-log structured field text (%s) when that exclusion is on',
    (text) => {
      expect(shouldAutoRewriteNode(text, {}, ALL_ON, 1)).toBe(false);
    }
  );

  it('does not exclude ordinary text that merely starts with one of those words without the field-label punctuation', () => {
    expect(shouldAutoRewriteNode('Context matters a lot in negotiations', {}, ALL_ON, 1)).toBe(true);
  });

  it('excludes text containing a [[backlink]] when the syntax exclusion is on', () => {
    expect(shouldAutoRewriteNode('see [[other node]] for more detail', {}, ALL_ON, 1)).toBe(false);
  });

  it('excludes text containing inline `code` when the syntax exclusion is on', () => {
    expect(shouldAutoRewriteNode('run the `npm test` command please', {}, ALL_ON, 1)).toBe(false);
  });

  it('allows plain prose with no exclusions triggered', () => {
    expect(shouldAutoRewriteNode('a perfectly ordinary sentence with enough words', {}, ALL_ON, 5)).toBe(true);
  });

  it('all exclusions off means only minWords is checked', () => {
    expect(shouldAutoRewriteNode('Decision Log: [[x]] `code` enough words', { isCheckbox: true, styles: { heading: 1 } }, ALL_OFF, 5)).toBe(true);
  });
});
