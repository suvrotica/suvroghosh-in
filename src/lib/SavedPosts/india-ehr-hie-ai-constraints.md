---
title: "Why EHR and HIE Struggle in India but AI Diagnostics might not"
description: "A system-level analysis of why Electronic Health Records and Health Information Exchange architectures remain impractical in India, and how structural gaps may paradoxically enable AI-driven diagnostics."
thumbnail : "/images/IMG-20260423-WA0009.jpg" 
date: "2026-04-21"
category: "healthcare it"
tags: ["Video", "Engineering Blog", "SuvroGhosh", "EHR", "HIE", "AI Diagnostics", "India", "Healthcare IT", "India Ehr Hie AI Constraints", "AI in India", "Suvro Ghosh", "Calcutta", "Kolkata", "Bengali Essay", "Indian Middle Class", "Lower Middle Class India", "Kolkata Bengali Writing", "Longform Essay", "Personal Blog", "Systems Thinking", "South Asia", "Urban India", "Healthcare Data", "Clinical Informatics", "Health IT Architecture", "Medical Data Systems", "Interoperability", "Artificial Intelligence", "AI Commentary", "AI Ethics", "AI Safety", "Large Language Models", "Agentic AI", "Technology Culture", "Kolkata Life", "Calcutta Bengali", "Bengali Culture", "West Bengal", "Urban Kolkata", "Mental Health", "Bipolar Depression", "Anxiety", "Depression Writing", "Mental Health India", "Loneliness", "Middle Age", "Personal Essay", "India Commentary"]
published: true
color: "teal"
---

<TTS />

<Pi src="IMG-20260423-WA0009.jpg" />

Acronyms expanded in this post:
- AI: Artificial Intelligence. software that generates, classifies, predicts, summarizes, or acts on patterns in data.
- API: Application Programming Interface. a controlled doorway through which software systems exchange data or actions.
- CDA: Clinical Document Architecture. an older Health Level Seven standard for structured clinical documents.
- EHR: Electronic Health Record. the clinical system where patient care is documented and managed.
- FHIR: Fast Healthcare Interoperability Resources. the modern web-friendly Health Level Seven healthcare data exchange standard.
- HIE: Health Information Exchange. the sharing of clinical information across organizations.
- HL7: Health Level Seven. the family of healthcare messaging and data exchange standards.
- HL7 v2: Health Level Seven version 2. the older event-message standard still running much hospital integration.
- ICD: International Classification of Diseases. a diagnosis classification system used for reporting, billing, and statistics.
- IT: Information Technology. the practice of building, operating, and supporting computing systems.
- NLP: Natural Language Processing. software methods for working with human language.
- SNOMED CT: Systematized Nomenclature of Medicine Clinical Terms. a large clinical terminology for representing medical meaning.

---

Electronic Health Record [EHR, the digital clinical record used to document patient care], Health Information Exchange [HIE, the network and governance layer that lets clinical information move between organizations], Artificial Intelligence [AI, software that learns patterns from data and uses them for prediction, classification, or generation], Health Level Seven version 2 [HL7 v2, the old but still widely used healthcare messaging standard that moves events like lab results and admissions], Fast Healthcare Interoperability Resources [FHIR, a newer healthcare data standard that represents clinical data as small linked resources such as Patient, Observation, Encounter, and MedicationRequest], Clinical Document Architecture [CDA, a document-based healthcare standard that packages clinical narratives and structured sections], Optical Character Recognition [OCR, software that converts scanned or photographed text into machine-readable text], Natural Language Processing [NLP, software methods for extracting meaning from human language], International Classification of Diseases [ICD, a coding system for diagnoses], Systematized Nomenclature of Medicine Clinical Terms [SNOMED CT, a detailed clinical terminology for representing medical concepts], Application Programming Interface [API, a controlled software doorway through which one system can request or send data], and Ayushman Bharat Digital Mission [ABDM, India’s national digital health initiative meant to support health identity, records, consent, and data exchange] are the main beasts in this particular zoo.

India does not have an EHR problem in the way a kitchen has a cockroach problem. It has a reality problem. The EHR arrives with polished shoes, a data model, and the faint smell of American hospital administration; then it steps into a clinic where the doctor is seeing seventy patients before lunch, the printer is coughing like an old ambassador taxi, the prescription is half-English, half-private shorthand, and the patient’s longitudinal record is a plastic folder, two WhatsApp images, one faded lipid report, and the mother’s memory.

That is not a small implementation gap. That is the whole bridge missing.

Most EHR and HIE architectures quietly assume a certain kind of civilization already exists underneath them. Not a morally superior civilization, mind you; just a boringly organized one. Stable patient identity. Reliable addresses. Participating hospitals. Trained coders. Structured notes. Billing codes that mean something close to clinical truth. Labs that send results electronically. Doctors who have the time, money, and incentive to document in a way that helps a future stranger.

