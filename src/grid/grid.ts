import { colIndexToLetters, formatAddr, parseAddr } from './addr';
import { getCell, setCellRaw, recalcAll, checkpoint } from '../state/cells';
import {
  getActiveAddr,
  setActiveAddr,
  getRangeFocusAddr,
  selectCell,
  selectRange,
  extendSelectionTo,
  getSelectionRect,
  isEditing,
  setEditing,
} from './selection';

type ActiveCellListener = (addr: string, raw: string) => void;
type CellInputListener = (value: string) => void;
type ColumnHeaderListener = (col: number, th: HTMLTableCellElement) => void;
type RowHeaderListener = (row: number, td: HTMLTableCellElement) => void;

const activeCellListeners: ActiveCellListener[] = [];
const cellInputListeners: CellInputListener[] = [];
const columnHeaderListeners: ColumnHeaderListener[] = [];
const rowHeaderListeners: RowHeaderListener[] = [];

export function onActiveCellChange(cb: ActiveCellListener): void {
  activeCellListeners.push(cb);
}

export function onActiveCellInput(cb: CellInputListener): void {
  cellInputListeners.push(cb);
}

export function onColumnHeaderCreated(cb: ColumnHeaderListener): void {
  columnHeaderListeners.push(cb);
}

export function onRowHeaderCreated(cb: RowHeaderListener): void {
  rowHeaderListeners.push(cb);
}

type SelectionRect = ReturnType<typeof getSelectionRect>;
const selectionListeners: Array<(rect: SelectionRect) => void> = [];

/** Fires whenever the selection rectangle is redrawn (click, drag, keys, fill, ...). */
export function onSelectionChange(cb: (rect: SelectionRect) => void): void {
  selectionListeners.push(cb);
}

const MIN_COLS = 8;
const MIN_ROWS = 20;
const GROWTH_STEP = 5;

const ROW_HEADER_COL_WIDTH = 32;
const DEFAULT_COL_WIDTH = 64;
const MIN_COL_WIDTH = 20;
const MAX_COL_WIDTH = 400;
const DEFAULT_ROW_HEIGHT = 22;
const MIN_ROW_HEIGHT = 16;
const MAX_ROW_HEIGHT = 200;

let numCols = MIN_COLS;
let numRows = MIN_ROWS;

let theadRow: HTMLTableRowElement;
let tbodyEl: HTMLTableSectionElement;
let colgroupEl: HTMLTableColElement;
let colEls: HTMLTableColElement[] = [];

const colWidths = new Map<number, number>();
const rowHeights = new Map<number, number>();

const cellInputs = new Map<string, HTMLInputElement>();
const selectionHighlighted = new Set<string>();

export function initGrid(table: HTMLTableElement): void {
  table.innerHTML = '';
  colEls = [];

  colgroupEl = document.createElement('colgroup');
  const rowHeaderCol = document.createElement('col');
  rowHeaderCol.style.width = `${ROW_HEADER_COL_WIDTH}px`;
  colgroupEl.appendChild(rowHeaderCol);
  table.appendChild(colgroupEl);

  const thead = document.createElement('thead');
  theadRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'corner';
  theadRow.appendChild(corner);
  thead.appendChild(theadRow);
  table.appendChild(thead);

  tbodyEl = document.createElement('tbody');
  table.appendChild(tbodyEl);

  for (let c = 1; c <= numCols; c++) addColumnHeader(c);
  for (let r = 1; r <= numRows; r++) addRow(r);

  const first = formatAddr(1, 1);
  setActiveAddr(first);
  focusCell(first);
}

function addColumnHeader(col: number): void {
  const colEl = document.createElement('col');
  colEl.style.width = `${getColWidth(col)}px`;
  colgroupEl.appendChild(colEl);
  colEls[col] = colEl;

  const th = document.createElement('th');
  th.textContent = colIndexToLetters(col);
  const handle = document.createElement('div');
  handle.className = 'col-resize-handle';
  th.appendChild(handle);
  th.addEventListener('click', () => selectWholeColumn(col));
  theadRow.appendChild(th);
  columnHeaderListeners.forEach((cb) => cb(col, th));
}

