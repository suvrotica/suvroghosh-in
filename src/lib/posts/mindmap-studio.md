---
title: "Mindmap Studio: Read Deeply, See the Connections"
seoTitle: "Mindmap Studio — Source Analysis, Mind Maps & Knowledge Graphs"
description: "Turn articles, transcripts and PDF excerpts into editable mind maps and knowledge graphs. Follow source evidence, refine ideas and export your work."
date: "2026-10-29"
dateModified: "2026-10-30"
thumbnail: "/images/visualizations/mindmap-studio/social.png"
thumbnailAlt: "Mindmap Studio on warm paper, with a central inquiry branching into six coloured themes and connected ideas"
category: "Visualizations"
collections: ["apps"]
tags: ["Mind Maps", "Knowledge Graphs", "Source Analysis", "Learning", "Research", "Browser Tools", "Data Visualization", "Artificial Intelligence", "Concept Mapping", "Critical Thinking"]
pinnedTags: ["Mind Maps", "Knowledge Graphs", "Source Analysis", "Learning", "Research", "Browser Tools", "Data Visualization", "Artificial Intelligence", "Concept Mapping", "Critical Thinking"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#365849"
author: "Suvro Ghosh"
readingTime: "5 min"
inPlainEnglish: "Bring an article, a transcript or a PDF excerpt. Arrange its ideas, inspect the words behind them, and explore the same material as a mind map, a knowledge graph or an outline."
keyTerms: ["Mind map", "Knowledge graph", "Evidence", "Inference", "Source analysis"]
faq:
  - question: "Does Mindmap Studio send my material to an AI provider?"
    answer: "Local outline mode works in your browser. Optional conceptual AI analysis requires consent for each request and sends your sources through this site's server, with selected excerpts sent through Vercel AI Gateway to NVIDIA. NVIDIA may retain the submitted material for model improvement. Availability depends on the configured free service and shared usage limits."
  - question: "Can I paste a video link?"
    answer: "A link can be saved as a source reference. Add the video's transcript or captions for analysis. Mindmap Studio does not watch linked videos or invent inaccessible content."
  - question: "What is the difference between the mind map and knowledge graph?"
    answer: "The mind map organises ideas into a hierarchy. The knowledge graph shows labelled relationships across that hierarchy. Both views use the same editable ideas and source references."
  - question: "Where are my maps saved?"
    answer: "Edits are saved in this browser's local storage database. Download the editable project JSON for a portable backup. It includes your source text, evidence and notes. A public snapshot omits source bodies and private notes but still needs a content review before publication."
---

<script>
	import MindmapStudio from '$lib/components/visualizations/mindmap-studio/MindmapStudio.svelte';
	import MindmapFigure from '$lib/components/blog/MindmapFigure.svelte';
	import publishedExample from '$lib/data/mindmap-studio-example.json';
</script>

An idea becomes easier to understand when you can see what it rests on, where it leads, and which questions it leaves open. Bring a piece of writing, follow a branch, and keep the original words within reach.

<MindmapStudio />

<TTS />

## Begin with a question

The example opens with a small essay about inquiry: asking questions, gathering evidence, building explanations, testing arguments, connecting ideas and communicating what remains uncertain. It is an original demonstration text included with this tool. Its coloured branches offer several ways into the same subject.

Select **Sources** to add your own material. Paste an article or transcript, open a text or Markdown file, or select pages from a text-based PDF. Caption files preserve their timestamps. For a scanned PDF, provide extracted text or OCR output. The preview lets you inspect what the app can actually read before analysis begins.

A video or article link can accompany the text as a reference. The application does not retrieve the linked material. Paste the passage or captions you want to examine; a title alone cannot support an interpretation.

Use the focus field to name your question. You might want to understand the main argument, compare evidence, examine assumptions, or prepare a teaching outline. Overview, Detailed and Research settings control the requested depth.

## Two ways to read

**Local outline** arranges source passages in your browser. It preserves exact evidence and gives you a starting structure to edit. Its extraction rules do not perform the deeper conceptual interpretation requested of an analyst.

**AI conceptual analysis**, when available, identifies themes, claims, relationships and possible implications. It requires consent before transmission. The free service has shared usage limits and may be unavailable. You can also copy a research prompt, use it with a model of your choice, and import its validated project JSON.

Long inputs have explicit limits. Coverage records show how many source segments were considered, and limitations explain omissions. A partial reading should remain recognisable as partial.

## A branch is a way in

The **Mind map** view follows a hierarchy. Expand a branch, inspect a smaller idea, or move a piece to a more useful place. Long explanations belong in the inspector, where they can remain readable without stretching the entire map.

The **Knowledge graph** reveals connections between branches. A claim may support one argument and challenge another. Select a labelled relationship to read its rationale and available evidence. Filters help you explore a source, relationship type or selected idea's neighbourhood.

The **Outline** provides a reading-order alternative and keyboard-accessible editing. **Analysis** gathers the overview, concepts, relationships and study questions. Switching views preserves the same underlying ideas.

## Keep the words nearby

An **explicit** idea is directly stated in the source. An **inferred** idea interprets identified material. A **speculative** idea proposes a possibility. These labels describe how an idea relates to its source; they do not guarantee that the source itself is correct.

Open an evidence card to read its exact passage in context. When you rewrite a claim, review whether the original passage still supports it. Changing the wording of an explicit claim marks the interpretation for review.

Relationships need the same care. “Associated with” does not establish “causes”. Disagreement between sources can be useful information, and a question need not be resolved to deserve a place on the map.

## Keep a working copy

Your edits are saved on this device. Use Undo and Redo to move between revisions. New analysis keeps the previous map in Undo instead of silently discarding your work.

Download **project JSON** to preserve the editable model, full source text, evidence and private notes. Treat that file as containing the material you supplied. Markdown and Mermaid exports provide portable reading and diagram formats, while image exports make a map easier to share.

A **public snapshot** removes source bodies, URLs, evidence excerpts and private notes. Its labels, descriptions and relationship explanations may still contain source-derived content, so review the snapshot before adding it to a published article. Saving locally does not publish anything.

The hierarchical editor builds on [Mind Elixir Core](https://github.com/SSShooter/mind-elixir-core). The surrounding source workflow, evidence model and knowledge graph are integrated into this blog. You can also explore [Prompt Atlas](/blog/visualizations/prompt-atlas) for prompt structure or [Knowledge Gap Atlas](/blog/visualizations/knowledge-gap-atlas) for topic coverage across a corpus.

## A map on the page

This is the example as a published snapshot. Its text outline is available without the interactive canvas, and exploring it leaves the original unchanged.

<MindmapFigure data={publishedExample} caption="An original demonstration essay about inquiry, published as a read-only map." />
