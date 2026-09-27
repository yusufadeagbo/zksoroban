# Versioning and Release Process

This document describes how `zksoroban` tracks versions, milestones, and sprint work.

Every notable change is recorded in [CHANGELOG.md](../CHANGELOG.md) as it
lands on `main`, under an `[Unreleased]` heading until a release actually
ships.

## Semantic Versioning

The SDK and contracts each follow [Semantic Versioning](https://semver.org),
but "breaking" means something different for a published npm package than
for a contract instance that's already live on a network — see the two
subsections below.

### SDK (`sdk/package.json`)

The SDK's version is a normal npm semver: consumers pin a version range and
choose when to upgrade, and an old version stays installable forever.

- **MAJOR** — anything that breaks a consumer who doesn't change their own
  code: removing or renaming an export, changing a function's parameter or
  return shape, changing what a function throws, or changing the on-the-wire
  byte encoding `formatProof`/`formatVerifyingKey` produce.
- **MINOR** — backward-compatible additions: a new exported function, a new
  optional field on an existing options object, support for a new circuit
  shape, a new `SorobanZkErrorCode` variant.
- **PATCH** — backward-compatible fixes: a bug fix that doesn't change any
  documented input/output shape, a dependency bump that doesn't change the
  SDK's own public behavior, a documentation or type-annotation correction.

### Contracts (`contracts/verifier`, `contracts/registry`)

A contract can't be "rolled back" the way an npm version can — once
`verify_proof` or `register_circuit` has a given interface deployed at a
given contract ID, every existing integration is already calling it that
way, and `upgrade()` (see below) replaces that same contract ID's logic for
everyone at once rather than letting each caller opt in on their own
schedule. So the bar for what counts as a breaking (MAJOR) contract change
is stricter than for the SDK:

- **MAJOR** — anything that would make an existing, unmodified caller's
  transaction fail or behave differently: a changed function signature,
  changed argument order or types, a removed function, a changed error
  code's meaning, or a storage layout change that isn't handled by
  `upgrade`'s migration path.
- **MINOR** — a new function, a new optional read-only getter, or a new
  circuit registered with `contracts/registry` — anything an existing
  caller's transactions are unaffected by if they never call the new
  surface.
- **PATCH** — an internal fix that doesn't change any function's interface
  or observable behavior for a well-formed call: e.g. a storage-cost
  optimization (see the `CallCount` rate-limit entries moving to temporary
  storage) or a fix for a bug that only ever caused a transaction to fail
  in a way it was already documented to fail.

Both contracts expose their own version via a `version()` contract call,
sourced from that contract's `Cargo.toml` (`env!("CARGO_PKG_VERSION")`) —
see `contracts/verifier/src/lib.rs` and `contracts/registry/src/lib.rs`.

## Contract deployments are versioned separately from the SDK package

`sdk/package.json`'s version and each contract's `Cargo.toml` version are
independent numbers that do not need to move together:

- The SDK version describes the *npm package* — the TypeScript code a
  consumer installs.
- A contract's version describes the *wasm currently deployed* at a
  specific contract ID on a specific network (e.g. the Testnet registry at
  `CDTPNARKKZCZ36PL4BNKBXZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH`, see the
  README). Deploying a new contract version means calling `upgrade()` on
  that existing contract ID (via the two-step admin transfer/`upgrade`
  flow in `contracts/verifier`/`contracts/registry`) or deploying an
  entirely new contract ID — neither of which involves `npm publish` at
  all.

Because these two version numbers can drift, the SDK ships an
`EXPECTED_CONTRACT_VERSION` constant (`sdk/src/version.ts`) and a
`getContractVersion()` call: it warns at runtime if the contract you've
pointed the SDK at reports a different version than the one that SDK build
was written against, so a mismatch surfaces as a warning instead of a
silent behavior difference.

## Pre-1.0 Stability (current: 0.1.0)

`sdk/package.json` is at `0.1.0`, and per semver's own rules, everything
before `1.0.0` is exempt from the MAJOR/MINOR/PATCH guarantees above —
semver §4 permits breaking changes in *any* `0.x` release, including a
patch release. In practice, for this project:

- Expect the exported API, error codes, and calldata encoding to still
  change based on integration feedback.
- A breaking change during `0.x` will still be called out as `### Changed`
  (or `### Removed`) in [CHANGELOG.md](../CHANGELOG.md) and will still bump
  the minor version (`0.1.0` → `0.2.0`), even though semver doesn't
  strictly require that below `1.0.0` — this project chooses to signal
  breakage with a minor bump anyway rather than relying on patch releases
  being safe to auto-upgrade.
- `1.0.0` is the commitment point: once cut, the MAJOR/MINOR/PATCH policy
  above is treated as a hard guarantee rather than a best-effort intention.

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
