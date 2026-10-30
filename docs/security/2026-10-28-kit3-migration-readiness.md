# SvelteKit 3 migration readiness — 28 October 2026

This is a dependency compatibility investigation and follow-up plan, **not an implemented
migration or a passing security audit**. Source baseline:
`dbe6303c4f49105a2e0d6138e2c13e6d492ed3ef`. The canonical
[architecture](../architecture/ARCHITECTURE.md#3-toolchain-ground-truth) and
[change gate](../../CONTRIBUTING.md#architecture-change-gate) were reviewed. Experiments used
separate ignored directories; the application manifest, lockfile and shared `node_modules`
were not changed by this investigation. Unrelated concurrent work was left intact.

The subsequent [release-blocker cleanup](2026-10-28-release-blockers.md) removes the unused
Speed Insights SDK from the application. The experiments below retain the baseline manifest
for reproducibility; Speed Insights is therefore no longer a live application prerequisite.
The active Analytics and transitive UI constraints, plus `deepmerge`, remain unresolved.

## Decision supported by the evidence

There is no demonstrated stable upgrade of the current complete application that removes
all remaining advisory findings. Kit 3 fixes the two remaining Kit advisory findings discussed in
the [release-readiness record](2026-10-28-release-readiness.md), but it does not remove
`deepmerge` from the Svelte build plugin. Stable Vercel packages also reject Kit 3 as a peer.
Do not force this graph, suppress advisories, downgrade packages to satisfy audit suggestions,
or substitute a handwritten third-party fork. Keep the existing mitigations and the audit's
failure visible while preparing a supported migration.

This does not imply that every installed advisory is reachable by a website visitor. The
existing report distinguishes package findings, local-preview exposure and application
mitigations; those distinctions remain necessary.

## Registry and resolver evidence

Registry metadata was read on 28 October 2026. The latest Kit 2 release remained `2.70.3`.
An isolated core using these exact stable versions resolved successfully:

| Package                        | Tested version |
| ------------------------------ | -------------- |
| `@sveltejs/kit`                | `3.1.0`        |
| `@sveltejs/adapter-vercel`     | `7.0.1`        |
| `@sveltejs/vite-plugin-svelte` | `7.3.1`        |
| `svelte`                       | `5.57.3`       |
| `vite`                         | `8.3.5`        |
| `typescript`                   | `6.0.3`        |
| `svelte-check`                 | `4.7.7`        |

Kit's published peer range requires TypeScript `^6.0.0`; the registry's newer TypeScript 7
`latest` tag is not a compatible substitution. Kit requires Node `>=22.17`. The Vercel
adapter's published Kit range is `^3.0.0-next.0`, which accepts stable Kit 3.
Sources: [Kit registry manifest](https://registry.npmjs.org/@sveltejs%2fkit/3.1.0),
[adapter registry manifest](https://registry.npmjs.org/@sveltejs%2fadapter-vercel/7.0.1),
[checker registry manifest](https://registry.npmjs.org/svelte-check/4.7.7).

Every resolver experiment ran:

```sh
npm install --package-lock-only --ignore-scripts --no-audit --fund=false --strict-peer-deps
```

This resolves a graph; it does not install or execute the application, prove compilation,
or validate runtime behavior. No `--force`, `--legacy-peer-deps` or peer-range override was used.

| Isolated experiment                                                                   | Observed result                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable core listed above                                                              | Exit 0. Lock-only audit exits 1: four low-severity package entries, all originating from the same deepmerge advisory and propagated through the plugin, Kit and adapter.                                                                                                  |
| Complete application dependencies, upgraded stable core, latest stable Bits UI 2.20.2 | ERESOLVE: @vercel/analytics@2.0.1 accepts Kit major 1 or 2, not Kit 3.                                                                                                                                                                                                    |
| Same stable graph with Analytics removed solely to expose the next constraint         | ERESOLVE: @vercel/speed-insights@2.0.0 has the same Kit peer restriction. This was not an application dependency removal.                                                                                                                                                 |
| Diagnostic graph using Analytics 2.1.0-canary.5 and Speed Insights 2.1.0-canary       | Resolver exits 0, but installs Kit 2.70.3 under both bits-ui/node_modules and svelte-toolbelt/node_modules. Audit exits 1 with eight low-severity package entries, including Kit 2 findings, nested cookie@0.6.0 and deepmerge. This is rejected as a migration solution. |

The canary experiment establishes why successful resolution alone is insufficient. Bits UI
`2.20.2` and Svelte Toolbelt `0.10.6` require `runed@^0.35.1`; that version's optional Kit peer
is `^2.21.0`. npm satisfies it with nested Kit 2 installations. Runed `0.38.0` declares Kit 3
support, but is outside both callers' dependency ranges. A future supported graph needs
compatible caller releases, not a forced transitive replacement.
Sources: [Bits UI](https://registry.npmjs.org/bits-ui/2.20.2),
[Svelte Toolbelt](https://registry.npmjs.org/svelte-toolbelt/0.10.6),
[Runed 0.35.1](https://registry.npmjs.org/runed/0.35.1),
[Runed 0.38.0](https://registry.npmjs.org/runed/0.38.0).

Stable [Analytics 2.0.1](https://registry.npmjs.org/@vercel%2fanalytics/2.0.1) and
[Speed Insights 2.0.0](https://registry.npmjs.org/@vercel%2fspeed-insights/2.0.0) do not declare
Kit 3 compatibility. Analytics is used by `src/lib/analytics/client.ts` through its generic
`inject`/`pageview` API. No runtime Speed Insights import was found in `src` or `scripts`;
the separate cleanup removed that unused package. It does not solve the Analytics or Runed
constraints.

`deepmerge@4.3.1` remains the latest published release and has no listed patched version for
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). The
[current upstream Svelte plugin manifest](https://github.com/sveltejs/vite-plugin-svelte/blob/main/packages/vite-plugin-svelte/package.json)
still requires it. In the current installed plugin, `src/utils/options.js` merges defaults,
loaded project configuration, inline plugin options and derived build options. No visitor-input
path into this caller was established. A supported upstream fix or removal of this dependency
is still needed for a clean all-severity audit; Kit 3 alone cannot supply it.

## Repository migration inventory

The following is an inventory of work to validate, not a mechanical replacement prescription.
Counts cover text matches in `src` and `scripts`, excluding generated directories; matches
include tests and authored component imports.

| Existing surface                                                | Concrete migration work                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svelte.config.js` and `vite.config.ts`                         | Move configuration into the Kit Vite plugin while preserving mdsvex/rehype preprocessing, conditional UML imports, image metadata, CSP, prerender error handling, Vercel image settings and disabled automatic service-worker registration. |
| `$lib`: 1,448 matches across 586 files                          | Migrate application and authored Markdown imports; review generated import strings and test resolvers. Native `#lib` imports need explicit package mappings and file extensions.                                                            |
| `tsconfig.json`; `vitest.enquiry-demo.config.ts`                | Replace the generated Kit tsconfig extension and update custom alias assumptions. Check every test configuration, not only the default runner.                                                                                              |
| `$app/environment`: 12 files                                    | Update environment API imports and corresponding test mocks.                                                                                                                                                                                |
| `$env` modules: 41 matches across 36 files                      | Review the new environment declarations/API without moving secrets into universal/browser modules. Deprecated APIs must not be assumed equivalent without validation.                                                                       |
| `src/service-worker.ts`; `scripts/service-worker.test.mjs`      | Replace the removed `$service-worker` module, preserve the build/version inputs and public Notes offline rules, and test worker behavior locally.                                                                                           |
| `$app/paths`: 86 files                                          | Most use retained APIs. Direct removed `base` imports were identified in `src/routes/+layout.svelte` and `src/lib/components/visual/WordCloud.svelte`; review multiline imports and URL behavior too.                                       |
| `src/hooks.server.ts`; Notes/contact actions and enhanced forms | Update hook type locations and review error, redirect, form navigation, cookie and cache semantics against existing boundary regressions. No `$app/stores` matches were found.                                                              |
| `scripts/security-policy.mjs` and its tests                     | The policy scanner recognizes `$lib/server` and imports `svelte.config.js` directly. Update its real boundary checks with the new configuration/import scheme; do not disable the scanner to pass migration.                                |
| `package.json` overrides                                        | The existing Kit-wide `cookie: ^0.7.2` override must not be carried onto Kit 3, which requires cookie 2. Scope any retained Kit 2 mitigation by version during experiments.                                                                 |
| Bits UI wrappers                                                | Thirteen files import Bits UI under `src/lib/components/ui/{tooltip,tabs,sheet}`. Preserve keyboard, focus and accessibility behavior when validating compatible upstream releases.                                                         |

The [official Kit migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3)
documents the changed configuration, import, environment, service-worker and HTTP APIs and
provides `sv migrate sveltekit-3`. Use its automation only in an isolated reviewable checkout.
The current Markdown scanner in `vite.config.ts` uses `optimizeDeps.esbuildOptions.plugins`.
Vite 8 has a compatibility layer with only partial support for such plugins: validate or
port this scanner instead of assuming it is unchanged.
[Vite migration guidance](https://vite.dev/guide/migration#dependency-optimizer-now-uses-rolldown).

## Ordered follow-up and acceptance

1. Recheck published stable manifests. Require a complete strict-peer lock resolution without
   nested Kit 2 or other vulnerable replacements. Resolve the active Analytics and transitive
   UI constraints through supported releases or an explicitly scoped, behavior-preserving
   integration change. Resolve the plugin's `deepmerge` dependency upstream. Keep unsuccessful
   audit results visible until these prerequisites are met.
2. Make the framework migration separately reviewable. Apply the official migration tool to
   an isolated checkout, inspect every changed import/configuration, and preserve authored
   content and security policy. Record the substantial toolchain/rendering trade-off in an ADR
   and update affected architecture sections in the same implementation change.
3. Run a clean strict install and inspect the entire lockfile. Require no peer errors, no nested
   Kit 2, compatible Node/TypeScript versions, and an unmodified, successful `security:audit`.
   A resolver-only pass or lower vulnerability count is not acceptance.
4. Run `check`, `security:smoke`, `security:sql`, `test:critical`, the architecture fixtures,
   policy tests, formatting and `git diff --check`. Run `build:full` and the existing route-asset
   budgets. Investigate actual failures without weakening tests or budgets.
5. On loopback, verify prerendered Markdown/math/images, navigation, CSP, public cache headers,
   RSS/sitemap/social metadata, Notes forms/auth/private caching, offline Notes, and the Bits UI
   controls. Use mocked providers and disposable databases; preserve disabled expensive routes.
   Repeat bounded preview verification only within the user's deployment authorization.

Production deployment, migration execution, account policy changes and merge are outside this
readiness investigation. There is no new release approval in this document.

## Reproduction artifacts

Ignored local artifacts live under `.audit-private/dependency-research-kit3/`:
`registry-evidence.json`, `api-inventory.json`, and the `core-only`, `stable-peers`,
`stable-speed-peer`, `canary-vercel-peers` directories. Each contains its exact experiment
manifest and resolver log; successful resolutions also contain lockfiles and audit JSON.
These diagnostic artifacts are not release dependencies or committed application inputs.
