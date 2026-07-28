# Editing balloon text by hand

The lettering is source-driven. Final words are not baked into the generated artwork, so changing
a line does not require regenerating the panel image.

## Quick edit for one page

1. Open the canonical page file. Album 001 uses:

   ```text
   src/lib/comics/the-last-analog-town/episodes/001-the-efficiency-inspector/script/pages/page-001.yaml
   …
   src/lib/comics/the-last-analog-town/episodes/001-the-efficiency-inspector/script/pages/page-062.yaml
   ```

2. Find the stable dialogue ID, then change only `text`. For example:

   ```yaml
   - id: p01-02-d01
     speaker: riju-dhar
     text: 'Could we shift the left support half a metre?'
   ```

3. If that balloon has `manualBreaks`, update them at the same time. Joining the lines with spaces
   must reproduce `text` exactly:

   ```yaml
   text: 'Could we shift the left support half a metre?'
   balloon:
     manualBreaks:
       - 'Could we shift the left'
       - 'support half a metre?'
   ```

4. From the project directory, rebuild and check the edited page:

   ```powershell
   npm run comic:compile -- --episode 001
   npm run comic:lettering -- --episode 001 --strict
   npm run comic:assemble -- --episode 001
   npm run comic:render-pages -- --episode 001 --pages 1
   npm run comic:validate -- --episode 001
   ```

   Replace `1` with a comma-separated list such as `1,17,42`. The preview appears in
   `pages/previews/page-001.png` inside the episode directory.

## Auditable edit for several lines

For repeatable changes, copy
`script/dialogue-revisions/manual-edits.example.yaml` to a new YAML file in the same directory.
Add one record per line, preserving the exact current wording in `before`:

```yaml
format: suvroghosh-comic-dialogue-revisions
formatVersion: 1
revisions:
  - dialogueId: p01-02-d01
    before: 'Could we move the left support half a metre?'
    after: 'Could we shift the left support half a metre?'
    reason: 'Manual wording preference.'
    status: accepted
    manualBreaks:
      - 'Could we shift the left'
      - 'support half a metre?'
```

Apply it from the project directory:

```powershell
npm run comic:dialogue-revise -- --episode 001 --manifest "src/lib/comics/the-last-analog-town/episodes/001-the-efficiency-inspector/script/dialogue-revisions/my-edits.yaml"
```

The command is idempotent: a rerun reports an already-current line, while unexpected source drift
stops instead of guessing.

## What a text edit can and cannot change

- Short wording changes normally need only a rebuild.
- A much longer line may need a wider or taller balloon in the page YAML.
- Moving a balloon or tail requires updating its approved record in `lettering/geometry.yaml` and
  visually rechecking that it avoids faces, heads, evidence, and other balloons.
- Do not paint words directly into `panels/raw` or `panels/approved`. Those files deliberately
  remain clean, text-free art.
- Keep the stable dialogue ID, speaker, and reading order unless the story action itself changes.

