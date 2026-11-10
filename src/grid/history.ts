import { undo, redo } from '../state/cells';
import { renderAll, refreshActiveCell } from './grid';
import { isEditing } from './selection';

/** Ctrl+Z undoes, Ctrl+Y / Ctrl+Shift+Z redoes. While editing a cell the
 * browser's native text undo is left alone. */
export function initHistory(container: HTMLElement): void {
  container.addEventListener('keydown', (e) => {
    if (isEditing()) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

    const key = e.key.toLowerCase();
    let changed: boolean;
    if (key === 'z' && !e.shiftKey) changed = undo();
    else if (key === 'y' || (key === 'z' && e.shiftKey)) changed = redo();
    else return;

    e.preventDefault();
    if (changed) {
      renderAll();
      refreshActiveCell();
    }
  });
}
