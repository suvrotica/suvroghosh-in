# Healthcare IT content pack

`index.ts` exports `healthcareItPack`, a schema-version 1 `CrosswordPack`.

The pack separates three authoring layers:

- `sources.ts` keeps primary-source metadata reviewed on 2026-08-13.
- `concepts.ts` keeps reusable teaching records and six-step hint ladders.
- `puzzles.ts` places those concepts into deterministic, connected grids and hydrates the complete serializable puzzle objects expected by the engine.

Answers contain only grid characters. `displayAnswer` preserves meaningful spacing and capitalization such as `SNOMED CT`, `RxNorm` and `eCRF`. Hint `revealPositions` are zero-based positions in the normalized `answer`, never positions in the display form.

The library contains one tutorial, three Refresh rounds, three Working Knowledge rounds, four Architect rounds and two adaptive review seeds. The Architect set includes one fixed Deep Round: a connected 18-answer systems chain following a clinical record through exchange, terminology, pipelines, governance, analytics and human-reviewed AI. Runtime Review Rounds may select the stable `conceptId` values from local learning history, but visitor-side code must not invent new clues or grids.

Run the crossword validator and unit suite after any edit. In addition to automated validation, manually read every clue, all six hints and the teaching card; verify the cited source; then solve both directions from a blank grid.
