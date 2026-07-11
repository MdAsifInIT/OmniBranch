# Security And Policy

## Purpose

OmniBranch coordinates autonomous or semi-autonomous engineering work across repositories, branches, processes, and third-party engines. This document defines the threat model, policy evaluation model, and audit expectations that govern that work.

The security model is deliberately conservative:

- repository state is untrusted input
- engine output is advisory unless separately verified
- destructive, external, or high-impact actions require explicit approval
- missing evidence is treated as a policy weakness, not a harmless omission

## Security Objectives

- Prevent unauthorized repository mutation.
- Prevent execution outside assigned scope.
- Resist prompt and command injection originating from repository content.
- Protect secrets, credentials, and sensitive workspace data.
- Prevent unintended source control, cloud, package, or service mutations.
- Preserve attributable audit evidence for every material action.
- Keep policy decisions deterministic and external to the model provider.

## Trust Boundaries

| Boundary                        | Trust stance                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------- |
| OmniBranch policy engine        | Trusted decision authority                                                       |
| Local adapter process           | Trusted only insofar as it enforces OmniBranch policy and records evidence       |
| External AI engine              | Untrusted executor of advisory reasoning and optional local actions              |
| Repository working tree         | Untrusted content, including docs, scripts, branches, hooks, and generated files |
| User input                      | Trusted for intent, but still subject to policy and validation                   |
| External networks and APIs      | Untrusted unless explicitly allowlisted                                          |
| Skills, plugins, and extensions | Untrusted until reviewed and classified                                          |

## Threat Model

### Primary Attack Surfaces

- repository files and history
- prompts assembled from repository content
- branch names, tags, and file paths
- local command execution surfaces
- plugin, tool, and extension loading
- logs and audit artifacts
- package and dependency acquisition
- SCM, cloud, and CI credentials

### Threat Actors

- malicious contributor in the repository
- compromised dependency or plugin author
- benign contributor whose content accidentally triggers unsafe behavior
- untrusted external service responding with harmful instructions
- stale or duplicated automation process acting on outdated ownership assumptions

## Threats And Required Controls

### Repository Attacks

Repository content may attempt to alter behavior through hidden instructions, poisoned scripts, malicious hooks, or crafted documentation.

Required controls:

- treat all repository text as untrusted input
- never elevate repository instructions above the explicit OmniBranch assignment or policy
- disable automatic trust in repo-local executables, hooks, or config unless separately approved
- require explicit allowlists for files that may influence command execution or prompt assembly

### Prompt Injection

Prompt injection can come from Markdown, comments, generated logs, test fixtures, commit messages, branch names, or issue text.

Required controls:

- separate trusted instruction layers from untrusted repository content
- label imported repository text as evidence, not authority
- prohibit repository text from modifying scope, approvals, secrets access, or denial rules
- redact or truncate hostile content when forwarding context if the content is not required

### Command Injection

Shell arguments, scripts, branch names, filenames, and generated content may attempt to escape intended commands.

Required controls:

- use structured process invocation, not concatenated shell strings, whenever possible
- quote and validate every user-derived or repository-derived argument
- prohibit direct interpolation of branch names, paths, and model output into destructive commands
- require explicit command templates for privileged action classes

### Path Traversal

Assignments may target only declared paths. Attackers may use relative traversal, symlinks, archive extraction, or path normalization tricks to escape scope.

Required controls:

- resolve every candidate path to a canonical absolute path before action
- deny paths outside the declared repository root or explicit allowlist
- re-check canonical paths immediately before write or delete operations
- treat symlink jumps, junctions, and mount boundary changes as scope violations unless explicitly allowed

### Secrets Exposure

Secrets may appear in environment variables, config files, local credentials, branch metadata, test snapshots, or engine transcripts.

Required controls:

- deny broad secret discovery by default
- pass only narrowly scoped credentials needed for an approved action
- redact secrets from logs, prompts, and artifacts
- avoid pasting raw credentials into engine-visible prompts under any normal flow
- require separate approval for any operation that reads from a credential store or secret file

### Malicious Branch Names

Branch names can be crafted to break shells, manipulate prompts, spoof environment metadata, or bypass path assumptions.

Required controls:

- treat branch names and tags as untrusted strings
- sanitize before display, logging, prompt assembly, or command invocation
- prohibit branch names from being executed, sourced, or embedded in policy expressions without escaping

