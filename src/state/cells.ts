import { parseFormula } from '../formula/parser';
import { evaluate, EvalResult, ErrorTag, RangeCell } from '../formula/evaluator';
import { parseAddr, formatAddr } from '../grid/addr';

export interface CellData {
  raw: string;
  display: string;
  error?: ErrorTag;
}

export const cells = new Map<string, CellData>();

export function getCell(addr: string): CellData | undefined {
  return cells.get(addr);
}

export function setCellRaw(addr: string, raw: string): void {
  if (raw === '') {
    cells.delete(addr);
    return;
  }
  cells.set(addr, { raw, display: raw });
}

export function clearAllCells(): void {
  cells.clear();
}

// Undo/redo: whole-sheet snapshots of raw contents. The sheet is small and
// ephemeral, so snapshotting is simpler and safer than per-operation diffs.
type Snapshot = Map<string, string>;

const HISTORY_LIMIT = 100;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];

function takeSnapshot(): Snapshot {
  const snap: Snapshot = new Map();
  for (const [addr, cell] of cells) snap.set(addr, cell.raw);
  return snap;
}

function restoreSnapshot(snap: Snapshot): void {
  cells.clear();
  for (const [addr, raw] of snap) cells.set(addr, { raw, display: raw });
  recalcAll();
}

/** Call right BEFORE a user-visible change to the sheet so it can be undone. */
export function checkpoint(): void {
  undoStack.push(takeSnapshot());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

export function undo(): boolean {
  const prev = undoStack.pop();
  if (!prev) return false;
  redoStack.push(takeSnapshot());
  restoreSnapshot(prev);
  return true;
}

export function redo(): boolean {
  const next = redoStack.pop();
  if (!next) return false;
  undoStack.push(takeSnapshot());
  restoreSnapshot(next);
  return true;
}

function isFormula(raw: string): boolean {
  return raw.startsWith('=');
}

// Scoped to a single recalcAll() pass: memoizes resolved values and guards
// against circular references via an "in progress" set, rather than
// building a persistent dependency graph (unnecessary at this grid size).
let memo = new Map<string, EvalResult>();
let evaluating = new Set<string>();

function resolveCell(addr: string): EvalResult {
  const cached = memo.get(addr);
  if (cached) return cached;

  if (evaluating.has(addr)) {
    const err: EvalResult = { ok: false, error: '#CIRCULAR!' };
    memo.set(addr, err);
    return err;
  }

  const cell = cells.get(addr);
  if (!cell) {
    const zero: EvalResult = { ok: true, value: { type: 'number', value: 0 } };
    memo.set(addr, zero);
    return zero;
  }

  if (!isFormula(cell.raw)) {
    const num = Number(cell.raw);
    const result: EvalResult = Number.isNaN(num)
      ? { ok: true, value: { type: 'string', value: cell.raw } }
      : { ok: true, value: { type: 'number', value: num } };
    memo.set(addr, result);
    return result;
  }

  evaluating.add(addr);
  let result: EvalResult;
  try {
    const ast = parseFormula(cell.raw);
    result = evaluate(ast, {
      resolveCell,
      resolveRange,
    });
  } catch {
    result = { ok: false, error: '#ERROR!' };
  }
  evaluating.delete(addr);
  memo.set(addr, result);
  return result;
}

function resolveRange(startAddr: string, endAddr: string): RangeCell[] {
  const start = parseAddr(startAddr);
  const end = parseAddr(endAddr);
  if (!start || !end) {
    return [{ addr: startAddr, result: { ok: false, error: '#REF!' } }];
  }

  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);

  const results: RangeCell[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const addr = formatAddr(c, r);
      results.push({ addr, result: resolveCell(addr) });
    }
  }
  return results;
}

function formatDisplayValue(result: EvalResult & { ok: true }): string {
  const { value } = result;
  if (value.type === 'number') {
    if (Number.isInteger(value.value)) return String(value.value);
    return String(Math.round(value.value * 1e6) / 1e6);
  }
  if (value.type === 'bool') return value.value ? 'VERDADERO' : 'FALSO';
  return value.value;
}

export function recalcAll(): void {
  memo = new Map();
  evaluating = new Set();

  for (const [addr, cell] of cells) {
    if (!isFormula(cell.raw)) {
      cell.display = cell.raw;
      cell.error = undefined;
      continue;
    }
    const result = resolveCell(addr);
    if (result.ok) {
      cell.display = formatDisplayValue(result);
      cell.error = undefined;
    } else {
      cell.display = result.error;
      cell.error = result.error;
    }
  }
}
