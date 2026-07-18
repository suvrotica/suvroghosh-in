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

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

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
on Linux, macOS, or Windows through WSL; from a supported system, install the reproducible Mojo and
Jupyter environment in this repository with Pixi:

```sh
pixi install
pixi run notebooks
```

The normal site prebuild renders notebooks when `nbconvert` is available. Otherwise it verifies
that the committed HTML matches the source notebook, keeping deployment deterministic.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
