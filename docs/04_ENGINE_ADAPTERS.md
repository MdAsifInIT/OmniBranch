# Engine Adapters

## Purpose

OmniBranch runs work through engine adapters rather than coupling orchestration logic to any single provider, user interface, or process model. This document defines the required adapter contract for supported engines and the compatibility expectations for:

- Codex
- Claude Code
- OpenCode
- Antigravity CLI
- Antigravity IDE

The core contract in this document is normative. Engine-specific command examples are illustrative only and must not be treated as required invocation syntax.

## Design Goals

- Keep orchestration provider-neutral and capability-driven.
- Distinguish required adapter behavior from engine-specific affordances.
- Preserve deterministic OmniBranch policy decisions outside the engine.
- Support both fully autonomous execution and constrained guided mode.
- Prefer graceful degradation over partial undefined behavior.

## Adapter Model

An adapter is the boundary layer between OmniBranch and an execution engine. The adapter owns discovery, launch, supervision, cancellation, resume, and result normalization for one engine family.

OmniBranch requires every adapter to expose the same logical surface:

| Contract area              | Required outcome                                                        |
| -------------------------- | ----------------------------------------------------------------------- |
| Identity                   | Stable adapter id, engine family, engine surface, and version facts     |
| Capability discovery       | Machine-readable feature map with explicit unsupported states           |
| Assignment materialization | Convert an OmniBranch assignment envelope into an engine-native request |
| Process lifecycle          | Start, monitor, detect exit, collect artifacts, and classify failures   |
| Structured results         | Return a normalized completion record regardless of engine format       |
| Resume model               | Re-attach to an existing engine session when supported                  |
| Cancellation               | Stop or request stop using the least destructive supported mechanism    |
| Guided fallback            | Offer a constrained operator-mediated path when autonomy is unavailable |

## Capability-Driven Interface

Adapters must declare capabilities instead of relying on hard-coded engine names. OmniBranch makes scheduling and policy decisions from capabilities first and brand names second.

### Required Capability Fields

| Field                 | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `interactive_session` | Engine supports a long-lived conversational session                 |
| `noninteractive_run`  | Engine supports one-shot task execution                             |
| `workspace_read`      | Engine can inspect local repository files                           |
| `workspace_write`     | Engine can modify local repository files                            |
| `command_execution`   | Engine can run local commands or tool actions                       |
| `structured_result`   | Engine can emit machine-parseable completion data directly          |
| `artifact_collection` | Engine can expose logs, patches, summaries, or screenshots          |
| `session_resume`      | Engine can resume an existing session or thread                     |
| `cancellation`        | Engine supports explicit cancellation or interruption               |
| `skills`              | Engine supports reusable instructions, tools, or plugins            |
| `policy_controls`     | Engine exposes sandbox, approval, or permission controls            |
| `version_probe`       | Adapter can determine engine version and surface facts              |
| `guided_mode`         | Adapter can run in a user-mediated mode when autonomy is restricted |

### Capability States

Each capability must be reported as one of:

- `native`: directly supported by the engine
- `adapted`: achievable through adapter mediation
- `unsupported`: unavailable
- `unknown`: not yet verified for the installed version

Adapters must never silently treat `unknown` as `native`.

## Process Lifecycle

OmniBranch expects a stable execution lifecycle even when engine behavior differs internally.

### 1. Probe

Before assignment launch, the adapter must:

- detect whether the engine executable or application is present
- determine the engine family and surface, such as CLI or IDE
- collect version information when available
- collect capability facts and unknowns
- fail closed if mandatory policy controls are missing

### 2. Prepare

The adapter must prepare a launch plan that includes:

- working directory
- assignment envelope
- materialized skill inputs
- runtime policy constraints
- lease identifier for concurrency control
- expected result collection path or retrieval method

### 3. Launch

The adapter must start the engine using the least privileged supported surface. Launch may be:

- attached interactive
- detached background
- IDE handoff
- guided operator prompt

The adapter must retain a stable run identifier that OmniBranch can use for monitoring and resume.

### 4. Supervise

During execution, the adapter must:

- monitor process or session liveness
- detect idle, blocked, cancelled, failed, and completed states
- collect incremental logs or status messages when available
- enforce OmniBranch timeouts, lease expiry, and policy interrupts

### 5. Collect

On exit or checkpoint, the adapter must normalize:

- exit status
- summary text
- changed-file claims
- artifacts
- warnings
- approval requests
- final disposition

