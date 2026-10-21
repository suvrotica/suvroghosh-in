# ADR 0004: Continue article narration through GitHub Actions with durable bounded state

- Date: 21 October 2026
- Status: Accepted for implementation; hosted activation requires successful end-to-end validation
- Supersedes: The local daily-continuation and manual-only publication portions of
  [ADR 0003](0003-pre-generated-article-narration.md); its saved narration, Achird, provider limits,
  compression, freshness and browser-fallback decisions remain in force

## Context

Daily Free-tier generation can take months for the published corpus. The first implementation
used a local Codex heartbeat, which requires this computer and Codex to remain available. Hosted
continuation needs durable quota reservations and incomplete audio across disposable runners,
and must publish complete compressed narration without duplicating synthesis or exposing keys
and uncompressed checkpoints. The repository is public and the site already uses Vercel Hobby's
Git integration. Account upgrades, a paid provider, another object store and additional Google
administrative access are outside the chosen design.

## Decision

Use `.github/workflows/article-narration.yml` with `scripts/github-narration.mjs`, exposed as
`narration:hosted`. Run a standard GitHub-hosted Ubuntu 24.04 runner daily at 08:45 UTC
(14:15 India time), with manual dispatch as a recovery path. Both paths execute `main` only;
there are no pull-request triggers. A repository-wide narration concurrency group uses
`cancel-in-progress: false`. Grant the job's `GITHUB_TOKEN` only `contents: write` and
`deployments: read`. Do not add a personal access token, Vercel administrative credential,
Google IAM service account or OIDC grant.

Keep tiny authoritative state on `codex/narration-state`. Each provider attempt first commits its
quota reservation using the last-read state commit as its parent and a non-forced fast-forward
ref update. Conflicts and persistence failures stop the request. Preserve the ten calls per
Pacific day, 65-second spacing, DST-aware rollover, 429 stop, model allowlist and no paid fallback.
The state branch disables Git deployment in its own `vercel.json`; quota reservations must not
create Vercel previews. A local ledger cannot coordinate with hosted state, so independent local
and hosted generation must not overlap.

Encrypt pending and incomplete WAV/checkpoint state with AES-256-GCM using the 32-byte
`NARRATION_STATE_KEY` Actions secret. Upload ciphertext to the `narration-checkpoints` prerelease,
then commit its checksum and pointer to the state branch. Restore only authenticated, matching
snapshots. Cap raw pending data at 384 MiB and the archive at 512 MiB. Retain the two current owned
snapshot assets, pruning older ones only after a replacement upload and state commit succeed.
Stop further provider calls when checkpoint persistence fails. Actions caches/artifacts are not
the authoritative quota or WAV store. Ciphertext and minimal metadata remain public; keys and
unencrypted checkpoints do not.

Prioritize validated partial articles. Recognize valid current compressed delivery without a
retained WAV source so completed work does not incur another synthesis. Compress complete work
to the existing 64 kbps mono MP3 format, preserve generation fingerprints and freshness checks,
and commit only complete MP3s/manifests to `main`. Publish through Vercel's existing Git
integration. Read the matching SHA's production deployment status and verify custom-domain
manifests/audio before dropping those completed WAV copies from hosted state. Preserve original
local WAVs. A failed deployment or live verification retains checkpoint recovery state.

Pin `NARRATION_GOOGLE_PROJECT_ID` and `NARRATION_GOOGLE_KEY_SHA256` to the existing project's
operator-verified key. Store that key privately as the `GEMINI_API_KEY` repository secret. The
21 October 2026 setup verified project `gen-lang-client-0296473115` (number `570357561308`) with
billing unlinked and the existing Vercel project on Hobby. These pins are static configuration
attestation, not a live billing audit: an external administrator can change billing later.
The synthesis key cannot enable billing. Live billing verification would require additional
OAuth/IAM credentials; avoid granting that extra access. Keep account configuration on the
verified free tiers and stop for an explicit review when changing project, key or billing.

