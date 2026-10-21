# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Architecture & Engineering Standards

The [canonical architecture reference](docs/architecture/ARCHITECTURE.md) describes the current
system design, module boundaries, state and data flow, rendering, security, engineering patterns,
and major technical decisions. The [forensic audit](docs/architecture/FORENSIC_AUDIT.md) contains
evidence-backed findings and a prioritized remediation roadmap; its
[coverage inventory](docs/architecture/AUDIT_COVERAGE.md) states inspection limits.

Follow the mandatory [architecture change gate](CONTRIBUTING.md#architecture-change-gate) for
structural or foundational changes. Review and update affected architecture sections in the same
change, and include an architecture-impact declaration and rationale in the PR description.
Agent instructions are in [AGENTS.md](AGENTS.md); significant decisions are recorded as
[ADRs](docs/architecture/decisions/README.md).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.14.0 create --template minimal --types ts --add prettier eslint tailwindcss="plugins:typography,forms" sveltekit-adapter="adapter:vercel" mdsvex --install npm suvroghosh-in
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Contact form environment

The `/contact` form sends email through Resend. Configure these Vercel environment variables for production:

```sh
RESEND_API_KEY=your_resend_api_key
CONTACT_TO_EMAIL=contact@suvroghosh.in
CONTACT_FROM_EMAIL=noreply@suvroghosh.in
```

`CONTACT_FROM_EMAIL` must be a sender address allowed by your Resend domain configuration.

## IndexNow environment

Production deployments expose the IndexNow verification file through a secret-backed route and
diff the live main and Notes sitemaps against their prior successful snapshots, submitting only
added, modified, or deleted URLs. Generate one unguessable 32-character
value containing only letters, numbers, or dashes, then configure the identical value in both
places:

- Vercel environment variable: `INDEXNOW_KEY`
- GitHub Actions repository secret: `INDEXNOW_KEY`

Rotate any key that has previously been committed or otherwise disclosed. The verification URL is
`https://www.suvroghosh.in/<INDEXNOW_KEY>.txt`; do not publish that URL separately.

After setting or rotating the Vercel variable, create a new production deployment; environment
changes do not update an existing deployment. Before each live submission, the script checks that
the deployed verification route returns HTTP 200, `text/plain`, and exactly the configured key.
Verification and submission requests each have a 15-second deadline. A failed ownership check
prevents the POST and leaves the previous successful sitemap snapshot intact. Errors omit the
key, its verification URL, and upstream response bodies.

Run `npm run indexnow:test` for the isolated protocol and ownership checks. A `--dry-run` validates
the URL payload without checking live ownership or submitting it. After deployment, the production
workflow checks ownership and submits the main and Notes sitemap families separately. HTTP 200
confirms receipt; HTTP 202 means receipt with key validation pending. Neither confirms indexing.

## Building

Article listening supports saved Google US English narration with browser/device voices as the
fallback. Synthesis is a separate, bounded authoring operation using a confirmed Gemini Free-tier
project; ordinary builds and visitor playback never call Google. See
[article narration setup, commands and verification](docs/article-narration.md).
The daily rollout uses GitHub Actions with a durable quota ledger and encrypted pending-audio
checkpoints, so it can generate, compress and publish while the author's computer is off.

To create a production version of your app:

```sh
npm run build
```

This is also the normal build for publishing a text-and-image article. It retains content,
media, SEO, link, search and rendered-page validation, while using committed notebook HTML and
leaving visualization-specific artifact maintenance to a separate command:

```sh
# When changing visualizations, notebooks, their generated artifacts, or shared build inputs
npm run build:full
```

The full build additionally checks the visualization artifacts, prepares only missing/stale
notebook HTML, and audits Barnum's emitted route assets. The feature-maintenance workflow runs
for relevant source/configuration/artifact changes, rather than ordinary article publication.
Both commands compile the shared SvelteKit site, so existing route names can still appear in
compiler output. Those names alone do not require investigating or repairing old features.

You can preview the production build with `npm run preview`.

For changes to request handling, Notes persistence or Meaning Map lifecycle, run
`npm run check` and `npm run test:critical`. A path-selected workflow runs those checks for the
affected application boundaries. Publishing workflow/gallery fixtures use
`npm run build-workflow:test`; incremental notebook fixtures use `npm run notebooks:test`.

## Handwritten notes

The site now includes a public handwritten-notes library at `/notes` and an owner-only infinite
canvas studio at `/notes/studio`. Images can be dropped or uploaded anywhere on the canvas, moved
independently, grouped with handwriting, or wrapped in a movable tile.

The implementation, trade-offs, security model, setup, and acceptance criteria are documented in
[`docs/handwritten-notes-architecture.md`](docs/handwritten-notes-architecture.md). The shortest
production setup path is:

```sh
# PowerShell
Copy-Item .env.example .env.local

# macOS or Linux
cp .env.example .env.local

npm install
npm run notes:test
npm run check
```

Then apply `supabase/migrations/202607230001_handwritten_notes.sql`, create the single Supabase Auth
owner, insert that immutable user UUID into `note_owners`, and install the one-minute publication
job from `supabase/cron.sql`. Do not expose the service-role key to browser code.

For hosted password recovery, set the Supabase Auth **Site URL** to
`https://www.suvroghosh.in`, allow the exact redirect
`https://www.suvroghosh.in/notes/reset-password`, and change the Recovery email template link to:

```html
<a href="{{ .SiteURL }}/notes/reset-password?token_hash={{ .TokenHash }}">Reset password</a>
```

The app deliberately waits for a same-origin **Continue securely** form before consuming the
one-time token, so email link previews cannot silently invalidate it. Request a new email after
changing the template; links generated from the old localhost template will not work.

## Mojo notebooks

Notebook sources live in `src/lib/notebooks`. Install the native Jupyter rendering and authoring
tools, then render every notebook to an isolated HTML document under `static/notebooks`:

```sh
npm run notebooks:install
npm run notebooks:render
```

Use `npm run notebooks:lab` to open the source notebooks in JupyterLab. A notebook can be attached
to a first-class notebook post with frontmatter:

```yaml
notebook: 'perceptron-from-scratch-in-mojo'
```

It can also be placed at a specific point in any Markdown post because `Notebook` is globally
available to mdsvex files:

```svelte
<Notebook src="perceptron-from-scratch-in-mojo" title="A Perceptron from Scratch in Mojo" />
```

Mojo notebooks use the official Python-kernel integration: the first Python cell imports
`mojo.notebook`, and complete Mojo programs run in cells beginning with `%%mojo`. Mojo itself runs
on Linux, macOS, or Windows through WSL; from a supported system, install the repository's pinned
Mojo 1.0.0b2 and version-constrained Jupyter environment with Pixi:

```sh
pixi install
pixi run notebooks
```

The routine site build uses committed notebook HTML and does not invoke the notebook toolchain.
`npm run notebooks:prepare` (also part of `build:full`) first checks source hashes and renderer
versions; current files are left untouched. It renders only missing/stale HTML when rendering
dependencies are available, otherwise fails verification with instructions for the notebook
author. `npm run notebooks:render` remains an explicit full refresh.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Search & discoverability validation

Content, media, link, and SEO checks run automatically before every build via `prebuild`.
A dedicated discoverability validator checks every published post's frontmatter and inspects the
actual server-rendered HTML of representative routes (single H1, canonical URL, parseable JSON-LD,
stable `#person` / `#website` entity IDs, BlogPosting author linkage, and visible-FAQ/FAQPage
agreement). It also guards the explicit search/retrieval/training crawler policy, the curated
`/llms.txt` guide, and the separation between editorial social artwork and the author's identity:

```sh
npm run validate:discoverability
```

The audit of what was checked and changed lives in `docs/GEO_AUDIT.md`; post-deployment monitoring
steps live in `docs/GEO_MEASUREMENT.md`.
