# Chatterbox TTS

This blog has a second, experimental text-to-speech path for Resemble AI Chatterbox. It is exposed as a separate markdown component:

```svelte
<ChatterboxTTS />
```

The existing browser-based component remains available as:

```svelte
<TTS />
```

Do not replace old posts yet. The point of this version is side-by-side comparison before removing the earlier TTS system.

## What It Does

`ChatterboxTTS.svelte` renders a compact, opt-in control panel on a post. It extracts readable article text in the browser, removes code/UI/component text, trims the request to a preview segment, and sends that text to `/api/tts/chatterbox`.

The SvelteKit API route calls a configured local or self-hosted Chatterbox backend and forwards audio bytes back to the browser. The blog does not run Python, Torch, CUDA, model weights, or voice experiments itself.

## Why It Is Separate

`<TTS />` uses the browser's built-in Web Speech API and is already used across existing posts. `<ChatterboxTTS />` is a separate experiment so the old behavior, markup, and posts remain unchanged while Chatterbox is evaluated.

## Chatterbox Models

- Original: English, expressive, good for high-quality long-form narration experiments.
- Turbo: English, optimized for speed and near-real-time tests. Use this as the default for English blog preview narration.
- Multilingual: intended for multilingual experiments, including later Bengali/Hindi testing. Do not assume Indian-language quality without listening tests.

The component exposes logical model options: `turbo`, `original`, and `multilingual`. The server route maps those to backend model names in one place:

- `turbo` -> `CHATTERBOX_TTS_DEFAULT_MODEL` when set, otherwise `chatterbox-turbo`
- `original` -> `chatterbox`
- `multilingual` -> `chatterbox-multilingual`

## Environment Variables

Set these locally or in the hosting environment where the SvelteKit server runs:

```bash
CHATTERBOX_TTS_ENDPOINT=http://localhost:8004/v1/audio/speech
CHATTERBOX_TTS_DEFAULT_MODEL=chatterbox-turbo
CHATTERBOX_TTS_DEFAULT_VOICE=Emily.wav
PUBLIC_ENABLE_CHATTERBOX_TTS=true
```

Optional:

```bash
CHATTERBOX_TTS_API_KEY=
```

`CHATTERBOX_TTS_API_KEY` is server-only and must not be renamed with a `PUBLIC_` prefix.

## Local Backend

Keep the Python backend outside this repository, for example:

```powershell
C:\AI\chatterbox-server
```

Recommended flow:

1. Start an OpenAI-compatible Chatterbox backend locally.
2. Confirm it accepts `POST /v1/audio/speech`.
3. Set `CHATTERBOX_TTS_ENDPOINT` to that full endpoint URL.
4. Start this SvelteKit app with `npm run dev`.
5. Add `<ChatterboxTTS />` to one markdown post and generate audio from the browser.

For an OpenAI-compatible endpoint, the route sends:

```json
{
	"model": "chatterbox-turbo",
	"voice": "Emily.wav",
	"input": "Article preview text...",
	"response_format": "wav"
}
```

If you point `CHATTERBOX_TTS_ENDPOINT` at a native `/tts` endpoint from a compatible Chatterbox server, the route uses the documented native fields `text`, `voice_mode`, `predefined_voice_id`, `output_format`, `split_text`, `exaggeration`, and `cfg_weight`. The native endpoint may use the backend's active engine rather than the model name from the UI.

## Request and provider controls

The public `POST /api/tts/chatterbox` route requires an `Origin` exactly matching the request URL's
origin and `Content-Type: application/json`. Missing or foreign origins receive `403`; other
content types receive `415`. Input must be a UTF-8 JSON object with non-empty cleaned text. Supplied
model, voice, format, expressive-tag and numeric options are validated. The server clips text to
3,000 characters; the browser component normally sends a preview of at most 2,400 characters.

Request bodies have a 64 KiB limit counted as bytes arrive, regardless of `Content-Length`, and a
10-second read deadline. Oversized input receives `413`; a timed-out or aborted body receives
`408`. Reads are cancelled without waiting for cancellation cleanup to settle.

Admission is bounded within each server process: three admitted requests per hashed client
address per rolling minute, twelve across that process per minute, two active requests in total,
and one active request per client. The map holds at most 2,048 client keys. If the adapter cannot
provide an address, requests share a conservative fallback bucket. Rejections return `429` with
`Retry-After`, and active slots are released when the request finishes or fails.

The provider call and audio consumption share a 120-second deadline that aborts the upstream
request and settles the handler even if a provider ignores cancellation. A successful response
must contain non-empty `audio/*` content of at most 32 MiB, buffered before being returned with
its audio content type and `Cache-Control: no-store`. Error-detail reads are limited to ten
seconds and 8 KiB; accepted details are clipped to 500 characters. Provider failures,
invalid/oversized audio, and provider timeouts produce `502`.

These limits are process-local and reset with that process; they do not coordinate separate
Vercel instances or provide a durable cost quota. The public UI flag and Origin header are not
authentication. Request-body cancellation is observed, but client disconnection after body
consumption is not linked to the provider's abort signal; provider work can continue until its
deadline. Hosted execution limits and provider-side cancellation still require deployment checks.

## Privacy

The code assumes the endpoint is local or self-hosted. Article text is not sent to a cloud service unless you deliberately configure `CHATTERBOX_TTS_ENDPOINT` to a cloud URL.

The browser never receives `CHATTERBOX_TTS_API_KEY`. Do not expose unpublished drafts or secrets through public Chatterbox tests.

## Expressive Tags

Turbo-style tags such as `[laugh]`, `[sigh]`, `[pause]`, `[cough]`, and `[breath]` are disabled by default. When expressive tags are disabled, those tags are stripped before the backend request. When enabled, only that small whitelist is preserved.

Arbitrary bracketed prompt text is not forwarded as a Chatterbox instruction.

## Voice Cloning

This first version does not implement browser voice upload or public voice cloning. It only supports backend-configured voice names.

Voice cloning should only be used with voices you own or have explicit permission to use.

## Known Limitations

- CPU inference may be slow.
- GPU inference is recommended.
- Torch installs can be troublesome on Windows.
- Long text can sound overacted or produce tail artifacts.
- This version only generates a preview from the first part of the article.
- The current route does not stitch chunks for full essays.
- Voice cloning is permission-only and intentionally not exposed in the browser.

## Future TODO

- Add chunking for long essays.
- Stitch generated chunks into one audio file.
- Test Original, Turbo, and Multilingual against real posts.
- After Chatterbox is approved, replace old `<TTS />` usages.
- After replacements are approved, remove the old TTS component and old TTS routes if any exist.
- Do not do that cleanup before approval.

## Troubleshooting

If `/api/tts/chatterbox` returns `501`, SvelteKit is working but `CHATTERBOX_TTS_ENDPOINT` is missing.

For `403`, submit from the same-origin blog page; for `415`, use JSON. A `413` means the request
exceeded 64 KiB; a `408` means its body timed out or was aborted. For `429`, wait for `Retry-After`
before generating again.

If it returns `502`, SvelteKit reached the route but the backend was unreachable, timed out, returned non-audio, or rejected the request. Check the local Chatterbox server logs and confirm the endpoint URL, model, voice, and output format.

If the component is not visible, confirm:

```bash
PUBLIC_ENABLE_CHATTERBOX_TTS=true
```

Then restart the SvelteKit dev server so the public environment variable is picked up.

## References

- [Resemble AI Chatterbox](https://www.resemble.ai/learn/models/chatterbox)
- [Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server)