India, being India, smiles politely and produces a receipt from 2017 with the corner eaten by humidity.

This is why the usual imported digital health sermon fails. It imagines healthcare as a railway timetable. India’s healthcare behaves more like a para transit system assembled by necessity, bargaining, improvisation, prestige, fear, and cash. A patient moves from a local doctor to a diagnostic center to a specialist to a hospital to a pharmacy to an uncle who knows someone at a nursing home. Each stop may produce data, but not necessarily data that wants to be reunited with its cousins.

An HIE assumes the cousins are willing to attend the same family wedding.

They are not.

The first crack is identity. A good EHR needs to know that the Suvro Ghosh who came for a creatinine test last month is the same Suvro Ghosh who turned up yesterday with swelling, a cough, and the cheerful fatalism common to middle-aged Bengali men who have read too much and exercised too little. In theory, India can use national identity infrastructure. In practice, healthcare identity is tangled with privacy, politics, phone numbers, misspelled names, changing addresses, local registration numbers, and the great subcontinental art of writing the same person five different ways.

Once identity wobbles, the longitudinal record becomes a detective novel with missing pages.

Then comes the data itself. HL7 v2 can move a lab result. FHIR can represent an Observation. CDA can wrap a discharge summary inside a document. But none of these standards can magically create the clinical meaning that was never captured. This is the first distinction people keep losing: data transport is not semantic meaning. Transport is the bus. Meaning is whether the passenger is actually the person named on the ticket, going to the right destination, for the reason written in the file.

A system can send a message perfectly and still say almost nothing useful.

One hospital writes “DM.” Another writes “diabetes mellitus.” A third writes “sugar.” A fourth records only metformin. A fifth knows the patient is diabetic because everyone in the room knows it, so nobody bothers to type it. To a human clinician, these may sit in the same mental bucket. To software, they are not the same unless someone builds the semantic bridge. That bridge is made from terminology mapping, workflow knowledge, provenance, and humility. It is not made from vendor brochures.

This is where representation failures are often mislabeled as data quality failures. People say, “The data is dirty,” with the air of someone blaming the floor for the flood. But much of the time the data is faithfully representing a broken workflow. It is not dirty in the simple sense. It is honest. It records billing pressure, hurry, missing fields, informal diagnosis, local habits, and the shadow workflow that everyone uses but nobody admits exists.

The database is not lying. The organization is speaking through it in a hoarse voice.

Now add economics. A large corporate hospital may have an EHR. A premier diagnostic chain may have decent lab systems. A government program may define a digital architecture. But much of Indian care happens in small clinics, standalone labs, nursing homes, pharmacy counters, and local diagnostic shops where integration is not merely hard; it is irrational. Why should a small clinic spend money on FHIR APIs, consent workflows, interface maintenance, terminology services, uptime monitoring, cybersecurity, and staff training when the patient will pay today for the consultation and may never return?

This is not villainy. It is arithmetic wearing a thin shirt in May heat.

The American EHR grew inside reimbursement machinery. Documentation meant billing, compliance, litigation defense, coding, quality measures, insurance negotiation, and institutional memory. That machinery is ugly in its own way, like a rhinoceros in a tie, but it creates a reason to document. India has not built the same pressure system across the whole market. Private care documents what helps the business. Public care documents what the program demands. Small care documents what helps the doctor survive the queue.

So the idea of a clean national HIE, while attractive on PowerPoint, runs into the mud wall of incentive design.

Even if ABDM grows, even if consent rails mature, even if patient health IDs become common, the core question remains: who will create accurate clinical data at the source, under time pressure, without being paid for the effort, and who will maintain the meaning of that data after it moves? An API cannot answer that. A standard cannot answer that. A standard can define the shape of the bucket. It cannot fill the bucket with milk.

Sometimes it fills with rainwater.

The non-obvious architectural point is this: India’s digital health problem is not mainly the absence of a national data pipe. It is the absence of stable, workflow-coupled clinical representation at the point where care is produced. HIE tries to connect institutions after the fact. But the meaning has already been damaged upstream. By the time the record arrives at the exchange layer, it may have lost diagnosis context, temporal sequence, medication intent, and clinician confidence. The exchange then becomes a grand post office for postcards written during an earthquake.

Still, and this is the interesting little crack in the wall, AI diagnostics may arrive before proper EHR maturity in some places.

Not general magical doctor AI. That is fantasy with venture capital shoes. I mean narrow diagnostic AI, tied to specific inputs and specific questions. A chest X-ray. A retinal image. A skin lesion photograph. A pathology slide. An electrocardiogram. A cough recording. A short triage form. These are not complete patient histories. They are bounded artifacts. They do not always require ten years of longitudinal EHR data. They require a good input, a defined task, a validated model, a sane workflow, and a clinician or health worker who knows when not to trust the machine.

