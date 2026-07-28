# Cultural and local-accuracy review

The review sharpens the target of the satire. It does not remove political conflict or make
institutions bland.

Run the deterministic stage:

```bash
npm run comic:cultural-review -- --episode 001
```

Then a named human reviewer records decisions on the generated checklist.

## Setting

- Golmohar Junction is wholly fictional and is not Golmohar Railway Quarters in Howrah, a renamed
  municipality, or a claim about one real locality.
- No invented scandal, institution, or corrupt act is mapped onto a real neighbourhood.
- Architecture, clothing, weather, transport, and public systems feel locally plausible without
  turning Calcutta into a shorthand for dirt, traffic, or crowds.
- Local details belong to the scene’s work; religion, caste, party colour, and regional identity
  are not decorative shorthand.

## People and satire

- The target is power, vanity, rigid procedure, opportunism, technological overconfidence,
  exclusion, corruption, or fatalism—not poverty, hunger, disability, skin tone, accent, or
  informal labour.
- Residents are not uniformly irrational, innocent, ingenious, corrupt, or anti-technology.
- Vale and the Grid are not uniformly foreign, cold, or superior. Indian and local actors build,
  invite, fund, profit from, and contest modernization.
- The town’s workarounds sometimes preserve life and sometimes preserve gatekeeping.
- Jokes remain legible without requiring a reader to recognise a current partisan controversy.
- Serious welfare, medical, flood, and employment harms receive emotional weight.

## Language

- Main dialogue is clear international British English.
- Bengali use is selective and understandable from context.
- Bengali words are not automatically italicised as foreign decoration.
- Translations and transliterations preserve legal and practical meaning.
- Generated art contains no fake Bengali-looking glyphs.
- Every publication-bound Bengali sign has a named reviewer and date in `data/signage.yaml`.

## Visual plausibility

- Skin tone, body shape, hair, clothing, and recurring props follow the approved reference data.
- Eastern Indian public architecture shows accumulated historical layers rather than one generic
  “developing world” backdrop.
- Crowds have individual purposes and do not function as a joke.
- No real party marks, corporate logos, public figures, or identifiable private people appear.
- The visual joke’s target is unambiguous even when read without dialogue.

## Human sign-off

Record reviewer name, review date, affected page/panel/sign IDs, decision, and any required
correction. `passed-with-notes` is acceptable only when every note is either resolved or
explicitly accepted by the publication editor. A blank checklist is not a pass.
