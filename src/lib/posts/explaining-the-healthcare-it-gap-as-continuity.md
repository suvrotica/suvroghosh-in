explaining-the-healthcare-it-gap-as-continuity.md
---
title: "Explaining my gap in conventional employment"
description: "A first-person account of a healthcare IT career gap understood not as absence, but as a difficult and useful continuation of architectural work across data, systems, markets, and representation."
date: "2026-04-25"
category: "Healthcare IT"
published: true
color: "slate"
---
<TTS />

The easiest thing to misunderstand about a career gap is that the calendar looks empty from a distance, the way a hospital corridor looks quiet at midnight until someone opens a chart, a database job fails, or a clinician says the report is wrong.

I was not away from healthcare information technology. I was away from conventional employment.

That distinction is not cosmetic. It is the hinge on which the whole explanation turns. Employment has a neat administrative shape. It has titles, start dates, end dates, reporting lines, performance reviews, and all the little square boxes that applicant tracking systems enjoy digesting. Work is less obedient. Work can continue after the title disappears. It can become harder to name precisely because it has moved closer to the problem itself.

My earlier work in United States healthcare and research environments gave me a durable obsession with the machinery underneath clinical data. I worked around Veterans Affairs (VA), the United States federal healthcare system for military veterans, and University of Texas Health Science Center at San Antonio (UTHSCSA), a large academic health and research institution. Those environments taught me that healthcare data is never merely stored. It is produced by care, distorted by documentation, constrained by regulation, reshaped by research, and then asked to behave as if it were a clean little row in a table, freshly ironed and morally upright.

That is not how the creature behaves.

I had worked with Electronic Health Record (EHR) data, meaning clinical data generated inside systems used to document and manage patient care. I had seen Veterans Affairs legacy systems shaped by Massachusetts General Hospital Utility Multi-Programming System (MUMPS), an old but resilient programming language and database environment that still haunts major healthcare infrastructure like a grandfather clock in a server room. I had worked with Structured Query Language (SQL) Server warehouses, Statistical Analysis System (SAS) datasets, clinical research registries, and trial-oriented data models. The technical objects varied. The underlying question stayed stubbornly the same.

What does this data actually mean?

Not what does the field label say. Not what does the interface display. Not what does the extract specification promise on a tidy afternoon when everyone is still hopeful. I mean what does the data mean after it has passed through a workflow, a source system, a transformation script, a terminology map, a human workaround, a reporting requirement, and a downstream user who quite reasonably believes the column name should be telling the truth.

That question did not disappear during the years that appear, on paper, as a gap. It became sharper, less academic, and less forgiving.

After those formal roles, I moved into the more exposed territory of trying to build healthcare software outside the institutional shelter of a university, hospital, or federally funded research setting. This did not always create a neat résumé line. It did not always produce a title that glows in a recruiter search. It did not come wrapped in the reassuring vocabulary of enterprise career progression. But it kept me inside the same work: how healthcare data is represented, moved, cleaned, standardized, interpreted, governed, priced, and finally trusted or quietly ignored.

Trying to build healthcare information technology products in India forced me to learn a different dialect of the same failure. In the United States, healthcare technology is bent by reimbursement logic, compliance burden, institutional procurement, defensive documentation, and regulatory overhead. In India, the bending comes from another direction: fragmented care delivery, thinner budgets, uneven digital maturity, weaker standardization, fragile buying capacity, and a smaller appetite for infrastructure whose value is real but invisible.

That last part matters. Serious healthcare infrastructure is often invisible when it works. A Health Information Exchange (HIE), a system for moving clinical information across organizations, does not announce itself like a shiny consumer app. A Clinical Trial Management System (CTMS), a platform for managing clinical research operations, does not thrill a buyer the way a dashboard does. A data governance layer does not make a room gasp. Yet without these quiet foundations, the visible systems become decorative plumbing. The taps gleam. The water is mysterious.

I learned that a healthcare software product is rarely just a software product. It depends on the surrounding ecosystem being ready to absorb it. That ecosystem includes standards, budgets, contracting habits, clinical workflows, master data, regulatory expectations, operational discipline, and a shared willingness to treat data infrastructure as infrastructure rather than stationery.

Often, the ecosystem is the real product.

That is a hard lesson. It is also a useful one.

The gap years taught me that healthcare software does not fail only because of bad code, weak user interfaces, or poor project management. Those are common enough villains, but they are not the whole rogues’ gallery. Systems fail because incentives are misaligned. Data is semantically unstable. Users are overburdened. Buyers are not always beneficiaries. Procurement rewards appearance before resilience. Standards are adopted as documents rather than practiced as shared discipline. The workflow on paper says one thing, while the actual work happens in side conversations, spreadsheets, phone calls, memory, habit, and small acts of human improvisation.

Those improvisations are not trivial. They are shadow architecture.

A nurse’s workaround, a research coordinator’s spreadsheet, a billing-driven field, an undocumented code translation, a nightly extract patched by one tired engineer who knows where the bodies are buried — these are not outside the system. They are the system revealing itself. Much of healthcare information technology fails because leadership keeps treating these things as contamination instead of evidence.

This is where representation failures are often mislabeled as data quality failures. A missing value may be a data quality issue. A badly typed date may be a data quality issue. But a field that means one thing to a clinician, another to a billing department, another to a researcher, and another to a machine learning pipeline is not merely dirty data. It is an unresolved conflict in representation. The database did not create that conflict. It preserved it, like amber holding an insect with all its legs still accusingly intact.