### Stale Leases

Two actors may believe they own the same workspace or branch after a crash, timeout, or resume attempt.

Required controls:

- use lease identifiers with creation time, owner, scope, and expiry
- require lease refresh on long-running execution
- deny write actions when lease ownership is missing, expired, or superseded
- record stale lease detection as a security event

### Race Conditions

Concurrent runs can clobber files, observe inconsistent repository state, or validate the wrong revision.

Required controls:

- bind every run to a repository snapshot or branch head fact
- re-check critical preconditions before write, commit-like, merge-like, or publish-like actions
- deny background continuation if the repository head or ownership scope changed materially without reassessment
- require serialized ownership for high-conflict surfaces

### Destructive Git Actions

History rewrite, reset, force push, branch deletion, and broad checkout operations can destroy user work.

Required controls:

- classify destructive Git operations as high-risk or denied-by-default
- require explicit approval and precise target identification
- prohibit operations that affect unknown or unrelated worktree changes
- retain pre-action evidence and post-action outcome records

### SCM And Cloud Mutations

Pull requests, branch creation, issue edits, releases, deployments, infrastructure changes, and ticket mutations affect external systems.

Required controls:

- deny external mutation by default unless the assignment explicitly authorizes it
- separate read-only SCM access from write-capable SCM access
- require specific target repo, branch, service, and action parameters for approval
- log remote identity, target resource, and resulting state for every approved mutation

### Logging And Redaction Failures

Audit logs can become a secondary exfiltration path.

Required controls:

- minimize logged command arguments and prompt bodies to the least needed for evidence
- redact secrets, tokens, signed URLs, and sensitive file fragments
- support operator-visible summaries with deeper restricted evidence only where justified
- stamp logs with policy decision ids and lease ids

### Supply Chain Risks

Package installs, remote scripts, model-delivered snippets, and generated configuration can introduce unreviewed dependencies.

Required controls:

- classify package installation and remote fetch execution as approval-required
- prefer lockfile-respecting, pinned, or offline-safe flows where available
- deny execution of downloaded scripts unless explicitly approved
- record source origin, integrity evidence, and review status

### Plugin And Skill Trust

Plugins, skills, and extension bundles can expand tool access or silently alter instructions.

Required controls:

- classify every plugin or skill as trusted, restricted, unverified, or denied
- require provenance and version facts before activation
- prevent unverified plugins from granting broader permissions than the assignment allows
- log which skills or plugins were loaded, expanded inline, skipped, or downgraded

## Policy Model

OmniBranch policy decisions must be deterministic and made outside the engine.

### Inputs To Evaluation

| Input          | Meaning                                                                        |
| -------------- | ------------------------------------------------------------------------------ |
| Assignment     | Objective, scope, allowed paths, forbidden actions, validation, and approvals  |
| Action request | The concrete operation the adapter or engine wants to perform                  |
| Lease          | Ownership, scope, and freshness for the workspace or branch                    |
| Runtime facts  | Engine surface, version, capability tier, environment, and repository snapshot |
| Trust facts    | Plugin trust, secret classification, external target classification            |
| Policy rules   | Organization defaults, repo-level restrictions, and user overrides             |

### Action Classes

Every attempted action must be classified before evaluation.

| Class                    | Examples                                                               | Default stance                                        |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `read_repo`              | read files, list directories, inspect diffs                            | allow within scope                                    |
| `write_repo`             | edit allowed files, create scoped artifacts                            | allow within scope when lease is valid                |
| `execute_local_safe`     | deterministic read-only commands, tests, linters                       | allow or approval based on repo policy                |
| `execute_local_mutating` | formatters, generators, package scripts, build steps with side effects | approval unless explicitly pre-authorized             |
| `git_read`               | status, log, diff, branch list                                         | allow                                                 |
| `git_write_safe`         | create non-destructive local branch, stage scoped files                | approval unless pre-authorized                        |
| `git_write_destructive`  | reset, checkout overwrite, rebase, clean, delete branch, force push    | deny by default                                       |
| `network_read`           | fetch documentation, query package metadata                            | approval or allowlist-based allow                     |
| `network_write`          | API mutation, issue update, PR creation, webhook trigger               | deny or explicit approval only                        |
| `secret_read`            | read credential files, keychain entries, env secrets                   | explicit approval only                                |
| `plugin_load`            | activate plugin, tool server, extension                                | allow only for trusted or specifically approved items |
| `scm_mutation`           | create branch remotely, push, open PR, edit issue                      | explicit approval only                                |
| `cloud_mutation`         | deploy, provision, rotate, delete, publish                             | deny by default                                       |

