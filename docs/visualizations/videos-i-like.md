# Videos I Like

Videos I Like is an ordinary Markdown app post at
`/blog/visualizations/videos-i-like`. Its source catalogue comes from the
`drafts/` directory of `suvrotica/SuvroTuitionBlog`, on branch `laptop`.
The import records the resolved commit rather than relying on a moving branch
when describing provenance.

## Responsibilities

- `src/lib/posts/videos-i-like.md` owns publication metadata and reader guidance.
- `src/lib/components/visualizations/videos-i-like` owns the gallery, topic and
  music filters, search, media permission and one selected player.
- `src/lib/visualizations/videos-i-like/catalogue.json` is the imported editorial
  manifest. `catalogue.ts` exposes the typed manifest, and `types.ts` defines the
  browser-safe catalogue and availability response contracts.
- `scripts/import-videos-i-like.mjs` scans Markdown as data and produces that
  manifest. It does not execute imported Svelte scripts or modify the source
  repository.
- `src/lib/server/videos-i-like` owns provider lookups, availability screening,
  bounded caching and request admission.
- `src/routes/api/videos-i-like/+server.ts` admits bounded same-origin requests
  for the fixed catalogue or its known playlist continuation.
- `src/lib/visualizations/listening-room/youtube.ts` is the existing official
  IFrame API adapter reused by both apps. The gallery uses numeric `errorCode`
  rather than interpreting display text. An optional `iframeTitle` changes only
  the accessible title; existing Listening Room callers keep their default.

## Editorial catalogue

The initial source snapshot is commit
`729fa4cc676ee2f26d946f2ef800127e52160b22`: 108 Markdown files, 96 direct
references in 16 posts, 89 distinct standalone videos, five ordinary playlists
and one generated Mix. The single duplicate video, `EkyAuG9RSSU`, retains both
its `MedDoc.md` and `OldPhotos.md` references. These are import counts, not a
claim that the corresponding uploads currently play.

Each record keeps its canonical identity, source file and original URL, source
order, category memberships, and meaningful time/index context. Tracking
parameters are removed from canonical URLs. An unused player import does not
create a record. Provider titles, thumbnails and availability are transient
metadata rather than permanent author statements.

The app groups entries into Music, Films, Audiobooks, Documentaries, Maths, Talks
and Other, with All as the complete deduplicated view. The explicit Movies
heading in `Bengali.md` places 13 entries in Films and its other four in
Music/Bengali. Music adds Bengali, Hindi,
English and Rabindrasangeet filters. An entry may appear under more than one
topic; it appears only once in All. Playlist member videos do not expand into
hundreds of top-level gallery cards.

To reproduce the initial import, use:

```powershell
node --experimental-strip-types scripts/import-videos-i-like.mjs --commit 729fa4cc676ee2f26d946f2ef800127e52160b22
```

Add `--check` to compare without writing. Omit `--commit` to resolve the current
`laptop` head once, then read every file using that immutable commit. Optional
`--output <path>` writes an alternate artifact. Import fetches use at most six
concurrent requests, a 15-second deadline per request, a streamed 2 MiB limit per
file and 8 MiB tree limit. The importer rejects truncated trees and more than
1,000 Markdown files. It is an explicit maintenance command, not a reader or
routine build dependency.

## Availability and credentials

Configure `YOUTUBE_DATA_API_KEY` in the server environment for public YouTube
Data API v3 access. Restrict that credential to the required Google API and
configure the provider project's quota. Never use a `PUBLIC_` variable or send
the key to a browser. This feature does not need OAuth access to a visitor's
YouTube account.

The page requests its own availability endpoint on opening. The server reads
only curated IDs, batches video lookups and uses the official playlist-items
API for ordinary playlists. Short-lived metadata is cached in the running
server process with in-flight work coalescing: successful snapshots last 15
minutes; incomplete snapshots expire after one minute. A shared raw-video cache
deduplicates lookups across standalone entries and playlist memberships, with a
5,000-record ceiling. Snapshot expiry respects the oldest underlying metadata;
reusing a video does not extend its check time. An idle expiry timer releases
snapshot and cached metadata. Process-local limits and cache
are not a distributed quota ledger across serverless instances; Google project
quota remains the external budget boundary.

The JSON POST body is either `{}` or `{ "playlistKey": "playlist:<known-id>",
"page": <nextPage> }`. Continuation uses the next page number returned by the
server; no client supplies a provider page token. The endpoint rejects unknown
keys and out-of-range pages, requires a matching Origin, and admits only JSON.
It enforces a streamed 1 KiB body cap with a three-second read deadline. Current
process-local endpoint limits are 30 attempts per client and 120 globally per
minute, with two concurrent requests per client and eight globally. Responses
are private/no-store so a viewer-specific result cannot enter a public CDN cache.

