import type { NodeData, NodeDefinition, NodeValue } from './index.js'

const reference = /\{\{\s*([\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*)\s*\}\}/gu

export function validateTextTemplate(node: NodeDefinition, field: 'prompt' | 'command'): void {
  const text = node[field] as string
  const remainder = text.replace(reference, (_match, path: string) => {
    let schema: NodeValue = node.input_schema ?? {}
    for (const key of path.split('.')) {
      if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !Object.hasOwn(schema, key)) throw new Error(`Node ${node.id}: undeclared input reference ${path}`)
      const type: NodeValue | undefined = schema[key]
      schema = type && typeof type === 'object' && !Array.isArray(type) && type.type === 'object' ? type.properties! : null
    }
    return ''
  })
  if (/{{|}}|{%|%}|{#|#}/.test(remainder)) throw new Error(`Node ${node.id}: unsupported ${field} template syntax`)
  if (field === 'command') validateShellParameters(node.id, text)
}

function validateShellParameters(id: string, text: string): void {
  let quote = '', word = '', escaped = false, comment = false, substitution = 0, parameter = 0, heredoc = false, needsCommand = true, redirect = false
  const heredocs: Array<{ delimiter: string; stripTabs: boolean }> = []
  const invalid = () => { throw new Error(`Node ${id}: command references must be independent unquoted data arguments`) }
  const finishWord = () => {
    // ponytail: require literal command names; use a Shell parser if dynamic names are needed.
    if (word.replaceAll('\\\n', '') && !redirect && !/[$`*?\[]/.test(word) && !/^(?:if|then|elif|else|while|until|do|time|coproc|!|\w+=.*|-.*)$/.test(word)) needsCommand = false
    if (word) redirect = false
    word = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (text.startsWith('{{', i)) {
      const end = text.indexOf('}}', i) + 2
      if (quote || escaped || comment || substitution || parameter || heredoc || needsCommand || word || !/[ \t\n]/.test(text[i - 1] ?? '') || (end < text.length && !/[ \t\n;|&<>)]/.test(text[end]!))) invalid()
      word = 'argument'; i = end - 1; continue
    }
    if (escaped) { escaped = false; word += char; continue }
    if (comment) { if (char === '\n') { comment = false; needsCommand = true } else continue }
    if (char === '\\' && quote !== "'") { escaped = true; word += char; continue }
    if (quote) { if (char === quote) quote = ''; word += char; continue }
    if (char === "'" || char === '"' || char === '`') { quote = char; word += char; continue }
    if (char === '#' && !word) { comment = true; continue }
    if (text.startsWith('$(', i)) { substitution++; word += '$('; i++; continue }
    if (substitution) { if (char === '(') substitution++; if (char === ')') substitution--; word += char; continue }
    if (text.startsWith('${', i)) { parameter++; word += '${'; i++; continue }
    if (parameter) { if (char === '}') parameter--; word += char; continue }
    if (char === '{' && !word && /[ \t\n]/.test(text[i + 1] ?? '')) { needsCommand = true; continue }
    if (/[<>]/.test(char) && /^\d+$/.test(word)) word = ''
    if (text.startsWith('<<', i)) {
      const match = /^<<(-?)[ \t]*(?:'([^']+)'|"([^"$`\\]+)"|([^ \t\n;|&<>()'"$`\\]+))(?=[ \t\n;|&]|$)/.exec(text.slice(i))
      if (!match) heredoc = true
      else { heredocs.push({ delimiter: (match[2] ?? match[3] ?? match[4])!, stripTabs: match[1] === '-' }); i += match[0].length - 1; continue }
    }
    if (/[ \t\n;|&()<>]/.test(char)) {
      finishWord()
      if (/[<>]/.test(char)) redirect = true
      if (/[;|&()\n]/.test(char)) { needsCommand = true; redirect = false }
      if (char === '\n') while (heredocs.length) {
        const next = heredocs.shift()!
        while (i + 1 < text.length) {
          const end = text.indexOf('\n', i + 1)
          const line = text.slice(i + 1, end === -1 ? text.length : end)
          if (line.includes('{{')) invalid()
          i = end === -1 ? text.length : end
          if ((next.stripTabs ? line.replace(/^\t+/, '') : line) === next.delimiter) break
        }
      }
    } else word += char
  }
}

export function renderTextTemplate(text: string, input: NodeData, shell = false): string {
  return text.replace(reference, (_match, path: string) => {
    let value: NodeValue | undefined = input
    for (const key of path.split('.')) value = value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, key) ? value[key] : undefined
    const result = value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value)
    return shell ? `'${result.replaceAll("'", "'\\''")}'` : result
  })
}