function addRow(row: number): void {
  const tr = document.createElement('tr');
  const height = rowHeights.get(row);
  if (height) tr.style.height = `${height}px`;

  const rowHeader = document.createElement('td');
  rowHeader.className = 'row-header-cell';
  rowHeader.textContent = String(row);
  const handle = document.createElement('div');
  handle.className = 'row-resize-handle';
  rowHeader.appendChild(handle);
  rowHeader.addEventListener('click', () => selectWholeRow(row));
  tr.appendChild(rowHeader);

  for (let c = 1; c <= numCols; c++) {
    tr.appendChild(createCellTd(formatAddr(c, row)));
  }
  tbodyEl.appendChild(tr);
  rowHeaderListeners.forEach((cb) => cb(row, rowHeader));
}

function selectWholeColumn(col: number): void {
  const { numRows: rows } = getGridSize();
  const anchor = formatAddr(col, 1);
  selectRange(anchor, formatAddr(col, rows));
  focusCell(anchor);
  updateSelectionVisual();
}

export function selectAll(): void {
  const anchor = formatAddr(1, 1);
  selectRange(anchor, formatAddr(numCols, numRows));
  focusCell(anchor);
  updateSelectionVisual();
}

function selectWholeRow(row: number): void {
  const { numCols: cols } = getGridSize();
  const anchor = formatAddr(1, row);
  selectRange(anchor, formatAddr(cols, row));
  focusCell(anchor);
  updateSelectionVisual();
}

function createCellTd(addr: string): HTMLTableCellElement {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-input';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.readOnly = true;
  input.dataset.addr = addr;

  input.addEventListener('focus', () => onCellFocus(addr));
  input.addEventListener('blur', () => onCellBlur());
  input.addEventListener('keydown', (e) => onCellKeyDown(e, addr));
  input.addEventListener('input', () => onCellInput(addr));
  input.addEventListener('mousedown', (e) => onCellMouseDown(e, addr));
  input.addEventListener('dblclick', () => beginEditing(addr));

  cellInputs.set(addr, input);
  td.appendChild(input);
  return td;
}

/** Grows the table so that (minCols, minRows) is a valid address, adding a growth buffer. */
export function ensureSize(minCols: number, minRows: number): void {
  if (minCols > numCols) {
    const target = Math.max(minCols, numCols + GROWTH_STEP);
    for (let c = numCols + 1; c <= target; c++) {
      addColumnHeader(c);
    }
    const rows = Array.from(tbodyEl.children) as HTMLTableRowElement[];
    rows.forEach((tr, idx) => {
      const row = idx + 1;
      for (let c = numCols + 1; c <= target; c++) {
        tr.appendChild(createCellTd(formatAddr(c, row)));
      }
    });
    numCols = target;
  }
  if (minRows > numRows) {
    const target = Math.max(minRows, numRows + GROWTH_STEP);
    for (let r = numRows + 1; r <= target; r++) {
      addRow(r);
    }
    numRows = target;
  }
}

export function getCellInput(addr: string): HTMLInputElement | undefined {
  return cellInputs.get(addr);
}

export function focusCell(addr: string): void {
  const input = getCellInput(addr);
  if (input) input.focus();
}

function renderCell(addr: string): void {
  const input = getCellInput(addr);
  if (!input) return;
  const cell = getCell(addr);
  if (isEditing() && addr === getActiveAddr()) {
    input.value = cell?.raw ?? '';
  } else {
    input.value = cell?.display ?? '';
  }
  input.classList.toggle('cell-error', !!cell?.error);
}

export function renderAll(): void {
  for (const addr of cellInputs.keys()) {
    renderCell(addr);
  }
}

