---
title: "FHIR"
description: "A rigorous but readable introduction to HL7 FHIR for serious beginners, grounded in history, healthcare architecture, and the lived texture of real systems. This post explains what FHIR actually is, what it is not, and why its promise is both enormous and frequently misunderstood."
thumbnail : "/images/IMG-20260423-WA0007.jpg"
date: "2026-04-23"
category: "healthcare it"
tags: ["FHIR", "HL7 FHIR", "Fast Healthcare Interoperability Resources", "Healthcare Interoperability", "Health IT Architecture", "Electronic Health Records", "EHR Integration", "Clinical Data", "Healthcare APIs", "FHIR R4", "FHIR R5", "FHIR Resources", "FHIR Profiles", "Implementation Guides", "HL7 v2", "CDA", "REST API", "Healthcare Data Exchange", "Semantic Interoperability", "Terminology Mapping", "SNOMED CT", "LOINC", "RxNorm", "ICD-10", "EHR Data Quality", "Health Information Exchange", "Healthcare Data Standards", "Clinical Informatics", "Healthcare Data Architecture", "Digital Health", "Medical Records", "Population Health Analytics", "Healthcare Data Governance", "US Healthcare IT", "India Healthcare IT", "Calcutta Healthcare IT", "Engineering Blog", "SuvroGhosh"]
published: true
color: "blue"
---
<TTS />

<Pi src="IMG-20260423-WA0007.jpg" />




Acronyms used in this post: Fast Healthcare Interoperability Resources [FHIR, the modern web-friendly healthcare data exchange standard pronounced “fire”]; Health Level Seven [HL7, the standards organization and family of standards used for healthcare information exchange]; Health Level Seven version 2 [HL7 v2, the older message-based hospital integration standard that still runs much of the clinical world]; Clinical Document Architecture [CDA, an HL7 document standard used for structured clinical summaries]; Electronic Health Record [EHR, the clinical system where patient care is documented and managed]; Application Programming Interface [API, a structured way for software systems to talk to each other]; Representational State Transfer [REST, a common web API style built around resources and standard web operations]; Logical Observation Identifiers Names and Codes [LOINC, a terminology often used for labs and clinical observations]; Systematized Nomenclature of Medicine Clinical Terms [SNOMED CT, a large clinical terminology for conditions, findings, procedures, and related meanings]; International Classification of Diseases, Tenth Revision [ICD-10, a diagnosis classification system widely used for billing, reporting, and statistics]; RxNorm [a United States medication terminology that standardizes drug names and identifiers]; Health Information Exchange [HIE, the sharing of clinical information across organizations]; Veterans Affairs [VA, the United States federal healthcare system for veterans].

<TTS />

---

FHIR is what happens when healthcare, after decades of exchanging data like a nervous clerk passing folded notes through a grilled bank counter, finally admits that the internet exists.

That is not the whole story, naturally. In healthcare nothing is ever the whole story. Every sentence comes with a corridor, a form, a missing signature, a billing code, an interface analyst with tea gone cold, and one gentleman in a remote office who knows why the allergy feed broke in 2013 but has unfortunately retired to Arizona. Still, as a first approximation, FHIR is a modern attempt to make clinical data move between systems in a way that is structured enough for machines, readable enough for developers, and not completely hostile to human sanity.

I say “attempt” carefully. Standards in healthcare are like umbrellas in a Calcutta storm. Essential, noble, often beautifully designed, and still no guarantee that your trousers will survive.

FHIR was created under the umbrella of HL7, which has been in the healthcare data business for a long time. Before FHIR, the great workhorse was HL7 v2, a standard so durable that one is forced to respect it even while muttering at it under one’s breath. HL7 v2 messages are everywhere in hospitals: admissions, discharges, lab results, radiology orders, pharmacy updates, the daily postal traffic of the clinical empire. They are compact, fast, ugly in the way a reliable old Ambassador taxi is ugly, and full of local habits. One hospital’s message may behave like another hospital’s message until, one rainy Tuesday, it does not.

