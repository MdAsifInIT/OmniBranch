# Configuration

The canonical plan is `.omnibranch/workspace.yaml` with `apiVersion: omnibranch.dev/v1alpha1`. Unknown object keys are rejected. Configuration `require_approval` is normalized to runtime `approval_required`. Secrets are referenced, never embedded. JSONL is authoritative and SQLite is rebuildable.