That distinction became central to how I now think about healthcare systems. Data transport is not semantic meaning. A message can move perfectly and still mislead. A Health Level Seven (HL7) message, part of a family of standards used to exchange healthcare information, can carry an event from one system to another without carrying enough context for trustworthy interpretation. Fast Healthcare Interoperability Resources (FHIR), a modern interoperability standard that represents healthcare concepts as modular resources, improves structure and accessibility, but it does not dissolve ambiguity by magic. Clinical Data Interchange Standards Consortium (CDISC), a standards organization for clinical research data, and Study Data Tabulation Model (SDTM), its structured model for regulatory trial submissions, impose discipline on tabulation, but discipline is not the same as truth.

A standard can tell systems how to speak. It cannot guarantee they are saying the same thing.

That is the kind of thing I kept working on, even when the work no longer sat inside a conventional employment frame. I studied the seams between clinical care and research, between operational databases and analytic warehouses, between local meaning and standardized form. I learned to respect provenance, because a value without origin is a rumor in business attire. I learned to distrust smooth dashboards, because aggregation can launder uncertainty until it looks executive-ready. I learned that late-binding transformations can preserve flexibility, but they can also defer accountability. I learned that early-binding transformations can create consistency, but they can also freeze the wrong interpretation into architecture and then defend it with confidence.

None of this is résumé theater. It is the layer beneath the visible system.

That layer has become more important, not less, with the rise of Artificial Intelligence (AI), meaning computational systems that learn patterns from data and produce predictions, classifications, summaries, or decisions. Healthcare AI is now being placed on top of the same substrate I have spent years studying: EHR extracts, HL7 messages, FHIR resources, CDISC datasets, research registries, claims-adjacent structures, operational databases, and data warehouses built under pressure by people who were rarely given enough time, authority, or clean source material.

The excitement around AI is real. So are the old constraints.

Models do not operate on healthcare reality. They operate on representations of healthcare reality. Those representations are shaped by workflow, billing, documentation habits, legacy system design, regulatory pressure, institutional incentives, and historical accident. If the representation is wrong, incomplete, biased, stale, or semantically confused, AI will not repair it simply by being clever. It will scale the confusion with impressive fluency.

This is why I do not see my interest in AI as a pivot. I see it as a continuation. The work is still about representation, provenance, workflow, constraints, and trust. The model is new machinery placed on an old floor. Before admiring the machinery, someone still has to ask whether the floor can bear the weight.

My experience remains relevant because I understand the layer beneath the model: where clinical events become computable artifacts, where interoperability becomes translation, where standardization improves structure but does not guarantee meaning, where research data becomes regulatory evidence, where analytics can look precise while resting on unstable definitions, and where organizational structure quietly embeds itself into data architecture.

That last point is easy to miss. Healthcare data does not merely describe patients, encounters, orders, labs, medications, visits, trials, sites, and outcomes. It also describes the institution that produced it. It carries traces of staffing, reimbursement, documentation burden, procurement history, departmental boundaries, and who had the authority to define a field. Every system is partly a technical artifact and partly an organizational fossil.

During my years outside conventional employment, I saw this more plainly because I was no longer looking only from inside a protected institution. I saw what happens when a technically reasonable product enters a market not prepared to sustain it. I saw how essential infrastructure can be treated as optional because its value appears only when something else stops failing. I saw how healthcare buyers may want outcomes but not the unglamorous foundations required to produce them. I saw that standards alone do not create interoperability. Procurement alone does not create adoption. Software alone does not create institutional readiness.

These are not cheerful lessons. They are useful lessons.

They have made me more realistic, not less committed. I no longer believe that healthcare information technology can be improved by pretending the system is cleaner than it is. I do not believe that AI will rescue data whose meaning was never governed. I do not believe that another interface, another dashboard, another integration engine, or another model will fix a broken chain of representation unless the architecture acknowledges where meaning is created, lost, bent, and guessed.

The practical direction is therefore not glamorous, but it is defensible. Build from provenance outward. Treat terminology mapping as a governed clinical and operational act, not a clerical afterthought. Separate transport success from semantic success. Design canonical models with humility, because every canonical model is a treaty, not a divine object. Preserve source context where possible. Make transformations observable. Document exceptions as architecture, not embarrassment. Let workflow analysis happen before data modeling, because in healthcare the data is usually the fossilized residue of work.

And when AI enters the picture, do not begin with the model. Begin with the representation. Ask what the data was created for, who created it, under what pressure, through which system, using which vocabulary, with which omissions, and for which downstream purpose. Ask whether the target question is actually answerable from the available substrate. Ask whether the system is measuring clinical reality, billing reality, documentation reality, or merely the path of least resistance through a form.

That is the work I have continued to do.

The gap, then, is not a disappearance from the field. It is a non-linear stretch of entrepreneurship, independent work, market exposure, technical reflection, and hard-earned realism. It may not map perfectly to a corporate ladder, but healthcare information technology rarely maps cleanly to anything. It is a field of translations, compromises, standards, exceptions, buried assumptions, institutional scars, and partial truths moving through pipes that were installed by different generations for different reasons.

I have worked in that difficult middle layer.

I still work there intellectually.

And I want to help build healthcare AI that is useful because it respects that layer, not because it floats above it in a cloud of confident abstraction. The future I am interested in is not another expensive skin over confused data. It is a more honest architecture: one that knows the difference between moving information and understanding it, between standardizing a field and preserving its meaning, between filling a gap on a résumé and continuing the work between the lines.