Then came CDA, which tried to represent clinical information as documents. This made sense because medicine is full of documents: discharge summaries, progress notes, referral letters, lab reports, operative notes. Doctors do not think only in database rows. They think in stories, fragments, suspicions, hedges, and narrative responsibility. “Patient looks better today” is not a lab value, but it may matter more than the lab value. CDA respected that. But documents are heavy beasts. Excellent for sending a clinical summary. Less elegant when a mobile app wants just the patient’s latest creatinine, or a care coordination system wants active medications, or a population health platform wants diabetic patients with recent hemoglobin A1c values.

FHIR entered this old bazaar with a different idea: do not send everything as one giant document, and do not rely only on cryptic positional messages. Break healthcare into named chunks called resources.

A Patient is a resource. An Observation is a resource. An Encounter is a resource. A MedicationRequest is a resource. A Condition is a resource. A Procedure is a resource. A DiagnosticReport is a resource. Each resource has a defined shape, fields, relationships, identifiers, and rules. It is not the whole patient. It is one manageable piece of the patient’s digital shadow.

This is the first important idea. FHIR is not a database. It is not an EHR. It is not artificial intelligence. It is not a magic solvent poured over old hospital systems to remove bureaucracy, greed, confusion, or bad interface design. FHIR is a way to represent healthcare facts and exchange them using patterns that modern software can understand.

Think of College Street. Books everywhere. Stalls leaning into one another. Engineering guides, poetry, pirated test-prep manuals, political pamphlets, old medical textbooks, damp pages, bargaining voices, tram bells somewhere in the distance, and the smell of dust doing postgraduate work in your lungs. The place is chaotic, but not meaningless. A bookseller can still find a book. There is hidden indexing. There is human metadata. There are conventions. FHIR is a bit like trying to give healthcare’s College Street a cataloging system without bulldozing the street and building a sterile mall.

The resource model is the cataloging trick.

A Patient resource may carry names, dates of birth, gender, addresses, phone numbers, and identifiers. But patient identity in healthcare is already slippery. The same person may have a hospital medical record number, a national identifier, an insurance identifier, a research study identifier, and three spelling variations because one registration clerk heard “Ghosh” as “Ghose” and the system accepted both with the cheerfulness of a drunk typist. FHIR gives you a structure to carry identifiers. It does not solve identity governance by divine intervention.

An Observation resource may represent blood pressure, pulse, oxygen saturation, a lab result, body weight, or a clinical measurement. But here too life gets interesting. A blood pressure reading is not just two numbers. Was it taken sitting or standing? At home or in clinic? By machine or nurse? Was the cuff size appropriate? Was the patient anxious? Was it repeated? Was the value manually entered, device-generated, copied, corrected, imported, or blessed by some midnight interface engine with mysterious powers? FHIR can model much of this, especially with codes, references, timestamps, components, devices, performers, and provenance. But the source workflow still matters. A beautiful Observation resource born from a careless workflow is still a well-dressed lie.

That is the second important idea: data transport is not semantic meaning.

Transport means the data moved. The packet crossed the road. The API returned a response. The JSON looked valid. The server did not collapse into the Hooghly. Good. We celebrate.

Semantic meaning means both systems understand the clinical fact in the same way, or at least close enough that no one commits an expensive act of stupidity. This is harder. If one system says “active medication” because the doctor prescribed it, another says “active medication” because the pharmacy dispensed it, and a third says “active medication” because the patient claimed to be taking it during a hurried visit, then all three may be speaking grammatical FHIR while quietly disagreeing about reality.

This is why bad representation is often mislabeled as bad data quality. People look at healthcare data and say, “The data are dirty.” Sometimes they are. There is dirt. There is mud. There are duplicate rows, missing fields, impossible dates, nonsense codes, and problem lists that have become retirement homes for diagnoses that should have died years ago. But often the deeper issue is not dirt. It is that the data were generated for one purpose and later interrogated for another.

A billing diagnosis is not always a clinical truth. A problem-list entry is not always an active disease. A medication order is not proof of medication consumption. A lab result timestamp may not be the specimen collection time. A discharge date may not be the moment the patient medically left care; it may be the moment paperwork finally escaped captivity. These are representation problems. You can clean them, normalize them, dashboard them, and scold them in meetings, but they will not become the thing you wish they were.

