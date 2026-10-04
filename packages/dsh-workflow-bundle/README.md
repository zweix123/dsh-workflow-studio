# Default workflow bundle

Add this local directory after building the repository. Its ordinary dsh patch installs the public node registry, bash/session_agent/form node plugins, and Studio. It does not contain or install the dsh CLI.

```sh
dsh plugin --profile web add ./packages/dsh-workflow-bundle
```

The template loader and common distribution of the six bundled templates are the next implementation stage. Studio currently retains its existing local template discovery/copy behavior. See [the node author guide](../../docs/node-plugin-authoring.zh.md) and [the third-party example](../../examples/echo-node/README.zh.md).
