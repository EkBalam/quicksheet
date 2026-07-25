import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { getSelectionRect, isEditing } from './selection';
import { getCell } from '../state/cells';
import { formatAddr } from './addr';

export function initClipboard(container: HTMLElement): void {
  container.addEventListener('keydown', (e) => {
    if (isEditing()) return; // let native in-input text copy proceed untouched
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return;
    e.preventDefault();
    void writeText(buildCopyText());
  });
}

function buildCopyText(): string {
  const { minCol, maxCol, minRow, maxRow } = getSelectionRect();
  const lines: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const cols: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      cols.push(getCell(formatAddr(c, r))?.display ?? '');
    }
    lines.push(cols.join('\t'));
  }
  return lines.join('\n');
}
