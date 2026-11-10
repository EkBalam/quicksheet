import { getCellInput, onActiveCellChange, renderAll } from './grid';
import { getCell, setCellRaw, recalcAll, checkpoint } from '../state/cells';
import { parseAddr, formatAddr } from './addr';
import { shiftFormula } from '../formula/shift';

const PREVIEW_CLASS = 'fill-preview';

/** Builds the straight-line path of addresses from source (exclusive) to
 * target (inclusive), along whichever axis has the larger delta — matching
 * Excel's fill-handle behavior when dragging from a single, unselected cell
 * (no diagonal/L-shaped fill, no multi-cell range source). */
function computeFillPath(sourceAddr: string, targetAddr: string): string[] {
  const src = parseAddr(sourceAddr);
  const tgt = parseAddr(targetAddr);
  if (!src || !tgt) return [];

  const dCol = tgt.col - src.col;
  const dRow = tgt.row - src.row;
  const path: string[] = [];

  if (Math.abs(dRow) >= Math.abs(dCol)) {
    const step = dRow >= 0 ? 1 : -1;
    for (let r = src.row + step; step > 0 ? r <= tgt.row : r >= tgt.row; r += step) {
      path.push(formatAddr(src.col, r));
    }
  } else {
    const step = dCol >= 0 ? 1 : -1;
    for (let c = src.col + step; step > 0 ? c <= tgt.col : c >= tgt.col; c += step) {
      path.push(formatAddr(c, src.row));
    }
  }
  return path;
}

function setPreview(addrs: string[], on: boolean): void {
  for (const addr of addrs) {
    getCellInput(addr)?.classList.toggle(PREVIEW_CLASS, on);
  }
}

function commitFill(sourceAddr: string, sourceRaw: string, path: string[]): void {
  const src = parseAddr(sourceAddr);
  if (!src) return;
  checkpoint();
  for (const targetAddr of path) {
    const t = parseAddr(targetAddr);
    if (!t) continue;
    const newRaw = shiftFormula(sourceRaw, t.col - src.col, t.row - src.row);
    setCellRaw(targetAddr, newRaw);
  }
  recalcAll();
  renderAll();
}

export function initFillHandle(): void {
  const handle = document.createElement('div');
  handle.className = 'fill-handle';

  let activeAddr = 'A1';
  onActiveCellChange((addr) => {
    activeAddr = addr;
    const input = getCellInput(addr);
    const td = input?.parentElement;
    if (td) td.appendChild(handle);
  });

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceAddr = activeAddr;
    const sourceRaw = getCell(sourceAddr)?.raw ?? '';
    let lastPath: string[] = [];

    const onMove = (ev: MouseEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const input = el?.closest<HTMLInputElement>('.cell-input');
      const hoveredAddr = input?.dataset.addr;
      if (!hoveredAddr) return;
      const path = computeFillPath(sourceAddr, hoveredAddr);
      setPreview(lastPath, false);
      setPreview(path, true);
      lastPath = path;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setPreview(lastPath, false);
      if (lastPath.length > 0) commitFill(sourceAddr, sourceRaw, lastPath);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
