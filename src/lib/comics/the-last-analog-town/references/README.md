# Reference production registry

This directory is the approval boundary for recurring character and location references for **The Last Analog Town**. It intentionally contains no approved art yet.

The canonical machine-readable requirements live in:

- `../data/characters.json`
- `../data/locations.json`
- `../data/props.json`
- `../data/visual-language.json`
- `../data/continuity.json`

No final panel or cover art may be generated until the relevant reference slots have a file, provenance record, revision number, named human approval and approval date.

## Originality and rights

References must be original commissioned or generated production assets, photographs the project has the right to use, or public-domain factual references with recorded provenance. Do not store unlicensed comic panels, film stills, character sheets, logos or “style examples” from a named artist here. A reference may document a material, garment construction, plant, vehicle mechanism or architectural fact; it may not invite imitation of another creator's composition or signature language.

Golmohar Junction is wholly fictional. It is not the real Golmohar Railway Quarters in Howrah, not a renamed ward and not a reconstruction of one identifiable neighbourhood. Real eastern-Indian reference research should be synthesised into the invented layered history defined in `../data/series.json`, never copied into a one-to-one street map.

## Expected structure

When reference files are approved, use this structure:

```text
references/
  characters/
    ila-dastidar/
    riju-dhar/
    ananya-rook/
    babul-courier/
    cecil-c17/
    director-vale/
    relative-height/
  locations/
    junction-square/
    golmohar-municipal-hall/
    rook-clinic/
    twelve-hand-market/
    golmohar-halt/
    new-development/
    old-exchange/
    golmohar-school-3/
  props/
  provenance/
```

Do not create empty directory trees merely to simulate progress. Add a folder when its first candidate asset and provenance record exist.

## Character-sheet requirement

Each recurring character needs one approved sheet or an approved, clearly indexed set containing:

- front, three-quarter, side and back views;
- neutral expression plus at least four named expressions;
- standing, walking and seated body poses;
- clear hands holding every signature prop;
- wardrobe layers, closures, footwear and repeated damage or wear;
- front and back views of recurring bags, terminals, tools or attached mechanisms;
- palette swatches with stable colour values;
- relative-height comparison against the entire principal cast;
- provider or model, seed where available, source prompt, revision number and creation date;
- a named human approver, approval date and written correction notes.

The prompt requirements and immutable “never” rules are inside each character's `referenceSheet` record in `../data/characters.json`. A visually appealing sheet that omits a required view is not approved.

Expected filenames:

```text
{character-id}__turnaround__r{revision}.{ext}
{character-id}__expressions__r{revision}.{ext}
{character-id}__poses-props__r{revision}.{ext}
principal-cast__relative-height__r{revision}.{ext}
```

## Location-sheet requirement

Each of the eight canonical locations needs:

- a wide establishing view;
- a street or route approach showing entrances and exits;
- a reverse angle that preserves the same geography;
- a simple plan or route diagram with cardinal orientation;
- monsoon, power-cut and other required state variants;
- close details of fixed story mechanisms;
- scale figures from the approved cast;
- blank, correctly shaped signage fields for deterministic lettering;
- provider or model, seed where available, source prompt, revision number and creation date;
- a named human approver, approval date and written correction notes.

Required view-slot IDs and location-specific prompt requirements live in `../data/locations.json`.

Expected filenames:

```text
{location-id}__{view-slot-id}__r{revision}.{ext}
{location-id}__plan__r{revision}.svg
```

A reverse angle must be geographically compatible with the establishing view. Do not approve a sheet if a model has moved doors, tracks, drains, stairs, counters, trees, platforms or fixed machinery between views.

## Prop and animal reference requirement

Create a prop sheet when an object:

- changes hands;
- carries a clue or record;
- has damage that must persist;
- recurs in close-up;
- determines a mechanism or route;
- is attached to a recurring character; or
- has distinct scripted states.

Use the exact IDs in `../data/props.json`. Show orthographic or three-quarter views as needed, scale, moving parts, open and closed states, damage, colour values, ownership marks and blank lettering regions. Animals require stable markings, scale, range and physically motivated behaviour; they are never speaking mascots.

Expected filename:

```text
{prop-id}__states__r{revision}.{ext}
```

## Provenance record

Every candidate asset must have a sidecar record in `provenance/`:

```json
{
	"assetId": "ila-dastidar__turnaround__r1",
	"status": "candidate",
	"sourceType": "original-generated-or-commissioned",
	"provider": null,
	"model": null,
	"seed": null,
	"promptFile": null,
	"sourceReferences": [],
	"rightsNotes": null,
	"revision": 1,
	"createdAt": null,
	"approved": false,
	"approvedBy": null,
	"approvedAt": null,
	"corrections": []
}
```

`sourceReferences` must identify the origin and rights basis of every external factual reference. “Found online” is not sufficient.

## Human approval checklist

Before changing `approved` to `true`, a named reviewer checks:

- identity, age presentation, body shape, face, hair and skin tone against canonical data;
- proportions and relative height;
- wardrobe, palette, carried objects and persistent damage;
- hands, grips, contact shadows and moving mechanisms;
- location topology and route continuity;
- eastern-Indian material plausibility without generic cultural collage;
- no copied character, composition, logo or named-artist imitation;
- no generated words, pseudo-Bengali, balloons, signatures or watermarks;
- all sign substrates are blank and usable by the deterministic renderer;
- any Bengali test overlay is Unicode and still marked `needs-human-review` in `../data/signage.yaml` until separately approved.

Approval is specific to a revision. Editing an approved image creates a new revision and returns its status to `candidate`.

## Storage and publishing boundary

Working references, prompts, raw generations, rejected candidates, layered masters and print masters stay outside public static assets. Only deliberately selected web derivatives may enter the publishing tree, and only after their reference, language, rights and editorial gates pass.

This registry controls visual continuity; it does not substitute for page-by-page script, accessibility, lettering or print review.
