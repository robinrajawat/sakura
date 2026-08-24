/**
 * Phase 6.3 slice (docs/phase6-full-parity-plan.md's "Panels: Note, Code" section): rich-text
 * note editing. Direct port of legacy's `sakuraSanitizeRichHtml` (legacy/index.html:9034-9060),
 * same blocked-tag list and same three attribute rules (event handlers, javascript: URLs on
 * href/src/action/formaction, javascript:/expression() in style) -- not a reinterpretation.
 * `node.note` moves from Phase 3's plain-text field to real HTML in this slice, so every write
 * path (the rich editor's onBlur) must run through this first, same as legacy's own note-editor
 * commit path (legacy/index.html:35239's `sakuraSanitizeRichHtml(active.innerHTML)`).
 */
const BLOCKED_TAGS = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'style'];

export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return '';
  try {
    const container = document.createElement('div');
    container.innerHTML = String(html);
    BLOCKED_TAGS.forEach((tag) => {
      container.querySelectorAll(tag).forEach((el) => el.remove());
    });
    container.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value || '';
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          return;
        }
        if (
          (name === 'href' || name === 'src' || name === 'action' || name === 'formaction') &&
          /^\s*javascript:/i.test(value.replace(/[\x00-\x1f]/g, ''))
        ) {
          el.removeAttribute(attr.name);
          return;
        }
        if (name === 'style' && /javascript:|expression\(/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return container.innerHTML;
  } catch {
    // Fail closed -- if sanitizing itself throws, discard rather than risk raw insertion.
    return '';
  }
}
