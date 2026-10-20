# Repository security invariants

## Architecture review

- Before implementation, classify architecture impact and review [the canonical architecture](docs/architecture/ARCHITECTURE.md).
- Follow the single mandatory [architecture change gate in CONTRIBUTING.md](CONTRIBUTING.md#architecture-change-gate), including same-change documentation/diagram updates, significant ADRs, implementation verification, and an explicit impact/rationale in the PR description or task handoff. Routine content work may be unaffected; explain that conclusion.
- The [forensic audit](docs/architecture/FORENSIC_AUDIT.md) records known implementation gaps. Do not describe its recommendations or missing security commands as implemented safeguards.

## Security boundaries

- Secrets and private environment variables stay in `+server`, `+page.server`, hooks, scripts, or `$lib/server`; never import them into browser or universal modules.
- Treat every `PUBLIC_` environment value as readable by every visitor. Prefer `$env/static/public` for build-time flags and document each one in `.env.example`.
- Every new state-changing or expensive endpoint needs explicit input validation, an actual streamed body limit, same-origin enforcement where browser-invoked, a timeout, and rate limiting appropriate to its cost.
- Preserve the SvelteKit CSP, Vercel security headers, private-response cache controls, `npm run security:audit`, and `npm run security:smoke`; update their tests when legitimate resource requirements change.
- Do not add broad bot, country, user-agent, `/.well-known/`, or HTTPS-origin blocks. Keep public articles, verified crawlers, RSS, sitemaps, social previews, and static assets working.

## Fast standard post publishing

- For a routine Markdown post, inspect the supplied draft and one adjacent recent post, then add only `src/lib/posts/<slug>.md` and the supplied image under `static/images/` before building.
- Preserve requested prose exactly and verify it before and after formatting with a normalized-text hash. Limit edits to front matter, component paths and attributes, and repository-standard separators unless the user asks for rewriting.
- When the user says to use an image as-is, do not invoke image generation or transformation. Keep its original format and artwork; the repository build may apply its existing lossless, same-dimension optimization.
- Curate `tags` and `pinnedTags` together, with no more than ten meaningful tags, so the tag generator does not replace them with incidental phrases from the prose.
- Run `npm run build` once. Its prebuild already runs content generators, image optimization, word clouds, search indexing, and content, SEO, media, and link validation; do not run those separately beforehand.
- After a successful build, review the expected generated artifacts, run `git diff --check`, commit on a `codex/` branch, fast-forward `main`, push `origin main`, and verify the remote ref. If a final metadata-only correction is necessary, rerun only the affected generator and validators.
