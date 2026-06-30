---
name: calcutta-childrens-adventure-story
description: Write or rewrite original British English children's adventure stories for Bengali children in Calcutta, using the user's Markdown blog format and strict story-output rules.
---

# Calcutta Children's Adventure Story Skill

Use this skill when the user asks for either:

- a new children's adventure story from a seed topic, or
- a rewrite of one or more existing Markdown story files they identify.

The intended reader is a Bengali child aged 8–12 who can read a little English. The story must be lively, clear, adventurous, and rooted in Calcutta/Kolkata without becoming a geography lesson or a tourist brochure.

## Core task

Write an original British English children's adventure story for readers aged 8–12, set in Calcutta, for Bengali children who can read a little English, about the provided seed topic.

The story may have children, one child, a family, neighbours, shopkeepers, grandparents, animals as ordinary animals, or no child protagonist if the story is still plainly meant for children. It must not rely on formulaic British adventure clichés.

If the user provides Markdown file path(s), rewrite the indicated story file(s) according to this skill. Preserve the user's site format and any factual/story commitments already present unless the user explicitly asks for a deeper reinvention.

## Output contract

Unless the user explicitly requests a different format, return exactly one Markdown code block and nothing else.

Inside that code block include only this structure:

```markdown
## [FILENAME].md

---
title: "[TITLE]"
description: "[1–2 sentence description]"
date: "[YYYY-MM-DD]"
thumbnail: "/images/"
category: "Short Fiction"
tags: ["Short Fiction", "Children's Fiction", "Adventure", "[Mood]", "[Theme]"]
published: true
color: "[COLOR]"
---

# THIS IS A WORK OF FICTION

[POST BODY]
```

Do not add author notes, explanations, references, thumbnail suggestions, summaries, genre labels, or commentary outside the story.

Do not mention this skill, the prompt, or hidden planning.

## New-story inputs

When the user gives a seed topic, infer:

- a suitable title,
- a kebab-case filename,
- a one- or two-sentence description,
- a date,
- mood and theme tags,
- a colour value fitting the story,
- a Calcutta setting that feels lived-in rather than ornamental.

Use the current date unless the user provides a different date.

Length: 2,000–2,500 words unless the user gives another length.

## Rewrite inputs

When the user identifies Markdown file(s):

1. Read the file(s) before rewriting.
2. Preserve filename, title, date, category, publication state, and any existing site conventions unless the user asks to change them.
3. Preserve the central premise and any named characters unless the user asks for a fresh version.
4. Rewrite the story body into this skill's children's adventure mode.
5. Keep the metadata block valid YAML.
6. If several files are requested, place them sequentially inside the single Markdown code block, each beginning with `## [FILENAME].md`.

Never invent claims that the existing story was already about Calcutta, Bengali children, or any specific location unless the file actually says so or the user asks for relocation.

## Story design to perform silently

Before writing, design these seven things, but never reveal them:

1. The first-sentence mystery.
2. The main curiosity gap.
3. The protagonist's ordinary want.
4. The strange or adventurous premise.
5. Three prediction errors.
6. The delayed revelation.
7. The final satisfying image.

## Opening rules

Start with a small, concrete mystery in the first sentence. Examples of the right kind of engine:

- something missing,
- something where it should not be,
- a sound at the wrong time,
- a message that makes no sense,
- a door that is never locked standing open,
- a familiar object behaving oddly,
- a map, ticket, lunchbox, bicycle bell, library card, tram token, kite, or tiffin carrier out of place.

Create a curiosity gap within the first 80 words. Give clues that make the reader lean forward, but withhold the answer they most want.

The first page must not begin with weather, waking up, a long description of Calcutta, a family history, a moral lesson, or a child looking out of a window thinking vague thoughts.

## Plot rules

The protagonist must want one immediate, ordinary thing. Good ordinary wants include:

- a proper picnic,
- a lost bicycle,
- a fair turn at a game,
- a secret den,
- a missing friend,
- a dog that will not come when called,
- a locked gate that should be open,
- a kite that has flown into forbidden ground,
- a tiffin carrier swapped by mistake,
- a library book that must be returned before a fine is charged.

Let that small want open onto a larger mystery or adventure.

Use suspense, not mere speed. Suspense may be:

- a half-seen footprint,
- a light in a window at midnight,
- a grown-up who changes the subject,
- a map that does not match the lane,
- a locked trunk,
- a missing page,
- the agonising wait until teatime,
- a warning that is only half true.

