import { parseAddr } from './addr';

let activeAddr = 'A1'; // cell with real DOM focus / anchor of the range
let rangeFocusAddr = 'A1'; // far corner of the selection rectangle
let editing = false; // true only while activeAddr's input is being edited

export function getActiveAddr(): string {
  return activeAddr;
}

export function setActiveAddr(addr: string): void {
  activeAddr = addr;
}

export function getRangeFocusAddr(): string {
  return rangeFocusAddr;
}

/** Collapses the selection to a single cell. */
export function selectCell(addr: string): void {
  activeAddr = addr;
  rangeFocusAddr = addr;
}

/** Sets both corners of the rectangle explicitly (e.g. column/row header clicks). */
export function selectRange(anchor: string, focus: string): void {
  activeAddr = anchor;
  rangeFocusAddr = focus;
}

/** Moves only the far corner, keeping the anchor (and real DOM focus) put. */
export function extendSelectionTo(addr: string): void {
  rangeFocusAddr = addr;
}

export function getSelectionRect(): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
  const a = parseAddr(activeAddr);
  const f = parseAddr(rangeFocusAddr);
  const anchor = a ?? { col: 1, row: 1 };
  const focus = f ?? anchor;
  return {
    minCol: Math.min(anchor.col, focus.col),
    maxCol: Math.max(anchor.col, focus.col),
    minRow: Math.min(anchor.row, focus.row),
    maxRow: Math.max(anchor.row, focus.row),
  };
}

export function isEditing(): boolean {
  return editing;
}

export function setEditing(value: boolean): void {
  editing = value;
}
