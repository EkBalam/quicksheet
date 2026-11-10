export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'CELL'
  | 'IDENT'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'COLON'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'EQ'
  | 'NE'
  | 'LT'
  | 'LE'
  | 'GT'
  | 'GE'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
}

// Optional "$" marks an absolute column and/or row ($A$1, A$1, $A1).
const CELL_RE = /^\$?[A-Za-z]+\$?[0-9]+/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER_RE = /^[0-9]+(\.[0-9]+)?/;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    if (ch === '"') {
      i++;
      let s = '';
      while (i < input.length && input[i] !== '"') {
        s += input[i];
        i++;
      }
      if (input[i] !== '"') throw new Error('Cadena de texto sin cerrar');
      i++;
      tokens.push({ type: 'STRING', value: s });
      continue;
    }

    if (ch === '<') {
      if (input[i + 1] === '=') {
        tokens.push({ type: 'LE', value: '<=' });
        i += 2;
      } else if (input[i + 1] === '>') {
        tokens.push({ type: 'NE', value: '<>' });
        i += 2;
      } else {
        tokens.push({ type: 'LT', value: '<' });
        i += 1;
      }
      continue;
    }
    if (ch === '>') {
      if (input[i + 1] === '=') {
        tokens.push({ type: 'GE', value: '>=' });
        i += 2;
      } else {
        tokens.push({ type: 'GT', value: '>' });
        i += 1;
      }
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'EQ', value: '=' });
      i += 1;
      continue;
    }

    const rest = input.slice(i);
    let m: RegExpMatchArray | null;
    // Cell refs (letters immediately followed by digits) must be tried before
    // plain identifiers, since "A1" would otherwise also match IDENT_RE.
    if ((m = rest.match(CELL_RE))) {
      tokens.push({ type: 'CELL', value: m[0] });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(NUMBER_RE))) {
      tokens.push({ type: 'NUMBER', value: m[0] });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(IDENT_RE))) {
      tokens.push({ type: 'IDENT', value: m[0] });
      i += m[0].length;
      continue;
    }

    switch (ch) {
      case '(':
        tokens.push({ type: 'LPAREN', value: ch });
        break;
      case ')':
        tokens.push({ type: 'RPAREN', value: ch });
        break;
      case ',':
        tokens.push({ type: 'COMMA', value: ch });
        break;
      case ':':
        tokens.push({ type: 'COLON', value: ch });
        break;
      case '+':
        tokens.push({ type: 'PLUS', value: ch });
        break;
      case '-':
        tokens.push({ type: 'MINUS', value: ch });
        break;
      case '*':
        tokens.push({ type: 'STAR', value: ch });
        break;
      case '/':
        tokens.push({ type: 'SLASH', value: ch });
        break;
      default:
        throw new Error(`Unexpected character: ${ch}`);
    }
    i++;
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}
