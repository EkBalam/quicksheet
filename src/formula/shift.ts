import { tokenize, TokenType } from './tokenizer';
import { parseAddr, colIndexToLetters } from '../grid/addr';

const SPACE_AFTER: TokenType[] = ['COMMA'];

const REF_RE = /^(\$?)([A-Za-z]+)(\$?)([0-9]+)$/;

/** Shifts one reference, leaving a "$"-anchored column and/or row in place. */
function shiftCellRef(ref: string, dCol: number, dRow: number): string {
  const m = ref.match(REF_RE);
  const addr = m && parseAddr(m[2] + m[4]);
  if (!m || !addr) return ref;
  const [, colAbs, , rowAbs] = m;
  const col = colAbs ? addr.col : Math.max(1, addr.col + dCol);
  const row = rowAbs ? addr.row : Math.max(1, addr.row + dRow);
  return `${colAbs}${colIndexToLetters(col)}${rowAbs}${row}`;
}

/** Shifts every relative cell reference in a formula by (dCol, dRow), the
 * same way Excel adjusts references when you drag-fill a cell. References
 * anchored with "$" ($A$1, A$1, $A1) keep that part fixed. Non-formula
 * values are returned unchanged (shifted references clamp to a minimum of 1). */
export function shiftFormula(raw: string, dCol: number, dRow: number): string {
  if (!raw.startsWith('=')) return raw;

  const tokens = tokenize(raw.slice(1));
  let out = '';
  let prevType: TokenType | null = null;

  for (const t of tokens) {
    if (t.type === 'EOF') break;

    let text: string;
    if (t.type === 'CELL') {
      text = shiftCellRef(t.value, dCol, dRow);
    } else if (t.type === 'STRING') {
      text = `"${t.value}"`;
    } else {
      text = t.value;
    }

    if (prevType && SPACE_AFTER.includes(prevType)) out += ' ';
    out += text;
    prevType = t.type;
  }

  return '=' + out;
}
