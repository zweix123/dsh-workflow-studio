# Default workflow bundle

Add this local directory after building the repository. Its ordinary dsh patch installs the public node registry, bash/session_agent/form node plugins, and Studio. It does not contain or install the dsh CLI.

```sh
dsh plugin --profile web add ./packages/dsh-workflow-bundle
```

The bundle also installs the template loader and two Chinese templates: Matt Pocock Wayfinder (`matt-pocock-wayfinder-workflow.zh`) and [OpenSpec delivery](../../docs/openspec-workflow.zh.md) (`openspec-delivery.zh`). See [the template author guide](../../docs/template-plugin-authoring.zh.md), [the node author guide](../../docs/node-plugin-authoring.zh.md), and [the third-party example](../../examples/echo-node/README.zh.md).

Template packages declare their loader and node package versions in `peerDependencies`. This bundle supplies the packages through `dependencies` and activates nodes and template loader declarations in `cordis.patch.yml`. It loads template resources directly rather than also applying each template package's bundle patch. Keep each node and template declaration enabled only once in a profile; package dependencies alone do not activate plugins.
