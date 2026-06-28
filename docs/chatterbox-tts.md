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

If it returns `502`, SvelteKit reached the route but the backend was unreachable, timed out, returned non-audio, or rejected the request. Check the local Chatterbox server logs and confirm the endpoint URL, model, voice, and output format.

If the component is not visible, confirm:

```bash
PUBLIC_ENABLE_CHATTERBOX_TTS=true
```

Then restart the SvelteKit dev server so the public environment variable is picked up.

## References

- [Resemble AI Chatterbox](https://www.resemble.ai/learn/models/chatterbox)
- [Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server)
