---
title: 'Research and Verification Prompts'
description: 'Evidence-first prompts for traceable research, current-event verification and technical documentation checks without citation laundering.'
date: '2026-07-30'
dateModified: '2026-07-30'
kind: 'prompt'
tags:
  - 'Research'
  - 'Fact-checking'
  - 'Sources'
  - 'Current events'
  - 'Technical documentation'
published: true
featured: false
order: 60
thumbnail: '/images/resources/research-and-verification-prompts.webp'
thumbnailAlt: 'A research desk with primary documents, dated evidence cards, conflicting claims and linked citations'
estimatedLength: '3 research templates'
related:
  - 'prompts/codex-desktop-implementation-prompts'
  - 'prompts/scientific-visualization-prompts'
  - 'prompts/editing-prompts'
language: 'en'
---

These prompts make the evidence trail part of the answer. They are for questions where freshness, source quality, conflicting accounts or a technically precise version matter more than a smooth synthesis.

## Intended use

The master prompt handles general research. Two variations tighten the method for fast-moving events and versioned technical documentation.

## Suitable inputs

Provide the exact question, intended use, relevant places or jurisdictions, as-of date, acceptable source languages, time budget and any sources or claims that must be checked rather than merely repeated.

<!-- resource-copy:start -->

## Evidence-first research master prompt

Research and answer [RESEARCH QUESTION] as of [AS-OF DATE].

### Scope

- Intended reader and decision: [AUDIENCE AND USE]
- Geographic or legal scope: [JURISDICTION OR LOCATION]
- Time period: [START AND END OR CURRENT]
- Depth and length: [DEPTH]
- Sources already supplied: [SOURCE MATERIAL OR NONE]
- Claims requiring special verification: [CLAIMS]
- Exclusions: [OUT OF SCOPE]

### Source hierarchy

Prefer sources in this order when they can answer the question:

1. original laws, regulations, standards, official records, court documents, datasets, filings, release notes, repositories, specifications and research papers;
2. direct statements or contemporaneous records from responsible institutions or named participants;
3. high-quality independent reporting or expert analysis that links to underlying evidence;
4. secondary summaries used for orientation, not as hidden substitutes for inaccessible originals.

Source prestige does not compensate for failure to support the claim. A search snippet, aggregation page, unsourced infographic or article that cites another article is not primary evidence. Follow citation chains to the strongest reachable source.

### Research method

1. Restate the question in one precise sentence and list ambiguous terms that could change the answer.
2. Break it into verifiable sub-questions.
3. Search for primary evidence first. Record unsuccessful searches when absence itself affects the conclusion.
4. Open and inspect the relevant source, not only its title or snippet.
5. Record the event or effective date separately from the publication, upload or update date.
6. Check version, jurisdiction, population, methodology and whether the source actually covers the requested period.
7. Seek credible contradictory or limiting evidence, not merely additional sources that repeat the first account.
8. Trace every material claim to a source that directly supports it.

### Evidence ledger

Maintain a compact ledger with:

- claim or sub-question;
- classification: fact, inference, allegation or unknown;
- source title and direct URL or stable identifier;
- source type and why it is authoritative or limited;
- event/effective date;
- publication/update date;
- exact supporting section, page, table, commit, release or passage;
- confidence and unresolved conflict.

Use these classifications strictly:

- **Fact:** directly supported by inspected evidence.
- **Inference:** a reasoned conclusion from stated facts; explain the reasoning.
- **Allegation:** attributed to the person or organization making it and not silently converted into fact.
- **Unknown:** evidence is missing, inaccessible, contradictory or insufficient.

### Conflicting evidence

When credible sources disagree:

- state the disagreement plainly;
- compare what each source measured, observed or was positioned to know;
- check whether they concern different dates, populations, definitions or versions;
- identify conflicts of interest or methodological limitations without using them as automatic disqualification;
- do not resolve the conflict by counting articles or choosing the most confident prose;
- state which conclusion is best supported, how tentative it is and what evidence would change it.

### Citation discipline

- Place citations immediately beside the claim they support.
- Link to the direct source, document, dataset, paper, standard section or release note where possible.
- Never invent a title, author, date, quotation, DOI, URL, page number or access result.
- Do not cite a source for a broader claim than it makes.
- Do not cite a secondary article as though you inspected the primary material it mentions.
- Use short quotations only when exact wording matters; otherwise paraphrase accurately.
- If a paywall, login, missing archive or tool limitation prevents inspection, say so.

### Required answer

Return:

1. **Short answer** — the most defensible conclusion and its date boundary.
2. **What is established** — verified facts with direct citations.
3. **What is inferred** — reasoned conclusions with the chain of reasoning.
4. **What is alleged or disputed** — attributed claims and conflicts.
5. **What remains unknown** — missing evidence and why it matters.
6. **Timeline or version table** — include event/effective and publication/update dates separately.
7. **Source-quality note** — primary evidence used, weaker evidence excluded or retained with caution, and access limitations.
8. **Practical implications** — only those warranted by the evidence and intended use.

End with an audit: identify the three claims most vulnerable to change or error and say how each was checked.

### Boundaries

Do not manufacture certainty to satisfy the requested tone. Do not infer legal, medical, scientific or financial safety from an ordinary checklist. Do not treat repeated wording across weak sources as independent confirmation. If the evidence cannot support a conclusion, give a useful account of the uncertainty rather than a confident synthesis from scraps.

## Current-events verification variation

Verify [CURRENT-EVENT CLAIM OR QUESTION] within [RECENCY WINDOW] as of [EXACT DATE AND TIME ZONE].

Prioritize official records and direct statements, then independent reporting with reporters, datelines and explicit sourcing. Build a timeline using the date each event happened, not only the date each article was published. Distinguish:

- confirmed event;
- official or participant claim;
- eyewitness report;
- independent corroboration;
- analysis;
- rumour or unverified social post.

Check whether later reporting corrected, narrowed or contradicted early accounts. When quoting live totals, office-holders, schedules, prices, casualties or legal status, attach the exact observation time. Produce a concise answer, chronology, conflict table and “what could change next” section. Do not call two stories independent corroboration if both derive from the same wire report, press release or anonymous source.

## Technical-documentation verification variation

Answer [TECHNICAL QUESTION] for [PRODUCT, API, LIBRARY OR STANDARD] version [VERSION] in [RUNTIME OR PLATFORM].

Use the official specification, documentation, source repository, changelog, release notes and executable examples as primary material. Verify:

- version and release channel;
- exact symbol, field, command or behaviour;
- prerequisites and platform limits;
- deprecation or replacement status;
- whether an example belongs to the current version;
- failure behaviour and security implications.

Separate documented guarantee from observed implementation behaviour and community convention. Cite the exact documentation page, specification section, release or source line. If sources conflict, reproduce the smallest safe example in [TEST ENVIRONMENT] and report the command, input, output and version; do not generalize beyond that evidence. Return a direct answer, minimal verified example, version caveat, failure modes and source links.

<!-- resource-copy:end -->

## Usage notes

Use an exact as-of date whenever the subject can change. A citation-heavy answer can still be poorly verified if every link descends from one press release or if publication dates are mistaken for event dates. For high-stakes decisions, treat the result as research support and obtain the qualified review appropriate to the domain.
