const TEXT_NUM_RE = /^(.*?)(\d+)$/;

function isNumericConstant(raw: string): boolean {
  if (raw.trim() === '' || raw.startsWith('=')) return false;
  return Number.isFinite(Number(raw));
}

function cleanNumber(n: number): string {
  return String(Math.round(n * 1e10) / 1e10);
}

/** Computes the raw content for the cell at offset `p` along the fill axis,
 * where `sources` are the raws of the selected line (index 0 = first source
 * cell, so p < 0 fills backwards and p >= sources.length fills forwards).
 *
 * Excel-style rules:
 *  - 2+ numeric constants        -> linear series (1,2 -> 3,4,...)
 *  - text ending in a number     -> incremented suffix (Item1 -> Item2)
 *  - anything else (incl. formulas and a single plain number) -> repeat the
 *    source cells in a cycle; `shift(raw, delta)` adjusts relative references.
 */
export function fillLine(
  sources: string[],
  p: number,
  shift: (raw: string, delta: number) => string,
): string {
  const n = sources.length;

  if (sources.every(isNumericConstant)) {
    if (n >= 2) {
      const first = Number(sources[0]);
      const step = (Number(sources[n - 1]) - first) / (n - 1);
      return cleanNumber(first + step * p);
    }
  } else {
    const matches = sources.map((s) => (s.startsWith('=') ? null : s.match(TEXT_NUM_RE)));
    const prefix = matches[0]?.[1];
    if (prefix && matches.every((m) => m && m[1] === prefix)) {
      const nums = matches.map((m) => Number(m![2]));
      const step = n >= 2 ? (nums[n - 1] - nums[0]) / (n - 1) : 1;
      const value = nums[0] + step * p;
      if (Number.isInteger(value) && value >= 0) {
        const width = matches[0]![2].length;
        const digits = matches[0]![2].startsWith('0') ? String(value).padStart(width, '0') : String(value);
        return prefix + digits;
      }
    }
  }

  const i = ((p % n) + n) % n;
  return shift(sources[i], p - i);
}
