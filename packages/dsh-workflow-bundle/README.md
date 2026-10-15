# Default workflow bundle

Add this local directory after building the repository. Its ordinary dsh patch installs the public node registry, bash/agent/form node plugins, and Studio. It does not contain or install the dsh CLI.

```sh
dsh plugin --profile web add ./packages/dsh-workflow-bundle
```

The bundle also installs the template loader and two Chinese templates: Matt Pocock Wayfinder (`matt-pocock-wayfinder-workflow.zh`) and OpenSpec change (`openspec-change.zh`). See [the template author guide](../../docs/template-plugin-authoring.zh.md), [the node author guide](../../docs/node-plugin-authoring.zh.md), and their links to production implementations.

Template packages declare their loader and node package versions in `peerDependencies`. This bundle supplies the packages through `dependencies` and activates nodes and template loader declarations in `cordis.patch.yml`. It loads template resources directly rather than also applying each template package's bundle patch. Keep each node and template declaration enabled only once in a profile; package dependencies alone do not activate plugins.

Development adds [dsh-workflow-dev-templates](../dsh-workflow-dev-templates/README.zh.md) separately. This default bundle neither depends on nor loads development templates. Use `npm run dev` for an isolated development home; `npm run install:local` continues to install only this default bundle.