Provider operations have an 18-second overall deadline and six-second individual
request deadlines. The service also enforces a process-local rolling ceiling
of 2,000 provider calls per day. Public retries do not reset that budget.

Screening considers returned resources, embedding permission, privacy/upload
state, age restrictions and applicable region restrictions. The server does not
infer the visitor's country from its own location. Provider data is cached
independently of viewer-specific decisions. Geography is accepted only from
`x-vercel-ip-country` on the canonical `https://www.suvroghosh.in` origin when
`VERCEL=1` and `VERCEL_ENV=production`; other environments leave country unknown.

`eligible` means the metadata screening passed. It cannot establish all
viewer-, account-, domain- or claim-specific playback restrictions.
`unavailable` means a successful lookup reports unsuitable content or omits the
resource. Missing resources do not distinguish private uploads from deletions.
`unknown` covers missing configuration, quota failures, network deadlines and
provider errors. Only eligible entries appear in the playable grid. A failed
check never deletes editorial source records or becomes a false “deleted” label.

Successful results carry check timestamps and freshness. The browser can retry
an incomplete check, but retry does not bypass cache, provider backoff or rate
limits. Failed playlist continuation has a one-minute cooldown and preserves the
already checked prefix. Continuation works on a copy and commits only within
its deadline, so a late provider response cannot mutate a returned snapshot.
No API metadata is written into the permanent catalogue or browser
storage; short cache lifetimes remain below YouTube's 30-day refresh/deletion
requirement for stored non-authorized API data.

Playlist members are checked in source order, in bounded pages. A playlist needs
at least one eligible member for the main grid; one broken member does not
invalidate the collection. The interface labels checked counts and partial
results, with explicit continuation rather than pretending to have checked an
arbitrarily large playlist. Continuation checks one further page of up to 50
members, with an absolute ceiling of 20 pages (1,000 members). An expired
snapshot restarts from the first page instead of reusing old provider tokens.
Generated Mix `RD6sfHEAeNklM` is kept as an external
YouTube link, not asserted to be an enumerable public playlist.

## Browser media boundary

First-party availability checks may run before media permission: they send the
fixed catalogue to Google from the server, not browser identifiers or a visitor
chosen search query. Browser requests to provider thumbnails, scripts or frames
remain behind remembered media permission or explained one-time activation.
Local placeholders render before activation. Revocation or expiry removes
provider images and destroys any active or starting player.

The gallery owns a filtered queue and uses one visible official player. Opening
the page does not autoplay, and hidden players are not used to test links.
Queue positions identify occurrences, so a playlist may repeat a video without
duplicate render keys or an auto-next loop. A refreshed catalogue reconciles the
selected queue and unloads a video that is no longer eligible. Expired metadata
blocks new playback selections; a continuation that crosses expiry refreshes the
complete catalogue before extending any card's freshness.
The adapter retains native controls, the real page origin and
`strict-origin-when-cross-origin` referrer policy. It exposes only documented
player operations, not iframe DOM access, audio extraction or a media proxy.

Player errors 100, 101 and 150 can suppress the current video for this visit and
offer another eligible selection. Errors 2, 5 and 153 indicate input,
environment or identification problems and must not classify an upload as
deleted. `onReady` means that API calls can be accepted, not that playback
succeeded. Autoplay blocking requires a user Play action. Session failures are
not persisted or promoted into shared server availability state.

## Verification boundaries

Import tests cover source URL normalization, rejected hosts, deduplication and
provenance. Service and route tests cover metadata outcomes, playlists, partial
failures, deadlines and request admission. Controller regression tests retain
Listening Room behavior while verifying numeric error identity and accessible
titles. Gallery browser checks cover filtering, queue selection, consent,
single-player cleanup, failures and responsive/keyboard interaction.

Mocked provider responses make failures reproducible; they do not prove live
YouTube playback or production credential configuration. Record actual build,
browser and hosted checks in the release handoff. The repository's forensic
audit records missing security commands; this feature does not turn those
recommendations into implemented global safeguards.

See [ADR 0024](../architecture/decisions/0024-curated-youtube-availability.md),
the [canonical architecture](../architecture/ARCHITECTURE.md#videos-i-like-curated-availability-and-consented-playback),
the [video metadata reference](https://developers.google.com/youtube/data/reference/rest/v3/videos),
the [playlist-items reference](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list),
and the [IFrame API reference](https://developers.google.com/youtube/iframe_api_reference).
