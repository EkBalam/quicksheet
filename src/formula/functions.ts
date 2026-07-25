import type { ASTNode } from './parser';
import type { CellValue, ErrorTag, EvalContext, EvalResult } from './evaluator';
import { evaluate } from './evaluator';

type FuncImpl = (args: ASTNode[], ctx: EvalContext) => EvalResult;

function numVal(n: number): CellValue {
  return { type: 'number', value: n };
}

function ok(value: CellValue): EvalResult {
  return { ok: true, value };
}

function errResult(error: ErrorTag): EvalResult {
  return { ok: false, error };
}

function toBoolean(v: CellValue): boolean {
  if (v.type === 'bool') return v.value;
  if (v.type === 'number') return v.value !== 0;
  return v.value !== '';
}

/** Collects numeric values from a mix of scalar args and ranges, silently
 * ignoring non-numeric cells within ranges (matches Excel's SUM/AVERAGE
 * behavior of skipping text in a range rather than erroring). */
function collectNumbers(
  nodes: ASTNode[],
  ctx: EvalContext,
): { ok: true; values: number[] } | { ok: false; error: ErrorTag } {
  const values: number[] = [];
  for (const node of nodes) {
    if (node.type === 'range') {
      for (const { result } of ctx.resolveRange(node.start, node.end)) {
        if (!result.ok) return result;
        if (result.value.type === 'number') values.push(result.value.value);
      }
    } else {
      const r = evaluate(node, ctx);
      if (!r.ok) return r;
      if (r.value.type === 'number') values.push(r.value.value);
    }
  }
  return { ok: true, values };
}

/** Matches a cell's value against an Excel-style criteria value: a bare
 * value means "equals", a string may carry a comparison prefix like ">5". */
function matchesCriteria(value: CellValue, criteria: CellValue): boolean {
  if (criteria.type === 'number') {
    return value.type === 'number' && value.value === criteria.value;
  }
  if (criteria.type === 'bool') {
    return value.type === 'bool' && value.value === criteria.value;
  }

  const text = criteria.value.trim();
  const m = text.match(/^(<=|>=|<>|=|<|>)(.*)$/);
  if (!m) {
    if (value.type === 'number') {
      const asNum = Number(text);
      return !Number.isNaN(asNum) && value.value === asNum;
    }
    return String(value.value).toLowerCase() === text.toLowerCase();
  }

  const op = m[1];
  const rhsText = m[2].trim();
  const rhsNum = Number(rhsText);
  const numericCompare = value.type === 'number' && rhsText !== '' && !Number.isNaN(rhsNum);

  if (numericCompare) {
    const left = (value as { type: 'number'; value: number }).value;
    switch (op) {
      case '=':
        return left === rhsNum;
      case '<>':
        return left !== rhsNum;
      case '<':
        return left < rhsNum;
      case '>':
        return left > rhsNum;
      case '<=':
        return left <= rhsNum;
      case '>=':
        return left >= rhsNum;
    }
  }

  const leftStr = String(value.value).toLowerCase();
  const rhsStr = rhsText.toLowerCase();
  switch (op) {
    case '=':
      return leftStr === rhsStr;
    case '<>':
      return leftStr !== rhsStr;
    default:
      return false;
  }
}

export const FUNCTIONS: Record<string, FuncImpl> = {
  SUM: (args, ctx) => {
    const r = collectNumbers(args, ctx);
    if (!r.ok) return r;
    return ok(numVal(r.values.reduce((a, b) => a + b, 0)));
  },

  AVERAGE: (args, ctx) => {
    const r = collectNumbers(args, ctx);
    if (!r.ok) return r;
    if (r.values.length === 0) return errResult('#DIV/0!');
    return ok(numVal(r.values.reduce((a, b) => a + b, 0) / r.values.length));
  },

  MIN: (args, ctx) => {
    const r = collectNumbers(args, ctx);
    if (!r.ok) return r;
    return ok(numVal(r.values.length === 0 ? 0 : Math.min(...r.values)));
  },

  MAX: (args, ctx) => {
    const r = collectNumbers(args, ctx);
    if (!r.ok) return r;
    return ok(numVal(r.values.length === 0 ? 0 : Math.max(...r.values)));
  },

  COUNT: (args, ctx) => {
    const r = collectNumbers(args, ctx);
    if (!r.ok) return r;
    return ok(numVal(r.values.length));
  },

  ROUND: (args, ctx) => {
    if (args.length !== 2) return errResult('#ERROR!');
    const numR = evaluate(args[0], ctx);
    if (!numR.ok) return numR;
    const digitsR = evaluate(args[1], ctx);
    if (!digitsR.ok) return digitsR;
    if (numR.value.type !== 'number' || digitsR.value.type !== 'number') {
      return errResult('#VALUE!');
    }
    const factor = Math.pow(10, digitsR.value.value);
    return ok(numVal(Math.round(numR.value.value * factor) / factor));
  },

  IF: (args, ctx) => {
    if (args.length < 2 || args.length > 3) return errResult('#ERROR!');
    const condR = evaluate(args[0], ctx);
    if (!condR.ok) return condR;
    const branch = toBoolean(condR.value) ? args[1] : args[2];
    if (!branch) return ok({ type: 'bool', value: false });
    return evaluate(branch, ctx);
  },

  SUMIF: (args, ctx) => {
    if (args.length < 2 || args.length > 3) return errResult('#ERROR!');
    const rangeNode = args[0];
    if (rangeNode.type !== 'range') return errResult('#VALUE!');
    const critR = evaluate(args[1], ctx);
    if (!critR.ok) return critR;

    const sumRangeNode = args[2];
    if (sumRangeNode && sumRangeNode.type !== 'range') return errResult('#VALUE!');

    const rangeCells = ctx.resolveRange(rangeNode.start, rangeNode.end);
    const sumCells = sumRangeNode ? ctx.resolveRange(sumRangeNode.start, sumRangeNode.end) : rangeCells;
    if (sumCells.length !== rangeCells.length) return errResult('#VALUE!');

    let total = 0;
    for (let i = 0; i < rangeCells.length; i++) {
      const cond = rangeCells[i].result;
      if (!cond.ok) return cond;
      if (matchesCriteria(cond.value, critR.value)) {
        const sumVal = sumCells[i].result;
        if (!sumVal.ok) return sumVal;
        if (sumVal.value.type === 'number') total += sumVal.value.value;
      }
    }
    return ok(numVal(total));
  },

  COUNTIF: (args, ctx) => {
    if (args.length !== 2) return errResult('#ERROR!');
    const rangeNode = args[0];
    if (rangeNode.type !== 'range') return errResult('#VALUE!');
    const critR = evaluate(args[1], ctx);
    if (!critR.ok) return critR;

    let count = 0;
    for (const { result } of ctx.resolveRange(rangeNode.start, rangeNode.end)) {
      if (!result.ok) return result;
      if (matchesCriteria(result.value, critR.value)) count++;
    }
    return ok(numVal(count));
  },
};
