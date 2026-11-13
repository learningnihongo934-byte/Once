// Turns Once source into HTML with colored spans (playground editor and the Book).

const FLOW = new Set(['if', 'then', 'otherwise', 'else', 'end', 'repeat', 'times', 'while', 'until', 'forever', 'for',
  'each', 'in', 'from', 'to', 'by', 'give', 'back', 'stop', 'skip', 'every', 'when', 'frame', 'seconds', 'second',
  'key', 'pressed', 'clicked', 'the', 'with', 'choose', 'case', 'try', 'after']);
const VERBS = new Set(['set', 'change', 'say', 'wait', 'draw', 'background', 'clear', 'play', 'note', 'sound', 'add',
  'remove', 'hide', 'show', 'new', 'fail', 'check', 'do', 'forget', 'swap', 'save', 'load', 'move', 'turn']);
const WORDS = new Set(['and', 'or', 'not', 'is', 'above', 'below', 'at', 'least', 'most', 'more', 'less', 'than',
  'mod', 'of', 'random', 'any', 'holding', 'touches', 'contains', 'item', 'given', 'between']);
const LITERALS = new Set(['true', 'false', 'nothing', 'edge', 'width', 'height', 'mouse', 'pi', 'time', 'gravity', 'problem']);
const CLAUSES = new Set(['size', 'color', 'moving', 'bouncy', 'solid', 'fixed', 'hidden', 'outline', 'angle', 'wave',
  'volume', 'circle', 'box', 'line', 'text', 'square', 'rectangle']);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(src: string): string {
  let out = '';
  let i = 0;
  let afterDot = false;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^--[^\n]*/.exec(rest))) {
      out += `<span class="t-com">${esc(m[0])}</span>`;
    } else if ((m = /^["“](?:\\.|[^"”\\\n])*["”]?/.exec(rest))) {
      out += `<span class="t-str">${esc(m[0]).replace(/\{([^}\n]*)\}/g, '<span class="t-int">{$1}</span>')}</span>`;
    } else if ((m = /^\d+(?:\.\d+)?/.exec(rest))) {
      out += `<span class="t-num">${m[0]}</span>`;
    } else if ((m = /^['’]s\b/.exec(rest))) {
      out += `<span class="t-poss">${esc(m[0])}</span>`;
    } else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      const w = m[0];
      const cls = afterDot ? '' : FLOW.has(w) ? 't-flow' : VERBS.has(w) ? 't-verb' : WORDS.has(w) ? 't-word'
        : LITERALS.has(w) ? 't-lit' : CLAUSES.has(w) ? 't-clause' : /^\s*\(/.test(src.slice(i + w.length)) ? 't-call' : '';
      out += cls ? `<span class="${cls}">${w}</span>` : w;
    } else {
      m = /^[\s\S]/.exec(rest)!;
      out += esc(m[0]);
    }
    afterDot = m[0] === '.';
    i += m[0].length;
  }
  return out;
}
