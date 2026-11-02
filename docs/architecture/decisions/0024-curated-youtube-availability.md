# ADR 0024: Curated YouTube availability and consented playback

Date: 3 November 2026. Status: accepted for implementation; production API
configuration and actual provider playback require separate verification.

## Context

The author's earlier draft posts contain individual YouTube links and playlists
that should become one browsable gallery. A list of historical links does not
establish current public visibility or embedding permission. A successful
metadata response also cannot guarantee playback for a particular viewer.

The site already has a strict YouTube URL parser, consent lifecycle and an
official visible IFrame API controller in Listening Room. Its initial browser
render does not contact YouTube. A public availability service introduces a
credential, quota and cache boundary that ordinary embedded posts do not have.

## Decision

Keep a versioned editorial manifest imported from a pinned source commit.
Retain provenance, order and category membership independently of temporary
provider metadata. Do not delete source records when a check fails.

Add a bounded same-origin endpoint serving only the fixed catalogue and known
playlist continuations. Use the official Data API with a server-only credential,
bounded requests and response sizes, deadlines, short process-local caches,
in-flight coalescing and admission limits. Do not accept arbitrary provider URLs
or video IDs. The provider project's quota is the global external budget
boundary; the process-local limiter is not represented as a distributed ledger.

Separate `eligible`, `unavailable` and `unknown` results. A credential, quota or
network failure is unknown. Missing resources do not prove deletion. Filter
known age, embedding and relevant region restrictions before displaying playable
cards, but retain runtime handling of viewer-specific failures. Cache provider
facts independently from viewer-specific decisions.

Enumerate ordinary playlists in bounded pages and screen their members. Preserve
the collection order and expose partial checking and continuation. Keep a
generated Mix as an external link when it cannot be reliably enumerated. Use a
gallery-owned queue with one selected video in the existing visible player.

Let the first-party endpoint run on opening, while retaining media permission
for all browser requests to provider thumbnails, scripts and frames. Media permission
revocation or expiry unloads provider media and cancels player startup. Extend the existing
adapter with a backwards-compatible numeric error field and optional accessible
title rather than duplicating its lifecycle code.

Playback failures belong to the current session; they cannot change the shared
catalogue for everyone. Codes that indicate invalid input, environment or
referrer failures are not labelled as deleted content. No hidden player probes,
scraping, media extraction or streaming proxy is introduced.

## Alternatives and consequences

- A build-only check is inexpensive but cannot satisfy the opening availability
  check. The permanent manifest still comes from the build/development workflow;
  runtime provider metadata remains separate.
- A client-exposed API key or direct Data API lookup would transfer quota and
  visitor-network boundaries to the browser. The chosen server endpoint keeps
  credentials private and preserves the browser permission contract.
- Per-card hidden autoplay probes would be costly, intrusive and unreliable.
  Metadata screening followed by a real selected player gives honest outcomes.
- A distributed cache/limiter could reduce repeated work across a large fleet
  but introduces persistence and operational configuration. The initial bounded
  service uses process-local state and an explicit provider quota. A future
  traffic-driven shared store requires its own documented decision.
- An unknown outcome can leave fewer cards than the editorial catalogue. The UI
  explains incomplete checks and offers retry instead of inventing playability.
- The shared adapter's new fields are optional. Existing Listening Room behavior
  and its local-audio/extension boundaries must remain unchanged.

## 3 November 2026 extension: saved notes and progressive checks

Adding the author's local Obsidian Videos collection increases the catalogue to
199 ordinary playlists. Eagerly checking 50 members of every playlist in one
request would exceed the intended request and cache bounds. Increasing all
timeouts and quotas would make the first visit more expensive and delay otherwise
available videos.

Keep the local source as a separately generated, checked-in link manifest.
The local import requires an explicit folder and publishes normalized YouTube
links and short collection labels, not note prose, absolute vault paths or fake
public note URLs. Merge the two manifests by canonical identity, preserving
memberships and provenance. The build does not need access to the local vault,
and either source can be refreshed without erasing the other.

Check the enlarged catalogue in bounded stages and expose eligible cards as
results arrive. Catalogue batching is distinct from continuing the members of
one selected playlist. The initial stage checks standalone videos and eight
playlists; `nextBatch` addresses successive fixed groups of at most eight.
A later stage can run on a cold server process without repeating the initial
stage. All stages share the same service-owned provider budget,
concurrency and metadata caches; a batch is not a new quota account. Intentionally
pending work is not classified as a provider failure or deletion. A playlist
still needs a checked eligible member before it enters the playable gallery.
Per-entry freshness prevents later responses from extending earlier results;
the browser preserves the earliest expiry while merging batches.

This extends the existing fixed-catalogue service and state ownership. It adds no
reader file access, arbitrary URL lookup, new persistence store or credential.
Verify source isolation and duplicate merging, batch admission and completion,
shared limits, and the UI distinction between pending checks and actual failures.

## Verification

Test extraction against all supported URL forms and malformed hosts, preserve
duplicate provenance, and assert deterministic source counts. Test provider and
endpoint failure classifications, bounds, pagination, cache/backoff and
single-flight behavior. Test consent network boundaries, one-player lifecycle,
keyboard use, queues and session-only failure handling in a browser. Run the
existing controller regressions whenever the shared adapter changes.

Passing fixtures does not establish live embeds or production credentials.
Record those separately in the implementation handoff. Review the final
implementation against the [canonical architecture](../ARCHITECTURE.md#videos-i-like-curated-availability-and-consented-playback)
and [feature contract](../../visualizations/videos-i-like.md).
