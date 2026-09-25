export type Operand = { field: string } | { literal: string | number | boolean };
export type Expression = { left: Operand; operator?: '==' | '!='; right?: Operand };
const operand = String.raw`(?:\$\.[A-Za-z_][A-Za-z0-9_]*|"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false)`;
const pattern = new RegExp(`^[\\x20\\t\\r\\n]*(${operand})(?:[\\x20\\t\\r\\n]*(==|!=)[\\x20\\t\\r\\n]*(${operand}))?[\\x20\\t\\r\\n]*$`);
export function parse(text: string, forEdge = false): Expression | undefined {
  const match = pattern.exec(text); if (!match) return;
  const read = (s: string): Operand => s.startsWith('$.') ? { field: s.slice(2) } : { literal: JSON.parse(s) as string | number | boolean };
  const left = read(match[1]!);
  if (forEdge && (match[2] || !('field' in left))) return;
  if (!match[2] && !('field' in left)) return;
  return { left, ...(match[2] ? { operator: match[2] as '==' | '!=', right: read(match[3]!) } : {}) };
}
export function evaluate(expression: Expression, data: Record<string, unknown>): unknown {
  const read = (o: Operand): unknown => 'field' in o ? data[o.field] : o.literal;
  const left = read(expression.left);
  return expression.operator ? expression.operator === '==' ? left === read(expression.right!) : left !== read(expression.right!) : left;
}
