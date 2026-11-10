import { formatAddr, parseAddr } from './addr';
import { ensureSize, renderAll } from './grid';
import { getActiveAddr } from './selection';
import { setCellRaw, recalcAll, checkpoint } from '../state/cells';

export function attachPasteHandler(container: HTMLElement): void {
  container.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;

    const rows = text.replace(/\r/g, '').split('\n');
    while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
    if (rows.length === 0) return;

    const start = parseAddr(getActiveAddr());
    if (!start) return;

    const maxCols = Math.max(...rows.map((row) => row.split('\t').length));
    ensureSize(start.col + maxCols - 1, start.row + rows.length - 1);

    checkpoint();
    rows.forEach((rowStr, ri) => {
      rowStr.split('\t').forEach((val, ci) => {
        setCellRaw(formatAddr(start.col + ci, start.row + ri), val.trim());
      });
    });

    recalcAll();
    renderAll();
  });
}
