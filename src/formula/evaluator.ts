import { ASTNode } from './parser';
import { FUNCTIONS } from './functions';

export type ErrorTag = '#DIV/0!' | '#VALUE!' | '#CIRCULAR!' | '#ERROR!' | '#REF!';

export type CellValue =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'bool'; value: boolean };

export type EvalResult = { ok: true; value: CellValue } | { ok: false; error: ErrorTag };

export interface RangeCell {
  addr: string;
  result: EvalResult;
}

export interface EvalContext {
  resolveCell(addr: string): EvalResult;
  resolveRange(start: string, end: string): RangeCell[];
}

function requireNumber(r: EvalResult): { ok: true; value: number } | { ok: false; error: ErrorTag } {
  if (!r.ok) return r;
  if (r.value.type !== 'number') return { ok: false, error: '#VALUE!' };
  return { ok: true, value: r.value.value };
}

function valueAsString(v: CellValue): string {
  if (v.type === 'bool') return v.value ? 'VERDADERO' : 'FALSO';
  return String(v.value);
}

function compareValues(a: CellValue, b: CellValue): number {
  if (a.type === 'number' && b.type === 'number') {
    return a.value - b.value;
  }
  const as = valueAsString(a).toLowerCase();
  const bs = valueAsString(b).toLowerCase();
  return as < bs ? -1 : as > bs ? 1 : 0;
}

export function evaluate(node: ASTNode, ctx: EvalContext): EvalResult {
  switch (node.type) {
    case 'number':
      return { ok: true, value: { type: 'number', value: node.value } };

    case 'string':
      return { ok: true, value: { type: 'string', value: node.value } };

    case 'cellref':
      return ctx.resolveCell(node.addr);

    case 'range':
      // A bare range only makes sense as a function argument; used as a
      // scalar it has no defined value.
      return { ok: false, error: '#VALUE!' };

    case 'unary': {
      const n = requireNumber(evaluate(node.arg, ctx));
      if (!n.ok) return n;
      return { ok: true, value: { type: 'number', value: -n.value } };
    }

    case 'binop': {
      const l = requireNumber(evaluate(node.left, ctx));
      if (!l.ok) return l;
      const r = requireNumber(evaluate(node.right, ctx));
      if (!r.ok) return r;
      switch (node.op) {
        case '+':
          return { ok: true, value: { type: 'number', value: l.value + r.value } };
        case '-':
          return { ok: true, value: { type: 'number', value: l.value - r.value } };
        case '*':
          return { ok: true, value: { type: 'number', value: l.value * r.value } };
        case '/':
          if (r.value === 0) return { ok: false, error: '#DIV/0!' };
          return { ok: true, value: { type: 'number', value: l.value / r.value } };
      }
    }

    case 'compare': {
      const l = evaluate(node.left, ctx);
      if (!l.ok) return l;
      const r = evaluate(node.right, ctx);
      if (!r.ok) return r;
      const cmp = compareValues(l.value, r.value);
      let result: boolean;
      switch (node.op) {
        case '=':
          result = cmp === 0;
          break;
        case '<>':
          result = cmp !== 0;
          break;
        case '<':
          result = cmp < 0;
          break;
        case '>':
          result = cmp > 0;
          break;
        case '<=':
          result = cmp <= 0;
          break;
        case '>=':
          result = cmp >= 0;
          break;
      }
      return { ok: true, value: { type: 'bool', value: result } };
    }

    case 'funccall': {
      const fn = FUNCTIONS[node.name];
      if (!fn) return { ok: false, error: '#ERROR!' };
      return fn(node.args, ctx);
    }
  }
}
