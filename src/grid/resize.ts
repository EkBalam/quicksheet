import {
  onColumnHeaderCreated,
  onRowHeaderCreated,
  getColWidth,
  setColWidth,
  getRowHeight,
  setRowHeight,
  resetRowHeight,
  getCellInput,
  getGridSize,
} from './grid';
import { getZoom } from '../ui/zoom';
import { colIndexToLetters } from './addr';

const CELL_PADDING = 8;

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d')!;
    const sample = getCellInput('A1');
    if (sample) {
      measureCtx.font = getComputedStyle(sample).font;
    }
  }
  return measureCtx;
}

function autoFitColumn(col: number): void {
  const ctx = getMeasureCtx();
  const { numRows } = getGridSize();
  const colLetters = colIndexToLetters(col);
  let maxWidth = 0;
  for (let row = 1; row <= numRows; row++) {
    const input = getCellInput(`${colLetters}${row}`);
    if (!input) continue;
    const width = ctx.measureText(input.value).width;
    if (width > maxWidth) maxWidth = width;
  }
  setColWidth(col, Math.ceil(maxWidth) + CELL_PADDING);
}

function startColResize(e: MouseEvent, col: number): void {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startWidth = getColWidth(col);

  const onMove = (ev: MouseEvent) => {
    const deltaScreen = ev.clientX - startX;
    const deltaLogical = deltaScreen / (getZoom() / 100);
    setColWidth(col, startWidth + deltaLogical);
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startRowResize(e: MouseEvent, row: number): void {
  e.preventDefault();
  e.stopPropagation();
  const startY = e.clientY;
  const startHeight = getRowHeight(row);

  const onMove = (ev: MouseEvent) => {
    const deltaScreen = ev.clientY - startY;
    const deltaLogical = deltaScreen / (getZoom() / 100);
    setRowHeight(row, startHeight + deltaLogical);
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

export function initResize(): void {
  onColumnHeaderCreated((col, th) => {
    const handle = th.querySelector<HTMLElement>('.col-resize-handle');
    if (!handle) return;
    handle.addEventListener('mousedown', (e) => startColResize(e, col));
    handle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      autoFitColumn(col);
    });
  });

  onRowHeaderCreated((row, td) => {
    const handle = td.querySelector<HTMLElement>('.row-resize-handle');
    if (!handle) return;
    handle.addEventListener('mousedown', (e) => startRowResize(e, row));
    handle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      resetRowHeight(row);
    });
  });
}
