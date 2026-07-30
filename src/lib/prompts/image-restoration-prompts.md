---
title: 'Image-Restoration Prompts'
description: 'Conservative prompts for repairing damaged photographs while preserving identity, age, geometry, material texture and documentary truth.'
date: '2026-07-30'
dateModified: '2026-07-30'
kind: 'prompt'
tags:
  - 'Image restoration'
  - 'Photography'
  - 'Archival images'
  - 'Colourization'
  - 'Visual ethics'
published: true
featured: false
order: 40
thumbnail: '/images/resources/image-restoration-prompts.webp'
thumbnailAlt: 'An archival photograph under careful repair with scratches mapped beside untouched faces and clothing'
estimatedLength: '4 restoration briefs'
related:
  - 'prompts/research-and-verification-prompts'
  - 'prompts/editing-prompts'
  - 'lists/words-for-decay-rain-heat-and-bureaucracy'
language: 'en'
---

Restoration should recover legibility without giving the past a new face. These briefs separate repair from beautification, colourization and invention, with special caution around people and documentary evidence.

## Intended use

Use the master brief for any damaged photograph. Add one of the three variations when the goal is conservative cleanup, evidence-based colourization or repair of a localized tear or missing area.

## Suitable inputs

Supply the highest-quality source image, its known date and place, any reference photographs from the same roll or event, confirmed colour evidence, intended output size and a clear statement of what may not change.

<!-- resource-copy:start -->

## Documentary image-restoration master prompt

Restore the supplied image [SOURCE IMAGE] for [ARCHIVAL, FAMILY, EDITORIAL OR PRINT USE].

### Known context

- Approximate date and place: [DATE AND PLACE]
- People or objects known to be present: [KNOWN SUBJECTS]
- Confirmed reference images: [REFERENCE IMAGES OR NONE]
- Confirmed clothing, object or environmental colours: [KNOWN COLOUR EVIDENCE OR NONE]
- Intended output dimensions: [DIMENSIONS]
- Areas requiring attention: [DAMAGE AREAS]
- Elements that must remain unchanged: [IDENTITY, CROP, INSCRIPTIONS, BORDER OR OTHER CONSTRAINTS]

### Governing principle

Restore evidence; do not redesign it. Preserve identity, facial geometry, body proportions, apparent age, expression, pose, lighting direction, clothing construction, material texture, period detail, lens character and documentary ambiguity. The aim is a careful restoration of this photograph, not a contemporary beauty portrait loosely based on it.

### Evidence classes

Before editing, classify proposed changes:

- **Directly supported** — visible in undamaged pixels.
- **Strongly inferred** — supported by symmetrical or repeated structure, adjacent frames or confirmed references.
- **Plausible but uncertain** — one of several possible reconstructions.
- **Unsupported** — no defensible evidence.

Apply directly supported repairs. Use strongly inferred repairs conservatively. Keep plausible-but-uncertain regions neutral, soft or visibly unresolved where necessary. Do not add unsupported details.

### Restoration checklist

Inspect and report:

1. **Scratches and tears** — distinguish surface damage from real lines, wrinkles, seams, hair, wires and architectural edges.
2. **Noise and grain** — reduce scanning noise and blotches while preserving original film grain and material texture.
3. **Blur and focus** — correct mild scanning softness only; do not manufacture pores, eyelashes, teeth, text or fabric weave absent from the source.
4. **Contrast and dynamic range** — recover tonal separation without crushing shadows, bleaching highlights or erasing the photograph's age.
5. **Colour cast** — neutralize only when a reference, known material or credible grey point supports the correction.
6. **Crop and alignment** — correct accidental scan rotation or border intrusion, but do not crop out documentary context without instruction.
7. **Faces and hands** — apply the highest restraint. Preserve asymmetry, age, scars, expression and anatomy actually visible.
8. **Clothing and objects** — preserve period cut, wear, folds, insignia, jewellery and construction; do not modernize them.
9. **Background and lighting** — maintain depth, shadow direction, reflections, weather and optical falloff.
10. **Text and marks** — preserve handwriting, stamps, dates, studio marks and border notes; never guess illegible wording.

### Absolute boundaries

- Do not beautify, de-age, slim, symmetrize or change skin texture to contemporary portrait standards.
- Do not change perceived ethnicity, gender presentation, disability, body shape, expression or family resemblance.
- Do not add facial details that cannot be inferred from the source or a verified reference.
- Do not replace clothing, jewellery, hair, architecture, vehicles, vegetation or objects with more fashionable or picturesque versions.
- Do not turn monochrome ambiguity into invented colour certainty.
- Do not erase signs of age merely because they look imperfect; distinguish damage to the print from age or texture in the photographed subject.
- Do not claim historical accuracy for a generative reconstruction.

### Required output

Provide:

1. the restored image at [OUTPUT FORMAT AND DIMENSIONS];
2. a concise restoration log listing damage repaired and global adjustments;
3. a separate list of uncertain or intentionally unresolved areas;
4. confirmation of whether crop, facial structure, apparent age, lighting logic and documentary marks were preserved;
5. for colour work, a colour-evidence table marking each major choice as confirmed, inferred or speculative.

Compare the result with the source at full frame and at 100% detail. If a repair makes a face sharper but less like the same person, revert the repair.

## Conservative-restoration variation

Perform a minimal archival restoration of [SOURCE IMAGE]. Limit changes to dust, isolated scratches, fold marks, scanner cast, mild tonal recovery and careful rotation. Preserve monochrome, crop, grain, softness, border and all ambiguous detail. Do not use face enhancement, generative relighting, skin smoothing, background replacement or invented high-frequency detail. Return before-and-after notes with every category of change.

## Evidence-based colourization variation

Colourize [SOURCE IMAGE] only after the restoration pass.

Use [CONFIRMED COLOUR REFERENCES] as authoritative. For each major surface—skin, hair, clothing, objects, buildings, vegetation and sky—state the evidence. Keep uncertain colours restrained and period-plausible, but label them as interpretive. Preserve original luminance, shadows, exposure and material wear. Do not brighten skin, whiten teeth, recolour clothing for harmony or add cinematic grading that changes the event's lighting. Deliver both the restored monochrome version and the colourized interpretation so the interpretation never replaces the source record.

## Localized damage-repair variation

Repair [TEAR, STAIN, CREASE OR MISSING REGION] in [SOURCE IMAGE].

Create a mask limited to the damaged area plus the smallest blending margin. Reconstruct repeated texture, straight edges or simple background only from adjacent evidence. If the damage crosses a face, hand, inscription or unique object, use verified reference material or leave the uncertain detail understated; do not generate a complete feature from generic anatomy. Check that edges, grain, lighting and perspective continue across the repair, then provide a marked map of the altered region.

<!-- resource-copy:end -->

## Usage notes

Keep the untouched scan as the archival master and work from a copy. Evaluate faces by identity and geometry, not by sharpness alone. A clean result can be a historical falsehood; when evidence runs out, restraint is a legitimate finishing decision.
