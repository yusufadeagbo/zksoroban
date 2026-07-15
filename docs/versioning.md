# Versioning and Release Process

This document describes how `zksoroban` tracks versions, milestones, and sprint work.

## Semantic Versioning

The SDK and contracts follow [Semantic Versioning](https://semver.org):

- **MAJOR** for breaking API or proof-format changes.
- **MINOR** for backward-compatible features.
- **PATCH** for backward-compatible fixes.

The current SDK version is tracked in `sdk/package.json`.

## Wave Program Milestones

Sprint work is organized into time-boxed milestones called Waves. Each Wave is a GitHub milestone with a due date. Issues that belong to the active sprint are tagged with the `wave-sprint` label.

### Auto-Milestone Assignment

Manually assigning 100+ issues to the current milestone is slow and error-prone, so it is automated.

The `.github/workflows/milestone.yml` workflow runs whenever a label is added to an issue. When the added label is `wave-sprint`, it:

1. Checks whether the issue already has a milestone. If it does, the workflow exits without changing anything, so manual milestone assignments are never overwritten.
2. Otherwise it finds the open milestone with the latest due date and assigns it to the issue.

The workflow has `issues: write` permission only and uses the built-in `GITHUB_TOKEN`. It does not create milestones or perform any other triage — milestone creation and sprint planning remain manual.

To move an issue into the current sprint, add the `wave-sprint` label and the milestone is assigned automatically.
