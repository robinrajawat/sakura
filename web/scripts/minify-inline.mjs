// Minifies a built page's inline <script> and <style> blocks (docs/mobile-plan.md, "faster first
// load"). The app is one big HTML page whose code is inline, which Vite leaves as written, comments
// and all; minifying it roughly halves what a first visit downloads (700 KB → about 400 KB
// compressed, measured 2026-11-13).
//
// A small scanner, not a regex over the whole page: HTML comments are skipped (a comment that
// mentions "<script>" must not be read as one), script and style contents are found by their own
// closing tag, and only JavaScript scripts are touched (no src, type absent/text/javascript/module;
// JSON and other types are left alone). Top-level names are kept: these are classic scripts whose
// top-level declarations are globals shared across scripts, inline handlers and tests, and esbuild
// doesn't rename top-level symbols when no output format is set. Anything esbuild can't parse is
// left exactly as it was.
import { transformSync } from 'esbuild';

const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);

export function minifyInlineHtml(html) {
  let out = '';
  let i = 0;
  const lower = html.toLowerCase();
  while (i < html.length) {
    const nextComment = html.indexOf('<!--', i);
    const nextScript = lower.indexOf('<script', i);
    const nextStyle = lower.indexOf('<style', i);
    const candidates = [nextComment, nextScript, nextStyle].filter((n) => n >= 0);
    if (!candidates.length) { out += html.slice(i); break; }
    const at = Math.min(...candidates);
    out += html.slice(i, at);
    if (at === nextComment) {
      const end = html.indexOf('-->', at + 4);
      const stop = end < 0 ? html.length : end + 3;
      out += html.slice(at, stop); // comments stay (some are licence notices)
      i = stop;
      continue;
    }
    const isScript = at === nextScript;
    const tag = isScript ? 'script' : 'style';
    const openEnd = html.indexOf('>', at);
    const openTag = html.slice(at, openEnd + 1);
    const close = lower.indexOf('</' + tag, openEnd + 1);
    if (openEnd < 0 || close < 0) { out += html.slice(at); break; }
    const body = html.slice(openEnd + 1, close);
    out += openTag + minifyBlock(isScript, openTag, body);
    i = close;
  }
  return out;
}

function minifyBlock(isScript, openTag, body) {
  if (!body.trim()) return body;
  try {
    if (isScript) {
      if (/\ssrc\s*=/i.test(openTag)) return body;
      const type = ((openTag.match(/\stype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '').toLowerCase();
      if (!JS_TYPES.has(type)) return body;
      const code = transformSync(body, { minify: true, loader: 'js', target: 'es2020', legalComments: 'inline' }).code;
      return code.replace(/<\/script/gi, '<\\/script');
    }
    return transformSync(body, { minify: true, loader: 'css', legalComments: 'inline' }).code;
  } catch {
    return body;
  }
}