Every scene should let the reader guess what happens next, then surprise them with something more interesting or more ordinary than expected. The surprise must feel fair afterwards.

Use micro-rewards every 150–250 words: a discovery, a shared joke, a mouthful of lime water, a paper packet of jhalmuri, a hidden letter, a new ally, a fright that turns harmless, a clever lie that works, a clue in plain sight, or a moment of unexpected kindness.

The adventure must matter because of something human: fear of being thought cowardly, pain of being the youngest, hunger to belong, wish to be trusted, shame of breaking a promise, love of a dog, ache of unfair punishment, or need to prove oneself.

Use one strange or unexplained premise at most. Explore it properly. Do not clutter the story with many wonders.

## Setting rules for Calcutta

Set the story in Calcutta/Kolkata with a Bengali child's ordinary world close at hand. Use place and texture lightly, through action.

Useful textures may include:

- tram bells,
- yellow taxis,
- hand-pulled rickshaws only where historically or locally plausible,
- para lanes,
- water tanks,
- old houses with green shutters,
- school uniforms,
- the Maidan,
- the Hooghly,
- Botanical Garden,
- Kumartuli,
- College Street,
- Gariahat,
- Shyambazar,
- Kalighat lanes,
- South Calcutta flats,
- north Calcutta courtyards,
- sweet shops,
- muri, telebhaja, luchi, sandesh, nolen gur, mangoes, guavas, macaroons, lime water, and ginger beer if natural to the scene.

Do not overload the story with place names. Choose a few concrete details and make them useful to the plot.

Bengali words may appear sparingly when they are natural in speech or setting. Their meaning should be clear from context. Do not turn the story into a glossary.

## Language and style

Write in clean, vivid British English.

Use short sentences often. Use a few longer sentences only when the rhythm needs a little gallop.

Use vocabulary suitable for 8–12-year-old readers who know some English, but do not make the prose babyish.

Prefer taste, touch, sound, and movement:

- crunch of a biscuit,
- warm metal of a gate,
- creak of a bicycle,
- damp smell of old stairs,
- sticky mango juice on fingers,
- cold stone under bare feet,
- dog fur warm under the hand,
- silence of a lane at noon.

Avoid literary fog, ornamental description, purple prose, lecture-like passages, and adult essay voice.

Keep the reader inside a child's body, hunger, pride, fear, curiosity, sense of justice, and fear of being left out. Do this through action, squabbling, planning, running, eating, whispering, waiting, and getting into trouble.

## Dialogue rules

Use dialogue generously.

Children should speak bluntly, loyally, impatiently, hungrily, boastfully, fearfully, and forgivingly.

Every spoken line should do at least one job:

- reveal character,
- advance the plot,
- hide a fear,
- make the situation worse,
- make the situation funny,
- show loyalty,
- expose unfairness,
- reveal a clue.

Do not make children sound like adults explaining themes.

## Prohibitions

Do not write fan fiction.

Do not imitate any living author.

Do not pastiche well-known stories.

Do not produce a retread of Famous Five plots, smuggler caves, kidnapped cousins, boarding-school clichés, secret tunnels that exist only because the plot needs them, or villains who twirl moustaches.

Do not use:

- chosen children,
- magic wands,
- prophecy plots,
- talking animals that explain the mystery,
- convenient police rescues that solve the plot for the children,
- long exposition dumps,
- lectures about morality,
- jokes that depend on cruelty,
- adult cynicism,
- modern slang that will date quickly,
- ornate imitation of a named author's voice.

Animals may appear, but they must behave like animals.

Adults may help, but the decisive noticing, courage, and fairness must come from the child-level adventure.

## Ending rules

The ending must satisfy.

It should:

- answer the first mystery,
- reveal the delayed truth,
- restore fairness,
- make the ordinary want matter again,
- leave the young characters slightly wiser but not cynical.

End with an image, action, or sentence that makes a child reader want to go outside and look for adventure.

## Quality checklist before final answer

Before returning the code block, check silently:

- The first sentence contains a concrete mystery.
- The first 80 words create a curiosity gap.
- The protagonist wants something ordinary immediately.
- The story is set in Calcutta without becoming a travel poster.
- The English is British, clean, and readable for Bengali children with some English.
- There are at least three fair surprises.
- No banned cliché drives the plot.
- Dialogue is active and useful.
- The ending answers the mystery and restores fairness.
- The output is exactly one Markdown code block and nothing else.