/** Re-notifies listeners (formula bar, fill handle) about the active cell, e.g. after undo/redo. */
export function refreshActiveCell(): void {
  const addr = getActiveAddr();
  const cell = getCell(addr);
  activeCellListeners.forEach((cb) => cb(addr, cell?.raw ?? ''));
}

export function commitCell(addr: string, rawValue: string): void {
  if ((getCell(addr)?.raw ?? '') === rawValue) return;
  checkpoint();
  setCellRaw(addr, rawValue);
  recalcAll();
  renderAll();
}

/** Enters edit mode for addr: makes the input writable, shows raw content
 * (or initialValue when typing replaces it, Excel-style), caret at end. */
export function beginEditing(addr: string, initialValue?: string): void {
  const input = getCellInput(addr);
  if (!input) return;
  const cell = getCell(addr);
  setEditing(true);
  input.readOnly = false;
  input.value = initialValue ?? cell?.raw ?? '';
  const len = input.value.length;
  input.setSelectionRange(len, len);
}

/** Leaves edit mode for the active cell, optionally committing the typed value. */
export function endEditing(commit: boolean): void {
  if (!isEditing()) return;
  const addr = getActiveAddr();
  const input = getCellInput(addr);
  const value = input?.value ?? '';
  setEditing(false);
  if (input) input.readOnly = true;
  if (commit) {
    commitCell(addr, value);
  } else {
    renderCell(addr);
  }
}

function updateSelectionVisual(): void {
  for (const addr of selectionHighlighted) {
    getCellInput(addr)?.classList.remove('cell-in-selection');
  }
  selectionHighlighted.clear();

  const { minCol, maxCol, minRow, maxRow } = getSelectionRect();
  const active = getActiveAddr();
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const addr = formatAddr(c, r);
      if (addr === active) continue;
      getCellInput(addr)?.classList.add('cell-in-selection');
      selectionHighlighted.add(addr);
    }
  }
  const rect = getSelectionRect();
  selectionListeners.forEach((cb) => cb(rect));
}

/** Programmatically selects a rectangle (anchor = active cell) and syncs the UI. */
export function setSelection(anchor: string, focus: string): void {
  selectRange(anchor, focus);
  focusCell(anchor);
  updateSelectionVisual();
  refreshActiveCell();
}

function onCellFocus(addr: string): void {
  setActiveAddr(addr);
  const cell = getCell(addr);
  activeCellListeners.forEach((cb) => cb(addr, cell?.raw ?? ''));
  updateSelectionVisual();
}

function onCellBlur(): void {
  if (!isEditing()) return;
  endEditing(true);
}

function onCellInput(addr: string): void {
  if (addr !== getActiveAddr()) return;
  const input = getCellInput(addr);
  if (!input) return;
  cellInputListeners.forEach((cb) => cb(input.value));
}

