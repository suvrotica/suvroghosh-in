# Article narration

The shared article player prefers saved Google narration when a complete, current audio manifest
exists. Its default locale is **US English (`en-US`)**. When narration is unavailable, readers can
listen with their browser/device voices and select another installed voice. Device voices vary
by operating system and browser; the site cannot install or guarantee a particular device voice.

Google synthesis is an explicit authoring operation. A visitor, page load, ordinary build,
pause/resume, or playback-speed change never initiates a Google generation request. Saved audio
can be played repeatedly without spending generation quota. There is no new public speech API.

## Free-tier setup

1. Create a Gemini Developer API project/key in [Google AI Studio](https://aistudio.google.com/api-keys).
2. Verify that the project is on the **Free tier**, with billing disabled. Do not use a paid project
   or assume that an unused paid allowance is equivalent to the Free tier.
3. Set `GEMINI_API_KEY` in your ignored `.env.local` or local process environment.
4. Set `GEMINI_TTS_FREE_TIER_CONFIRMED=true` only after verifying that project tier.

The confirmation flag is an operator assertion, **not an automatic Google billing audit**. The
generator cannot establish billing status from an API key. Neither a request counter nor this
flag can make a key for a paid project free. Keep the key on a project without billing enabled.
No code in this feature enrolls in billing or falls back to paid models/providers.

The baseline model is `gemini-3.8-flash-tts`. On 21 October 2026, the official Gemini Developer API
[pricing table](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts) lists free input
and output for this model. Google's [rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits)
explains that limits depend on model and project. Check current availability and your project's
quotas in AI Studio before generating. Free-tier content may be used to improve Google's products;
this workflow sends only already-public article text.

`GEMINI_TTS_MODEL` and `GEMINI_TTS_VOICE` are private authoring configuration. The default
voice is **Achird (`achird`)**, verified against the prebuilt US English regional catalogue.
Voice selection and concise delivery metadata follow Google's
[speech-generation documentation](https://ai.google.dev/gemini-api/docs/speech-generation).

## Hosted daily continuation

The hosted authoring lane is `.github/workflows/article-narration.yml`, backed by
`scripts/github-narration.mjs` (`npm run narration:hosted`). It uses a standard GitHub-hosted
Ubuntu 24.04 runner in this public repository. Its daily schedule is **08:45 UTC / 2:15 p.m.
India time**; manual dispatch is also available. Both entry points run the `main` revision only.
There are no pull-request triggers. One repository-wide concurrency group queues narration runs
with cancellation disabled, so a manual dispatch cannot cancel a run that has already reserved
quota or saved part of an article.

Activation requires a successful hosted validation run, including durable state restoration and
production verification. Pause the former local Codex heartbeat only after that succeeds; do not
leave both schedules generating independently. The hosted lane then continues without this
computer or Codex running. An ordinary site build and public playback remain independent of it.

Configure these repository settings through GitHub's Actions secrets and variables UI or the
authenticated GitHub CLI. Never paste either secret into chat, commit it, or put it in a command
argument or public variable.

| Setting                          | Kind                        | Required value and purpose                                                                                                                         |
| -------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                 | Actions repository secret   | The existing key already verified against the unlinked Free-tier project; transfer it privately from the local secret through CLI standard input.  |
| `NARRATION_STATE_KEY`            | Actions repository secret   | 32 cryptographically random bytes encoded as exactly 64 hexadecimal characters; encrypts pending WAV state with AES-256-GCM. Keep a secure backup. |
| `NARRATION_GOOGLE_PROJECT_ID`    | Actions repository variable | `gen-lang-client-0296473115`; pins the operator-verified Google project, number `570357561308`.                                                    |
| `NARRATION_GOOGLE_KEY_SHA256`    | Actions repository variable | SHA-256 of that verified API key; detects an unexpected key replacement without exposing the key.                                                  |
| `NARRATION_FREE_TIERS_CONFIRMED` | Actions repository variable | `true` after verifying the pinned Google project has billing unlinked and Vercel remains on Hobby; records operator attestation.                   |
| `NARRATION_HOSTED_ENABLED`       | Actions repository variable | Initially `false`; set to `true` only after hosted validation succeeds and the former local schedule is paused.                                    |

The workflow uses its repository-scoped `GITHUB_TOKEN` with `contents: write` and
`deployments: read`. It needs no personal access token, Vercel token, Google service account,
OIDC trust, or extra Google IAM grant. The Google key remains dedicated to synthesis. The job
does not enable billing, choose a paid fallback, upgrade Vercel, or grant itself account access.

The project and key pins are **configuration attestation, not a live billing audit**. On
21 October 2026, AI Studio showed this project on the Free tier with billing unlinked, and the
existing Vercel project was confirmed on Hobby. Future runs assume those account settings remain
unchanged. The key cannot enable billing; a project administrator can change billing outside
this workflow. Stop the workflow and review the pins before changing the key, project, model,
or billing configuration. Google's [billing guide](https://ai.google.dev/gemini-api/docs/billing/)
explains that keys inherit their project's tier. A live
[billing-state API check](https://docs.cloud.google.com/billing/docs/reference/rest/v1/projects/getBillingInfo)
requires separate OAuth/IAM credentials; this design deliberately avoids granting that additional
access. A daily request cap cannot make a paid project free.

### Durable quota and resumable audio

The authoritative hosted quota state is tiny metadata on `codex/narration-state`, rather than
the disposable runner filesystem or an Actions cache. Every catalogue or synthesis attempt is
reserved there **before** its Google request. Updates use the previously read commit as their
parent and a non-forced fast-forward ref update; a competing update or failure stops the request.
The same ten-call Pacific-day cap, 65-second spacing, DST-aware reset, and HTTP 429 halt apply
across restarts. The state pins the verified project/key identity and records quota plus the
checksum and pointer for the current encrypted checkpoint snapshot. Its branch contains
`vercel.json` with Git deployment disabled, so quota commits are not site deployments.

Pending and incomplete WAV sources are encrypted with AES-256-GCM before upload as assets of
the `narration-checkpoints` prerelease. This is a public repository: the ciphertext and minimal
state metadata are public, while the encryption key remains an Actions secret. An authenticated
snapshot and its checksum must validate before any source state is restored. The raw checkpoint
payload is capped at **384 MiB**, the archive at **512 MiB**, and only the two current owned
snapshot assets are retained. Upload the replacement, commit its state pointer, then prune older
owned assets; never prune first. A failed checkpoint write blocks further provider requests.
Actions artifacts and caches are not the authoritative WAV or quota store.

Keep `NARRATION_STATE_KEY` stable while snapshots depend on it. If it is lost or replaced, stop
generation and restore the matching key or perform an explicit recovery; do not silently reset
the quota ledger or discard pending state. Already-published MP3s remain playable. Local original
WAVs are retained, and the hosted job does not delete files from this computer.

The generator prioritizes validated partial articles and recognizes current, checksum-verified
delivery MP3s even when their WAV sources have been retired from hosted state. Complete narration
is compressed, validated, and committed to `main` as MP3s plus manifests. Vercel's existing Git
integration deploys that commit. The job waits for the corresponding production deployment
status and verifies the custom-domain manifests and audio before dropping those completed WAV
copies from runner state. A missing deployment, failed live check, or state conflict stops
cleanup and publication progress; it does not fall back to a Vercel administrative token.

### Operation and limits

After the workflow is on `main`, validate restoration and delivery with `verify_only` while
hosted generation remains disabled. The one-time `deployment_probe` option creates an empty bot
commit on `main` solely to prove that the existing Git integration deploys a `GITHUB_TOKEN` push;
it does not spend Google quota. Ordinary runs do not create empty commits. Once the hosted checks
pass, pause the local heartbeat and enable `NARRATION_HOSTED_ENABLED` before normal dispatch.
An authorized maintainer can start or inspect runs with:

```sh
gh workflow run article-narration.yml --ref main
gh run list --workflow article-narration.yml --limit 5
```

Use GitHub Actions to inspect the run summary and deployment verification. Expected quota pauses
are resumable; authentication, state corruption, deployment failures and size limits need review.
Do not delete the state branch, reseed a populated ledger, or force-push over a conflict to obtain
another daily allowance. Manual local generation must not run alongside the hosted schedule with
an independent quota ledger.

Standard hosted runner time is [free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
Larger runners and separately metered Actions storage are not part of this design. GitHub
[release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
allow up to 1,000 assets per release, each under 2 GiB; this lane retains at most two bounded
encrypted snapshots. Release storage does not make the repository, provider or hosting service
unlimited. The publication guard caps delivery audio at **6 GiB** and the site's payload
at **8 GiB**, leaving 2 GiB below the currently documented 10 GiB Hobby deployment-storage
allowance. These are deployment-size safeguards, not measurements of account-wide
Vercel storage, retained deployments, or transfer. The workflow has no Vercel read credential
to audit that usage. Stay within the existing [Hobby limits](https://vercel.com/docs/plans/hobby)
and review the account dashboard before increasing the caps; stop at limits without an upgrade.
Hosted generation also requires at least 2 GiB of free runner disk for bounded pending work.
The 384 MiB pending-data cap does not permit accumulating the full WAV corpus on a runner.
Manual local generation requires the operator to monitor available disk space.

GitHub's scheduled events can be delayed or dropped, and public-repository schedules can be
disabled after 60 days without repository activity. The workflow must exist on the default
branch. Manual dispatch is the recovery path; a missed schedule does not justify a second quota
allowance. See [GitHub's schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Preview and generate

Start the local site in one terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 4218
```

In another terminal, inspect the command and perform a dry run (no Google key needed):

```sh
npm run narration:generate -- --help
npm run narration:generate -- --missing --dry-run --limit 1
```

Once the free-tier key is configured, list matching voices, create an audition, and generate a
single article before considering a larger batch:

```sh
npm run narration:generate -- --list-voices
npm run narration:generate -- --sample
npm run narration:generate -- --slug the-new-mantra --limit 1 --max-requests 5
```

Listen to the audition and the generated article. Model descriptions and successful protocol
tests do not establish perceptual voice quality. Check natural US English pronunciation,
sentence stress, Bengali names and mixed-language passages before generating a batch.
After choosing the narrator, set `GEMINI_TTS_VOICE` to the returned catalogue ID so later runs
keep that exact voice. Open the audition's returned absolute local audio path to listen.

Use `--origin` to select a different loopback preview/dev address. The script reads canonical
article URLs from that local site's sitemap, then checks local source publication metadata.
Future-dated posts and drafts are excluded. Use the current checkout's local server, not a
different checkout or a remote production site.

```sh
npm run narration:generate -- --status
npm run narration:batch
npm run narration:generate -- --missing --limit 3 --max-requests 5
npm run narration:generate -- --stale --limit 3 --max-requests 5
npm run narration:generate -- --stale --dry-run --limit 20 --offset 20
```

`narration:batch` inspects up to 20 missing articles, prioritizing validated partial work before
new articles from newest to oldest, and permits at most
10 Google calls, including catalogue lookup. Repeat from offset zero: the missing queue shrinks
as manifests become complete. Interactive game routes have no prose reading region and are
counted separately from narratable articles. Drafts and future posts remain excluded.

Every real CLI mode shares the ignored `.codex-artifacts/narration-quota.json` ledger under the
repository generation lock. It reserves each attempt **before** transport, caps all invocations
at **10 calls per Pacific calendar day**, and spaces calls by at least **65 seconds**. Catalogue,
failed, interrupted and successful attempts count conservatively. Pacific midnight rollover
handles daylight saving time. An HTTP 429 blocks further attempts until the next Pacific day;
corrupt state, clock rollback or persistence errors stop requests. Do not delete the ledger to
restart a batch. If initial project usage predates the ledger, seed its dated initial usage
after inspecting AI Studio; normal runs never reseed an existing file.

These request safeguards are not replacements for Google's project quotas or a billing audit.
They cannot see requests from other clients. AI Studio showed 3 RPM, 10,000 input TPM and
10 RPD for this project's `gemini-3.8-flash-tts` on 21 October 2026. The slower local spacing
and transcripts bounded by characters, UTF-8 bytes and word count leave room below the minute limits. Verify current
limits before changing the safeguards. Do not use the paid provider Batch API for this rollout.

Generation is sequential and bounded. Quota exhaustion pauses the run without selecting a
paid alternative. Resume with the same command; validated completed segments can be reused.
Expected request/day/quota pauses report `paused` and exit successfully; actual errors exit
nonzero. `.codex-artifacts/narration-last-batch.json` records the most recent real batch's
counts and quota state for local continuation. It contains no credentials or article text.
Missing credentials or confirmation stop real Google operations before any provider request.
An interrupted stale-lock recovery can leave a `.recovery` marker in the local temporary
directory. The error reports its exact path. Verify that no narration command is running before
manually removing that marker; the script deliberately does not steal an in-progress recovery.
`--limit` bounds inspection as well as generation; use `--offset` to inspect later windows of
existing manifests when checking stale narration. `--status` is a lightweight inventory: present
manifests remain unverified until their rendered transcript and segment files are checked.

## Compress and publish

Generation saves lossless WAV segments, checkpoints and complete source manifests under the
ignored `.codex-artifacts/narration-sources/<slug>/` directory. This private cache supports
resumption and never enters the browser bundle, Git or a Vercel upload. Auditions and partial
articles stay there. The generator does not overwrite compressed delivery manifests.

Install FFmpeg locally for this explicit authoring step. Either set `FFMPEG_PATH` to its absolute
executable path, make `ffmpeg` available on `PATH`, or install the optional encoder in the ignored
tools directory:

```sh
npm install --prefix .codex-artifacts/narration-tools --no-audit --no-fund --save-exact ffmpeg-static@5.3.0
npm run narration:compress -- --all
```

Use `--slug <slug>` (repeatable) to limit compression to selected complete articles. The command
validates source manifests and WAV checksums, encodes 64 kbps mono MP3 at 24 kHz, then fully
decodes each result to check duration. It atomically writes a public manifest only when every
segment is valid. Repeating the command reuses validated compressed files. It shares the generation
lock but never calls Google, reads an API key, changes the quota ledger, uploads or deploys.
FFmpeg is not required by the site build or on Vercel.

Public delivery consists only of complete `static/audio/articles/<slug>/manifest.json` files and
content-hashed MP3 segments. The manifest retains the WAV generation identity and records MP3
delivery details and checksums separately; this preserves freshness checks and source reuse.
Review and commit these complete assets together with the player before an authorized deployment.

For the first three articles, the existing Vercel project was verified on the active **Hobby**
plan on 21 October 2026. Its same-origin static storage/CDN serves the files without another
storage account, storage credentials or paid service. The three MP3s total **3,485,511 bytes**,
compared with **20,919,474 bytes** of WAV: **83.34% smaller**, with 435.44 seconds of narration.
Manifests revalidate; content-hashed MP3 URLs are cached immutably. Keep account-wide deployment
storage and transfer within the current [Hobby limits](https://vercel.com/docs/plans/hobby).
The initial three-file release used an explicit deployment. Hosted daily publication is the
separate authoring lane described above and in [ADR 0004](architecture/decisions/0004-github-actions-article-narration.md).

Routine hosted runs verify only newly ready deliveries or publications still awaiting successful
verification. Already verified initial articles do not trigger another production browser run
on a no-work day. Explicit `verify_only` and `deployment_probe` runs retain the three initial
smoke fixtures. Production smoke contexts block service workers; local extraction, feature tests
and repeated performance measurements use loopback previews. This prevents verification from
installing an offline cache for unrelated pages. A new or recovered delivery still receives its
manifest, audio and browser verification before completed source WAVs are retired.

## Storage, extraction and freshness

At 24 kHz, mono, 16-bit PCM, local WAV sources occupy roughly **2.88 MB per minute**.
The provider-free audit snapshot on
21 October 2026 inspected 698 published canonical pages: **694 prose articles**, four interactive
games without a reading region, 7,119 legacy-sized segments and an estimated **31.56 GiB** / 196 hours
of WAV narration at 150 words/minute. Route/extraction errors were zero. The ignored
`.codex-artifacts/narration-corpus-plan.json` records that snapshot, including public transcripts;
generation still extracts the current rendered page and does not trust this cache for freshness.

Retain validated provider WAV locally during manual generation. The available disk had about
196 GiB free before rollout, enough for that snapshot. At the chosen MP3 bitrate, the same full
corpus would be roughly **5.3 GiB** of delivery audio. Review account-wide storage, old deployments
and transfer before a large release or a move to another same-origin media store. Current article
counts can grow beyond the dated snapshot. At the
conservative allowance of nine syntheses plus one catalogue request per day, the larger bounded
segment policy reduces the snapshot to **2,367 segments**, or about **264 daily batches** allowing
for the already-started legacy article, before failures, revisions or new posts. The initial
1,800-character policy would have required about 792 daily batches.

The hosted lane replaces local daily continuation after its activation checks pass. Local
`narration:batch` and `narration:compress` remain useful for explicit operator work with the current
checkout's preview available. Coordinate quota state before switching between local and hosted
generation; independent ledgers cannot observe one another. Both lanes preserve Achird, the
billing-disabled Free-tier assumption, quota stops and browser fallback. Hosted state retains
only bounded pending work, rather than accumulating the estimated full WAV corpus.

The generator and player share DOM-based narration extraction. It retains structural paragraph
breaks, reading order, and the site's explicit article-reading/exclusion conventions. It excludes
controls, hidden chrome, embedded applications and code. Generation uses a script-disabled DOM
of the rendered local page, so client simulations cannot contribute unstable narration text.
Text is split at natural boundaries rather than silently clipped. New segments permit up to
6,000 UTF-16 code units, 7,000 UTF-8 bytes and 900 words, with a 600-second WAV ceiling,
48 MiB streamed-response limit and 240-second provider deadline. These are local safeguards;
Google's current [model specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts)
lists 8,192 input / 16,384 output tokens, and its
[pricing page](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts) describes 25 audio
tokens per second. A 600-second audio cap leaves room below that
output-token ceiling. Existing complete manifests and unfinished articles with a validated
legacy first segment keep their 1,800-character segmentation, so saved work is reused.
The manifest records its recognized segmentation policy; unknown policies are rejected.
The larger policy was exercised against the real Free-tier API on 21 October 2026 using
the 740-word “August Fifteenth” article as one complete segment, rather than its three legacy
segments. Achird generation completed and the returned WAV passed checksum/container validation.

The manifest records the transcript hash and generation configuration. Text, extraction-version,
model, voice or style changes invalidate the relevant generation cache. The browser compares
the current extracted transcript to the manifest and offers device speech for stale/missing
narration. It never silently plays an outdated transcript. Provider credentials are absent from
manifests, assets and browser code.

Manifests revalidate; content-hashed MP3 URLs have immutable cache headers. The feature uses
same-origin media within the existing CSP and does not extend service-worker offline caching.

## Verification

```sh
npm run narration:test
npm run narration:browser:test
npm run check
npm run build
git diff --check
```

Provider tests use mocked responses and do not require a key or spend quota. Browser tests use
mocked media/device speech; they verify controls, fallback and lifecycle, not audible accent.
Real Google generation and listening require the setup above. Existing `security:audit` and
`security:smoke` npm commands remain absent, as recorded in the forensic audit.
