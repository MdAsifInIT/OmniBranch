# ADR-0015: Semantic Caching for AI Engine Requests

**Status:** Accepted

## Context
Repeated AI engine requests with identical or semantically equivalent prompts increase latency and API token costs. However, caching dynamic or non-deterministic queries could produce inaccurate or stale execution results.

## Decision
Implement a semantic caching layer for AI engine adapters. Hash prompt structures, input context, and intent definitions to store verified execution outputs. Automatically bypass cache lookups for non-deterministic intents (e.g. ambient environment reads, unseeded random outputs, or live timestamps). Track cache hit/miss rates in telemetry.

## Consequences
Dramatically reduces token cost and response latency for deterministic tasks while preserving correctness by bypassing non-deterministic requests.