function onCellMouseDown(e: MouseEvent, addr: string): void {
  if (isEditing()) {
    if (getActiveAddr() === addr) return; // let native caret placement happen
    endEditing(true);
  }
  e.preventDefault();
  const input = getCellInput(addr);
  if (!input) return;
  input.focus();

  if (e.shiftKey) {
    extendSelectionTo(addr);
  } else {
    selectCell(addr);
  }
  updateSelectionVisual();

  const onMove = (ev: MouseEvent) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const hovered = el?.closest<HTMLInputElement>('.cell-input')?.dataset.addr;
    if (!hovered) return;
    extendSelectionTo(hovered);
    updateSelectionVisual();
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function onCellKeyDown(e: KeyboardEvent, addr: string): void {
  if (isEditing()) {
    handleEditingKeyDown(e, addr);
  } else {
    handleNavigationKeyDown(e, addr);
  }
}

function handleEditingKeyDown(e: KeyboardEvent, addr: string): void {
  const input = e.target as HTMLInputElement;
  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      endEditing(true);
      move(addr, 0, 1);
      break;
    case 'Tab':
      e.preventDefault();
      endEditing(true);
      move(addr, e.shiftKey ? -1 : 1, 0);
      break;
    case 'ArrowUp':
      e.preventDefault();
      endEditing(true);
      move(addr, 0, -1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      endEditing(true);
      move(addr, 0, 1);
      break;
    case 'ArrowLeft':
      if (input.selectionStart === 0) {
        e.preventDefault();
        endEditing(true);
        move(addr, -1, 0);
      }
      break;
    case 'ArrowRight':
      if (input.selectionEnd === input.value.length) {
        e.preventDefault();
        endEditing(true);
        move(addr, 1, 0);
      }
      break;
    case 'Escape':
      e.preventDefault();
      endEditing(false);
      break;
  }
}

function handleNavigationKeyDown(e: KeyboardEvent, addr: string): void {
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    beginEditing(addr, e.key);
    return;
  }
  switch (e.key) {
    case 'F2':
      e.preventDefault();
      beginEditing(addr);
      break;
    case 'Enter':
      e.preventDefault();
      move(addr, 0, 1);
      break;
    case 'Tab':
      e.preventDefault();
      move(addr, e.shiftKey ? -1 : 1, 0);
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (e.shiftKey) extendSelection(0, -1);
      else move(addr, 0, -1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (e.shiftKey) extendSelection(0, 1);
      else move(addr, 0, 1);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (e.shiftKey) extendSelection(-1, 0);
      else move(addr, -1, 0);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (e.shiftKey) extendSelection(1, 0);
      else move(addr, 1, 0);
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      clearSelection();
      break;
  }
}

/** Clears the raw content (values and formulas) of every cell in the current selection. */
export function clearSelection(): void {
  const { minCol, maxCol, minRow, maxRow } = getSelectionRect();
  let hasContent = false;
  for (let r = minRow; r <= maxRow && !hasContent; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (getCell(formatAddr(c, r))) {
        hasContent = true;
        break;
      }
    }
  }
  if (!hasContent) return;
  checkpoint();
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      setCellRaw(formatAddr(c, r), '');
    }
  }
  recalcAll();
  renderAll();
}

function extendSelection(dCol: number, dRow: number): void {
  const parsed = parseAddr(getRangeFocusAddr());
  if (!parsed) return;
  const nextCol = Math.max(1, parsed.col + dCol);
  const nextRow = Math.max(1, parsed.row + dRow);
  ensureSize(nextCol, nextRow);
  extendSelectionTo(formatAddr(nextCol, nextRow));
  updateSelectionVisual();
}

function move(fromAddr: string, dCol: number, dRow: number): void {
  const parsed = parseAddr(fromAddr);
  if (!parsed) return;
  const nextCol = Math.max(1, parsed.col + dCol);
  const nextRow = Math.max(1, parsed.row + dRow);
  ensureSize(nextCol, nextRow);
  const nextAddr = formatAddr(nextCol, nextRow);
  selectCell(nextAddr);
  focusCell(nextAddr);
  updateSelectionVisual();
}

export function moveFromActive(dCol: number, dRow: number): void {
  move(getActiveAddr(), dCol, dRow);
}

export function getColWidth(col: number): number {
  return colWidths.get(col) ?? DEFAULT_COL_WIDTH;
}

export function setColWidth(col: number, px: number): void {
  const clamped = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, px));
  colWidths.set(col, clamped);
  const colEl = colEls[col];
  if (colEl) colEl.style.width = `${clamped}px`;
}

export function getRowHeight(row: number): number {
  return rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT;
}

export function setRowHeight(row: number, px: number): void {
  const clamped = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, px));
  rowHeights.set(row, clamped);
  const tr = tbodyEl.children[row - 1] as HTMLTableRowElement | undefined;
  if (tr) tr.style.height = `${clamped}px`;
}

export function resetRowHeight(row: number): void {
  rowHeights.delete(row);
  const tr = tbodyEl.children[row - 1] as HTMLTableRowElement | undefined;
  if (tr) tr.style.height = '';
}

export function getGridSize(): { numCols: number; numRows: number } {
  return { numCols, numRows };
}
