# Web asset promotion

Web export remains private staging. Promotion copies reviewed WebP derivatives into the site's
static tree and creates the runtime panel map; it does not publish the album, change approval
gates, or deploy the site.

Run the verification-only dry run first:

```bash
npm run comic:promote:web -- --episode 001
```

To verify a non-default staging directory:

```bash
npm run comic:promote:web -- --episode 001 --input path/to/web-staging
```

After reviewing the dry-run result, perform the exact same checks and write the assets explicitly:

```bash
npm run comic:promote:web -- --episode 001 --confirm
```

Promotion requires a current compiled `sourceDigest`, exactly 338 final panels, no placeholder
entries, and a byte-for-byte and SHA-256-valid staged WebP for every panel. Public filenames contain
the complete derivative hash. Existing identical files are reused; a differing file at the same
destination is never overwritten. Repeating the confirmed command is idempotent.

The generated `web-runtime-map.json` is accepted by the server only while its digest, panel set,
root-relative URLs, content-hashed filenames, and on-disk WebP bytes all verify. Without that map,
the reader removes internal production paths and shows its honest contextual placeholders.
