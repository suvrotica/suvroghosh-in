---
title: "Building VA Data Warehouses"
description: "A high-level but technically serious primer on how data warehouses are actually built from Department of Veterans Affairs operational systems. It explains why extraction is the easy part, why semantic stability is the hard part, and where warehousing efforts usually go wrong."
thumbnail : "/images/IMG-20260423-WA0020.jpg"
date: "2026-04-23"
category: "healthcare-it"
published: true
color: "blue"
---
<TTS />

<Pi src="IMG-20260423-WA0020.jpg" />

The first mistake is to imagine that a data warehouse is just a quieter copy of the source system. It is not. In a Department of Veterans Affairs [VA] environment, the warehouse is a negotiated reconstruction of operational reality assembled from Veterans Health Information Systems and Technology Architecture [VistA], ancillary applications, identity systems, claims and eligibility platforms, reporting layers, and increasingly mixed-generation electronic health record [EHR] sources. You are not moving data from one place to another. You are deciding what the institution believes happened, when it happened, to whom it happened, and under which workflow conditions that fact should count.

That is why newcomers are often surprised by the emotional temperature of warehouse work. Source teams think in transactions, screens, and local operational survival. Analysts think in stable cohorts and reproducible metrics. Leadership thinks in enterprise numbers. Researchers want longitudinal consistency. Auditors want provenance. These are not different views of the same object so much as different demands placed on a system that was rarely designed to satisfy them all at once.

## Core Insight

A warehouse built from VA operational systems succeeds or fails on semantic control, not extraction mechanics.

The pipes matter, of course. You need interfaces, schedules, change capture logic, orchestration, indexing, storage design, security boundaries, and performance tuning. But those are not the part that usually ruins the effort. The real difficulty is that operational systems generate data in service of care delivery, order entry, scheduling, billing, documentation, and local administration. Warehouses generate data products in service of analysis, reporting, quality measurement, operations, and sometimes research. The same row can survive transport intact and still arrive semantically damaged.

That distinction is the one beginners need early. Data transport answers whether something moved. Semantic meaning answers whether what moved still means the same thing once detached from the workflow that created it. A Health Level Seven [HL7] version two [v2] feed can faithfully deliver an event. A relational load can preserve every source value. Neither guarantees that the receiving warehouse now possesses a clinically or operationally trustworthy fact.

This is why so many so-called data quality complaints are actually representation failures. The warehouse may not be wrong in the crude sense. It may simply encode a source event at the wrong level of abstraction, with the wrong temporal anchor, the wrong person identity, the wrong facility attribution, or the wrong understanding of what “final,” “active,” “current,” or “encounter-linked” meant in the originating workflow.

## System-Level Breakdown

Start with the source landscape. In the VA world, one historically important fact is that VistA was not a single tidy monolith in practice. It has operated across many instances, facilities, packages, and locally conditioned workflows. That matters because warehousing begins before extraction. It begins with deciding what counts as the enterprise source of truth when the operational world is federated, uneven, and shaped by years of local adaptation.

Operational data generally enters the warehouse through some combination of direct database extraction, file-based movement, service layers, message-driven interfaces, and curated intermediate stores. In older healthcare architectures, HL7 v2 often carries event notifications well enough for operational interoperability, but it is a poor substitute for analytic reconstruction. Message streams are excellent at saying that an admission, discharge, order, or result event occurred. They are less reliable as the sole basis for constructing durable analytic state without careful replay logic, correction handling, late-arriving updates, and domain-specific reconciliation.

This is where uninitiated teams often confuse movement with modeling. They think the warehouse job is to ingest all available feeds. In reality, the first architectural question is what grain each fact table should represent. Is the atomic unit the patient, the visit, the bed movement, the order, the medication dispense, the observation result, the problem-list assertion, the note, the procedure occurrence, or the billing line? The answer is never “all of the above” in one place without consequence. Every warehouse silently makes ontological choices. Those choices determine whether downstream users can ask sensible questions without inventing their own shadow logic.

A sound VA warehouse architecture usually separates at least three layers, even if the names vary.

The first is a raw acquisition layer. This is the least romantic part and one of the most important. Here you preserve source fidelity as far as practical, including source keys, timestamps, facility identifiers, status codes, user or system provenance, and load metadata. This layer is not for elegant analytics. It is for recoverability, traceability, and dispute resolution. When someone later says the metric is wrong, this is where you go to see what actually arrived.

