import { parseCsv, decodeText } from './csv';
import { parseXlsx, ImportedCell } from './xlsx';
import { ensureSize, renderAll, setSelection } from '../grid/grid';
import { formatAddr } from '../grid/addr';
import { cells, setCellRaw, clearAllCells, recalcAll, checkpoint } from '../state/cells';

// The grid is one <input> per cell, so keep imports to a size it handles smoothly.
const MAX_ROWS = 1000;
const MAX_COLS = 60;

function csvToCells(buf: ArrayBuffer): ImportedCell[] {
  const { rows, delimiter } = parseCsv(decodeText(buf));
  const out: ImportedCell[] = [];
  rows.forEach((fields, r) => {
    fields.forEach((f, c) => {
      let v = f.trim();
      // "1,5" in a ;-separated (Spanish-locale) file is the number 1.5
      if (delimiter !== ',' && /^-?\d+,\d+$/.test(v)) v = v.replace(',', '.');
      if (v !== '') out.push({ col: c + 1, row: r + 1, raw: v });
    });
  });
  return out;
}

function applyImport(imported: ImportedCell[]): { truncated: boolean } {
  const kept = imported.filter((c) => c.col <= MAX_COLS && c.row <= MAX_ROWS);
  const truncated = kept.length < imported.length;

  checkpoint();
  clearAllCells();
  ensureSize(
    kept.reduce((m, c) => Math.max(m, c.col), 1),
    kept.reduce((m, c) => Math.max(m, c.row), 1),
  );
  for (const c of kept) setCellRaw(formatAddr(c.col, c.row), c.raw);
  recalcAll();

  // Formulas this app can't evaluate fall back to the value Excel had cached.
  let patched = false;
  for (const c of kept) {
    if (c.fallback === undefined) continue;
    const addr = formatAddr(c.col, c.row);
    if (cells.get(addr)?.error) {
      setCellRaw(addr, c.fallback);
      patched = true;
    }
  }
  if (patched) recalcAll();

  renderAll();
  setSelection('A1', 'A1');
  return { truncated };
}

async function importFile(file: File): Promise<void> {
  const name = file.name.toLowerCase();
  try {
    const buf = await file.arrayBuffer();
    let imported: ImportedCell[];
    if (name.endsWith('.xlsx')) imported = await parseXlsx(buf);
    else if (name.endsWith('.xls')) throw new Error('El formato .xls antiguo no está soportado. Guárdalo como .xlsx o .csv.');
    else imported = csvToCells(buf);

    const { truncated } = applyImport(imported);
    if (truncated) alert(`El archivo es muy grande: solo se importaron las primeras ${MAX_ROWS} filas y ${MAX_COLS} columnas.`);
  } catch (err) {
    alert(`No se pudo importar "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function initImport(): void {
  const btn = document.querySelector<HTMLButtonElement>('#import-btn');
  const input = document.querySelector<HTMLInputElement>('#import-input');
  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = ''; // allow re-importing the same file
    if (file) void importFile(file);
  });
}
