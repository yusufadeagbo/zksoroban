# Security Scanning

This document tracks automated security scanning results. A full manual
security audit checklist against the verifier contract is tracked
separately (#57) and will expand this document once it lands.

## CodeQL

`.github/workflows/codeql.yml` runs CodeQL analysis on every PR to `main`,
every push to `main`, and weekly, covering:

- TypeScript (`sdk/src/`, `demo/src/`)
- Rust (`contracts/verifier/src/`, `contracts/registry/src/`)

Results appear under the repository's Security > Code scanning tab.

### Accepted Findings

None yet. Any finding that is a false positive or an accepted risk
(rather than something to fix) will be listed here with a justification,
so the reasoning survives even after the finding is dismissed on GitHub.
