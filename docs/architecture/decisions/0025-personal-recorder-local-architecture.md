# ADR 0025: Local-first personal audio recorder, non-destructive DSP/neural enhancement, and ISO BMFF MP4 export

- **Date:** 5 November 2026
- **Status:** Accepted
- **Affected sections:** [Section 1 — System and principles](../ARCHITECTURE.md#1-system-and-principles), [Section 2 — Directory responsibilities](../ARCHITECTURE.md#2-directory-responsibilities), [Section 12 — Architectural invariants](../ARCHITECTURE.md#12-architectural-invariants-and-prohibited-patterns), [Section 14 — Existing decisions and debt](../ARCHITECTURE.md#14-existing-decisions-and-debt)

## Context

We need to integrate **Recorder — by Suvro Ghosh** (`/tools/recorder`) into the existing SvelteKit application and `/blog/apps` collection. The feature must solve an everyday recording workflow—recording ten minutes of speech beside a running fan, reducing steady background noise and electrical hum while preserving the speaker's natural voice and original capture, trimming non-destructively, and exporting a compact, standards-compliant `.mp4` file—within the repository's existing security and architectural constraints:

1. **Strict CSP (`svelte.config.js`):** `script-src` is `'self'` without `'wasm-unsafe-eval'`, and `connect-src` is `'self'` (plus configured first-party services). External CDN dependencies or WebAssembly binaries requiring `wasm-unsafe-eval` would either fail in production or weaken the site-wide Content Security Policy.
2. **Permissions-Policy (`src/hooks.server.ts`, `vercel.json`):** The global site policy sets `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Microphone capture requires a route-scoped `microphone=(self)` exception on `/tools/recorder` without opening microphone permissions on unrelated routes, and without invoking `navigator.mediaDevices.getUserMedia` until the user explicitly clicks **Record** or **Test microphone**.
3. **Recording reliability and immutable original preservation:** Browser tabs can be interrupted by device sleep, unplugged microphones, or accidental closure, and `MediaRecorder` chunk delivery is not a sample-accurate clock. Recordings must be persisted incrementally, verified before being marked *Saved*, and edited non-destructively so the original recording's SHA-256 digest never changes.
4. **Genuine MP4 container requirement:** Many browsers record `audio/webm;codecs=opus` by default. Renaming a WebM or Ogg file to `.mp4` produces corrupt files on Apple, Windows, and social-video platforms.

## Decision

1. **Canonical route and catalogue integration:**
   - Host the application at `/tools/recorder` (`src/routes/tools/recorder/+page.svelte`, prerendered shell) and link it from `/blog/apps` (`src/routes/blog/apps/+page.svelte`) and its companion article (`src/lib/posts/recorder.md`, `collections: ["apps"]`).
   - Scope `Permissions-Policy: camera=(), microphone=(self), geolocation=()` exclusively to `/tools/recorder` in `src/hooks.server.ts` and `vercel.json`.

2. **Incremental local persistence (`src/lib/recorder/storage.ts`):**
   - Store recording metadata, edit recipes, and active session journals in `IndexedDB` (`suvro-recorder-db-v1`) and binary audio segments/originals in the Origin Private File System (`OPFS`, `suvro-recorder-audio-v1`) with an automatic `IndexedDB` binary store fallback.
   - Flush ordered chunks (`chunk_<recordingId>_<index>`) every ~1.5 seconds with per-chunk SHA-256 checksums and `committed: true` status. Never transition a recording to `status: 'saved'` until all chunks and the immutable original (`orig_<recordingId>.bin`) are written and verified by readback.
   - Maintain a cross-tab `BroadcastChannel` (`suvro-recorder-session-v1`) lock and `WakeLock` request during active capture, and offer contiguous committed-chunk recovery (`findRecoverableSessions`, `recoverInterruptedSession`) after unexpected interruptions.

3. **Non-destructive editing and conservative DSP + on-demand local neural enhancement (`src/lib/recorder/dsp.ts`, `src/lib/recorder/neural-weights.ts`, `src/lib/recorder/editor.ts`):**
   - Store all trims, cuts, splits, clip joins, fade-ins/outs, clip gain, silence-shortening intervals, and enhancement parameters in a serializable `EditRecipe` (`undoStack` / `redoStack`) while keeping `orig_<recordingId>.bin` untouched.
   - Implement acoustic analysis (`analyzeAudioBuffer`: K-weighted ITU-R BS.1770-4 LUFS, RMS, peak, 15th-percentile noise floor, 50/60 Hz Goertzel hum prominence, sub-80 Hz rumble, sibilance ratio, clipping count) and mode-specific enhancement (`Speech`, `Music`, `Ambience`).
   - Provide an optional, on-demand downloadable 144 KB binary weight asset (`/downloads/recorder-neural-speech-v1.bin`) for a 24-band Bark-scale recurrent neural speech mask (`Bark-GRU`) that runs in pure TypeScript under `script-src 'self'`, cached in `CacheStorage` with a one-click removal option.

4. **Standards-compliant ISO BMFF `.mp4` / `.m4a` / Video-MP4 muxer and container inspector (`src/lib/recorder/mp4-encoder.ts`, `src/lib/recorder/mp4-parser.ts`):**
   - Encode AAC-LC (`mp4a.40.2`) using hardware `WebCodecs` (`AudioEncoder`) when supported by the browser, falling back deterministically to a pure-TypeScript MDCT + scale-factor/Huffman (`HCB_5`) AAC-LC encoder (`encodeAacLcPureTs`) and Constrained Baseline H.264 (`avc1.42c01e`) title-card encoder (`encodeH264TitleCardTrack`) muxed into a genuine ISO Base Media File Format container (`ftyp`, `moov`, `mvhd`, `trak`, `mdia`, `minf`, `stbl`, `stsd`, `stts`, `stsc`, `stsz`, `stco`, `mdat`).
   - Validate every exported file with `inspectMediaContainer` before completion and explicitly reject renamed WebM or Ogg streams.

## Alternatives Considered

- **FFmpeg.wasm / ONNX Runtime Web WASM:** Rejected as mandatory runtime dependencies because they require multi-megabyte downloads and `wasm-unsafe-eval` CSP relaxation, whereas a pure-TypeScript STFT/Bark-GRU engine plus WebCodecs/ISO BMFF muxer works within the strict `script-src 'self'` policy and loads in `<150 KB`.
- **Server-side audio processing and transcoding:** Rejected because uploading personal voice notes violates the local-first privacy guarantee and introduces server bandwidth/compute costs.

## Consequences and Verification

- **Privacy & storage trade-off:** All recordings stay private on the user's device by default. Because browser storage (`OPFS` / `IndexedDB`) can be cleared if the user wipes site data, the UI surfaces storage quota usage, requests `navigator.storage.persist()`, and provides `.mp4`/`.wav` exports plus self-contained `.zip` project backups (`fflate`).
- **Platform limitation:** Browser web apps cannot guarantee uninterrupted recording when a mobile OS suspends the browser in the background or locks the screen; Recorder uses `navigator.wakeLock` where available, logs any interruption gaps transparently, and documents that native OS background recording requires a native wrapper.
- **Verification:** Covered by `npm run recorder:test` (`src/lib/recorder/recorder.test.ts`) and `npm run recorder:browser:test` (`tests/recorder.spec.ts`).
