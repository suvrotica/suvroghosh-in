---
name: horror-charcoal-jpeg
description: Create or transform a provided image into a disturbing monochrome charcoal horror illustration, then save the final JPG under 500 kB in the project static/images folder. Use when the user asks for a horror charcoal image, textured cloth canvas image, compressed JPG, or a generated/transformed image for a website/static assets folder.
---

# Horror Charcoal JPG Skill

Use this skill when the task is to transform a supplied image, sketch from an image, or create a new image in a disturbing charcoal-horror illustration style, then place a web-ready `.jpg` file under `static/images` with a maximum size of 500 kB.

The final deliverable is always a real JPEG file, not Markdown, not a prompt-only answer, and not a PNG renamed as `.jpg`.

## Required output

Create exactly one final image file unless the user explicitly requests multiple variants.

The final file must be stored at:

```text
static/images/<descriptive-slug>.jpg
```

The file size must be no more than 500 kB, meaning no more than `512000` bytes.

Prefer a descriptive lowercase kebab-case filename, for example:

```text
static/images/charcoal-horror-face.jpg
static/images/charcoal-horror-portrait.jpg
static/images/charcoal-horror-figure.jpg
```

If the filename is not specified, derive one from the subject and use a timestamp only when needed to avoid overwriting an existing file.

## Inputs to look for

Look for one of these inputs:

1. A user-provided source image in the current task or project.
2. A local image path named by the user.
3. A previously generated intermediate image in the working directory.
4. A text-only request to sketch from scratch.

If the task says “provided image” but there is no actual image or local path available, do not pretend to transform it. Tell the user that a source image is needed, unless they explicitly want a from-scratch image.

## Image-generation prompt

Use this prompt as the main visual direction. Preserve it strongly, but adapt wording if the active image-generation/editing tool rejects direct artist-name style references. If artist names cause rejection, convert them into neutral descriptors such as “Northern Renaissance grotesque detail,” “Romantic nightmare illustration,” “expressionist horror,” “symbolist dread,” “gothic etching,” “surreal anatomical distortion,” “ink-comic terror,” and “dark charcoal academic realism.”

```xml
<prompt>
  <task>
    Transform the provided image into a disturbing, hyper-detailed charcoal horror illustration on a textured platinum-white heavy cloth canvas.
  </task>

  <style>
    Preserve the core composition, pose, and silhouette of the source image, but reinterpret all visible forms with realistic anatomical surface detail, ominous mood, and contest-level charcoal craftsmanship. If sketching from scratch, take broad visual inspiration from grotesque Northern Renaissance painting, Romantic nightmare art, Gothic etching, Expressionist horror, Symbolist dread, Surreal anatomical distortion, dark comic illustration, and museum-level charcoal realism. Historical reference points may include Hieronymus Bosch, Pieter Bruegel the Elder, Francisco Goya, William Blake, Henry Fuseli, Albrecht Dürer, Hans Baldung Grien, Matthias Grünewald, Giovanni Battista Piranesi, James Ensor, Edvard Munch, Odilon Redon, Félicien Rops, Gustave Doré, Franz von Stuck, Arnold Böcklin, Max Klinger, Alfred Kubin, Egon Schiele, Käthe Kollwitz, Otto Dix, George Grosz, Max Beckmann, Salvador Dalí, Max Ernst, René Magritte, Leonora Carrington, Dorothea Tanning, Frida Kahlo, Francis Bacon, Zdzisław Beksiński, Edward Gorey, Charles Burns, Dave McKean, Bernie Wrightson, Clive Barker, Arthur Rackham, Kay Nielsen, Aubrey Beardsley, Gustave Moreau, Austin Osman Spare, William Mortensen, Ivan Albright, Hugo Simberg, Mikhail Vrubel, Francisco de Zurbarán, Caravaggio, Salvator Rosa, Jacques Callot, Antoine Wiertz, Gustave Courbet, William Hogarth, and Théodore Géricault.
  </style>

  <medium>
    Black charcoal, compressed charcoal, graphite dust, soft smudging, dry-brush abrasion, subtle chalk lift, natural grain interaction with heavy woven canvas.
  </medium>

  <canvas>
    Textured platinum-white heavy cloth canvas with clearly visible woven fibers beneath the drawing. The charcoal should catch naturally on the raised grain and sink softly into the weave.
  </canvas>

  <rendering>
    Make the subject feel physically real: realistic skin texture, pores, stretched skin, wrinkles, creases, folds, tension lines, shadow transitions, and tactile surface irregularities.
    Use deep blacks, smoky grays, dusty midtones, and lifted highlights.
    Build volume through layered charcoal shading, feathered blending, edge variation, and selective sharpening.
  </rendering>

  <horror_features>
    Intensify the uncanny realism.
    Make the mouth cavity deep and oppressive.
    Make teeth appear menacingly real: sharp enamel reflections, irregular spacing, gum recession, wet gum texture, subtle saliva sheen, dark crevices between roots.
    Make skin folds heavy, strained, and believable, with realistic compression and stretch around the mouth, jaw, neck, and cheeks.
    Add tear streaks, drips, or viscous dark fluid only if they enhance dread and remain visually coherent.
  </horror_features>

  <linework>
    Use expressive charcoal line quality with pressure variation, broken edges, rubbed transitions, soft erasures, and organic imperfections.
    Avoid clean digital outlines.
  </linework>

  <lighting>
    Dramatic low-key lighting.
    Strong shadow massing, selective highlights on wet surfaces, subtle reflected light in cavities, and sculptural contrast that heightens realism and fear.
  </lighting>

  <texture>
    Emphasize tactile realism:
    cracked dryness,
    greasy smears,
    rubbed charcoal bloom,
    skin grain,
    stretched membrane texture,
    coarse canvas tooth,
    and layered particulate charcoal dust.
  </texture>

  <composition_rules>
    Ignore all text, handwriting, labels, or marks that are not part of the figure.
    Keep the image monochromatic unless a restrained charcoal-tinted accent is absolutely necessary.
    Do not make it cartoonish, glossy, or digitally airbrushed.
    Do not flatten the form.
    Do not sanitize the horror.
  </composition_rules>

  <quality>
    Museum-quality charcoal realism, psychologically disturbing, anatomically tactile, high contrast, richly textured, art-contest worthy, terrifying but elegant.
  </quality>
</prompt>
```