The second is a conformed integration layer. Here you reconcile identities, normalize code systems where appropriate, establish enterprise keys, manage slowly changing dimensions, standardize time handling, and create domain models that are analytically usable. This is where the work becomes philosophical in the old practical sense. A patient identity might require reconciliation across master person index logic, local identifiers, and historical merges. A location may need separate treatment as ordering facility, encounter facility, rendering location, and reporting hierarchy. A medication event may require disentangling ordering, verification, dispensing, administration, and documentation. Each is a different event with different operational significance.

The third is a curated consumption layer. This is where marts, subject-area tables, semantic views, and data products live. The purpose is not merely faster queries. It is controlled meaning. A quality dashboard, a population health cohort build, and an executive access report may all rely on the same upstream facts but should not force every user to rediscover edge cases in raw operational semantics.

A novice question is often whether the warehouse should be normalized or denormalized. The honest answer is both, at different stages and for different reasons. Normalization is useful when preserving domain discipline, minimizing contradictory updates, and maintaining coherent business rules. Denormalization is useful when exposing stable analytic patterns, reducing query complexity, and supporting performance at scale. In healthcare, over-denormalized models can become dangerously seductive because they look easy while flattening away the very context that determines meaning. Over-normalized models can be equally bad because they force every analyst to reenact domain integration by hand. Good architecture chooses where to compress complexity and where to leave it visible.

Fast Healthcare Interoperability Resources [FHIR] adds an extra temptation here. People see a modern resource model and imagine that it can replace warehouse design. It cannot. FHIR is a transport and representation framework with strong value for interoperability and application integration, but warehouse questions remain warehouse questions. A resource such as Encounter or Observation can help standardize exchange, but enterprise analytics still requires explicit decisions about grain, history, correction logic, deduplication, terminology governance, longitudinal stitching, and fitness for use. A FHIR-shaped lake is not automatically an analytic model.

## Failure Points

The common failure modes are boring in outline and vicious in effect.

Identity is usually first. A veteran may traverse multiple facilities, identifiers, episodes of care, and administrative contexts. If the enterprise key strategy is weak, every downstream measure inherits the weakness. Duplicate patients, broken merges, stale crosswalks, and ambiguous person matching do not merely create messy reports. They corrupt longitudinal analysis and can produce false utilization patterns, false readmission patterns, and false denominator counts.

Time is next, and it is more treacherous than beginners expect. Warehouses routinely inherit multiple timestamps for a single event: event time, entry time, verification time, result time, transmission time, load time, and correction time. Pick the wrong one and your trend is not slightly off; it may answer a different question altogether. A medication order entered late, a note signed hours after care delivery, or a result corrected after initial release can all look sensible row by row while distorting measures that depend on temporal ordering.

Status fields are another quiet killer. Operational systems are full of states that make sense inside workflow but decay into nonsense in analytic use unless interpreted with care. Pending, active, discontinued, held, completed, corrected, superseded, deleted, historical, and entered-in-error do not behave the same across domains. A novice warehouse often treats status as just another attribute. An experienced one treats it as a state machine whose transitions matter.

Terminology mapping produces its own breed of damage. Local codes, package-specific values, text shortcuts, and historically layered vocabularies do not become semantically interoperable merely because they are loaded into the same database. Mapping to standard terminologies can help, but every map carries loss. Some source distinctions collapse. Some local meanings are more procedural than clinical. Some mappings are one-to-many or context-dependent. Once again, what later gets called poor data quality is often a representational compromise that was never made explicit.

Source-of-truth conflicts are endemic. The same concept can exist in multiple systems with slightly different meanings and update rhythms. A patient’s location, provider attribution, appointment state, medication history, or problem list can appear in more than one place, each defensible in its own workflow context. The warehouse cannot simply “pick the best one” and move on. It must declare which source governs which use case, under what precedence rules, with what exceptions, and with what survivorship logic.

Then there is local variation, the old veteran of every large healthcare enterprise. Two sites may use the same package and still generate materially different data because the workflow, training, governance, and local workaround culture differ. Shadow architecture appears here. Humans invent spreadsheets, note templates, local code conventions, queue hacks, and sequencing workarounds to survive operational friction. These adaptations keep the clinic running and quietly deform the data. By the time the warehouse sees the record, part of the institution’s real logic may exist nowhere formal.

Performance and scale can also distort design. Large VA warehousing programs attract demands for one platform to serve operations, quality, finance, executive reporting, research, and machine learning. That ambition is understandable and usually unhealthy unless bounded. The more use cases you pile onto a single semantic layer, the more you pressure it into ambiguity. Either it becomes so generic that every user must reinterpret it, or so specialized that it stops being shared infrastructure.

## Deeper Truth

The reason these failures persist is not that healthcare architects are dim or careless. It is that operational systems are built under pressures that warehouses merely inherit.

