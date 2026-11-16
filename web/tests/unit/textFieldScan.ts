/**
 * Finds every place in index.html where a person can type: <input>/<textarea> in the markup or in
 * HTML the code builds, inputs and textareas the code creates, and contenteditable set in code or
 * in built HTML. Each is named by its class (or id), or else by the function that creates it, so
 * the names stay the same when unrelated lines move. Used by textFieldsKept.test.ts.
 */
const NONTEXT = /^(checkbox|radio|range|file|color|hidden|button|submit|reset|image|date|time)$/i;

function enclosingFunction(src: string, at: number): string {
  const before = src.slice(Math.max(0, at - 30000), at);
  let name = '';
  for (const m of before.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)) name = m[1];
  return name || 'top-level';
}

// An element built as HTML text: its own tag's id or class.
function nameInTag(tag: string): string | null {
  const cls = /\bclass=\\?["']([A-Za-z][A-Za-z0-9_-]*)/.exec(tag);
  const id = /\bid=\\?["']([A-Za-z][A-Za-z0-9_-]*)/.exec(tag);
  return id ? '#' + id[1] : cls ? '.' + cls[1] : null;
}

// An element made in code (`x=document.createElement(...)`, `x.contentEditable='true'`): the
// class or id the code gives that same variable nearby.
function nameOfVariable(src: string, at: number, v: string): string | null {
  const win = src.slice(Math.max(0, at - 600), at + 600);
  const esc = v.replace(/[$]/g, '\\$');
  const cls = new RegExp(esc + "\\.className\\s*=\\s*['\"`]([A-Za-z][A-Za-z0-9_-]*)").exec(win);
  const id = new RegExp(esc + "\\.id\\s*=\\s*['\"`]([A-Za-z][A-Za-z0-9_-]*)").exec(win);
  return cls ? '.' + cls[1] : id ? '#' + id[1] : null;
}

export function scanTextFields(src: string): string[] {
  const found = new Set<string>();
  const add = (name: string | null, at: number) => found.add(name || 'in ' + enclosingFunction(src, at));

  for (const m of src.matchAll(/<(input|textarea)\b[^>]*>/gi)) {
    const tag = m[0];
    if (/^<(input|textarea)>$/i.test(tag)) continue; // a mention in a comment, not an element
    if (/^<input/i.test(tag) && NONTEXT.test((/\btype=\\?["']?([a-z]+)/i.exec(tag) || [])[1] || 'text')) continue;
    add(nameInTag(tag), m.index!);
  }
  for (const m of src.matchAll(/[^[]contenteditable=\\?["']true/g)) {
    const at = m.index! + 1;
    const tagStart = src.lastIndexOf('<', at);
    add(nameInTag(src.slice(tagStart, at)), at);
  }
  for (const m of src.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*document\.createElement\(\s*['"](input|textarea)['"]\s*\)/g)) {
    const after = src.slice(m.index!, m.index! + 300);
    const type = new RegExp(m[1].replace(/[$]/g, '\\$') + "\\.type\\s*=\\s*['\"]([a-z]+)['\"]").exec(after);
    if (type && NONTEXT.test(type[1])) continue;
    add(nameOfVariable(src, m.index!, m[1]), m.index!);
  }
  for (const m of src.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\.contentEditable\s*=\s*['"]true['"]/g)) {
    add(nameOfVariable(src, m.index!, m[1]), m.index!);
  }
  return [...found].sort();
}