### 6. Finalize

The adapter must release temporary state, detach observers, and preserve evidence required for resume or audit.

## Structured Results

Each adapter must return a normalized result object, even if the engine only produces plain text. OmniBranch depends on semantic fields, not raw terminal output.

### Required Result Fields

| Field                 | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `run_id`              | OmniBranch run identifier                                                    |
| `adapter_id`          | Adapter implementation identifier                                            |
| `engine_family`       | Codex, Claude Code, OpenCode, Antigravity                                    |
| `engine_surface`      | CLI, desktop, IDE, or browser-mediated                                       |
| `engine_version`      | Probed version or `unknown`                                                  |
| `status`              | `completed`, `partial`, `blocked`, `cancelled`, `failed`, or `policy_denied` |
| `summary`             | Human-readable completion summary                                            |
| `assignment_echo`     | Normalized assignment metadata used for the run                              |
| `artifacts`           | Collected logs, transcripts, diffs, screenshots, or references               |
| `change_claims`       | Engine-reported or adapter-derived file change claims                        |
| `approvals_requested` | Actions that required user or policy approval                                |
| `warnings`            | Non-fatal execution or compatibility warnings                                |
| `timestamps`          | Start, last activity, end, and duration facts                                |

### Result Quality Rules

- Adapters must separate engine assertions from adapter-derived observations.
- Adapters must preserve unknowns rather than inventing precise values.
- Raw transcripts may be retained as artifacts, but OmniBranch decisions must use normalized fields.
- Partial results are valid and must not be collapsed into generic failure when useful evidence exists.

## Prompt and Assignment Envelope

OmniBranch must hand every adapter the same assignment envelope. The adapter is responsible for safe translation into engine-native prompts, tasks, or UI payloads.

### Required Envelope Sections

| Section     | Required content                                                               |
| ----------- | ------------------------------------------------------------------------------ |
| Objective   | The requested outcome and completion criteria                                  |
| Scope       | Allowed edit paths, forbidden paths, repository bounds, and write permissions  |
| Constraints | Policy limits, prohibited actions, sandbox expectations, and environment rules |
| Context     | Relevant repository, branch, ticket, or prior-run facts                        |
| Validation  | Required checks, evidence expectations, and completion format                  |
| Escalation  | What to do when blocked, missing capability, or facing out-of-scope work       |
| Lease       | Ownership token and expiry facts for concurrency control                       |

### Translation Rules

- The adapter must preserve explicit scope and forbidden-path instructions verbatim in meaning.
- The adapter may reorder sections to suit the engine, but must not drop policy constraints.
- The adapter must mark illustrative helper text as non-authoritative if added.
- The adapter must not insert provider-specific permissions assumptions unless explicitly configured.

## Skill Materialization

OmniBranch treats skills as reusable instruction or tool bundles that may or may not map directly to native engine features.

### Required Behavior

- If the engine supports native skills, the adapter may attach or reference them directly.
- If the engine lacks native skills, the adapter must materialize the skill payload into assignment context or guided instructions.
- Skill materialization must be auditable. OmniBranch must be able to answer which skills were attached, expanded inline, skipped, or downgraded.
- Skills must be classified as trusted, untrusted, or unverified before use.

### Materialization Modes

| Mode             | Use                                                                             |
| ---------------- | ------------------------------------------------------------------------------- |
| Native attach    | Engine has a first-class skill or plugin mechanism                              |
| Inline expansion | Skill instructions are embedded into the prompt envelope                        |
| Local reference  | Adapter points the engine at a local read-only skill file or directory          |
| Guided checklist | Operator follows stepwise instructions because direct attachment is unavailable |

## Session Resume

Resume support is desirable but not universal. The adapter contract requires explicit declaration of the resume model.

### Resume Levels

| Level        | Meaning                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `full`       | Adapter can re-attach to a stable existing session with context continuity |
| `checkpoint` | Adapter can reconstruct enough context from saved artifacts to continue    |
| `handoff`    | Adapter can generate a continuation package for operator-mediated resume   |
| `none`       | No meaningful resume support                                               |

### Resume Requirements

- The adapter must expose the maximum verified resume level for the installed engine version.
- Resume must bind to the original workspace and lease unless explicitly re-assigned.
- Adapters must detect stale session identifiers and return a typed resume failure, not a misleading new run.

## Cancellation

Cancellation must be explicit and conservative.