That difference matters.

EHR and HIE want to reconstruct the patient’s story across time. AI diagnostics can sometimes operate on a single page torn from the book. That page may be enough to flag diabetic retinopathy, tuberculosis suspicion, cervical cancer risk, arrhythmia, fracture, or malignancy. It is not enough to understand the patient as a person, but it may be enough to move the next clinical step.

In a country where many people do not reach specialists early, that may not be trivial.

India is full of diagnostic bottlenecks. Radiologists are unevenly distributed. Pathologists are scarce outside better-resourced centers. Specialists cluster where money and institutions cluster. Patients travel absurd distances for something that should have been caught earlier. A narrow AI tool, sitting inside a screening van, district hospital, ophthalmology camp, or low-cost diagnostic center, may do useful work before the perfect EHR arrives like a punctual government bus from a parallel universe.

But the door is only ajar. It is not wide open with garlands.

AI diagnostics has its own ugly constraints. Image quality varies. Devices vary. Lighting varies. Operators vary. Indian patients are not always represented properly in training datasets. Local disease prevalence changes the predictive value of a model. A tool trained on curated hospital images may behave badly in a rural camp where the camera is dusty, the queue is restless, and the technician has been trained in two afternoons. Distribution shift is not an academic phrase there. It is the difference between a useful warning and a confident mistake.

And without EHR context, AI can become clinically thin. A model may see pneumonia on an X-ray, but not know the patient’s prior tuberculosis, kidney disease, immunosuppression, pregnancy, drug allergy, or previous imaging. It may classify a lesion without knowing occupational exposure. It may flag risk without knowing that the patient cannot afford the follow-up test. The machine sees the slice. The clinician must still see the life.

That is where governance must be practical, not ornamental. A narrow AI diagnostic system in India should be designed as assisted decision support, not autonomous truth delivery. It should store input provenance: where the image came from, which device, which operator, what date, what quality score, what model version, what confidence range, and what human action followed. It should make uncertainty visible. It should fail closed when inputs are poor. It should be audited locally, not worshipped globally.

This is the design implication: do not build AI diagnostics as a shiny foreign brain dropped onto Indian chaos. Build it as a small, testable clinical instrument attached to a workflow. A thermometer does not become useful because it is intelligent. It becomes useful because someone knows where to put it, how to read it, when to distrust it, and what to do next.

The same applies here.

The realistic constraint is that clean solutions are blocked by the shape of the system. India cannot simply leap into nationwide semantic interoperability because the country does not have uniform care delivery, uniform documentation incentives, uniform infrastructure, or uniform institutional trust. It also cannot safely leap into AI diagnostics without validation, quality control, liability rules, clinician adoption, and follow-up capacity. A screening tool that detects disease but cannot route the patient into care is not transformation. It is a more technologically decorated form of sadness.

So the sensible architecture is layered and modest, which is irritating because modesty does not raise conference applause.

At the bottom, accept heterogeneity. Ingest PDFs, images, text, lab feeds, pharmacy records, and minimal demographics without pretending they are already clean. Preserve provenance. Do not flatten everything too early into a canonical model that lies by tidying up the mess.

In the middle, use standards where they fit. FHIR is useful for representing resources and exchanging data between capable systems. HL7 v2 will continue to grunt along in labs and hospitals because old plumbing is still plumbing. CDA may survive in document-heavy workflows. But none of these should be mistaken for meaning itself. Standards carry representation. They do not guarantee truth.

At the top, build focused registries, disease programs, and diagnostic networks where the incentives are specific enough to work. Diabetes eye screening. Tuberculosis triage. Maternal risk. Oncology referral. Chronic kidney disease monitoring. These narrower domains can develop better data habits because the purpose is visible. People document better when the record returns value before the next ice age.

The dream of a universal Indian EHR may remain stuck for a while between policy ambition and clinic reality. But useful AI diagnostics may grow in the cracks, especially where the input is bounded, the question is narrow, the workflow is supervised, and the output leads to actual care.

That is not the grand cathedral of digital health.

It is more like a tea stall with electricity during load-shedding: imperfect, improvised, slightly smoky, but serving something hot when the grand establishments are still discussing procurement.

And in India, one learns not to sneer at the small working thing.

## Related Posts

- [FHIR](/blog/healthcare-it/fhir-for-a-curious-student-in-calcutta)
- [Latent Space in Healthcare Data, From the Beginning](/blog/healthcare-it/latent-space-in-healthcare-data)
- [HIE from First Principles](/blog/healthcare-it/hie-first-principles-openhie)
- [Kenneth Arrow, Medical Uncertainty, and the False Dream of Healthcare as a Normal Market](/blog/healthcare-it/arrow_uncertainty_medical_care_healthcare_it)
