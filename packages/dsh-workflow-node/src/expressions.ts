import nunjucks from 'nunjucks'

// Nunjucks 3.2.4 exposes these APIs, but its community declarations omit them.
// Keep the version-specific AST adapter here; parsing and all evaluation belong to the library.
type Ast = { typename: string; fields: string[]; lineno: number; colno: number; [field: string]: any }
type Token = { type: string; value: string; lineno: number; colno: number }
const library = nunjucks as typeof nunjucks & {
  parser: { parse(text: string): Ast; Parser: new (tokens: unknown) => { parseExpression(): Ast; nextToken(): Token | null } }
  lexer: { lex(text: string): { in_code: boolean; nextToken(): Token | null } }
}
const environment = new nunjucks.Environment([], { autoescape: false })
type Schema = Record<string, unknown>
type Descriptor = 'string' | 'number' | 'boolean' | { type: 'object'; properties: Schema } | { type: 'array'; items: Descriptor }
export class ExpressionReferenceError extends Error {}

function inspect(root: Ast, schema: Schema): unknown {
  const globals = (environment as unknown as { globals: Record<string, unknown> }).globals
  function localBindings(node: Ast): string[] {
    if (node.typename === 'Set') return node.targets.map((target: Ast) => target.value)
    if (node.typename === 'Macro') return [node.name.value]
    if (['For', 'Caller', 'Block'].includes(node.typename)) return []
    return node.fields.flatMap(field => {
      const value = node[field]
      return Array.isArray(value) ? value.flatMap(child => child?.typename ? localBindings(child) : []) : value?.typename ? localBindings(value) : []
    })
  }
  function walk(node: Ast | null, scope: Map<string, unknown>): unknown {
    if (!node) return
    const error = (message: string): never => { throw new ExpressionReferenceError(`${message} (line ${node.lineno + 1}, column ${node.colno + 1})`) }
    switch (node.typename) {
      case 'Symbol':
        if (scope.has(node.value)) return scope.get(node.value)
        if (Object.hasOwn(schema, node.value)) return schema[node.value]
        if (Object.hasOwn(globals, node.value)) return
        return error(`Undeclared field ${node.value}`)
      case 'Literal': return ['string', 'number', 'boolean'].includes(typeof node.value) ? typeof node.value : undefined
      case 'Root': case 'NodeList': {
        const locals = localBindings(node)
        for (const child of node.children) {
          if (child.typename === 'Macro') scope.set(child.name.value, undefined)
          else walk(child, scope)
        }
        // A macro runs at its call site, which may precede or follow surrounding assignments.
        for (const child of node.children) if (child.typename === 'Macro') {
          const captured = new Map(scope)
          for (const name of locals) captured.set(name, undefined)
          walk(child, captured)
        }
        return
      }
      case 'If': {
        walk(node.cond, scope)
        const yes = new Map(scope), no = new Map(scope)
        walk(node.body, yes); walk(node.else_, no)
        for (const name of new Set([...yes.keys(), ...no.keys()])) {
          if (yes.get(name) !== scope.get(name) || no.get(name) !== scope.get(name) || !scope.has(name)) scope.set(name, undefined)
        }
        return
      }
      case 'TemplateData': return
      case 'Group': {
        const values = node.children.map((child: Ast) => walk(child, scope))
        return values.length === 1 ? values[0] : undefined
      }
      case 'Block': walk(node.body, new Map(scope)); return
      case 'LookupVal': {
        const target = walk(node.target, scope) as Descriptor | undefined
        if (node.val.typename !== 'Literal') { walk(node.val, scope); return }
        const key = node.val.value
        if (target === undefined) return
        if (typeof target === 'object' && target.type === 'object') {
          if (!Object.hasOwn(target.properties, key)) return error(`Undeclared field ${key}`)
          return target.properties[key]
        }
        if (typeof target === 'object' && target.type === 'array' && /^(0|[1-9][0-9]*)$/.test(String(key))) return target.items
        if (key === 'length' && (target === 'string' || typeof target === 'object' && target.type === 'array')) return 'number'
        const prototype = target === 'string' ? String.prototype : target === 'number' ? Number.prototype : target === 'boolean' ? Boolean.prototype : typeof target === 'object' && target.type === 'array' ? Array.prototype : undefined
        if (prototype && Object.hasOwn(prototype, key)) return
        return error(`Undeclared property ${key}`)
      }
      case 'Filter':
        environment.getFilter(node.name.value)
        walk(node.args, scope); return
      case 'Is': {
        walk(node.left, scope)
        const name = node.right.typename === 'FunCall' ? node.right.name.value : node.right.value
        ;(environment as unknown as { getTest(name: string): unknown }).getTest(name)
        if (node.right.typename === 'FunCall') walk(node.right.args, scope)
        return 'boolean'
      }
      case 'Pair': walk(node.value, scope); return
      case 'Set': {
        const value = walk(node.value ?? node.body, scope)
        for (const target of node.targets) scope.set(target.value, value)
        return
      }
      case 'For': {
        const value = walk(node.arr, scope) as Descriptor | undefined
        const inner = new Map(scope); inner.set('loop', undefined)
        if (node.name.typename === 'Symbol') inner.set(node.name.value, typeof value === 'object' && value.type === 'array' ? value.items : undefined)
        else for (const name of node.name.children) inner.set(name.value, undefined)
        walk(node.body, inner); walk(node.else_, new Map(scope)); return
      }
      case 'Macro': case 'Caller': {
        if (node.typename === 'Macro') scope.set(node.name.value, undefined)
        const inner = new Map(scope); inner.set('caller', undefined)
        for (const arg of node.args.children) {
          if (arg.typename === 'Symbol') inner.set(arg.value, undefined)
          else for (const pair of arg.children) { walk(pair.value, inner); inner.set(pair.key.value, undefined) }
        }
        walk(node.body, inner); return
      }
      case 'Include': case 'Import': case 'FromImport': case 'Extends':
      case 'AsyncEach': case 'AsyncAll': case 'IfAsync':
        throw new Error(`Unsupported template capability ${node.typename} (line ${node.lineno + 1}, column ${node.colno + 1})`)
    }
    for (const field of node.fields) {
      const value = node[field]
      if (Array.isArray(value)) { for (const child of value) if (child?.typename) walk(child, scope) }
      else if (value?.typename) walk(value, scope)
    }
    return
  }
  return walk(root, new Map())
}