### Cancellation Order

1. Request cooperative stop through the engine if supported.
2. Wait for a bounded grace period and collect any partial results.
3. Escalate to process interruption only if policy permits.
4. Mark the run `cancelled` or `partial` based on evidence collected.

### Cancellation Rules

- Adapters must not treat terminal disconnect as successful cancellation.
- Forced termination must be recorded as an elevated-risk event.
- If the engine can keep background work running after UI exit, the adapter must distinguish detached from cancelled state.

## Compatibility Tiers

Every adapter implementation must classify each engine surface into one compatibility tier.

| Tier   | Meaning                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------- |
| Tier 1 | Verified for autonomous OmniBranch execution with structured supervision and cancellation                |
| Tier 2 | Verified for execution, but with one or more adapted behaviors such as checkpoint resume or text parsing |
| Tier 3 | Supported only in guided mode or operator-mediated handoff                                               |
| Tier 4 | Detectable but not supported for production use                                                          |

Tier classification is per engine surface and version range, not per vendor overall.

## Version Probing

Version probing is required before Tier 1 or Tier 2 classification.

### Probe Requirements

- Prefer engine-native version reporting where available.
- Record executable path or application identity used for the probe.
- Distinguish installed version from adapter support range.
- If version cannot be probed, downgrade to Tier 3 or Tier 4 unless an operator explicitly accepts unknown compatibility.

### Probe Outcomes

| Outcome                   | Required adapter behavior                                      |
| ------------------------- | -------------------------------------------------------------- |
| Supported version         | Run normally using verified capability map                     |
| Newer than verified range | Warn, downgrade unknown features, and prefer guided safeguards |
| Older than minimum range  | Refuse autonomous execution                                    |
| Unprobeable               | Treat as unknown compatibility                                 |

## Guided-Mode Fallback

Guided mode is the required fallback when the engine lacks autonomy, structured outputs, or policy controls needed for normal operation.

### Guided-Mode Characteristics

- OmniBranch still generates the assignment envelope and policy decision.
- The adapter presents bounded operator instructions instead of direct autonomous execution.
- The operator must confirm launch, evidence capture, and completion status.
- Guided mode must record which steps were human-mediated.

### When Guided Mode Is Mandatory

- write access exists but cancellation is unsupported
- version is unknown and the adapter cannot verify safety controls
- native structured result output is unavailable and artifact capture is unreliable
- the surface is an IDE-only integration with no supervised background process

## Required Contract Versus Illustrative Commands

This document intentionally separates the contract from launch examples.

The adapter contract requires:

- capability discovery
- version probing
- assignment translation
- lifecycle supervision
- structured result normalization
- resume and cancellation classification
- guided-mode fallback

Illustrative commands may appear in implementation notes or operator runbooks, but OmniBranch must not depend on any undocumented flag, hidden file format, or unstable prompt transport mechanism.

## Engine Notes

The sections below describe compatibility expectations. They do not authorize unsupported invocation syntax.

### Codex

Expected surfaces:

- terminal or CLI execution
- desktop application workflow
- IDE-adjacent workflow where available

Expected adapter posture:

- prefer a CLI or other supervised local process for Tier 1 execution
- treat desktop or app-mediated workflows as Tier 2 or Tier 3 unless lifecycle hooks are verified
- support skill materialization through native skills when available, otherwise inline expansion

Likely strengths:

- strong local workspace workflows
- reusable skills and multi-surface operation
- good fit for structured assignment envelopes

Compatibility questions to verify in implementation:

- which local surface exposes the most stable structured completion signal
- whether session resume identifiers are portable across CLI and app surfaces
- how approval and sandbox controls are surfaced consistently across installations

Illustrative launch shape:

- launch a supervised local Codex surface with a working directory and a materialized assignment envelope

### Claude Code

Expected surfaces:

- terminal workflow
- IDE integration
- desktop and browser-associated workflows

Expected adapter posture:

- prefer the terminal surface for supervised autonomous runs
- treat IDE-linked workflows as adapted unless OmniBranch can reliably observe completion and cancellation
- map native skills and MCP-style tool extensions into the OmniBranch skill model where policy allows

Likely strengths:

- broad multi-surface availability
- documented extension and tool connectivity model
- viable path for both autonomous and guided execution

Compatibility questions to verify in implementation:

- how consistently structured status can be recovered across interactive and noninteractive flows
- whether resume works by stable session identifier or only by reconstructed context
- what minimum version is required for reliable policy-control mapping

