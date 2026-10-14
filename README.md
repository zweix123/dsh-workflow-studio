# dsh-workflow-studio

English | [简体中文](README.zh.md)

A workflow plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Define a workflow in YAML, create runs in a DSH workspace, and follow each run on a visual DAG.

Built for `@deepseek-ai/dsh@0.2.0-rc.1`. The plugin is currently installed from this repository; it is not published as a package.

> `npm install -g @deepseek-ai/dsh@0.2.0-rc.1 --registry=https://registry.npmjs.org`

## What it does

- Loads templates contributed by plugins in the active profile, with two Chinese defaults.
- Creates independent, persistent runs from template snapshots and shows their progress on a DAG canvas.
- Runs `agent` tasks in foreground conversations or background child executions, `bash` nodes in the host sandbox, and `form` nodes through user input.
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


DSH itself is not bundled with this plugin. The default bundle installs the public node registry, Studio, three node plugins, the template loader, and two Chinese templates: Matt Pocock Wayfinder (`matt-pocock-wayfinder-workflow.zh`) and [OpenSpec delivery](docs/openspec-workflow.zh.md) (`openspec-delivery.zh`). See the [node author guide](docs/node-plugin-authoring.zh.md) and the built-in node implementations. See the [template author guide](docs/template-plugin-authoring.zh.md) and [production template package](packages/dsh-workflow-template-openspec-delivery/package.json).

## Local development

`npm run dev` builds and installs the default bundle plus [node feature templates](packages/dsh-workflow-dev-templates/README.zh.md) into an isolated `.local/dsh-dev/` home, then starts the user-installed dsh on port 3081. Override launch arguments with `npm run dev -- --port 3082 --no-open`; `npm run install:dev` only installs. The default user bundle does not load development templates.

Author guides point to production implementations. Third-party integration and fault injection use dedicated test fixtures rather than separate teaching examples.

Deleting example sources does not unregister a previously installed bundle. If startup reports `cannot resolve profile bundle "@example/workflow-all-nodes"`, run `dsh plugin --profile web remove @example/workflow-all-nodes` against its original profile/home and restart the host. Remove `@example/workflow-echo` or `@acme/workflows` only if you previously installed those retired examples. Do not reinstall their dependencies.


## Create a workflow

1. Use a default template or add your own pure configuration bundle following the [author guide](docs/template-plugin-authoring.zh.md).
2. Open **Workflows** from the DSH sidebar. In **Instances**, choose a workspace, select the template, and create a run.
3. Open the run to execute ready nodes and inspect its graph. A `agent` node is completed explicitly by the user; a successful `bash` command completes automatically; a `form` node completes on valid submission.

Minimal package resource, exported and declared by a bundle:

```yaml
id: hello
name: Hello workflow
type: dag
dag:
  - id: draft
    type: node
    node_kind: agent
    prompt: Write a short draft.
```

Templates are read only when their declaration loads or reloads. Page refreshes do not reread YAML; existing runs retain their snapshots. The old DSH home template directory is no longer discovered or populated.

## Current limitation

`agent` consumes declared inputs through `{{ name }}` / `{{ object.field }}`. Its default foreground mode keeps an ordinary conversation; Complete hands declared outputs to a native fork using `structured_output`. Background mode executes in a read-only native child record and saves a result awaiting Complete. With no outputs, foreground completion skips the handoff; background still runs the task. Failures and interrupted attempts require an explicit retry, and earlier records remain available. `bash` uses the same references as independently escaped Shell arguments. With output declarations, its complete stdout must be a valid JSON object matching the output contract; logs belong on stderr. Without output declarations it completes with `{}` and keeps stdout as logs. `form` submits real user data. Workshop templates have no external root input: use an entry form to collect it. See the [DAG syntax guide (Chinese)](docs/dag-syntax.zh.md).

New templates use `node_kind: agent` and optional `mode: foreground | background` (default `foreground`). This change provides no compatibility or migration for old configurations or instances; existing data is retained.

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
