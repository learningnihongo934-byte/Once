// Friendly errors: a plain-English message, the line it happened on, and a hint.

export interface Span { line: number; col: number; len: number }

export class OnceError extends Error {
  constructor(
    public kind: 'syntax' | 'runtime',
    message: string,
    public span: Span | null,
    public hint?: string,
  ) {
    super(message);
  }
}

export function syntaxError(span: Span | null, msg: string, hint?: string): never {
  throw new OnceError('syntax', msg, span, hint);
}

export function runtimeError(span: Span | null, msg: string, hint?: string): never {
  throw new OnceError('runtime', msg, span, hint);
}

/** Renders an error the way the CLI prints it, with the source line underlined. */
export function formatError(err: OnceError, source: string, file?: string): string {
  const head = err.kind === 'syntax' ? 'Something in the story doesn\'t read right' : 'The story stopped';
  const out: string[] = [];
  const where = err.span ? `${file ? file + ', ' : ''}line ${err.span.line}` : file || '';
  out.push(`${head}${where ? ` (${where})` : ''}:`);
  out.push('  ' + err.message);
  if (err.span) {
    const text = source.split('\n')[err.span.line - 1] ?? '';
    const num = String(err.span.line);
    out.push('');
    out.push(`  ${num} | ${text}`);
    out.push(`  ${' '.repeat(num.length)} | ${' '.repeat(Math.max(0, err.span.col - 1))}${'^'.repeat(Math.max(1, err.span.len))}`);
  }
  if (err.hint) {
    out.push('');
    out.push('  Hint: ' + err.hint);
  }
  return out.join('\n');
}

/** Edit distance where swapping two neighbouring letters counts as one typo. */
function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** The closest word in `options`, if it is close enough to be a likely typo. */
export function closest(word: string, options: Iterable<string>): string | null {
  const w = word.toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  const limit = Math.max(1, Math.floor(word.length / 3));
  for (const o of options) {
    if (o === word) continue;
    const d = distance(w, o.toLowerCase());
    if (d < bestD) { bestD = d; best = o; }
  }
  return bestD <= limit ? best : null;
}
