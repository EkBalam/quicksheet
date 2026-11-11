import { getCellInput, onSelectionChange, renderAll, ensureSize, getGridSize, setSelection } from './grid';
import { getCell, setCellRaw, recalcAll, checkpoint } from '../state/cells';
import { parseAddr, formatAddr } from './addr';
import { shiftFormula } from '../formula/shift';
import { getSelectionRect } from './selection';
import { fillLine } from './series';
import { getZoom } from '../ui/zoom';

const PREVIEW_CLASS = 'fill-preview';

interface Rect {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

interface FillPlan {
  vertical: boolean;
  target: Rect; // the cells to be filled (excludes the source rectangle)
}

/** Decides which cells a drag from `src` to `hovered` would fill. The fill
 * extends the source along whichever axis the pointer moved further on
 * (no diagonal fills), like Excel. Works for a single cell or a range. */
function planFill(src: Rect, hovered: { col: number; row: number }): FillPlan | null {
  const dRow = hovered.row > src.maxRow ? hovered.row - src.maxRow : hovered.row < src.minRow ? hovered.row - src.minRow : 0;
  const dCol = hovered.col > src.maxCol ? hovered.col - src.maxCol : hovered.col < src.minCol ? hovered.col - src.minCol : 0;
  if (dRow === 0 && dCol === 0) return null;

  if (Math.abs(dRow) >= Math.abs(dCol)) {
    return {
      vertical: true,
      target:
        dRow > 0
          ? { ...src, minRow: src.maxRow + 1, maxRow: hovered.row }
          : { ...src, minRow: hovered.row, maxRow: src.minRow - 1 },
    };
  }
  return {
    vertical: false,
    target:
      dCol > 0
        ? { ...src, minCol: src.maxCol + 1, maxCol: hovered.col }
        : { ...src, minCol: hovered.col, maxCol: src.minCol - 1 },
  };
}

function rectAddrs(r: Rect): string[] {
  const out: string[] = [];
  for (let row = r.minRow; row <= r.maxRow; row++) {
    for (let col = r.minCol; col <= r.maxCol; col++) out.push(formatAddr(col, row));
  }
  return out;
}

function setPreview(addrs: string[], on: boolean): void {
  for (const addr of addrs) getCellInput(addr)?.classList.toggle(PREVIEW_CLASS, on);
}

function commitFill(src: Rect, plan: FillPlan): void {
  checkpoint();
  const { target } = plan;
  if (plan.vertical) {
    for (let col = src.minCol; col <= src.maxCol; col++) {
      const sources: string[] = [];
      for (let row = src.minRow; row <= src.maxRow; row++) sources.push(getCell(formatAddr(col, row))?.raw ?? '');
      for (let row = target.minRow; row <= target.maxRow; row++) {
        const raw = fillLine(sources, row - src.minRow, (s, d) => shiftFormula(s, 0, d));
        setCellRaw(formatAddr(col, row), raw);
      }
    }
  } else {
    for (let row = src.minRow; row <= src.maxRow; row++) {
      const sources: string[] = [];
      for (let col = src.minCol; col <= src.maxCol; col++) sources.push(getCell(formatAddr(col, row))?.raw ?? '');
      for (let col = target.minCol; col <= target.maxCol; col++) {
        const raw = fillLine(sources, col - src.minCol, (s, d) => shiftFormula(s, d, 0));
        setCellRaw(formatAddr(col, row), raw);
      }
    }
  }
  recalcAll();
  renderAll();

  // Like Excel, the selection grows to cover the source plus the filled cells.
  const all: Rect = {
    minCol: Math.min(src.minCol, target.minCol),
    maxCol: Math.max(src.maxCol, target.maxCol),
    minRow: Math.min(src.minRow, target.minRow),
    maxRow: Math.max(src.maxRow, target.maxRow),
  };
  setSelection(formatAddr(all.minCol, all.minRow), formatAddr(all.maxCol, all.maxRow));
}

const EDGE = 24; // px from the container edge where auto-scroll kicks in
const SCROLL_TICK_MS = 40;

export function initFillHandle(): void {
  const container = document.querySelector<HTMLElement>('#grid-container');
  const handle = document.createElement('div');
  handle.className = 'fill-handle';

  // The handle sits on the bottom-right cell of the selection, as in Excel.
  const place = (r: Rect) => {
    getCellInput(formatAddr(r.maxCol, r.maxRow))?.parentElement?.appendChild(handle);
  };
  onSelectionChange(place);
  place(getSelectionRect());

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const src = getSelectionRect();
    let lastPlan: FillPlan | null = null;
    let lastPreview: string[] = [];
    let mouseX = e.clientX;
    let mouseY = e.clientY;

    /** Maps the pointer (clamped inside the visible cell area, so dragging past
     * the edge or over the sticky headers still resolves to a cell) to a plan. */
    const update = () => {
      let x = mouseX;
      let y = mouseY;
      if (container) {
        const rect = container.getBoundingClientRect();
        const z = getZoom() / 100;
        x = Math.min(Math.max(x, rect.left + 40 * z), rect.right - 20);
        y = Math.min(Math.max(y, rect.top + 28 * z), rect.bottom - 20);
      }
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const hoveredAddr = el?.closest<HTMLInputElement>('.cell-input')?.dataset.addr;
      const hovered = hoveredAddr ? parseAddr(hoveredAddr) : null;
      if (!hovered) return;
      const plan = planFill(src, hovered);
      setPreview(lastPreview, false);
      lastPlan = plan;
      lastPreview = plan ? rectAddrs(plan.target) : [];
      setPreview(lastPreview, true);
    };

    /** Scrolls the grid while the pointer is at/over an edge, growing the grid
     * when the end is reached so a long fill never hits a wall. */
    const autoScroll = () => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const speed = (dist: number) => Math.min(40, 6 + dist / 3);
      let dx = 0;
      let dy = 0;
      if (mouseY > rect.bottom - EDGE) dy = speed(mouseY - (rect.bottom - EDGE));
      else if (mouseY < rect.top + EDGE) dy = -speed(rect.top + EDGE - mouseY);
      if (mouseX > rect.right - EDGE) dx = speed(mouseX - (rect.right - EDGE));
      else if (mouseX < rect.left + EDGE) dx = -speed(rect.left + EDGE - mouseX);
      if (dx === 0 && dy === 0) return;

      const { numCols, numRows } = getGridSize();
      if (dy > 0 && container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
        ensureSize(numCols, numRows + 1);
      }
      if (dx > 0 && container.scrollLeft + container.clientWidth >= container.scrollWidth - 2) {
        ensureSize(numCols + 1, numRows);
      }
      container.scrollBy(dx, dy);
      update();
    };

    const timer = window.setInterval(autoScroll, SCROLL_TICK_MS);
    const onMove = (ev: MouseEvent) => {
      mouseX = ev.clientX;
      mouseY = ev.clientY;
      update();
    };
    const onUp = () => {
      window.clearInterval(timer);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setPreview(lastPreview, false);
      if (lastPlan) commitFill(src, lastPlan);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