Clinical systems record care under urgency, regulation, staffing limits, reimbursement rules, legacy application boundaries, and the need to keep the lights on. Their first obligation is not analytic elegance. It is to support action. That means many data elements are workflow-coupled artifacts rather than clean observations about the world. A date may indicate when something was keyed rather than when it occurred. A diagnosis may reflect billing, justification, suspicion, or administrative necessity rather than settled ontology. A location may reflect accountability routing more than physical presence. Warehouses discover this late and then call it messy data, when in fact it is the ordinary fingerprint of the institution’s operating logic.

There is also path dependence. The VA environment, like every mature healthcare enterprise, carries historical layers. Older packages, local customizations, reporting traditions, research expectations, modernization programs, and new interoperability mandates all coexist. No greenfield architect gets to stride in and redraw the map from first principles. The warehouse becomes a diplomatic instrument as much as a technical one, mediating between eras of design that were never meant to align perfectly.

Modernization complicates rather than abolishes this problem. Mixed-source reality is the rule during transition. Legacy VistA-derived content, newer Oracle Health aligned workflows, FHIR-facing APIs, and analytic platforms may coexist. That is not simply a migration problem. It is a semantic coexistence problem. The same enterprise now contains multiple representational regimes. Unless provenance is first-class, users will unknowingly compare objects whose definitions differ because the care process that generated them differs.

Another deeper truth is that representation failures are attractive to mislabel as data quality failures because “quality” sounds fixable. It suggests better validation, stricter controls, and cleaner feeds. Sometimes that helps. But many warehouse defects arise because the enterprise has not decided what the data is supposed to mean outside the source workflow. No amount of null checks or referential integrity rules can repair an undefined concept. Governance must answer the semantic question first.

The last hard truth is organizational. Data models often encode ownership boundaries more than reality. Domains that are tightly governed get crisp tables. Domains that are politically split get vague joins and unstable definitions. What looks like a technical inconsistency is often an organizational boundary frozen into schema.

## Architectural Direction

Begin with purpose, not platform. Do not start by asking what technology stack to use. Start by asking which decisions the warehouse must support and which questions must be answerable without local heroics. That single discipline prevents a great deal of architectural theatre.

Preserve raw lineage aggressively. Every load should carry source identifiers, extraction timestamps, transformation versioning, and provenance markers that let you reconstruct how a warehouse fact came to be. In healthcare this is not academic nicety. It is the difference between a debuggable analytics platform and a shrine to unexplained numbers.

Model time as a first-class concern. Separate occurrence time from documentation time, ingestion time, and effective time. Build conventions for corrections and late-arriving facts. State clearly which timestamp governs each analytic product. Many downstream disputes vanish once the warehouse admits that there are several legitimate clocks in play.

Treat identity resolution as architecture, not preprocessing. Enterprise person keys, provider keys, facility hierarchies, and crosswalk stewardship need durable governance. A brittle identity layer can make sophisticated analytics look precise while resting on sand.

Conform only what needs conforming. Not every source difference should be crushed into a single enterprise value. Some distinctions should remain visible because they reflect real workflow differences. Early-binding transformation, where you force a canonical model too soon, creates elegant tables and quiet loss. Late-binding approaches, where raw and semi-conformed data remain available longer, often preserve optionality. The right balance depends on the use case, but beginners should know that aggressive early harmonization is often where institutional amnesia begins.

Publish semantic contracts, not just schemas. A table definition is not enough. Each important analytic object should say what event it represents, what source systems contribute, what inclusion and exclusion rules apply, what temporal rules govern it, how corrections are handled, and what it should not be used for. That last part matters. Warehouses become safer when they are honest about non-fitness.

Design for layered consumption. Executives need stable curated metrics. Analysts need inspectable logic. Engineers need raw traceability. Researchers may need historical nuance that a dashboard model intentionally hides. One layer should not pretend to serve all of them equally well.

Assume local variation and instrument for it. Build facility-level data profiling, anomaly detection, and domain stewardship reviews into normal operations. When one site suddenly shows impossible improvements or implausible declines, the explanation is often workflow or coding drift, not miraculous care transformation.

Keep transport and meaning separate in governance. Interface teams can certify that a feed arrived and validated. That is useful, and incomplete. Semantic governance must separately certify what a delivered object means in analytic use. Too many programs stop at technical conformance and then act surprised when the reports fight back.

Finally, resist the fantasy of finality. A VA warehouse is not a completed monument. It is a living argument between operations, care delivery, modernization, policy, and analysis. The goal is not to eliminate that tension. The goal is to make it explicit, governable, and inspectable enough that the institution can reason from its data without mistaking convenience for truth.