Use a 6 GiB delivery-audio cap and an 8 GiB site-payload cap, with 2 GiB of headroom below the
documented 10 GiB Hobby deployment-storage allowance. These are publication safeguards,
not an account-wide Vercel storage/transfer audit. The workflow has no credential to query that
usage or upgrade the account. Halt at provider/platform limits; never silently buy capacity.
Require at least 2 GiB free runner disk for bounded pending sources; the manual local lane retains
its 10 GiB guard. Standard hosted runner time is free in this public repository. Release checkpoints use bounded
ordinary release assets; no paid Actions artifact store or extra cache allowance is selected.

## Alternatives

- Keep the local heartbeat: preserves the initial implementation but cannot continue while the
  computer or Codex is unavailable.
- Trust runner-local or cached quota state: a cache miss, eviction or fresh runner can reset
  request history and spend the same daily allowance twice.
- Save every WAV in Git or Actions artifacts: exposes raw authoring state or accumulates a large
  separately metered storage payload. The original WAV corpus estimate was 31.56 GiB.
- Add a cloud object store and worker: adds account, access and billing boundaries that the
  existing GitHub/Vercel authoring lane can avoid for bounded pending work.
- Add a live Cloud Billing API guard: offers stronger current-state verification but needs
  separate Google OAuth/IAM access. Configuration attestation is retained and its limits stated.
- Synthesize on reader requests or during ordinary builds: couples publication/playback to
  provider credentials, scarce quota and costly public admission boundaries.

## Consequences, migration and verification

Record the free-tier verification with `NARRATION_FREE_TIERS_CONFIRMED=true`, but bootstrap with
`NARRATION_HOSTED_ENABLED=false`. Validate a `verify_only` dispatch before enabling generation.
Its one-time `deployment_probe` option can make an empty bot commit on `main` to verify the
GitHub-token-to-Vercel integration without spending Google quota; routine runs do not make empty
commits. Successful hosted activation removes the local computer dependency. Pause the former heartbeat
only after a hosted run proves state restore, quota reservation, publication and production
delivery; then leave one active schedule. Bootstrap the current dated quota and existing pending
segments once from the verified local state. Do not reset existing state to recover an allowance.
Protect the encryption key: losing it prevents recovery of the pending snapshot even though
published MP3s remain available. Interrupted writes can consume a conservatively reserved call,
which is preferable to unrecorded provider attempts.

GitHub schedules are best effort: jobs can be delayed/dropped, and public schedules can stop
after 60 days of inactivity. Manual dispatch resumes the same state. The roughly 5.3 GiB corpus
MP3 estimate fits the 6 GiB audio guard, but completion is not a promise to fit the entire evolving
corpus into fixed free storage. Account-wide usage, concurrent account changes,
external provider clients and GitHub/Vercel configuration remain explicit operational limits.

Verify encrypted round-trip/tamper rejection, bounded archives and restore paths, atomic state
updates/conflicts, pre-transport reservation, restart-safe day limits, checkpoint upload/pruning,
current-delivery reuse, partial-work priority, failure recovery, bounded Git publication and
deployment/live-file validation with provider-free tests. A real hosted validation must confirm
that the automated `main` push reaches the existing Vercel production integration. Do not claim
hosted activation or pause the local schedule based on local fixtures alone. Browser freshness,
US English preference and device fallback remain covered by the existing player regressions.

See the [operational guide](../../article-narration.md), canonical
[system diagram](../ARCHITECTURE.md#1-system-and-principles),
[integrations](../ARCHITECTURE.md#8-integrations-and-environment) and
[caching/state ownership](../ARCHITECTURE.md#10-caching-and-offline-behavior).
Provider/account assumptions are described by [Google's billing guide](https://ai.google.dev/gemini-api/docs/billing/),
the [Cloud Billing method](https://docs.cloud.google.com/billing/docs/reference/rest/v1/projects/getBillingInfo),
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases),
[schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
and [Vercel Hobby limits](https://vercel.com/docs/plans/hobby).