export interface Expression {
  evaluate(data: Record<string, unknown>): unknown
  inspect(schema: Schema): unknown
  path?: (string | number)[]
}
function referencePath(node: Ast): (string | number)[] | undefined {
  if (node.typename === 'Group' && node.children.length === 1) return referencePath(node.children[0])
  if (node.typename === 'Symbol') return [node.value]
  if (node.typename === 'LookupVal' && node.val.typename === 'Literal') {
    const parent = referencePath(node.target)
    if (parent) return [...parent, node.val.value]
  }
}
export function compileExpression(text: string): Expression {
  const tokens = library.lexer.lex(`${text} %}`); tokens.in_code = true
  const parser = new library.parser.Parser(tokens)
  const ast = parser.parseExpression()
  if (parser.nextToken()?.type !== 'block-end' || parser.nextToken()) throw new Error('Expected a single Nunjucks expression')
  const template = new nunjucks.Template(`{% set dshExpressionResult = ${text} %}`, environment, undefined, true)
  return {
    ...(referencePath(ast) ? { path: referencePath(ast)! } : {}),
    inspect: schema => inspect(ast, schema),
    evaluate(data) {
      let result: unknown, failure: unknown
      // getExported returns set values without rendering/coercing them to text.
      ;(template as unknown as { getExported(data: object, cb: (err: unknown, exports: Record<string, unknown>) => void): void }).getExported(data, (err, exports) => { failure = err; result = exports?.dshExpressionResult })
      if (failure) throw failure
      return result
    },
  }
}
export function validateTemplate(text: string, schema: Schema): void {
  inspect(library.parser.parse(text), schema)
  new nunjucks.Template(text, environment, undefined, true)
}
export function renderTemplate(text: string, data: Record<string, unknown>): string {
  return environment.renderString(text, data)
}

// Token coordinates come from the same lexer that parses the expressions, including quoted delimiters.
export function interpolationSpans(text: string): Array<{ start: number; end: number; text: string }> {
  const lines = text.split('\n'); const offsets: number[] = []; let offset = 0
  for (const line of lines) { offsets.push(offset); offset += line.length + 1 }
  const index = (token: Token) => offsets[token.lineno]! + token.colno
  const tokens = library.lexer.lex(text); const spans = []; let start: Token | undefined
  for (let token = tokens.nextToken(); token; token = tokens.nextToken()) {
    if (token.type === 'block-start' || token.type === 'comment') throw new Error('Bash command supports expression interpolation only')
    if (token.type === 'variable-start') {
      if (token.value !== '{{') throw new Error('Bash command does not support whitespace control')
      start = token
    }
    if (token.type === 'variable-end' && start) {
      if (token.value !== '}}') throw new Error('Bash command does not support whitespace control')
      const from = index(start), end = index(token) + token.value.length
      spans.push({ start: from, end, text: text.slice(from, end) }); start = undefined
    }
  }
  return spans
}
