---
title: "Post to UML: Draw in UML from Any Text or Article"
seoTitle: "Post to UML — Draw in 14 UML Diagram Types from Text"
description: "Paste an article or load a blog post to generate editable PlantUML code, render 14 UML diagram types, and export figures with captions."
date: "2026-10-27"
dateModified: "2026-10-27"
category: "Visualizations"
collections:
  - "apps"
thumbnail: "/images/visualizations/post-to-uml/social.png"
thumbnailAlt: "Post to UML studio showing a five-stage pipeline from article prose to editable PlantUML source, deterministic SVG diagrams across 14 UML types, and blog embeds."
tags: ["UML","PlantUML","System Architecture","Conceptual Modeling","Software Engineering","Visualizations","Interactive Tools","Technical Writing","Separating Interpretation Source","Concrete UML"]
pinnedTags:
  - "UML"
  - "PlantUML"
  - "System Architecture"
  - "Conceptual Modeling"
  - "Software Engineering"
  - "Visualizations"
  - "Interactive Tools"
  - "Technical Writing"
published: true
interactiveFirst: true
immersiveLead: true
inPlainEnglish: "Post to UML turns any pasted article or existing blog post into editable PlantUML source code and deterministic SVG diagrams across all 14 concrete UML 2.5 diagram types, then appends the rendered figures and captions after the original article."
keyTerms:
  - "Structural UML diagrams (7): Class, Object, Package, Component, Composite Structure, Deployment, and Profile."
  - "Behavioral & Interaction UML diagrams (7): Use Case, Activity, State Machine, Sequence, Communication, Interaction Overview, and Timing."
  - "Conceptual UML model: A domain model that clarifies prose concepts and workflows without pretending to be implemented software code."
  - "Deterministic PlantUML rendering: Separating text interpretation from validated PlantUML code and deterministic SVG rendering."
faq:
  - question: "Does every article have to produce all 14 UML diagrams?"
    answer: "No. Recommended mode chooses the smallest high-signal set (one to three diagrams). When All 14 mode is selected, unsupported diagram types—such as a Timing diagram when an article gives event order but no durations—honestly report 'Needs more information' or 'Not applicable' instead of inventing facts."
  - question: "What happens when I edit the PlantUML source code manually?"
    answer: "Manual edits in the Source tab immediately re-validate and re-render the SVG preview in your browser without making another AI request. If an edit introduces a syntax error, your code is preserved and the previous valid preview remains clearly marked."
  - question: "How are diagrams ordered when exported to a blog post?"
    answer: "The reader-facing preview and exported Markdown always keep the original article text first, followed by the rendered UML figures, their explanatory captions, and an optional disclosure to inspect or download the PlantUML source."
---

<script>
	import PostToUml from '$lib/components/visualizations/post-to-uml/PostToUml.svelte';
</script>

<PostToUml />

<TTS />

<p><small>Published <time datetime="2026-10-27">27 October 2026</time> · Updated <time datetime="2026-10-27">27 October 2026</time></small></p>

---

Prose explains *why* a system behaves the way it does, but prose is linear: a reader has to hold entities, state transitions, actor boundaries, and chronological handoffs in working memory at the same time. **Post to UML** bridges that gap inside the Viz studio. You paste the text of a draft—or load any published essay from `suvroghosh.in`—choose which UML views you want, inspect and edit the generated PlantUML source code, and export the original article followed by its rendered UML figures and captions.

### Separating Interpretation, Source Code, and Rendering

Language models are helpful at summarizing relationships, but an opaque picture that cannot be edited or audited is a liability in technical writing. Post to UML enforces a strict five-stage separation:

1. **Interpret the text into a shared internal model** of entities, relationships, actors, lifecycle states, and paragraph-level evidence spans so the same concept carries the same name across every diagram.
2. **Generate complete, standalone PlantUML source (`@startuml` … `@enduml`)** and structured metadata for each requested diagram type.
3. **Validate the PlantUML grammar and security rules**, blocking file/remote preprocessor directives (`!include`, `!includeurl`, `%getenv`) and running a bounded syntax-repair pass if needed.
4. **Render the validated AST deterministically into accessible SVG** (with browser PNG rasterization on demand).
5. **Append the rendered figures and captions after the original article prose** for publication.

### Coverage Across All 14 Concrete UML 2.5 Diagram Types

Rather than collapsing every explanation into a generic box-and-arrow sketch, the tool preserves the formal distinctions between all fourteen concrete UML diagram types across two top-level families (and the Interaction subfamily):

- **Structural diagrams (7):** Class, Object (underlined instance snapshots with slot values), Package, Component (with provided lollipop and required socket interfaces), Composite Structure (internal role-bound parts and boundary `portin`/`portout` squares), Deployment (3D execution nodes and deployed artifacts), and Profile (`«metaclass»` and `«stereotype»` metamodel extensions—never a biographical profile).
- **Behavioral diagrams (3 core + 4 Interaction):** Use Case (actors and system boundary), Activity (procedural control flow, decision diamonds, and parallel forks), and State Machine (lifecycle states and `trigger [guard] / effect` transitions), together with **Interaction diagrams (4):** Sequence (vertical lifelines), Communication (participant link network with hierarchical numbered messages `1:`, `1.1:`, `2:`), Interaction Overview (control flow connecting `ref` and `sd` interaction frames), and Timing (state waveforms along a horizontal clock axis).

### Example Published Embed

In a published post, the `<UmlFigure />` component renders the saved diagram asset after the article text, pairs it with an explanatory caption, and keeps the `.puml` source available inside a clean disclosure:

<UmlFigure
	src="/images/uml/post-to-uml/post-to-uml-class.svg"
	sourceHref="/uml/post-to-uml/post-to-uml-class.puml"
	diagramType="class"
	family="Structural"
	title="Post to UML — Five-Stage Pipeline Model"
	alt="UML Class diagram showing ArticleSource, SharedUmlModel, PlantUmlRenderer, and UmlFigureEmbed."
	caption="Figure (Class Diagram): The five-stage architecture separating prose extraction, shared terminology modeling, deterministic PlantUML validation/rendering, and static blog figure export."
	conceptual={false}
	sourceCode={`@startuml
title Post to UML — Five-Stage Pipeline Model
class "ArticleSource" as ArticleSource <<source>> {
  +title : String
  +paragraphs : ParagraphSpan[1..*]
  +segmentProse()
}
class "SharedUmlModel" as SharedUmlModel <<conceptual>> {
  +domainKind : UmlDomainKind
  +entities : SharedUmlEntity[1..*]
  +relationships : SharedUmlRelationship[0..*]
}
class "PlantUmlRenderer" as PlantUmlRenderer <<deterministic>> {
  +validateAndRepair()
  +renderPlantUmlToSvg()
}
class "UmlFigureEmbed" as UmlFigureEmbed <<export>> {
  +svgPublicPath : String
  +pumlPublicPath : String
  +caption : String
}
ArticleSource "1" --> "1" SharedUmlModel : extracts shared glossary
SharedUmlModel "1" --> "1..14" PlantUmlRenderer : synthesizes .puml
PlantUmlRenderer "1" *-- "1" UmlFigureEmbed : produces verified SVG & caption
@enduml`}
/>
