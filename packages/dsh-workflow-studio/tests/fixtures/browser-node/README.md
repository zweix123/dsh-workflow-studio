# Browser acceptance fixture

Only install in the temporary rc.1 profile used by `dsh-browser-e2e`.
Add this directory as an ordinary dsh bundle and copy `workflow.yaml` to that temporary Studio template directory. This is a diagnostic fixture, not a default node or template distributor.

Create a workflow instance. The two client actions deliberately throw (one synchronously and one asynchronously). `Crash probe panel` deliberately throws during rendering. Reload the page to reset that local error boundary.

Enter `Probe draft`, then click `Unload optional UI`. It disposes a Cordis child plugin that owns only the optional browser registration. The server contribution remains installed: the draft must be cleared with a notice, client actions disappear, common details remain, and `Run probe` can still save and complete. Reload to register the optional browser capability again; saved output must remain and the draft must be empty.

`builtins.workflow.yaml` is the companion form → bash → form fixture, with separate draft and session nodes. Copy it as another temporary template to reproduce the built-in scenarios in the acceptance record.
