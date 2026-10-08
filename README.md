# dsh-workflow-studio

English | [简体中文](README.zh.md)

A workflow plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Define a workflow in YAML, create runs in a DSH workspace, and follow each run on a visual DAG.

Built for `@deepseek-ai/dsh@0.2.0-rc.1`. The plugin is currently installed from this repository; it is not published as a package.

> `npm install -g @deepseek-ai/dsh@0.2.0-rc.1 --registry=https://registry.npmjs.org`

## What it does

- Loads templates contributed by plugins in the active profile, with six English/Chinese defaults.
- Creates independent, persistent runs from template snapshots and shows their progress on a DAG canvas.
- Runs `session_agent` nodes in DSH conversations, `bash` nodes in the host sandbox, and `form` nodes through user input.
- Supports dependencies, conditional edges, item expansion, nested DAGs, and recursive DAG references. See the [DAG syntax guide (Chinese)](docs/dag-syntax.zh.md) for the full rules.

## Install from source

Install DSH `0.2.0-rc.1` on your machine first. Node.js `^22.19.0 || >=24.0.0` is required to build this repository.

```sh
git clone https://github.com/zweix123/dsh-workflow-studio.git
cd dsh-workflow-studio
npm ci --registry=https://registry.npmjs.org
npm run build
dsh plugin --profile web add ./packages/dsh-workflow-bundle
dsh web
```

If this profile previously installed `packages/dsh-workflow-studio` directly, stop its host, remove the old plugin entry with `dsh plugin --profile web remove dsh-workflow-studio`, add the default bundle above, then restart. Use the same profile for both commands. Installing Studio alone leaves its node registry dependencies missing; the Web page can report `waiting for service: workflowNodeViews`. This changes plugin assembly, not instance files.


DSH itself is not bundled with this plugin. The default bundle installs the public node registry, Studio, three node plugins, the template loader, and the Chinese Matt Pocock Wayfinder template (`matt-pocock-wayfinder-workflow.zh`). See the [node author guide](docs/node-plugin-authoring.zh.md) and [minimal external example](examples/echo-node/README.zh.md). See the [template author guide](docs/template-plugin-authoring.zh.md) and [pure configuration example](examples/review-templates/README.zh.md).

## Create a workflow

1. Use a default template or add your own pure configuration bundle following the [author guide](docs/template-plugin-authoring.zh.md).
2. Open **Workflows** from the DSH sidebar. In **Instances**, choose a workspace, select the template, and create a run.
3. Open the run to execute ready nodes and inspect its graph. A `session_agent` node is completed explicitly by the user; a successful `bash` command completes automatically; a `form` node completes on valid submission.

Minimal package resource, exported and declared by a bundle:

```yaml
id: hello
name: Hello workflow
type: dag
dag:
  - id: draft
    type: node
    node_kind: session_agent
    prompt: Write a short draft.
```

Templates are read only when their declaration loads or reloads. Page refreshes do not reread YAML; existing runs retain their snapshots. The old DSH home template directory is no longer discovered or populated.

## Current limitation

`session_agent` consumes declared inputs through `{{ name }}` / `{{ object.field }}` in its prompt and completes with `{}`; it cannot declare business outputs. `bash` uses the same references as independently escaped Shell arguments. With output declarations, its complete stdout must be a valid JSON object matching the output contract; logs belong on stderr. Without output declarations it completes with `{}` and keeps stdout as logs. `form` submits real user data. Workshop templates have no external root input: use an entry form to collect it. See the [DAG syntax guide (Chinese)](docs/dag-syntax.zh.md).

The former `chat` kind is now `session_agent`. Update custom templates to the new kind and recreate existing runs that retain the old template snapshot.

## Development

```sh
npm run check
```

This runs type checking, the build, and tests. Product specifications live in [`docs/specs/`](docs/specs/), and repository conventions are in [`AGENTS.md`](AGENTS.md).

Run the saved browser regression tests against an isolated real DSH host:

```sh
npm run test:e2e
```

Requires your installed DSH `0.2.0-rc.1`, pnpm, and Node `^22.22.3 || >=24.8.0`. Tests use deterministic actions and assertions without a model. See [E2E setup and coverage](e2e/README.md).

```sh
dsh plugin --profile web remove dsh-workflow-bundle
```