FHIR gives you better boxes. It does not guarantee that the right thing was put in the box.

The historical importance of FHIR is that it arrived when healthcare could no longer pretend that every integration should be a bespoke marriage between two temperamental machines. The rest of the software world had moved toward web APIs, structured resources, developer documentation, standard query patterns, and reusable services. Meanwhile, healthcare was still often running like an old government office where one must know which window to approach, which uncle to flatter, and which form has to be submitted in triplicate though nobody remembers why.

FHIR made healthcare data feel, for the first time to many modern developers, somewhat approachable. You could ask a server for a Patient. You could search Observations. You could retrieve MedicationRequests. You could use RESTful APIs. You could represent data in JSON or XML. You could imagine apps, portals, analytics feeds, decision support tools, payer-provider exchange, and patient access workflows without first joining an esoteric priesthood of pipe-delimited incantations.

But approachability is not simplicity. This distinction is worth keeping in your pocket like emergency tram fare.

FHIR has base resources, but real implementations usually need profiles. A profile says, in effect, “For this use case, this resource must follow these additional rules.” A national program may require certain identifiers. A payer exchange may require specific coverage elements. A public health implementation guide may constrain which codes are allowed. A hospital network may define extensions for data that the base resource does not represent cleanly.

This is both necessary and dangerous. Without profiles, FHIR is too broad for dependable interoperability. With too many local profiles, everyone builds a private dialect and calls it a standard. This is healthcare’s old trick: gather under one flag, then immediately open small kingdoms beneath it.

Terminology is where the plot thickens. FHIR resources often depend on codes from LOINC, SNOMED CT, ICD-10, RxNorm, and other vocabularies. These are supposed to anchor meaning. A lab test should not merely be called “sugar test” in one system, “blood glucose” in another, and “that diabetic thing” in a third. Codes help machines understand what humans casually rename. But terminology mapping is not clerical work. It is intellectual plumbing. If the mapping is wrong, the building may look fine until somebody flushes reality through it.

LOINC is commonly used for lab tests and observations. SNOMED CT is used for clinical concepts. ICD-10 is used heavily for diagnosis classification, billing, reporting, and statistics. RxNorm helps standardize medications. Each terminology has its own purpose, grain, and history. A common mistake is to behave as though all codes are interchangeable labels pasted on reality. They are not. They are classification systems created for different jobs. Using one in place of another can be like using a railway timetable as a cookbook. It may contain numbers and columns, but dinner will not improve.

A non-obvious architectural insight hides here: FHIR’s greatest strength is not that it eliminates local meaning, but that it gives local meaning a place to declare itself. Profiles, extensions, value sets, implementation guides, provenance, and terminology bindings are the machinery by which organizations say, “Here is what we mean in this context.” That declaration is not glamorous. It will not get a conference audience to clap like trained seals. But it is the difference between a system that merely exchanges data and a system that can be trusted under pressure.

Pressure is the honest test. Not the vendor demo. Not the cheerful sandbox. Not the workshop where every sample patient has one name, one identifier, one medication, and the moral cleanliness of a nursery rhyme. Real healthcare pressure means the patient arrives without papers, the name is misspelled, the insurance has changed, the lab interface is delayed, the clinician is overbooked, the nurse documents after the fact, the payer wants prior authorization, public health wants reporting, the analytics team wants a cohort, the researcher wants longitudinal truth, and the hospital wants all of this without hiring enough people to govern meaning.

Under those conditions, FHIR helps. It does not save.

The practical implication for design is blunt: do not build FHIR interfaces as if the API contract is the whole architecture. Ask where the data came from, which workflow produced it, which terminology binds it, what time each timestamp actually means, what identifiers are stable, what provenance is preserved, what local extensions are being introduced, and what downstream decision will depend on the result. The API is the front door. The house may still have termites.

This matters especially for analytics and artificial intelligence. A FHIR feed can supply wonderful raw material. But FHIR resources are usually closer to operational data than analytic truth. Operational data are created during care. Analytic truth is constructed later through reconciliation, deduplication, normalization, temporal modeling, cohort logic, and governance. If you pour raw operational FHIR into a warehouse and call it population health, you may get something that looks impressive in a dashboard and behaves like a goat in a courtroom.

