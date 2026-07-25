import { getCellInput, beginEditing, endEditing, moveFromActive, onActiveCellChange, onActiveCellInput } from './grid';
import { getCell } from '../state/cells';

export function initFormulaBar(): void {
  const addrEl = document.querySelector<HTMLElement>('#formula-bar-addr');
  const input = document.querySelector<HTMLInputElement>('#formula-bar-input');
  if (!addrEl || !input) return;

  let currentAddr = '';

  onActiveCellChange((addr, raw) => {
    // Typing in the bar only edits the cell input's .value without giving it
    // real DOM focus, so its native blur handler never fires the commit if
    // the user clicks straight into another cell. Commit here instead.
    if (currentAddr && currentAddr !== addr) {
      endEditing(true);
    }
    currentAddr = addr;
    addrEl.textContent = addr;
    input.value = raw;
  });

  onActiveCellInput((value) => {
    if (document.activeElement !== input) input.value = value;
  });

  input.addEventListener('focus', () => {
    beginEditing(currentAddr, input.value);
  });

  input.addEventListener('input', () => {
    const cellInput = getCellInput(currentAddr);
    if (cellInput) cellInput.value = input.value;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      endEditing(true);
      moveFromActive(0, 1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      endEditing(true);
      moveFromActive(e.shiftKey ? -1 : 1, 0);
    } else if (e.key === 'Escape') {
      endEditing(false);
      input.value = getCell(currentAddr)?.raw ?? '';
    }
  });
}
