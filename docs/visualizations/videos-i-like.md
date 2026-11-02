# Videos I Like

Videos I Like is an ordinary Markdown app post at
`/blog/visualizations/videos-i-like`. Its catalogue combines links from the
`drafts/` directory of `suvrotica/SuvroTuitionBlog`, on branch `laptop`, with
YouTube links explicitly imported from the author's local Obsidian Videos
collection. The GitHub import records the resolved commit rather than relying
on a moving branch when describing provenance. The local import publishes only
link records and short collection labels; note prose and vault paths stay local.

## Responsibilities

- `src/lib/posts/videos-i-like.md` owns publication metadata and reader guidance.
- `src/lib/components/visualizations/videos-i-like` owns the gallery, topic and
  music filters, search, media permission and one selected player.
- `src/lib/visualizations/videos-i-like/catalogue.json` is the imported GitHub
  manifest; `obsidian.json` is the separate local-note link manifest.
  `catalogue.ts` uses `merge-catalogues.ts` to merge their entries by canonical
  identity without dropping source references or category memberships. `types.ts`
  defines the browser-safe catalogue and availability response contracts.
- `scripts/import-videos-i-like.mjs` scans Markdown as data and produces that
  manifest. It does not execute imported Svelte scripts or modify the source
  repository.
- `scripts/import-obsidian-videos.mjs` reads an explicitly supplied local folder
  as data and writes the supplemental link manifest. It does not modify notes,
  copy their prose, execute Markdown, or run as part of the build or reader flow.
- `src/lib/server/videos-i-like` owns provider lookups, availability screening,
  bounded caching and request admission.
- `src/routes/api/videos-i-like/+server.ts` admits bounded same-origin requests
  for fixed catalogue batches or a known playlist continuation.
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

The Obsidian addition contains 279 references from 30 Markdown notes: 76 distinct
videos and 194 ordinary playlists. None duplicate the original catalogue. The
combined catalogue therefore has 365 selections: 165 videos, 199 ordinary
playlists and one Mix. Duplicate references within a source are retained without
adding duplicate cards. Import counts remain separate from current eligibility.
Three YouTube channel links and one external article are deliberately excluded;
all 30 notes contain at least one supported video or playlist reference.

Each record keeps its canonical identity, source identity, source order,
category memberships, and meaningful time/index context. GitHub records retain
their original URLs and public source links. Local records contain normalized
YouTube URLs, stable source identifiers and short collection labels, with no
pretend public URL for a private note. Tracking parameters are removed from
canonical URLs. An unused player import does not create a record. Provider
titles, thumbnails and availability are transient metadata rather than
permanent author statements.

The app groups entries into Music, Films, Audiobooks, Documentaries, Maths,
Science, Technology, Food, Talks and Other, with All as the complete deduplicated
view. The explicit Movies
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

Import the local collection separately:

```powershell
node --experimental-strip-types scripts/import-obsidian-videos.mjs --folder "<local Videos folder>"
```

The folder is an explicit local input, never a committed machine-specific path.
The checked-in supplemental manifest lets builds run without the vault. Refreshing
the GitHub source cannot erase local additions, and refreshing the local source
cannot replace the GitHub snapshot. The local importer recognizes ordinary video
and playlist URLs and normalizes the legacy `view_play_list?p=` form. Channel
links and non-YouTube pages are excluded because they are not fixed playable
selections.

`--folder` is required. Add `--check` to compare without writing or `--output`
to choose an alternate manifest outside the source folder. Traversal is bounded
to 1,000 Markdown files, 2 MiB per file, 8 MiB total, 16 nested directory levels
and 10,000 filesystem entries. Linked files/directories and paths resolving
outside the supplied folder are rejected. File contents are read with a byte
limit as well as an initial size check. The importer also rejects an output
inside the source folder or an output that is a symbolic or hard link, preserving the read-only
source boundary.

The source disclosure keeps the public GitHub post links. Saved-note collections
are separate collapsible groups with safe subject labels and original YouTube
links. Checked provider titles label those links when available; otherwise a
kind/ID label preserves a usable fallback. A visitor never receives a local
file link or access to the note itself.

## Availability and credentials

Configure `YOUTUBE_DATA_API_KEY` in the server environment for public YouTube
Data API v3 access. Restrict that credential to the required Google API and
configure the provider project's quota. Never use a `PUBLIC_` variable or send
the key to a browser. This feature does not need OAuth access to a visitor's
YouTube account.

The page requests its own availability endpoint on opening. The server reads
only curated IDs, batches video lookups and uses the official playlist-items
API for ordinary playlists. The initial request checks all standalone videos,
retains the external Mix and checks the first eight ordinary playlists. Later
requests each check the next fixed group of at most eight playlists. The browser
merges these results and displays eligible cards while checks continue. A cold
server process can check a later batch without first rechecking the initial
batch or unrelated playlists. If a batch request fails, **Continue checking**
resumes at that group while the previously checked, still-fresh cards remain
usable. **Refresh videos** starts the catalogue check again.

Short-lived metadata is cached in the running server process with in-flight work
coalescing. Successes last 15 minutes; actual failures have a one-minute retry
lifetime. Intentionally unrequested batches do not shorten the lifetime of
successful entries. A shared raw-video cache deduplicates lookups across
standalone entries and playlist memberships, with a 5,000-record ceiling. Each
response expires with its oldest returned metadata; reusing a video does not
extend its check time. The browser retains the earliest expiry across merged
results, so a later batch cannot renew an older card. An idle expiry timer
releases cached state. Batches share the same provider cache, concurrency and
request budget. Process-local limits and cache are not a distributed quota
ledger across serverless instances; Google project quota remains the external
budget boundary.

The JSON POST body is `{}` for the initial batch, `{ "batch": <nextBatch> }` for
the next catalogue batch, or `{ "playlistKey": "playlist:<known-id>",
"page": <nextPage> }` to continue one playlist. The response's optional
`nextBatch` identifies the next fixed catalogue group; it is not a video ID,
provider token or arbitrary offset. Missing configuration stops the batch chain.
The playlist's `nextPage` remains separate and never accepts a provider page
token. On a cold process, a playlist continuation checks that playlist's first
page rather than loading the rest of the catalogue. The endpoint rejects unknown
keys, mixed query forms and out-of-range batches/pages, requires a matching
Origin, and admits only JSON.
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
members, with an absolute ceiling of 20 pages (1,000 members). Expired playlist
metadata restarts from the first page instead of reusing old provider tokens.
Generated Mix `RD6sfHEAeNklM` is kept as an external
YouTube link, not asserted to be an enumerable public playlist.

## Browser media boundary

First-party availability checks may run before media permission: they send the
fixed catalogue to Google from the server, not browser identifiers or a visitor
chosen search query. Browser requests to provider thumbnails, scripts or frames
remain behind remembered media permission or explained one-time activation.
Local placeholders render before activation. Media permission revocation or
expiry removes provider images and destroys any active or starting player.

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

Import tests cover source URL normalization, rejected hosts, local filesystem
bounds, deduplication and provenance. Merge checks preserve both independent
source manifests and their memberships. Service and route tests cover metadata
outcomes, fixed catalogue batches, cold-process isolation, shared limits,
playlists, partial failures, deadlines and request admission. Controller regression tests retain
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
