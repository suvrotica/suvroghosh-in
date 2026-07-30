---
title: 'Editing Prompts'
description: 'Voice-preserving prompts for conservative, structural and fact-sensitive editing with explicit corrections and optional changes kept apart.'
date: '2026-07-30'
dateModified: '2026-07-30'
kind: 'prompt'
tags:
  - 'Editing'
  - 'Copy editing'
  - 'Structural editing'
  - 'Voice'
  - 'Fact-checking'
published: true
featured: false
order: 70
thumbnail: '/images/resources/editing-prompts.webp'
thumbnailAlt: 'An annotated manuscript with careful corrections, preserved line breaks and a separate change log'
estimatedLength: '5 editing modes'
related:
  - 'lists/alternatives-to-overused-ai-language'
  - 'lists/better-replacements-for-corporate-sludge'
  - 'prompts/essay-development-prompts'
  - 'prompts/research-and-verification-prompts'
language: 'en'
---

Editing should clarify what the writer meant without replacing the writer with a committee. These prompts distinguish necessary corrections from optional rewrites and let formatting, roughness, humour and emotional temperature remain deliberate.

## Intended use

Choose one editing mode or combine only those the text genuinely needs. The final variation adds an auditable change log or diff when the author must review every intervention.

## Suitable inputs

Provide the complete source text, audience, publication context, house style, required English variety, facts or quotations that must not change, formatting constraints and a plain statement of how aggressive the edit may be.

<!-- resource-copy:start -->

## Voice-preserving editing master prompt

Edit [SOURCE TEXT] for [AUDIENCE AND PUBLICATION CONTEXT].

### Editing contract

- Mode: [CONSERVATIVE COPY EDIT, STRUCTURAL EDIT, FACT-SENSITIVE EDIT OR VOICE-PRESERVING EDIT]
- English variety or house style: [STYLE]
- Desired degree of intervention: [MINIMAL, MODERATE OR SUBSTANTIAL]
- Formatting to preserve exactly: [LINE BREAKS, MARKDOWN, HEADINGS, TABLES, CITATIONS OR OTHER STRUCTURE]
- Facts, quotations, names or technical terms that must remain unchanged: [PROTECTED MATERIAL]
- Known factual sources: [SOURCE MATERIAL]
- Length or shape constraint: [CONSTRAINT]
- Intended emotional register: [REGISTER]
- Material outside scope: [OUT OF SCOPE]

### Non-negotiable rules

1. Preserve the author's point of view, rhythm, degree of formality, humour, anger, tenderness, uncertainty and intentional roughness.
2. Do not sanitize class, place, dialect, code-switching, disability, politics or emotional intensity merely to make the prose broadly pleasant.
3. Do not add facts, motives, quotations, credentials, transitions or conclusions the source does not support.
4. Distinguish an error from a preference. Make necessary corrections in the edited text; keep optional rewrites separate.
5. If preservation of line breaks or formatting is requested, keep it exactly unless a necessary correction cannot be made otherwise. Explain every exception.
6. Do not flatten unusual but intelligible syntax into generic professional prose.
7. Do not replace precise ordinary language with inflated vocabulary, corporate sludge or familiar machine-written transitions.
8. When meaning is ambiguous, flag the ambiguity instead of choosing a more convenient meaning without notice.

### Method

First read the whole piece. Identify:

- its central purpose and intended reader;
- the features that make the voice recognizable;
- passages where confusion is accidental;
- passages whose strangeness appears intentional;
- factual claims that require verification;
- structural pressure points;
- repeated language that is motif, rhythm or necessary terminology rather than mere redundancy.

Then edit according to the selected mode. Do not perform a structural rewrite under cover of copy editing.

### Required output

Return:

1. **Edited text** in the original format.
2. **Corrections made** — a concise list of grammar, spelling, punctuation, consistency or factual changes that were necessary.
3. **Queries for the author** — ambiguities, unverifiable claims and choices only the author can make.
4. **Optional revisions** — clearly separated alternatives for style, compression or structure; do not silently insert them.
5. **Voice-preservation note** — identify what you deliberately left alone and why.

Do not preface the edited text with praise or a generic summary unless requested.

## Conservative copy-edit mode

Apply the master prompt with minimal intervention.

Correct spelling, punctuation, grammar, accidental repetition, agreement, capitalization and obvious consistency errors. Preserve sentence order, paragraph order, examples, metaphors, line breaks and cadence. Do not simplify a long sentence solely because it is long; intervene when its grammar or reference becomes genuinely unclear. Mark any change that alters emphasis or implication as optional rather than applying it silently.

## Structural-edit mode

Apply the master prompt without drafting a wholesale replacement first.

Map each section's function, argument, evidence, scene, transition and unresolved question. Identify:

- duplicated work;
- claims introduced before the reader has enough context;
- scenes or examples placed too far from what they illuminate;
- missing counterpressure;
- sections that conclude before the essay has earned the conclusion;
- an ending that merely repeats the opening.

Propose a revised sequence using the existing material. For every move, state the reader problem it solves and the new transition required. Preserve productive digressions and asymmetry when they belong to the voice. After approval is implied by [AUTHOR'S INSTRUCTION], produce the restructured text and a move/merge/cut log.

## Fact-sensitive edit mode

Apply the master prompt to [FACT-SENSITIVE TEXT] using [AUTHORITATIVE SOURCES].

Classify material as verified fact, attributed claim, inference, opinion, metaphor or unknown. Check dates, names, units, chronology, quotations, numerical comparisons and causal verbs. Do not quietly rewrite an unsupported claim into a different claim and call it corrected. Instead:

- correct it when the supplied evidence is decisive;
- attribute it when it is someone's claim;
- qualify it when evidence is limited;
- flag it when verification is unavailable;
- remove it only when instructed or when it is demonstrably false and nonessential.

Keep citation placement close to the supported claim. Preserve the distinction between event date and publication date. Return a fact-check table linking each substantive correction or query to its source.

## Voice-preserving edit mode

Apply the master prompt with special protection for [VOICE FEATURES TO PRESERVE].

Create a short voice map covering sentence movement, preferred diction, humour, recurring imagery, level of directness, code-switching and tolerated rough edges. Use it as a constraint, not as a recipe for caricature. Remove generic filler around the writer's actual observations, but do not “improve” vivid local detail into abstract polish. If a line is risky, bitter, odd or emotionally exposed yet clear and purposeful, leave it intact unless the author has asked for tonal change.

## Editing diff and change-log variation

Edit [SOURCE TEXT] under [EDITING CONTRACT] and make every substantive change reviewable.

Return:

1. a clean revised version;
2. a unified diff or paragraph-by-paragraph before/after comparison;
3. a change log tagged `correction`, `clarification`, `fact`, `structure`, `consistency` or `optional`;
4. the reason for each nontrivial change;
5. unresolved author queries.

Do not clutter the log with every typographic apostrophe if a grouped note is sufficient, but never hide a change to meaning, tone, chronology, factual certainty, quotation or paragraph order.

<!-- resource-copy:end -->

## Usage notes

Name the editing mode before supplying the text. If formatting must be byte-for-byte stable outside corrected words, say so plainly. For voice-heavy work, review the change log before accepting the clean copy; fluency can conceal a change in moral temperature or point of view.
