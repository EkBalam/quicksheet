import { initGrid, renderAll } from './grid/grid';
import { attachPasteHandler } from './grid/paste';
import { initFormulaBar } from './grid/formulabar';
import { initResize } from './grid/resize';
import { initFillHandle } from './grid/fillhandle';
import { initClipboard } from './grid/clipboard';
import { initZoom, initZoomIndicator } from './ui/zoom';
import { initHistory } from './grid/history';
import { recalcAll, clearAllCells, checkpoint } from './state/cells';
import { initSettingsPanel } from './settings';

window.addEventListener('DOMContentLoaded', () => {
  const table = document.querySelector<HTMLTableElement>('#grid');
  const container = document.querySelector<HTMLElement>('#grid-container');
  const zoomIndicator = document.querySelector<HTMLElement>('#zoom-indicator');
  const clearAllBtn = document.querySelector<HTMLButtonElement>('#clear-all-btn');
  if (!table || !container) return;

  initResize();
  initGrid(table);
  attachPasteHandler(container);
  initFormulaBar();
  initFillHandle();
  initClipboard(container);
  initZoom(container);
  if (zoomIndicator) initZoomIndicator(zoomIndicator);
  initSettingsPanel();
  clearAllBtn?.addEventListener('click', () => {
    if (!confirm('¿Borrar todos los valores y fórmulas de la hoja?')) return;
    checkpoint();
    clearAllCells();
    recalcAll();
    renderAll();
  });
  initHistory(container);
  recalcAll();
  renderAll();
});
