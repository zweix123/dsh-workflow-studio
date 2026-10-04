# Template browser acceptance fixture

Add this pure configuration bundle to an isolated web profile after the default bundle and `examples/review-templates`. It deliberately contributes:

- a duplicate `acme-review` (both declarations must become unavailable),
- a missing root name and broken YAML (source diagnostics),
- a missing node kind (kept visible),
- a nonblocking layout warning (still usable).

Use the native plugin page to disable the duplicate component and restore the remaining `acme-review`. Do not install this fixture into a daily profile. The second-stage acceptance record describes the expected/actual results.
