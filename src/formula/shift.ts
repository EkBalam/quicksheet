import { tokenize, TokenType } from './tokenizer';
import { parseAddr, formatAddr } from '../grid/addr';

const SPACE_AFTER: TokenType[] = ['COMMA'];

/** Shifts every relative cell reference in a formula by (dCol, dRow), the
 * same way Excel adjusts references when you drag-fill a cell. Non-formula
 * values are returned unchanged. There's no $A$1 absolute-reference syntax
 * in this engine, so every reference shifts (clamped to a minimum of 1). */
export function shiftFormula(raw: string, dCol: number, dRow: number): string {
  if (!raw.startsWith('=')) return raw;

  const tokens = tokenize(raw.slice(1));
  let out = '';
  let prevType: TokenType | null = null;

  for (const t of tokens) {
    if (t.type === 'EOF') break;

    let text: string;
    if (t.type === 'CELL') {
      const addr = parseAddr(t.value.toUpperCase());
      text = addr ? formatAddr(Math.max(1, addr.col + dCol), Math.max(1, addr.row + dRow)) : t.value;
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
