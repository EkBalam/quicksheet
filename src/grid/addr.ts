export interface Addr {
  col: number; // 1-based: A=1, B=2, ... Z=26, AA=27...
  row: number; // 1-based
}

export function colLettersToIndex(letters: string): number {
  let result = 0;
  for (const ch of letters.toUpperCase()) {
    result = result * 26 + (ch.charCodeAt(0) - 64);
  }
  return result;
}

export function colIndexToLetters(index: number): string {
  let result = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

const ADDR_RE = /^([A-Za-z]+)([0-9]+)$/;

export function parseAddr(addr: string): Addr | null {
  const m = addr.match(ADDR_RE);
  if (!m) return null;
  return { col: colLettersToIndex(m[1]), row: parseInt(m[2], 10) };
}

export function formatAddr(col: number, row: number): string {
  return `${colIndexToLetters(col)}${row}`;
}
