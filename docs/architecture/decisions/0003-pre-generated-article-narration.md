# ADR 0003: Generate article narration explicitly and reuse static audio

- Date: 21 October 2026
- Status: Accepted for the article narration implementation

The hosted daily-continuation and publication decision in
[ADR 0004](0004-github-actions-article-narration.md) supersedes this record's local-heartbeat and
manual-only publication scope. The original reasoning below is retained; saved narration,
Achird, provider limits, compression, freshness and browser fallback remain applicable.

## Context

The shared browser speech player selects the first matching device voice. Voice quality and
pronunciation differ across devices. Google offers regional generative speech, but its free-tier
quotas cannot support an assumption of unlimited synthesis on every public playback. The site
already publishes versioned articles and static media from Git, without durable runtime disk.

## Decision

Generate US English narration through an explicit, bounded, resumable local command using the
Gemini Developer API. Require a private key and explicit confirmation that its project is on
the Free tier; never enable billing or choose a paid fallback. Confirmation is an operator claim,
not programmatic verification of Google's billing tier.

Store content-versioned audio segments and a per-article complete manifest as same-origin static
assets. Share deterministic rendered-DOM extraction between generation and playback, compare
transcript hashes before using audio, and retain device speech with US English preference.
Do not invoke Google during builds, page visits or playback. Do not add a public generation API.

Keep validated provider WAV sources, checkpoints and source manifests in the ignored local
`.codex-artifacts/narration-sources` cache. Explicit local `narration:compress` uses FFmpeg to
produce 64 kbps, 24 kHz mono MP3, checks a full decode against source duration, then atomically
publishes complete delivery manifests and content-hashed MP3s under `static/audio/articles`.
Source fingerprints retain WAV semantics; delivery settings/checksums are separate. The generator
reads its private manifests and cannot replace compressed delivery manifests on a later batch.
Auditions and incomplete source articles remain private. FFmpeg is an authoring tool; site builds
do not require it and never encode or synthesize. There is no automatic upload, commit or deployment.

Use the existing Vercel Hobby static storage/CDN for the initial three completed narrations.
The account was confirmed active on the free Hobby plan on 21 October 2026. These three files
shrink from 20,919,474 WAV bytes to 3,485,511 MP3 bytes, preserving Achird and same-origin playback.
No separate object store, credentials, billing enrollment or CSP extension is needed. The original
31.56 GiB WAV corpus estimate becomes roughly 5.3 GiB at 64 kbps; review account-wide storage and
transfer limits before later large releases rather than assuming unlimited free media delivery.

Use Achird by default, verify its US English regional catalogue metadata, and persist a conservative
local quota ledger under the generation lock. Reserve every catalogue/synthesis attempt before
transport; permit at most ten calls per Pacific day with at least 65 seconds between calls.
Stop after HTTP 429 until the next Pacific reset. The ledger survives restarts and fails closed
for corrupt state or clock rollback. It cannot observe other clients or verify billing. Daily
local Codex continuation uses the same bounded command and checkpoints rather than a provider
Batch API or a new public/background application service.

For quota-efficient long-form generation, new segments are bounded by 6,000 UTF-16 code units,
7,000 UTF-8 bytes and 900 words, with a 600-second WAV ceiling, 48 MiB streamed-response cap
and 240-second provider timeout. Recognized legacy segmentation remains valid for complete
manifests and articles with existing validated checkpoints, preserving already-spent requests.
Google's 8,192 input / 16,384 output token limits and 25 audio tokens/second support this bounded
trial; actual long-passage synthesis must succeed before continued corpus generation.

## Alternatives

- Synthesize on every visitor request: consumes scarce quota repeatedly and creates an expensive
  public admission/cost-control boundary.
- Generate inside every build: makes publication depend on provider availability/credentials
  and couples ordinary content work to synthesis quotas.
- Add hosted storage and a background job service immediately: larger infrastructure change
  than needed to test and deploy a bounded narration collection.
- Improve only device voice ranking: retained as the fallback improvement, but cannot supply
  consistent generated narration across devices.

## Consequences and verification

Article audio becomes available only after explicit generation and publication of its assets.
Missing/stale audio uses device speech. No real Google narration is implied by installing the
feature without credentials. Long-form WAV storage can be substantial, and chunk transitions
and pronunciation need listening checks. Atomic manifests and segment checkpoints prevent an
interrupted generation run from advertising a partial article as complete.

Verify extraction/segmentation, response decoding, quota/error/deadline handling, resumption,
manifest freshness and browser lifecycle with focused tests; use real samples for listening.
See [the operational guide](../../article-narration.md) and the affected canonical
[integrations](../ARCHITECTURE.md#8-integrations-and-environment),
[security](../ARCHITECTURE.md#9-security-errors-and-validation), and
[caching](../ARCHITECTURE.md#10-caching-and-offline-behavior) descriptions.
