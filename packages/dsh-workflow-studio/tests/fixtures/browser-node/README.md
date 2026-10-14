# Browser acceptance fixture

Only install in the temporary rc.1 profile used by `dsh-browser-e2e`. This ordinary bundle registers its own public node and template from `workflow.yaml`; it is not a default distributor.

`Run probe` occupies position 1 and saves a successful result through the server contract. Position 2 stays empty. `Fail synchronously` occupies position 3 and checks the public client action error feedback. Details show read-only facts. `e2e/workflows/node-actions.e2e.ts` verifies the empty position, host icon and text, keyboard actions and independent inspection.

Rendering errors, asynchronous handler errors, frontend unload and draft lifetime are covered separately through the existing component/registry test entry. The previous diagnostic draft editor and self-unload controls in the detail panel were removed when details became read-only.

`builtins.workflow.yaml` remains a companion manual fixture; Form input now opens from the card in the plugin-owned Modal.
