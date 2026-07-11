# Contributing

Use Node 22 and the pinned pnpm release. Run `pnpm verify` before proposing a change. New adapters
must implement the shared contract, declare unknown capabilities explicitly, include hostile-input
tests, and retain guided-mode fallback. Breaking configuration, event, adapter, CLI, or report
changes require an ADR and migration note.
