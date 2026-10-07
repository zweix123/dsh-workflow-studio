# Default workflow bundle

Add this local directory after building the repository. Its ordinary dsh patch installs the public node registry, bash/session_agent/form node plugins, and Studio. It does not contain or install the dsh CLI.

```sh
dsh plugin --profile web add ./packages/dsh-workflow-bundle
```

The bundle also installs the template loader and only the Chinese Matt Pocock Wayfinder template (`matt-pocock-wayfinder-workflow.zh`). See [the template author guide](../../docs/template-plugin-authoring.zh.md), [the node author guide](../../docs/node-plugin-authoring.zh.md), and [the third-party example](../../examples/echo-node/README.zh.md).
