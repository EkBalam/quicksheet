import { tokenize, Token, TokenType } from './tokenizer';

export type CompareOp = '=' | '<>' | '<' | '>' | '<=' | '>=';

export type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'cellref'; addr: string }
  | { type: 'range'; start: string; end: string }
  | { type: 'unary'; op: '-'; arg: ASTNode }
  | { type: 'binop'; op: '+' | '-' | '*' | '/'; left: ASTNode; right: ASTNode }
  | { type: 'compare'; op: CompareOp; left: ASTNode; right: ASTNode }
  | { type: 'funccall'; name: string; args: ASTNode[] };

export class FormulaParseError extends Error {}

const COMPARE_OPS: Partial<Record<TokenType, CompareOp>> = {
  EQ: '=',
  NE: '<>',
  LT: '<',
  GT: '>',
  LE: '<=',
  GE: '>=',
};

export function parseFormula(formulaText: string): ASTNode {
  const body = formulaText.startsWith('=') ? formulaText.slice(1) : formulaText;
  const tokens = tokenize(body);
  let pos = 0;

  const peek = () => tokens[pos];
  const advance = () => tokens[pos++];
  const expect = (type: TokenType): Token => {
    const t = advance();
    if (t.type !== type) {
      throw new FormulaParseError(`Expected ${type}, got ${t.type}`);
    }
    return t;
  };

  function parseComparison(): ASTNode {
    const left = parseExpr();
    const op = COMPARE_OPS[peek().type];
    if (op) {
      advance();
      const right = parseExpr();
      return { type: 'compare', op, left, right };
    }
    return left;
  }

  function parseExpr(): ASTNode {
    let node = parseTerm();
    while (peek().type === 'PLUS' || peek().type === 'MINUS') {
      const op = advance().type === 'PLUS' ? '+' : '-';
      node = { type: 'binop', op, left: node, right: parseTerm() };
    }
    return node;
  }

  function parseTerm(): ASTNode {
    let node = parseFactor();
    while (peek().type === 'STAR' || peek().type === 'SLASH') {
      const op = advance().type === 'STAR' ? '*' : '/';
      node = { type: 'binop', op, left: node, right: parseFactor() };
    }
    return node;
  }

  function parseFactor(): ASTNode {
    const t = peek();

    if (t.type === 'MINUS') {
      advance();
      return { type: 'unary', op: '-', arg: parseFactor() };
    }
    if (t.type === 'NUMBER') {
      advance();
      return { type: 'number', value: parseFloat(t.value) };
    }
    if (t.type === 'STRING') {
      advance();
      return { type: 'string', value: t.value };
    }
    if (t.type === 'LPAREN') {
      advance();
      const node = parseComparison();
      expect('RPAREN');
      return node;
    }
    if (t.type === 'CELL') {
      advance();
      if (peek().type === 'COLON') {
        advance();
        const end = expect('CELL');
        return { type: 'range', start: t.value.toUpperCase(), end: end.value.toUpperCase() };
      }
      return { type: 'cellref', addr: t.value.toUpperCase() };
    }
    if (t.type === 'IDENT') {
      advance();
      expect('LPAREN');
      const args: ASTNode[] = [];
      if (peek().type !== 'RPAREN') {
        args.push(parseComparison());
        while (peek().type === 'COMMA') {
          advance();
          args.push(parseComparison());
        }
      }
      expect('RPAREN');
      return { type: 'funccall', name: t.value.toUpperCase(), args };
    }

    throw new FormulaParseError(`Unexpected token ${t.type}`);
  }

  const result = parseComparison();
  if (peek().type !== 'EOF') {
    throw new FormulaParseError('Unexpected trailing tokens');
  }
  return result;
}