Illustrative launch shape:

- start a supervised Claude Code terminal session, inject the normalized assignment envelope, and collect end-state artifacts

### OpenCode

Expected surfaces:

- terminal interface
- desktop application
- IDE extension

Expected adapter posture:

- use the terminal surface first for predictable supervision
- treat desktop and IDE surfaces as Tier 2 or Tier 3 until lifecycle observability is verified
- rely on adapter-side normalization if native structured results are incomplete

Likely strengths:

- multiple user surfaces for the same task family
- potential fit for inline skill expansion and guided continuation

Compatibility questions to verify in implementation:

- which surface offers the clearest process and result boundaries
- whether multi-session features expose stable external identifiers for resume
- how permission or approval controls are represented across surfaces

Illustrative launch shape:

- start an OpenCode terminal task in the target workspace and normalize output into OmniBranch result fields

### Antigravity CLI

Expected surfaces:

- terminal or TUI workflow
- asynchronous agent-oriented CLI execution where available

Expected adapter posture:

- prefer explicit process supervision and bounded task ownership
- require strong lease handling because asynchronous engine behavior can outlive the launching terminal
- downgrade to guided mode if background agents cannot be safely enumerated or cancelled

Likely strengths:

- agent-first orchestration model
- potential support for parallel or asynchronous task execution
- good candidate for checkpoint or detached supervision

Compatibility questions to verify in implementation:

- how OmniBranch should enumerate and correlate detached runs
- whether cancellation semantics stop only the foreground shell or the underlying agent task
- which artifacts are natively available for audit evidence

Illustrative launch shape:

- request a supervised Antigravity CLI task with explicit workspace ownership and capture the resulting task identifier for later monitoring

### Antigravity IDE

Expected surfaces:

- desktop IDE workflow
- manager or multi-agent orchestration interface where available

Expected adapter posture:

- default to Tier 3 guided mode until process hooks, result boundaries, and cancellation are verified
- treat IDE-driven tasks as operator-mediated unless a supported local control surface exists
- preserve OmniBranch policy ownership outside the IDE

Likely strengths:

- strong operator visibility for parallel agent work
- useful guided fallback surface for complex supervised sessions

Compatibility questions to verify in implementation:

- whether external automation can safely create, observe, and cancel tasks
- whether task history can be exported into stable audit artifacts
- whether workspace and permission boundaries are enforceable from outside the IDE UI

Illustrative launch shape:

- hand off a bounded OmniBranch assignment package to an operator inside Antigravity IDE and require explicit completion evidence

## Minimum Implementation Rules

An OmniBranch adapter implementation is acceptable only if it:

- refuses unsupported autonomous execution instead of guessing
- records capability unknowns explicitly
- separates native support from adapter emulation
- preserves forbidden-path and approval constraints in all modes
- returns structured results on success, failure, partial completion, and cancellation
- downgrades cleanly to guided mode when safety or observability is insufficient

## Open Compatibility Items

The following questions remain intentionally open until each adapter is implemented and tested against real engine builds:

- What exact version ranges should qualify for Tier 1 support on each engine surface?
- Which surfaces provide stable external run identifiers suitable for lease-aware resume?
- Which engines can emit machine-parseable structured completion without brittle transcript scraping?
- Which engines expose approval, sandbox, or permission signals strongly enough for direct OmniBranch policy mapping?
- Which IDE or desktop surfaces can be observed and cancelled without unsupported UI automation?

Until those questions are verified, adapters must prefer conservative tiering and guided fallback.

## Official Implementation References

Adapter maintainers must verify behavior against current official documentation and the installed engine version before assigning a compatibility tier:

- Codex workflows and reusable skills: <https://developers.openai.com/codex/use-cases>
- Claude Code programmatic execution: <https://code.claude.com/docs/en/headless>
- Claude Code subagents: <https://code.claude.com/docs/en/sub-agents>
- OpenCode skills: <https://opencode.ai/docs/skills>
- OpenCode agents: <https://opencode.ai/docs/agents/>
- OpenCode CLI: <https://opencode.ai/docs/cli/>
- Google Antigravity overview: <https://codelabs.developers.google.com/getting-started-google-antigravity>
- Google Antigravity skills: <https://codelabs.developers.google.com/getting-started-with-antigravity-skills>

These references inform adapter probing and tests; they are not substitutes for runtime capability detection.
