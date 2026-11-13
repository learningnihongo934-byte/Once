import { Span } from './errors';

export interface Clause { name: string; args: Expr[]; s: Span }

export type Expr =
  | { k: 'num'; v: number; s: Span }
  | { k: 'str'; parts: (string | Expr)[]; s: Span }
  | { k: 'bool'; v: boolean; s: Span }
  | { k: 'nothing'; s: Span }
  | { k: 'var'; name: string; s: Span }
  | { k: 'list'; items: Expr[]; s: Span }
  | { k: 'rec'; keys: string[]; vals: Expr[]; s: Span }
  | { k: 'bin'; op: string; a: Expr; b: Expr; s: Span }
  | { k: 'un'; op: 'neg' | 'not' | 'holding'; a: Expr; s: Span }
  | { k: 'call'; fn: Expr; args: Expr[]; s: Span }
  | { k: 'prop'; obj: Expr; name: string; s: Span }
  | { k: 'index'; obj: Expr; idx: Expr; s: Span }
  | { k: 'random'; lo: Expr; hi: Expr; s: Span }
  | { k: 'any'; list: Expr; s: Span }
  | { k: 'new'; kind: string; content: Expr | null; clauses: Clause[]; s: Span };

export type Stmt =
  | { k: 'set'; target: Expr; value: Expr; s: Span }
  | { k: 'change'; target: Expr; by: Expr; s: Span }
  | { k: 'say'; value: Expr; s: Span }
  | { k: 'if'; branches: { cond: Expr; body: Stmt[] }[]; els: Stmt[] | null; s: Span }
  | { k: 'repeat'; mode: 'times' | 'while' | 'until' | 'forever'; e: Expr | null; body: Stmt[]; s: Span }
  | { k: 'foreach'; name: string; list: Expr | null; from: Expr | null; to: Expr | null; by: Expr | null; body: Stmt[]; s: Span }
  | { k: 'fn'; name: string; params: string[]; body: Stmt[]; s: Span }
  | { k: 'give'; value: Expr | null; s: Span }
  | { k: 'stop'; s: Span }
  | { k: 'skip'; s: Span }
  | { k: 'theend'; s: Span }
  | { k: 'wait'; e: Expr; s: Span }
  | { k: 'every'; mode: 'frame' | 'seconds'; e: Expr | null; body: Stmt[]; s: Span }
  | { k: 'when'; ev: 'key' | 'click' | 'touch'; a: Expr | null; b: Expr | null; body: Stmt[]; s: Span }
  | { k: 'draw'; kind: string; content: Expr | null; clauses: Clause[]; s: Span }
  | { k: 'background'; e: Expr; s: Span }
  | { k: 'clear'; s: Span }
  | { k: 'play'; what: 'note' | 'sound'; e: Expr; clauses: Clause[]; s: Span }
  | { k: 'add'; value: Expr; target: Expr; s: Span }
  | { k: 'remove'; value: Expr; from: Expr | null; s: Span }
  | { k: 'hide' | 'show'; e: Expr; s: Span }
  | { k: 'expr'; e: Expr; s: Span };

export interface Program { body: Stmt[] }
