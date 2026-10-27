---
title: "Knowledge Gap Atlas — Find the Connections Your Notes Are Missing"
seoTitle: "Knowledge Gap Atlas — Free, Private Text Network and Research Tool"
description: "Map your essays and research notes. Follow source evidence, compare drafts with references, and build a research plan. No AI APIs or word quotas."
date: "2026-10-27"
dateModified: "2026-10-27"
thumbnail: "/images/visualizations/knowledge-gap-atlas/social.png"
thumbnailAlt: "Knowledge Gap Atlas showing eight coloured topic islands, 59 concepts and full-input indexing statistics for a city-heat research example"
category: "Visualizations"
collections: ["apps"]
tags: ["Knowledge Maps","Text Analysis","Research","Writing","Network Science","Data Visualization","Browser Tools","Information Design","Concepts","Atlas"]
pinnedTags: ["Knowledge Maps", "Text Analysis", "Research", "Writing", "Network Science", "Data Visualization", "Browser Tools", "Information Design", "Concepts", "Atlas"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#217b70"
author: "Suvro Ghosh"
readingTime: "6 min"
inPlainEnglish: "Turn your own writing and notes into a map of recurring ideas. Inspect the passages behind a connection, compare your draft with reference material, and save questions worth investigating. Your text stays on your device."
keyTerms: ["Co-occurrence", "Topic community", "Structural gap", "Source evidence", "Reference coverage"]
faq:
  - question: "Does Knowledge Gap Atlas use an AI API?"
    answer: "No. Text processing, network analysis and research-question templates run locally in your browser. You do not need an API key, account, subscription or model download."
  - question: "Is there a word or token limit?"
    answer: "There is no application-imposed word or token quota. Files are processed in chunks. Available browser storage, device memory and processing time still determine what your device can handle; graph analysis also needs memory."
  - question: "Does a gap prove that something is missing from my knowledge?"
    answer: "No. A structural gap describes weak connections in the supplied material under the current settings. Reference-relative coverage requires reference material you choose. Findings are questions for investigation, not judgements about you or claims about the whole world."
  - question: "Where are my projects stored?"
    answer: "Projects are stored in this browser on this device. They are not uploaded to this site. Clearing site data can erase them, so export a project when you need a portable backup."
---

<script>
	import KnowledgeGapAtlas from '$lib/components/visualizations/knowledge-gap-atlas/KnowledgeGapAtlas.svelte';
</script>

<KnowledgeGapAtlas />

<TTS />

<p><small>Published <time datetime="2026-10-27">27 October 2026</time> · Updated <time datetime="2026-10-27">27 October 2026</time></small></p>

## You have read the material. What connects it?

Sometimes the difficulty is not a shortage of notes. It is a folder full of notes that have never quite met each other.

One document discusses summer heat. Another discusses public transport. A third contains observations about elderly neighbours. The connections may be useful, but a search box only finds the words you already thought to search for.

Knowledge Gap Atlas gives your material a different surface. Recurring concepts become points, nearby mentions become connections, and groups of related concepts become topic islands. You can follow a promising connection straight back to the words that produced it.

Start with an example, or paste something you are working on. For longer material, add text or Markdown files. Your sources stay in the browser; the atlas does not send them to an AI service.

## Read the map, then read the evidence

A large node is a signal to inspect, not a certificate of importance. A line says that two concepts occurred near each other in your material. It does not establish that one caused the other, or even that the author agreed with their relationship.

Select a concept to see its source distribution and passages. Select a finding to inspect the concepts on both sides. The source reader keeps the original wording available, including the qualifications that a compact graph cannot show.

Topic colours distinguish groups found by the analysis. Positions help you navigate those groups; centimetres on the screen are not a calibrated measure of meaning. Use the concept list and coverage view when a table answers your question more directly than a map.

## Ask a better next question

The atlas looks for several kinds of opportunity. Some topics share a context but barely connect in the writing. Some connections depend heavily on one concept. Some ideas are developed in only one source. Others sit at the edge of the network with enough support to deserve another look.

Each finding explains the observation and offers a question. Those questions come from transparent templates using your extracted concepts. They are starting points for your judgement, not answers supplied by an invisible author.

A useful question might be: where does this report connect shaded walking routes with access to healthcare? The graph cannot decide whether that relationship matters to your project. It can make the missing discussion easier to notice, then show you the evidence you have.

Save promising questions to the research plan, rewrite them in your own words, and add notes as you investigate. You can mark a question addressed or dismiss it when the apparent gap turns out to be deliberate.

## Compare a draft with the material behind it

To investigate coverage, give the atlas two roles: your target material and your references. The target might be an essay draft, a report, or a collection of study notes. References might be a reading list, source excerpts, or a syllabus you supply.

The comparison shows shared concepts and relative coverage. A longer document does not automatically win: counts are normalised against the material in each role. An unfamiliar phrase can still be an extraction or vocabulary problem, so read “not found” as “not found under these settings”.

This is especially useful before a revision. It helps you see which parts of the reference material your draft returns to repeatedly and which barely appear. It cannot tell you that every reference topic belongs in the finished piece. A good essay often leaves things out on purpose.

## Keep the material; adjust the lens

Window size changes how near two concepts must occur to count as connected. Minimum support changes which concepts qualify for the analysed network. Topic resolution changes how finely that network is divided. Exclusions and aliases let you correct repetitive vocabulary or group terms deliberately.

These choices affect the findings. Keep the source text intact and treat settings as a lens you can revisit. A bridge that disappears after a small settings change deserves more caution than one you can repeatedly trace through several documents.

No word or token quota is imposed by the app. Large files are read and stored in chunks, but a browser is still a computer with finite resources. Very large vocabularies and networks can require substantial memory even when the text itself is stored on disk. Processing status and errors distinguish completed work from interrupted work.

## Take the questions with you

Projects are saved locally in this browser. Export a project to keep a portable copy, a Markdown report to continue writing elsewhere, or a map image to explain what you found. Review whether an export includes source text before sharing it.

Browser storage is convenient working space, not a permanent backup. Clearing site data or changing devices can leave your local project behind. A downloaded export gives you something you control.

The broad idea of exploring text through networks has a long history; [InfraNodus](https://noduslabs.com/infranodus/) is one useful inspiration. This atlas uses an independent browser-local implementation built around source inspection, comparison, and an editable research plan. If you want another view of the same writing, try [The Anatomy of an Essay](/blog/visualizations/anatomy-of-an-essay).

Find Knowledge Gap Atlas in both [Viz](/blog/visualizations) and [Apps](/blog/apps). Both open this same application.
