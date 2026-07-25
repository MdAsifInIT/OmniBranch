# ADR-0013: Work-Item Dependency Cycle Detection at Configuration Load Time

**Status:** Accepted

## Context
Invalid campaign configurations with circular dependencies between work items cause scheduler deadlocks or infinite loops if detected only during runtime execution.

## Decision
Perform topological graph validation and cycle detection during initial configuration parsing and loading before writing campaign events or enqueuing work items. If a cycle is detected, configuration validation fails immediately with source location details.

## Consequences
Prevents malformed campaign execution upfront and enforces strict DAG validation invariants before any campaign mutations take effect.