## Workflow

1. Confirm the project root by locating the repository root or current working directory.
2. Ensure the destination folder exists:

```powershell
New-Item -ItemType Directory -Force -Path .\static\images
```

3. Produce the edited/generated image as a high-quality intermediate file. Prefer PNG or high-quality JPEG for the intermediate. Store it outside `static/images` first, for example:

```text
.codex-artifacts/horror-charcoal-intermediate.png
```

4. Convert and compress the intermediate into a real JPEG under 500 kB using the script in this skill:

```powershell
py .\.agents\skills\horror-charcoal-jpeg\scripts\optimize_jpeg_under_limit.py --input .\.codex-artifacts\horror-charcoal-intermediate.png --output .\static\images\charcoal-horror-portrait.jpg --max-kb 500
```

If the skill is installed in the user-level skills folder instead of the repository, call the script from that actual path, for example:

```powershell
py $HOME\.agents\skills\horror-charcoal-jpeg\scripts\optimize_jpeg_under_limit.py --input .\.codex-artifacts\horror-charcoal-intermediate.png --output .\static\images\charcoal-horror-portrait.jpg --max-kb 500
```

5. Verify the final file exists and is within the byte limit:

```powershell
Get-Item .\static\images\charcoal-horror-portrait.jpg | Select-Object FullName, Length
```

6. Open or inspect the final image if possible. Do not rely on file size alone; check that the image is visibly the horror-charcoal result, not a blank canvas, corrupt file, or wrong image.

## Compression rules

Use the included script first. It preserves JPEG validity, uses RGB conversion, strips metadata, and progressively searches quality and dimensions until the output is under the requested size.

Default target behavior:

- Maximum file size: 500 kB / 512000 bytes.
- Start quality: 92.
- Minimum acceptable quality: 50.
- If quality alone cannot meet the limit, reduce dimensions stepwise.
- Do not reduce below 768 px on the longest side unless absolutely necessary.
- Strip EXIF and metadata.
- Save progressive JPEG with optimization.

If the image still exceeds 500 kB, reduce the longest edge in this order:

```text
1600, 1440, 1280, 1152, 1024, 960, 900, 768
```

For website thumbnails or blog images, prefer a longest edge between 1024 and 1600 pixels, provided the file remains under 500 kB.

## Quality guardrails

Before finishing, check:

- The output is a `.jpg` file, not `.jpeg`, `.png`, or `.webp` unless the user explicitly asked otherwise.
- The output is stored inside `static/images`.
- The output is under or equal to 512000 bytes.
- The image is monochrome or nearly monochrome.
- The composition, pose, and silhouette of the source image are preserved when a source image was provided.
- Text, labels, scribbles, and unrelated marks from the source image are ignored unless they are part of the figure.
- The image has visible cloth/canvas grain and charcoal texture.
- The result is not cartoonish, glossy, smooth, plastic, or digitally airbrushed.

## Failure behavior

If no image-generation or image-editing capability is available in the active Codex environment, still complete the deterministic project part when possible:

1. Save the prompt into `.codex-artifacts/horror-charcoal-prompt.xml`.
2. Tell the user that a visual generation/editing tool or already-generated intermediate image is needed.
3. Do not fabricate a JPEG by writing random bytes or copying an unrelated image.

If the compression script cannot meet the 500 kB limit without obvious quality loss, make the best valid JPEG under the limit and report the final dimensions and byte size.

## Final response format

Respond briefly with:

```text
Created: static/images/<filename>.jpg
Size: <bytes> bytes
Dimensions: <width>x<height>
```

Mention any limitation only if something could not be completed exactly.