### Decision Outcomes

Policy evaluation returns one of:

- `allow`: action may proceed without operator interruption
- `approval_required`: action is blocked pending explicit approval
- `deny`: action must not proceed

### Evaluation Order

1. Validate that the action class is known.
2. Validate lease ownership and freshness.
3. Validate repository scope and canonical target paths.
4. Validate engine capability tier and runtime restrictions.
5. Validate trust classification for plugins, skills, secrets, and external targets.
6. Apply repo and organization deny rules.
7. Apply explicit assignment allowances.
8. Return `allow`, `approval_required`, or `deny`.

The evaluation must stop at the first decisive deny condition.

### Deny Conditions

An action must be denied when any of the following is true:

- the action class is unknown
- the target path escapes scope
- the lease is missing, stale, or owned by another active actor
- the engine surface lacks the required control for safe execution
- the action requires external mutation not explicitly authorized
- the action requires secrets access not explicitly authorized
- the action is destructive and no explicit override exists
- required audit evidence cannot be captured

### Approval Conditions

An action must require approval when:

- it mutates local state outside a pre-approved low-risk class
- it loads a restricted plugin or skill
- it reaches a non-allowlisted network destination
- it stages, branches, publishes, or otherwise affects SCM state
- it reads secrets or invokes a credentialed service
- it executes generated or downloaded code

## Least Privilege Rules

- give the adapter only the filesystem, process, and network access required for the current assignment
- prefer read-only mode until a write action is actually needed
- limit credentials to the minimum scope and lifetime needed for the approved action
- keep plugin and tool activation opt-in rather than ambient
- avoid shared mutable workspaces when isolated worktrees or per-task sandboxes are available

## Audit Evidence

Every material run must leave enough evidence to reconstruct what happened without replaying the engine.

### Required Evidence

- assignment identifier and normalized envelope
- adapter id, engine family, engine surface, and version facts
- capability tier and any downgraded or unknown capabilities
- lease identifier, owner, scope, and expiry facts
- policy decisions for approval-required or denied actions
- command or action summaries with canonical target paths
- result status, warnings, and artifacts collected
- timestamps for launch, major state changes, and completion

### Evidence Quality Rules

- evidence must distinguish user intent from engine suggestion
- evidence must distinguish adapter observation from engine self-report
- evidence must preserve policy denials even when the engine attempted to continue
- redaction must not destroy the ability to understand why a decision was made

## Operational Guidance

### Safe Defaults

- default to read-only analysis when assignment scope is ambiguous
- default to guided mode when version, capability, or policy controls are unknown
- default to deny for destructive Git, SCM mutation, and cloud mutation
- default to inline skill expansion only for trusted or assignment-approved skill material

### Resume And Recovery

- re-validate lease freshness before any resumed write action
- re-check repository head or snapshot facts before continuing a partially completed run
- treat detached background activity as untrusted until correlated with a known run id
- require fresh approval if a resumed run crosses into a higher-risk action class

### Human Review Triggers

Human review is mandatory when:

- the engine proposes destructive or broad repository actions
- audit evidence is incomplete or inconsistent
- policy classification changed mid-run because environment facts changed
- secrets may have been exposed
- concurrent actors touched the same scoped surface

## Implementation Posture

A compliant OmniBranch implementation must:

- keep policy evaluation outside the model prompt
- refuse to execute unclassified actions
- preserve canonical path and lease checks at execution time, not only at planning time
- separate allow, approval-required, and deny outcomes cleanly
- treat provider features as optional enhancements, not policy authority
- keep enough audit evidence to support incident review and user trust

## Open Questions For Compatibility And Operations

- Which engine surfaces expose enough lifecycle detail to prove that cancelled work actually stopped?
- Which environments can enforce network allowlists at runtime rather than only by policy intent?
- What minimum evidence format is sufficient when an IDE surface only offers operator screenshots or export logs?
- How should OmniBranch classify plugin ecosystems that mix trusted first-party bundles with user-installed third-party extensions?

Until those questions are resolved in implementation, OmniBranch should prefer stricter approval gates and guided fallback.
