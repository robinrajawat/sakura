import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanTextFields } from './textFieldScan';

// The data-safety standard (docs/data-safety-audit.md): what a person types is never lost without
// a warning. Every place in the app you can type is listed here with how its text is kept. A new
// field fails this test until it's added here, which is the moment to decide how it's kept: for
// text someone writes, as they type, when they leave it, or as a draft (`fieldDraftSave`, synced).
type Kept =
  | 'as-you-type'   // saved to the document or list on every change
  | 'on-leave'      // saved when you leave the field; the app leaves it for you when it's put away
  | 'draft'         // unsent text in the shared draft store: saved as you type, synced, restored
  | 'on-hide'       // a form written into the document when the app is put away (it stays open)
  | 'asks'          // can't be saved from outside (draw.io); closing asks first
  | 'short-entry'   // a few words applied with Enter or OK (a link, a tag, a name in a dialog)
  | 'setting'       // a setting, applied as it changes; not document content
  | 'not-content';  // search boxes, sign-in, an e-mail address, the clipboard's hidden helper

const KEPT: Record<string, Kept> = {
  // Documents
  '.node-input': 'as-you-type',
  '.node-note-line': 'as-you-type',
  '#header-title': 'as-you-type',
  '#doc-author': 'as-you-type',
  '#sb-author': 'as-you-type',
  '#doc-link-label-input': 'on-leave',
  '.node-remark-text-inline': 'on-leave',
  'in renderThreadEntry': 'on-leave', // an entry's author, typed in place
  '.thread-author-edit': 'on-leave',
  '.thread-composer-input': 'draft',
  '.node-image-caption-input': 'on-leave',
  '.niv-mk-text-input': 'on-leave',
  '.node-diagram-preview-title': 'on-leave',
  '#diagram-editor-title-input': 'as-you-type',
  '.pv-name': 'on-leave',
  '.fi-note': 'on-leave',
  // Table cells while a table is edited (committed on leaving the table)
  'in makeTableCell': 'on-leave',
  'in enterEdit': 'on-leave',
  'in enterScopedTableEdit': 'on-leave',
  'in commit': 'on-leave',
  'in exit': 'on-leave',
  'in top-level': 'on-leave', // a row added to a table being edited
  // API request editor
  '#api-ed-url': 'on-hide',
  '#api-ed-desc': 'on-hide',
  '#api-ed-auth': 'on-hide',
  '#api-ed-body': 'on-hide',
  '.api-ed-input': 'on-hide',
  '#api-ed-curl': 'short-entry', // a cURL pasted to fill the form
  // Names and renames
  '.inline-edit-input': 'on-leave',
  '.sfolder-name-input': 'on-leave',
  // To-Dos
  '#todos-input': 'draft',
  '#todo-text-': 'on-leave',
  '.todo-waiting-name': 'on-leave',
  '.todo-subtask-text': 'on-leave',
  '.todo-subtask-input': 'short-entry',
  // Feedback
  '#feedback-message-input': 'draft',
  '#feedback-email-input': 'not-content',
  // Short entries
  '#link-card-addr': 'short-entry',
  '#doc-link-input': 'short-entry',
  '#link-pop-input': 'short-entry',
  '#sfmt-url': 'short-entry',
  '#tag-popover-input': 'short-entry',
  '#sakura-modal-input': 'short-entry',
  '#sakura-modal-input2': 'short-entry',
  '#account-delete-confirm-input': 'short-entry',
  '#share-modal-email-input': 'short-entry',
  // Settings
  '#default-author-input': 'setting',
  '#preview-branding-text-input': 'setting',
  '#ai-api-key-input': 'setting',
  '#ai-model-custom-input': 'setting',
  '#ai-prompt-input': 'setting',
  '#ai-vault-quota-input': 'setting',
  '#ai-vault-provider-id-input': 'setting',
  '#ai-vault-provider-order-input': 'setting',
  '#ai-vault-provider-baseurl-input': 'setting',
  '#ai-vault-provider-model-input': 'setting',
  '#ai-vault-provider-apikey-input': 'setting',
  // Not content
  '#search-input': 'not-content',
  '#replace-input': 'not-content',
  '#qa-input': 'not-content',
  '#help-search': 'not-content',
  '#settings-search': 'not-content',
  '#shortcuts-search': 'not-content',
  '#sidebar-search': 'not-content',
  '#todos-search-input': 'not-content',
  '#diagram-anchor-search': 'not-content',
  '.folder-picker-search': 'not-content',
  '.tbl-currency-search': 'not-content',
  '#sakura-landing-email-input': 'not-content',
  '#sakura-landing-password-input': 'not-content',
  'in copyNodesToClipboard': 'not-content',
  'in copyFeedbackPrompt': 'not-content',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

describe('every place you can type says how its text is kept', () => {
  const found = scanTextFields(html);
  it('has no field missing from the list (add it to KEPT, deciding how it is kept)', () => {
    expect(found.filter((f) => !(f in KEPT))).toEqual([]);
  });
  it('lists no field that is gone', () => {
    expect(Object.keys(KEPT).filter((k) => !found.includes(k))).toEqual([]);
  });
});

describe('scanTextFields', () => {
  it('finds markup, built HTML and code-made fields, by id, class or creating function', () => {
    const src = [
      '<input id="a" type="text"><input type="checkbox" id="skip"><textarea class="b c"></textarea>',
      '// a mention of an <input> in a comment',
      "function makeBox(){ const t=document.createElement('textarea'); t.className='box-x'; }",
      "function makeCheck(){ const c=document.createElement('input'); c.type='checkbox'; }",
      "function editCell(){ cell.contentEditable='true'; }",
      'function row(){ return `<span class="todo-x" contenteditable="true">`; }',
      "const css='[contenteditable=\"true\"]{}';",
    ].join('\n');
    expect(scanTextFields(src)).toEqual(['#a', '.b', '.box-x', '.todo-x', 'in editCell']);
  });
});
