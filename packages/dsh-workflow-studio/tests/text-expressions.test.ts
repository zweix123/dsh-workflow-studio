import test from 'node:test'
import assert from 'node:assert/strict'
import { agentNode } from '../../dsh-workflow-node-agent/src/server.js'
import { bashNode } from '../../dsh-workflow-node-bash/src/server.js'
import type { NodeContext, NodeDefinition } from '../../dsh-workflow-node/src/index.js'

test('Agent renders library control flow, local variables, raw data and explicit JSON through its execution interface', async () => {
  const definition: NodeDefinition = { id: 'task', type: 'node', input_schema: { title: 'string', rows: { type: 'array', items: 'string' } },
    prompt: '{% set label = title | upper %}{% macro wrap(x) %}[{{ x }}]{% endmacro %}{% if rows is defined %}{% for row in rows %}{{ wrap(row) }}{% endfor %}{% endif %}{{ label }}|{{ rows }}|{{ rows | dump }}|{% raw %}{{ literal }}{% endraw %}{# ignored #}' }
  let prompt = ''
  agentNode.validate(definition)
  const context: NodeContext = { definition, input: { title: '<& {{ untouched }}', rows: ['a', 'b'] }, workspaceId: 'w',
    services: { sessionController: { create: async () => {}, prompt: async (request: any) => { prompt = request.content[0].text } } } as any,
    validateOutput: value => value as any, save: async () => {} }
  await agentNode.action(context, 'start', {}).run!()
  assert.equal(prompt, '[a][b]<& {{ UNTOUCHED }}|a,b|["a","b"]|{{ literal }}')
})

test('Bash passes each rendered value as one real shell argument and does not render accepted results again', async () => {
  const { execFileSync } = await import('node:child_process')
  const definition: NodeDefinition = { id: 'shell', type: 'node', input_schema: { value: 'string' }, command: "printf '%s\\n' {{ value | replace('}}', '!') }} {{ value | default('') }}" }
  bashNode.validate(definition)
  const value = "a }} b\n'\"; $(printf INJECTION) & <tag>"
  let output = ''
  const context: NodeContext = { definition, input: { value }, workspaceId: 'w',
    services: { workspaceRegistry: { get: () => ({ path: '/tmp' }) }, sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
      shell: { sandboxMode: 'workspace-write', resolve: (request: any) => request, execute: async (request: any) => {
        output = execFileSync('/bin/bash', ['-c', request.command], { encoding: 'utf8' })
        return { result: async () => ({ exitCode: 0, stdout: { text: output }, stderr: { text: '' }, sandbox: { mode: 'workspace-write' } }) }
      } } } as any, validateOutput: value => value as any, save: async () => {} }
  assert.equal((await bashNode.action(context, 'start', {}).run!()).status, 'succeeded')
  assert.equal(output, "a ! b\n'\"; $(printf INJECTION) & <tag>\n" + value + '\n')
  context.definition.command = '{{ 1 / 0 | unknownFilter }}'
  context.fact = { kind: 'bash', status: 'succeeded', output: {} }
  assert.deepEqual(bashNode.action(context, 'start', {}), { fact: context.fact })
})

test('node validation checks known paths in all branches while accepting scoped names and dynamic results', () => {
  const definition: NodeDefinition = { id: 'validate', type: 'node', input_schema: { selected: 'string', rows: { type: 'array', items: { type: 'object', properties: { title: 'string' } } } }, prompt: '' }
  for (const prompt of [
    '{% if false %}{{ rows[0].missing }}{% endif %}',
    '{% for row in rows %}{{ row.missing }}{% endfor %}',
    '{{ rows[selected].title ~ missing }}',
    '{{ rows | unknown_filter }}', '{{ selected is unknown_test }}',
    '{% include "some-file" %}', '{% import "some-file" as tools %}', '{% extends "some-file" %}',
  ]) assert.throws(() => agentNode.validate({ ...definition, prompt }), /Node validate: prompt:/)
  for (const prompt of [
    '{% set alias = rows %}{% for row in alias %}{{ row.title }}:{{ loop.index }}{% endfor %}',
    '{% macro label(value="default") %}{{ value }}{% endmacro %}{{ label() }}',
    '{% macro m(x,y=x) %}{{ y }}{% endmacro %}{{ m("ok") }}',
    '{% macro m() %}{{ later }}{% endmacro %}{% set later = selected %}{{ m() }}',
    '{{ rows[selected].anything | default("empty") }}',
    '{{ range(2) | join(",") }}{% raw %}{{ not_data }}{% endraw %}',
    '{% set text %}{{ selected }}{% endset %}{{ text }}',
    '{% block content %}{{ selected }}{% endblock %}',
  ]) assert.doesNotThrow(() => agentNode.validate({ ...definition, prompt }), prompt)
})


