# dsh-workflow-studio

English | [简体中文](README.zh.md)

A workflow plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Define a workflow in YAML, create runs in a DSH workspace, and follow each run on a visual DAG.

Built for `@deepseek-ai/dsh@0.2.0-rc.1`. The plugin is currently installed from this repository; it is not published as a package.

> `npm install -g @deepseek-ai/dsh@0.2.0-rc.1 --registry=https://registry.npmjs.org`

## What it does

- Loads workflow templates from the local DSH home directory, with three bundled examples.
- Creates independent, persistent runs from template snapshots and shows their progress on a DAG canvas.
- Runs `chat` nodes in DSH conversations, `bash` nodes in the host sandbox, and `form` nodes through user input.
- Supports dependencies, conditional edges, item expansion, nested DAGs, and recursive DAG references. See the [DAG syntax guide (Chinese)](docs/dag-syntax.zh.md) for the full rules.

## Install from source

Install DSH `0.2.0-rc.1` on your machine first. Node.js `^22.19.0 || >=24.0.0` is required to build this repository.

```sh
git clone https://github.com/zweix123/dsh-workflow-studio.git
cd dsh-workflow-studio
npm ci --registry=https://registry.npmjs.org
npm run build
dsh plugin --profile web add ./packages/dsh-workflow-studio
dsh web
```

DSH itself is not bundled with this plugin.

## Create a workflow

1. Add a `workflow.yaml` under `<DSH home>/dsh-workflow-studio/templates/<template-id>/`. The default DSH home is `~/.dsh`.
2. Open **Workflow Studio** from the DSH sidebar. In **Instances**, choose a workspace, select the template, and create a run.
3. Open the run to execute ready nodes and inspect its graph. A `chat` node is completed explicitly by the user; a successful `bash` command completes automatically; a `form` node completes on valid submission.

Minimal template at `~/.dsh/dsh-workflow-studio/templates/hello/workflow.yaml`:

```yaml
id: hello
type: dag
dag:
  - id: draft
    type: node
    node_kind: chat
    prompt: Write a short draft.
```

Templates are files, not yet editable in the plugin UI. The bundled examples are copied into the template directory when the plugin starts.

## Current limitation

`chat` and `bash` execute real work, but their declared DAG outputs are currently placeholder values. Their conversation text and command output do not flow into downstream nodes or drive `if` / `for` expressions. `form` submits real values to the DAG. See the [DAG syntax guide (Chinese)](docs/dag-syntax.zh.md) before relying on data-dependent branches.

## Development

```sh
npm run check
```

This runs type checking, the build, and tests. Product specifications live in [`docs/specs/`](docs/specs/), and repository conventions are in [`AGENTS.md`](AGENTS.md).

```sh
dsh plugin --profile web remove dsh-workflow-studio
```
