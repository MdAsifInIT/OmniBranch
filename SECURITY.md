# Security Policy

Report suspected vulnerabilities privately through GitHub Security Advisories. Do not include
credentials, production repository contents, or exploit details in public issues.

OmniBranch treats repository content and engine output as untrusted. Remote mutations are disabled
by default, destructive Git operations are outside the 0.1 contract, and secrets must never be
persisted in events, projections, prompts, logs, or reports.
