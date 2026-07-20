# OmniBranch Campaign Templates

Campaign Templates allow developers to define reusable blueprints for common repository tasks (e.g., "Add new REST endpoint", "Bump dependency versions").

## Defining Templates

Templates are defined in `.omnibranch/templates/`. Each template specifies:

- The required input parameters.
- The parallel work items to generate (e.g., `api-route`, `database-migration`, `unit-tests`).
- Ownership globs for conflict prediction (e.g., `api-route` owns `src/routes/**`).

## Using Templates

Currently, templates are instantiated programmatically via the Runtime API. In future releases, they will be accessible via `omnibranch campaign start --template <name>`.
