# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

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
diff the live sitemap against the prior successful deployment, submitting only added, modified, or
deleted URLs. Generate one unguessable 32-character
value containing only letters, numbers, or dashes, then configure the identical value in both
places:

- Vercel environment variable: `INDEXNOW_KEY`
- GitHub Actions repository secret: `INDEXNOW_KEY`

Rotate any key that has previously been committed or otherwise disclosed. The verification URL is
`https://www.suvroghosh.in/<INDEXNOW_KEY>.txt`; do not publish that URL separately.

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

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

The normal site prebuild renders notebooks when `nbconvert` is available. Otherwise it verifies
that the committed HTML matches the source notebook, keeping deployment deterministic.

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
