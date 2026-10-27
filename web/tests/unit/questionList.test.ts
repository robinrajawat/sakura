import { describe, it, expect } from 'vitest';
import { outlineFromText, parseQuestionList, isQuestionList } from '../../src/utils/questionList';

const ROBIN_LIST = `Open Questions
   Kristoffer
      Deliveries for excluded postal codes. Do we then still show customer the Flexible Night Delivery option?
         It should be handled as a standard order and we should not show the Flexible Delivery Option
      Will the freight fee potentially change when customer chooses Flexible Night Delivery?
         Both freight and extra freight be fetched based on the shipping condition YN
      Should the webshop do a final ATP validation just before sending an order to SAP?
      Additional Questions
   Chandana
      Do we have any limitations on which products can be included in night deliveries?
         No limitations on the products as such
      Will the crane operation be completed before regular work day starts?
         No, and that's why tailored delivery takes precedence.

OQ-3: ATP validation

Should the webshop do a final ATP validation just before sending an order to SAP?

OQ-6: Combined delivery

What happens to the Flexible Night Delivery option when customer selects Combined Delivery?

Chandana
   Do we have any limitations on which products can be included in night deliveries?
      No limitations on the products as such
`;

describe('outlineFromText', () => {
  it('ranks indents, drops blank lines and bullets', () => {
    expect(outlineFromText('A\n\n  - B\n\t\tC\n  D')).toEqual([
      { depth: 0, text: 'A' },
      { depth: 1, text: 'B' },
      { depth: 2, text: 'C' },
      { depth: 1, text: 'D' }
    ]);
  });
});

describe('parseQuestionList', () => {
  const lines = outlineFromText(ROBIN_LIST);
  const { questions, repeats } = parseQuestionList(lines);

  it('takes the asker from the name line and answers from the lines under a question', () => {
    expect(questions[0]).toMatchObject({ author: 'Kristoffer', title: null, answers: ['It should be handled as a standard order and we should not show the Flexible Delivery Option'] });
    expect(questions[2]).toMatchObject({ author: 'Kristoffer', answers: [] });
    expect(questions[3]).toMatchObject({ author: 'Chandana', text: 'Do we have any limitations on which products can be included in night deliveries?' });
  });

  it('drops headings, keeps titles and skips repeats', () => {
    expect(questions.map((q) => q.text)).not.toContain('Open Questions');
    expect(questions.map((q) => q.text)).not.toContain('Additional Questions');
    expect(questions[5]).toMatchObject({ author: null, title: 'OQ-6: Combined delivery', answers: [] });
    expect(questions).toHaveLength(6);
    expect(repeats).toBe(2);
    expect(isQuestionList(lines, { questions, repeats })).toBe(true);
  });

  it('leaves out questions the thread already has', () => {
    const again = parseQuestionList(lines, ['Will the crane operation be completed before regular work day starts?']);
    expect(again.questions).toHaveLength(5);
    expect(again.repeats).toBe(3);
  });

  it('joins deeper lines into their answer', () => {
    const r = parseQuestionList(outlineFromText('Q one?\n  Yes\n    because of X\nQ two?'));
    expect(r.questions[0].answers).toEqual(['Yes\nbecause of X']);
  });

  it('is no list for ordinary multi-line text', () => {
    const plain = outlineFromText('We met today and went through the plan in detail.\nEveryone agreed with the approach we took.\nNext week we follow up with the team.');
    expect(isQuestionList(plain, parseQuestionList(plain))).toBe(false);
    const two = outlineFromText('One question?\nAnother?');
    expect(isQuestionList(two, parseQuestionList(two))).toBe(false);
  });
});

describe('Word plain text', () => {
  it('drops Word bullets', () => {
    expect(outlineFromText('Kim\n\to\tWhy?\n\t\t§\tBecause')).toEqual([
      { depth: 0, text: 'Kim' },
      { depth: 1, text: 'Why?' },
      { depth: 2, text: 'Because' }
    ]);
  });
});
