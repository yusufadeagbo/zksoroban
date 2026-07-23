# Versioning and Release Process

This document describes how `zksoroban` tracks versions, milestones, and sprint work.

## Semantic Versioning

The SDK and contracts follow [Semantic Versioning](https://semver.org):

- **MAJOR** for breaking API or proof-format changes.
- **MINOR** for backward-compatible features.
- **PATCH** for backward-compatible fixes.

The current SDK version is tracked in `sdk/package.json`.

## Releasing the SDK

Publishing is automated via `.github/workflows/publish.yml`, triggered by
pushing a tag matching `v*` (e.g. `v0.2.0`). To cut a release:

1. Bump the version in `sdk/package.json` to match the tag you're about
   to push, and merge that change to `main` first.
2. Tag the resulting commit and push the tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. The workflow then runs `npm ci`, `npm run lint`, `npm test`, and
   `npm run build` in `sdk/` — a failure at any of these steps stops the
   release before anything is published. If they pass, it runs
   `npm publish --access public --provenance` and creates a GitHub
   release for the tag with auto-generated notes.

`--provenance` attaches a signed, publicly verifiable attestation that
the published package was built by this exact workflow run from this
exact commit — visible on the npm package page. It relies on the
`id-token: write` permission the workflow already requests.

The workflow authenticates to npm via the `NPM_TOKEN` repository secret,
which `actions/setup-node` maps into the `NODE_AUTH_TOKEN` environment
variable `npm publish` expects. Only `sdk/` is published — `demo/` and
the Rust contracts are not npm packages. `sdk/package.json`'s `files`
field is scoped to `["dist"]`, so only the compiled output is published,
never the TypeScript source.

## Wave Program Milestones

Sprint work is organized into time-boxed milestones called Waves. Each Wave is a GitHub milestone with a due date. Issues that belong to the active sprint are tagged with the `wave-sprint` label.

### Auto-Milestone Assignment

Manually assigning 100+ issues to the current milestone is slow and error-prone, so it is automated.

The `.github/workflows/milestone.yml` workflow runs whenever a label is added to an issue. When the added label is `wave-sprint`, it:

1. Checks whether the issue already has a milestone. If it does, the workflow exits without changing anything, so manual milestone assignments are never overwritten.
2. Otherwise it finds the open milestone with the latest due date and assigns it to the issue.

The workflow has `issues: write` permission only and uses the built-in `GITHUB_TOKEN`. It does not create milestones or perform any other triage — milestone creation and sprint planning remain manual.

To move an issue into the current sprint, add the `wave-sprint` label and the milestone is assigned automatically.

## Reviewing Dependabot PRs

Dependabot opens weekly PRs against `sdk/`, `demo/`, `contracts/verifier/`,
`contracts/registry/`, and the repo's GitHub Actions, each labelled
`dependencies`. None of them auto-merge. Before merging one:

- **npm updates**: check the linked changelog for breaking changes, then
  confirm CI's `sdk` or `demo` job passes on the PR.
- **cargo updates**: pay particular attention to `soroban-sdk` and its
  transitive dependencies — this ecosystem has had real, recent version-skew
  breakage (see the CI workflow's contract job, which pins a working
  dependency set in `Cargo.lock`; a Dependabot update that bumps past a
  compatible version needs the same verification this repo's maintainers did
  when first pinning it, not just a passing build).
- **github-actions updates**: skim the diff for permission or trigger
  changes before merging; these run with repo-level access.

A PATCH-level update with a green CI run is normally safe to merge as-is.
MINOR or MAJOR updates should get a manual look at what changed, even when
CI passes.