test('template locals preserve conditional uncertainty and forward macro calls', async () => {
  const definition: NodeDefinition = { id: 'locals', type: 'node', input_schema: { flag: 'boolean', obj: { type: 'object', properties: { name: 'string' } }, text: 'string' }, prompt: '{% if flag %}{% set alias = obj %}{% else %}{% set alias = text %}{% endif %}{{ alias.name }}{% macro a() %}{{ b() }}{% endmacro %}{% macro b() %}ok{% endmacro %}{{ a() }}' }
  agentNode.validate(definition)
  let prompt = ''
  const context: NodeContext = { definition, input: { flag: true, obj: { name: 'value' }, text: 'other' }, workspaceId: 'w',
    services: { sessionController: { create: async () => {}, prompt: async (request: any) => { prompt = request.content[0].text } } } as any,
    validateOutput: value => value as any, save: async () => {} }
  await agentNode.action(context, 'start', {}).run!()
  assert.equal(prompt, 'valueok')
})

test('new Agent and Bash attempts render again while accepted or started work is reused', async t => {
  let draws = 0
  t.mock.method(Math, 'random', () => ++draws % 2 ? 0 : 0.99)
  const prompts: string[] = []
  const definition: NodeDefinition = { id: 'retry-agent', type: 'node', prompt: '{{ ["first", "second"] | random }}' }
  agentNode.validate(definition)
  const context: NodeContext = { definition, input: {}, workspaceId: 'w',
    services: { sessionController: { create: async () => {}, prompt: async (request: any) => { prompts.push(request.content[0].text); if (prompts.length === 1) throw new Error('not accepted') } } } as any,
    validateOutput: value => value as any, save: async () => {} }
  const first = agentNode.action(context, 'start', {})
  await assert.rejects(first.run!, /not accepted/)
  context.fact = { ...first.fact, status: 'failed' }
  context.fact = await agentNode.action(context, 'start', {}).run!()
  assert.deepEqual(prompts, ['first', 'second'])
  assert.equal(draws, 2)
  assert.equal(agentNode.action(context, 'start', {}).run, undefined)
  assert.equal(draws, 2)
  const commands: string[] = []
  context.definition = { id: 'retry-bash', type: 'node', command: "printf '%s' {{ ['first', 'second'] | random }}" }
  context.fact = undefined
  bashNode.validate(context.definition)
  context.services = { workspaceRegistry: { get: () => ({ path: '/tmp' }) }, sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) }, shell: {
    sandboxMode: 'workspace-write', resolve: (request: any) => request, execute: async (request: any) => {
      commands.push(request.command)
      return { result: async () => ({ exitCode: commands.length === 1 ? 1 : 0, stdout: { text: '' }, stderr: { text: '' }, sandbox: { mode: 'workspace-write' } }) }
    },
  } } as any
  context.fact = await bashNode.action(context, 'start', {}).run!()
  assert.equal(context.fact.status, 'failed')
  context.fact = await bashNode.action(context, 'start', {}).run!()
  assert.equal(context.fact.status, 'succeeded')
  assert.deepEqual(commands, ["printf '%s' 'first'", "printf '%s' 'second'"])
  assert.equal(draws, 4)
  assert.equal(bashNode.action(context, 'start', {}).run, undefined)
  assert.equal(draws, 4)
})

test('text conversion follows Nunjucks, including objects, missing inputs and property names containing delimiters', async () => {
  const definition: NodeDefinition = { id: 'values', type: 'node', input_schema: { payload: { type: 'object', properties: { '}}': 'string' } }, absent: 'string', zero: 'number', off: 'boolean' },
    prompt: '{{ payload }}|{{ payload | dump }}|{{ payload["}}"] }}|{{ absent }}|{{ zero }}|{{ off }}|{{ absent is defined }}' }
  agentNode.validate(definition)
  let prompt = ''
  const context: NodeContext = { definition, input: { payload: { '}}': '<& {{ data }}' }, zero: 0, off: false }, workspaceId: 'w',
    services: { sessionController: { create: async () => {}, prompt: async (request: any) => { prompt = request.content[0].text } } } as any,
    validateOutput: value => value as any, save: async () => {} }
  await agentNode.action(context, 'start', {}).run!()
  assert.equal(prompt, '[object Object]|{"}}":"<& {{ data }}"}|<& {{ data }}||0|false|false')
  assert.doesNotThrow(() => bashNode.validate({ ...definition, command: 'printf %s {{ payload["}}"] }}' }))
  for (const command of [
    '{{ payload["}}"] }}', 'echo "{{ payload["}}"] }}"', 'echo prefix{{ payload["}}"] }}',
    'echo # {{ payload["}}"] }}', 'echo $(printf %s {{ payload["}}"] }})',
    'cat <<EOF\n{{ payload["}}"] }}\nEOF', '{% if off %}echo x{% endif %}', 'echo {{- zero }}',
  ]) assert.throws(() => bashNode.validate({ ...definition, command }), /Node values: command:/)
})

test('later local declarations cannot legalize an earlier undeclared business read', () => {
  for (const prompt of [
    '{{ secret.value }}{% set secret = "local" %}',
    '{% set secret = secret.value %}{{ secret }}',
    '{% if false %}{{ secret.value }}{% endif %}{% set secret = "local" %}',
    '{{ hidden.value }}{% macro hidden() %}local{% endmacro %}',
  ]) assert.throws(() => agentNode.validate({ id: 'scope', type: 'node', prompt }), /Undeclared field/)
})
