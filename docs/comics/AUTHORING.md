# Authoring a comic album

## Work from consequence to detail

Lock these layers in order:

1. Premise, thematic question, protagonist’s stake, causal failure, climax, and ending.
2. Exact dramatic structure and page count.
3. One purpose and one page-turn function for every page.
4. Cast, location, prop, costume, time, and state continuity.
5. Final panel action, dialogue, captions, sounds, and visual jokes.
6. Accessibility descriptions.
7. Prompt ingredients and image work.

Do not generate panel prompts while the plot is still moving. Prompt files are deterministic
derivatives of stable panel records.

## Album One story rule

Every page must change action, knowledge, power, choice, or consequence. Begin with the physical
disturbance, not a town-history explanation. A scene may slow down, but it may not merely repeat
what the reader already knows.

The governing system becomes dangerous by operating according to approved rules. It does not
become sentient, malicious, or conveniently incompetent. The town’s informal systems must show
both humane adaptations and real exclusion or abuse.

## Canonical page files

Write one object per file:

```text
script/pages/page-001.yaml
script/pages/page-002.yaml
…
script/pages/page-062.yaml
```

The page object contains:

```yaml
page: 1
title: 'Page title'
purpose: 'The dramatic change'
location: junction-square
time: late morning
layout: 'One wide lead panel above four smaller beats'
panelCount: 5
dialogueGoal: 'What the words must accomplish'
pageTurn: 'The pressure revealed at the page edge'
visualMotif: 'The visual pattern developed here'
continuity:
  - 'Exact state entering and leaving this page'
panels: []
```

The validator permits the runtime panel sizes `small`, `medium`, `wide`, `tall`, `half-page`, and
`splash`. Album One normally uses four to nine panels, with any deliberate exception documented
in `script/exceptions.yaml`.

Panel, dialogue, and order IDs are deterministic:

```text
p01-01
p01-01-d01
```

Use only IDs present in `data/characters.json`, `data/locations.json`, and `data/props.json`.
Dialogue speakers must be visible in the panel unless the dialogue style is explicitly
off-panel and the validator permits the relationship.

## Dialogue

- Use clear British English that travels internationally.
- Keep each balloon to one readable intent.
- Give Ila concise political precision, Riju technical optimism under pressure, Ananya clinical
  mechanism, Babul-da practical route knowledge, Cecil categorical logic, and Vale calm
  institutional reasoning.
- Do not turn Bengali, names, accents, poverty, illness, or physical danger into punchlines.
- Use silence after a consequential choice, before a reveal, and around the final joke.
- Avoid explaining a procedure after the action has already made it clear.

Balloon coordinates are normalized from `0` to `1`. Boxes must remain inside the panel. Reading
order is sequential. Tail targets are normalized points, not character names. Manual line breaks
are string arrays and should be rare.

## Accessibility

Each panel requires:

- `alt`: a concise identification of the panel’s essential visual action;
- `description`: a fuller account of setting, expression, action, spatial relationship, and any
  visual joke needed to understand the story.

Do not repeat every line of dialogue in alt text; dialogue is already present in reading order.
Do include silent information and visual contradictions that prose-only readers would otherwise
miss.

## Revision

Revise against a named defect: unclear causality, repeated beat, voice drift, continuity break,
crowded balloon, inaccessible joke, or an unsafe stereotype. Do not request broad alternative
versions after the outline is locked.

After any canonical change, rerun:

```bash
npm run comic:validate -- --episode 001
npm run comic:compile -- --episode 001
npm run comic:prompts -- --episode 001
```

The deterministic writers update only changed derivatives.
