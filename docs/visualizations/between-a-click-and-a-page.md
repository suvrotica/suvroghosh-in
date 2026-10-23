# Between a Click and a Page

An interactive account of one HTTPS article request for readers outside computing.
Canonical route: `/blog/visualizations/between-a-click-and-a-page`, through the
ordinary Markdown article route. The Computer Science gallery imports lightweight
registry metadata only.

## Physical metaphor

An Anatomy Hero on one supported tabletop instrument plate: an address-card index,
two keyed connection couplings, transport channels, a cutaway server rack, four
receiving trays and a document easel. See the [parts record](between-a-click-and-a-page-parts.md).
DNS lookup selects address information. TCP setup establishes connection state;
TLS establishes protection. Moving tokens illustrate response-byte ranges travelling
through the network. Slots reveal the difference between arrival and ordered
delivery. The easel's document reveal is a pedagogic progress cue.

This is an invented mechanism. TCP does not reserve a physical track or fixed path,
and a server is not obliged to use the pictured software organisation. The returned
HTTP representation is decoded for teaching; actual wire traffic is encrypted TLS
records carried by TCP. Token positions do not represent a literal packet trace.

## Model contract

`src/lib/visualizations/between-a-click-and-a-page/model.ts` normalises inputs,
constructs an immutable timeline and samples snapshots without browser globals.
The default uses a 120 ms round trip, one simulated DNS round trip, a fresh TCP
connection, a one-round-trip TLS 1.3 handshake, 80 ms origin work, 4,800 response
bytes at 60 bytes/ms and a grouped follow-up resource exchange. Browser assembly
is fixed at 60 ms. No 0-RTT data, resumed handshake or speculative preconnection is
simulated. Default totals are 872 ms fresh, 512 ms reused, 1,082 ms with loss and
60 ms from a fresh browser cache. All times are illustrative.

Response ranges are `[0,1200)`, `[1200,2400)`, `[2400,3600)` and `[3600,4800)`.
With loss enabled, the second original transmission disappears, the third and
fourth ranges buffer beyond its gap, and a deterministic retransmission fills it.
`nextExpectedByte` is a relative decoded-response offset, not an actual encrypted
TCP acknowledgement number. Arrival never increases delivered bytes beyond a gap.
The model does not duplicate delivered bytes after retry. The timing receipt's
non-total entries add exactly to total time.

Reuse assumes both usable cached DNS information and an already protected open
connection. Fresh browser cache assumes a reusable page and all required resources,
and skips every origin and network stage. It is not a CDN-cache simulation: an edge
cache still requires reaching the edge. The cache scenario has zero network-stream
counters. Follow-up resources are deliberately grouped and serialised after the
initial response; real browser parsing, scheduling and network requests can overlap.

Limits: no congestion/receiver-window algorithm, real retransmission estimator,
certificate failure, ultimate timeout, network discovery, multi-origin scheduling,
IP/TLS/HTTP framing, service worker, external telemetry, packet capture or live
network probe. Page progress weights response delivery and follow-up work and must
not be presented as a real paint-performance measurement. HTTP/2 and HTTP/3 are
explained in a comparison, not simulated by changing a misleading protocol badge.

## Rendering and lifecycle

`ClickToPage.svelte` SSRs a representative gap/buffer state and readable caption.
Its controlled lazy import is disposed correctly if the shell unmounts.
`RequestRuntime.svelte` owns settings, scrubbing, selected mechanism and playback
per mount. `RequestScene.svelte` owns presentation writes to generated SVG parts
and moving-token refs. The same pure snapshot supplies captions, counters and
tile status. Frame work samples model time without using animation as an input
to the domain; UI refreshes are bounded and not a Svelte render on every frame.

No automatic playback begins on load. Still and OS reduced motion disable the
play button and leave manual steps/scrubbing available. Offscreen and hidden
documents stop frames; restoring visibility resumes only an already requested
playback. All frames, intersection/preference observers and media-query/visibility
listeners are cleaned up on unmount. Mobile presents a selected mechanism crop;
whole-instrument view remains available. Text and dash/solid cues accompany colour.

Geometry uses `scripts/lib/openhie-anatomy` (MIT, Copyright (c) 2026 Ryan) at build
time only. Controlled committed geometry is the only source of SVG `{@html}`.
`anatomy.css` copies the existing kit's ISO_CSS with feature-scoped visual overrides.
The generated geometry audit covers true recorded static shapes. Runtime token
travel is on a documented straight clear channel and is visually verified; static
audit success alone is not represented as proof of dynamic token collision bounds.

## Verification and publication artifacts

```sh
npm run http-tcp:test
npm run http-tcp:geometry
npm run check
npm run http-tcp:assets -- --base http://127.0.0.1:4296
npm run http-tcp:assets:check
npm run build:full
npm run http-tcp:browser:test
git diff --check
```

The asset renderer accepts only loopback preview URLs and blocks service workers.
It captures the implemented default article instrument, emits a 1200 × 630 PNG
at `static/images/visualizations/between-a-click-and-a-page/social.png`, and records
normalised source hashes and decoded pixel hash in adjacent `assets.json`.
The complete feature-artifact lane checks this provenance as well as deterministic
geometry; the routine prose lane does not acquire feature-audit work.

Focused tests cover recovery without out-of-order delivery or duplicate bytes,
cache and reuse bypasses, causal controls, input/time bounds and timing accounting
over 72 settings combinations. Browser checks exercise reading without JS, controls,
keyboard, reduced motion, mobile crops/overflow and actual screenshots on loopback.
Evidence and any unavailable/unrelated checks are reported in the task handoff.
The [verification record](between-a-click-and-a-page-verification.md) records the
production-browser evidence and the unrelated full-feature-lane stop.

The [editorial record](between-a-click-and-a-page-editorial.md) identifies the user's
supplied writing instructions and verified primary references. No installation of
a missing writing skill or publication to a live URL is implied by local files.
