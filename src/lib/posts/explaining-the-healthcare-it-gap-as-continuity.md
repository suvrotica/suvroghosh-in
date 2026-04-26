---
title: "The Shadow Architecture: Lessons from a Decade Bootstrapping Healthcare Data Systems"
description: "A first-person account of a decade spent outside conventional corporate structures—operating as a founder and independent architect to understand the deep, structural realities of healthcare data, markets, and AI representation."
thumbnail : "/images/IMG-20260425-WA0007.jpg"
date: "2026-04-25"
category: "Healthcare IT"
published: true
color: "slate"
---

<TTS />

<Pi src="IMG-20260425-WA0007.jpg" />

The easiest thing to misunderstand about independent entrepreneurship is that the corporate calendar looks empty from a distance—the way a hospital corridor looks quiet at midnight until someone opens a chart, a database job fails, or a clinician says the report is wrong.

I was not away from healthcare information technology. I was simply away from conventional employment. 

That distinction is not cosmetic. It is the hinge on which the whole explanation turns. Conventional employment has a neat administrative shape. It has titles, reporting lines, performance reviews, and all the little square boxes that applicant tracking systems enjoy digesting. But work is less obedient. Work can continue outside the corporate structure. It can become harder to name precisely because it has moved closer to the problem itself.

My earlier work in United States healthcare and research environments gave me a durable obsession with the machinery underneath clinical data. I worked around Veterans Affairs (VA) and the University of Texas Health Science Center at San Antonio (UTHSCSA). Those environments taught me that healthcare data is never merely stored. It is produced by care, distorted by documentation, constrained by regulation, reshaped by research, and then asked to behave as if it were a clean little row in a table, freshly ironed and morally upright.

That is not how the creature behaves.

I had worked with EHR data, seeing VA legacy systems shaped by MUMPS—an old but resilient programming language that still haunts major healthcare infrastructure like a grandfather clock in a server room. I had worked with SQL Server warehouses, SAS datasets, and clinical research registries. The technical objects varied, but the underlying question stayed stubbornly the same:

**What does this data actually mean?**

Not what the field label says. Not what the extract specification promises on a tidy afternoon. I mean what does the data mean after it has passed through a workflow, a transformation script, a terminology map, a human workaround, and a downstream user who quite reasonably believes the column name is telling the truth.

That question did not disappear when I left the institutional shelter of a university or hospital. It became sharper, less academic, and less forgiving.

For the past decade, I operated as an independent architect and technical founder. I set out to build proprietary healthcare software—specifically Health Information Exchanges (HIE) and Clinical Trial Management Systems (CTMS)—from the ground up. This did not come wrapped in the reassuring vocabulary of enterprise career progression, but it kept me inside the exact same work: how healthcare data is represented, moved, cleaned, interpreted, and finally trusted or quietly ignored.

Bootstrapping these products in India forced me to learn a different dialect of failure. In the US, healthcare technology is bent by reimbursement logic and defensive documentation. In India, the bending comes from fragmented care delivery, fragile buying capacity, and a smaller appetite for infrastructure whose value is real but invisible. 

Serious healthcare infrastructure is often invisible when it works. An HIE does not announce itself like a shiny consumer app. A CTMS does not thrill a buyer the way a dashboard does. Yet without these quiet foundations, the visible systems become decorative plumbing. The taps gleam, but the water is mysterious.

I learned that a healthcare software product is rarely just a software product. It depends on the surrounding ecosystem being ready to absorb it. The ecosystem includes standards, clinical workflows, master data, operational discipline, and a shared willingness to treat data infrastructure as infrastructure rather than stationery. 

**Often, the ecosystem is the real product.**

Operating independently taught me that healthcare software does not fail only because of bad code or weak user interfaces. Systems fail because incentives are misaligned. Data is semantically unstable. The workflow on paper says one thing, while the actual work happens in side conversations, spreadsheets, memory, habit, and small acts of human improvisation.

Those improvisations are not trivial. They are shadow architecture. 

A nurse’s workaround, a research coordinator’s spreadsheet, an undocumented code translation—these are not outside the system. They are the system revealing itself. Much of healthcare IT fails because leadership keeps treating these things as contamination instead of evidence. 

This is where representation failures are often mislabeled as data quality failures. A field that means one thing to a clinician, another to a billing department, and another to a machine learning pipeline is not merely dirty data. It is an unresolved conflict in representation. The database did not create that conflict. It preserved it, like amber holding an insect with all its legs still accusingly intact.

That distinction is central to how I think about healthcare systems. Data transport is not semantic meaning. An HL7 message can move perfectly and still mislead. FHIR improves structure, but it does not dissolve ambiguity by magic. CDISC and SDTM impose discipline on tabulation, but discipline is not the same as truth. 

A standard can tell systems how to speak. It cannot guarantee they are saying the same thing.

This layer has become more important, not less, with the rise of Artificial Intelligence. Healthcare AI is now being placed on top of the same substrate I have spent years studying: EHR extracts, HL7 messages, FHIR resources, and data warehouses built under pressure.

**The excitement around AI is real. So are the old constraints.**

Models do not operate on healthcare reality. They operate on representations of healthcare reality. If the representation is wrong, incomplete, biased, or semantically confused, AI will not repair it simply by being clever. It will scale the confusion with impressive fluency.

This is why my focus on Applied AI is not a pivot. It is a continuation. The work is still about representation, provenance, workflow, constraints, and trust. The model is new machinery placed on an old floor. Before admiring the machinery, someone has to ask whether the floor can bear the weight.

My decade of independent entrepreneurship gave me the clearest possible view of this floor. I saw what happens when a technically reasonable product enters a market not prepared to sustain it. I saw that standards alone do not create interoperability, and software alone does not create institutional readiness. 

These are not cheerful lessons, but they are incredibly valuable ones.

They have made me a fiercely realistic architect. I do not believe that AI will rescue data whose meaning was never governed. I do not believe another integration engine will fix a broken chain of representation unless the architecture acknowledges where meaning is created, lost, bent, and guessed.

The practical direction is therefore defensible: Build from provenance outward. Treat terminology mapping as a governed clinical act, not a clerical afterthought. Separate transport success from semantic success. Design canonical models with humility.

And when AI enters the picture, do not begin with the model. Begin with the representation.

My time operating outside the corporate ladder was not a disappearance from the field. It was a non-linear stretch of entrepreneurship, deep technical reflection, and hard-earned realism. I have spent my career in the difficult middle layer of healthcare IT—a field of translations, compromises, and partial truths moving through pipes installed by different generations for different reasons.

I want to help build healthcare AI that is useful because it respects that layer, not because it floats above it in a cloud of confident abstraction. I also plan to make this work visible by writing about healthcare IT in public—not as a slogan, but as architecture under a lamp. 

I will be building demos in public: a mock EHR extract, a toy interface engine, a simple FHIR server, a tiny clinical trial dataset. These will not pretend to be production systems. They will be small, deliberate mimics: little clockwork frogs that hop just enough to show the anatomy of the real animal. Through them, I hope to expose the forces that govern larger systems: representation, provenance, workflow, latency, semantic drift, and the treacherous difference between data that merely arrives and data that can be trusted.
