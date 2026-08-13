# Crossword content-pack authoring

The crossword is split deliberately into two layers:

- `src/lib/games/crossword/` contains the subject-independent schema, grid model,
  state transitions, checking, hint, review, persistence, and validation code.
- `src/lib/games/crossword/content/packs/<pack-id>/` contains vocabulary, topics,
  authored grids, explanations, sources, and optional visual language.

The browser never invents a crossword. Every public grid is authored, reviewed,
and validated before it ships. Runtime review rounds choose among those validated
grids according to the local learning record.

## Add a subject pack

1. Create `src/lib/games/crossword/content/packs/<pack-id>/index.ts`.
2. Export one serializable `CrosswordPack` with the current `schemaVersion`, a
   stable `id`, title, description, topic definitions, difficulty definitions,
   and puzzles.
3. Keep facts, vocabulary, source metadata, achievements, and accents inside the
   pack. Do not add subject checks to the engine or shared Svelte components.
4. Export the pack from the content registry if the route needs to discover it.
5. Add a test that calls `assertValidPack(pack)` and checks the intended topic,
   difficulty, and session-format coverage.

Pack, puzzle, entry, topic, and source identifiers are persistent data keys. Do
not rename them after publication without adding an explicit saved-data migration.

## Add a puzzle

Choose a rectangular size that serves the answers rather than newspaper
symmetry. Blocks and asymmetry are allowed. Each open cell must belong to an
Across or Down entry, and all open cells must form one connected region through
entry crossings.

For every entry provide:

- a stable ID and canonical answer;
- optional display spelling when spaces, punctuation, or hyphens matter;
- start row, start column, and direction;
- one fair clue;
- the six-step hint ladder described below;
- a concise definition, practical importance, example, common confusion,
  related concepts, and at least one primary source;
- topic and concept tags used by the local review selector.

Run the pack's focused test while authoring. The validator rejects dimensions,
bounds, collisions, bad crossings, duplicate IDs, duplicate answers, uncovered
or disconnected cells, unsupported characters, incomplete learning records,
invalid sources, broken reveal positions, stale schema versions, and early hints
that leak the answer.

## Answer normalization

`normalizeAnswer` converts Unicode letters and numbers to uppercase and removes
spaces, hyphens, apostrophes, and full stops. The display form remains untouched.
For example, `SNOMED CT` is solved as `SNOMEDCT`; the player still sees the correct
name in the teaching card.

Do not use normalization to change meaningful spelling. If a technically correct
answer needs a character the current schema does not support, extend and test the
schema rather than silently transliterating it.

## Write a fair clue

Clues test purpose, mechanism, distinction, workflow, consequence, or system
boundary. They do not test arbitrary code numbers, transient release trivia,
vendor screen coordinates, penalties, or the author's opinion. Difficulty comes
from the reasoning required:

- **Refresh** uses direct definitions and familiar scenarios.
- **Working Knowledge** uses mechanisms, comparisons, and workflows.
- **Architect** uses boundaries, trade-offs, failure modes, and data flow.
- **Adaptive Mix** is a runtime selection policy, not permission to make a clue
  vague.

Readability comes before wit. One dry aside is enough; the definition must remain
visible through it.

## Write the hint ladder

Every answer has exactly six ordered steps after the clue:

1. `nudge` names the conceptual neighbourhood.
2. `plain-language` explains the job without using the answer.
3. `contrast` distinguishes a plausible neighbour.
4. `letter` reveals one or more strategic positions that help crossings.
5. `nearly-obvious` gives an example, expansion, or unmistakable description.
6. `reveal` supplies the answer and teaches it.

Hints one through three must not contain the normalized answer, including a
punctuation-only disguise. Letter positions are zero-based, unique, and within
the normalized answer. Prefer positions that unlock another entry.

## Cite sources

Prefer the specification publisher or responsible standards body. Each source
has a title, HTTPS URL, publisher, review date (`YYYY-MM-DD`), and optional note.
Mark the learning record as stable conceptual knowledge, version-sensitive,
jurisdiction-specific, or recommended practice where the schema supports it.

Do not copy certification questions or commercial crossword clues. Summarize
source material in original language. Re-review version-sensitive and
jurisdiction-specific claims before changing a pack's `reviewedAt` date.

## Manual review checklist

After automated validation, solve every puzzle once in Coach mode and once in
Traditional mode.

- Confirm numbering, crossings, direction switching, and Backspace behaviour.
- Read clues without seeing answers and verify that each has one defensible solve.
- Request all six hints and confirm that each is genuinely more explicit.
- Open every teaching card and follow every source link.
- Complete the puzzle by keyboard, touch keyboard, and accessible list mode.
- Check portrait, short landscape, 200% zoom, reduced motion, high contrast, and
  forced colours.
- Reveal at least one concept, reload, and confirm that it enters the local review
  queue.

Useful commands are documented in `package.json`; the focused gates are the
crossword Vitest command, content validation, browser interaction suite, parent
type check, lint, and production build.
