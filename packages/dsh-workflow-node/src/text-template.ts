import type { NodeData, NodeDefinition } from './index.js'
import { validateTemplate, renderTemplate, interpolationSpans } from './expressions.js'

export function validateTextTemplate(node: NodeDefinition, field: 'prompt' | 'command'): void {
  try {
    const text = node[field] as string
    validateTemplate(text, node.input_schema ?? {})
    if (field === 'command') validateShellParameters(node.id, text, interpolationSpans(text))
  } catch (cause) { throw new Error(`Node ${node.id}: ${field}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }) }
}

function validateShellParameters(id: string, text: string, spans: ReturnType<typeof interpolationSpans>): void {
  const ends = new Map(spans.map(span => [span.start, span.end]))
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
    if (ends.has(i)) {
      const end = ends.get(i)!
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
  if (!shell) return renderTemplate(text, input)
  const spans = interpolationSpans(text)
  let result = '', offset = 0
  for (const span of spans) {
    const value = renderTemplate(span.text, input)
    result += text.slice(offset, span.start) + `'${value.replaceAll("'", "'\\''")}'`
    offset = span.end
  }
  return result + text.slice(offset)
}