For research, the gap can be even sharper. Clinical trial data often require controlled definitions, protocol-specific timing, curated variables, audit trails, and submission standards. FHIR can help retrieve and structure source data from EHRs, but it does not automatically transform routine care data into research-grade evidence. A creatinine result in an EHR is a clinical artifact. A creatinine value in a trial dataset is a governed data point inside a protocol-defined universe. They may share a number. They do not share a soul.

This is why the clean solution is not available. Healthcare cannot simply pause, redesign every workflow, standardize every term, retrain every clinician, replace every legacy system, reconcile every patient identity, and restart civilization on Monday morning after luchi and tea. Systems have history. Hospitals have budgets. Regulations have teeth. Vendors have contracts. Departments defend turf. Interfaces become permanent because removing them is riskier than tolerating them. Workarounds become architecture because the official architecture failed too slowly for anyone to notice.

So the realistic path is not purity. It is disciplined layering.

Use FHIR for what it is good at: structured exchange, patient access, app integration, care coordination, payer-provider workflows, event-driven patterns, and standardized access to clinical resources. Use profiles and implementation guides seriously. Treat terminology governance as a core architectural function, not a side hobby for people who enjoy spreadsheets too much. Preserve provenance. Separate event time, documentation time, ingestion time, and reporting time when they matter, which is more often than the young architect thinks and the old architect fears.

Do not flatten meaning too early. In data architecture this is the ancient temptation: make a canonical model, hammer everything into it, admire the tidiness, and discover six months later that you have thrown away the context needed to answer the real question. Early normalization can be a form of vandalism if it destroys provenance and workflow meaning. Late binding is often wiser: preserve source detail long enough that different downstream uses can interpret it honestly.

This is not an argument against canonical models. They are useful. Without shared models, enterprise data platforms become junk drawers with funding. But a canonical model must be humble. It must remember that healthcare reality has more corners than the model has boxes.

A curious college student in Calcutta should understand FHIR not as a shining foreign gadget, but as a serious human attempt to solve a very old problem: how to make one institution’s account of reality intelligible to another institution without carrying the whole institution along in a truck. The British loved ledgers. The Americans love platforms. Hospitals love forms. Software loves schemas. Patients, inconveniently, love staying alive. FHIR sits somewhere in the middle, trying to persuade all these creatures to speak with fewer unnecessary misunderstandings.

And the wonder of it is real. A patient can, in principle, retrieve their data. An app can, in principle, read structured clinical information. A public health system can, in principle, receive timely reports. A care team can, in principle, coordinate across institutional boundaries. A researcher can, in principle, find computable clinical facts without sending interns into a swamp of scanned PDFs and despair. These are not small ambitions. In a world where many hospitals still behave like islands with billing departments, FHIR is at least a ferry service with a timetable.

But never confuse the ferry with the destination.

FHIR moves representations. Humans and institutions create meaning. Good architecture respects both facts. It does not sneer at standards, because without standards we are back to shouting across the ward. It does not worship standards, because worship is what people do when they have stopped reading the error logs.

The best way to learn FHIR is therefore not to memorize resources like exam answers. Learn the shape of the resources, yes. Learn Patient, Observation, Encounter, Condition, MedicationRequest, DiagnosticReport, Procedure, Coverage, Claim, and CarePlan. Learn references, identifiers, cardinality, status, extensions, profiles, bundles, search parameters, subscriptions, and bulk export. But also learn to ask the rude architectural questions. What event produced this data? Who recorded it? For what purpose? What was lost when it became structured? What local convention is hiding inside a standard field? What does this code mean here, not in the abstract, but here, in this hospital, in this workflow, at this hour?

That is where FHIR becomes interesting. Not as a fashionable standard, not as a certification checkbox, not as another acronym to throw into a proposal like coriander into dal. It becomes interesting as a map of healthcare’s struggle to make suffering, treatment, billing, observation, memory, and bureaucracy computable without making them false.

The map is imperfect. Of course it is. All maps lie by omission. The question is whether they lie usefully.

FHIR, at its best, lies less than what came before. In healthcare IT, that is not paradise. It is progress.
