# Security policy

OmniBranch coordinates code, processes, Git repositories, AI tools, and optional remote providers. Treat every repository, adapter response, path, environment value, and worker claim as untrusted input.

## Report a vulnerability

Use [GitHub Security Advisories](https://github.com/MdAsifInIT/OmniBranch/security/advisories) to report vulnerabilities privately.

Include:

- affected version and commit;
- operating system and Node/Git versions;
- sanitized reproduction steps;
- security impact and affected boundary;
- suggested mitigation, if known.

Do not open a public issue containing exploit details, tokens, private repository content, or sensitive paths. Do not test against systems or repositories you do not own or have permission to assess.

## Supported version

Security fixes currently target the unreleased `0.2.x` line on `main`. Earlier source milestones are not maintained as separate release lines.

## Security guarantees

- Git/process execution uses executable-plus-argument arrays.
- Force push, hard reset, broad clean, and unsafe branch deletion are not implemented by the Git backend.
- Filesystem mutation and recovery require lexical and canonical containment.
- Repository mutation and installer activation use locks and expected-state checks.
- Unknown actions, schema versions, provider capabilities, and plugin trust fail closed.
- Required validation needs explicit `pass` evidence.
- Worker completion requires current lease authority.
- External writes require scoped approval and provider capability.
- Secrets are referenced at runtime and redacted from persisted or operator-facing surfaces.

## Credential handling

Never place credentials in:

- WorkspacePlan inline values;
- prompts or assignment envelopes;
- events or SQLite projections;
- logs, snapshots, reports, or fixtures;
- command arguments;
- issues, pull requests, or documentation examples.

Use scoped environment, file, keychain, or platform-native secret references. Rotate a credential immediately if it appears in repository history or generated artifacts.

## Safe research and testing

- Use disposable repositories and non-stable branches.
- Keep remote writes in dry-run until exact approval exists.
- Prefer local fakes and recordings for SCM/CI/provider tests.
- Preserve evidence when investigating recovery, stale authority, or external ref movement.
- Do not weaken containment, validation, or policy checks to make a test pass.

Read [Security and policy](docs/05_SECURITY_AND_POLICY.md) for the detailed threat model and [Contributing](CONTRIBUTING.md) for secure change requirements.
