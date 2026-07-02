---
title: "Mental Health Polypharmacy Needs Real Decision Support"
description: "A Healthcare IT essay on why complex prescribing histories need timelines, provenance, risk views, and workflow-aware decision support instead of another flat checklist."
date: "2026-04-26"
thumbnail: "/images/IMG-20260425-WA0013.jpg"
category: "Healthcare-IT"
tags: ["Healthcare IT", "Clinical Decision Support", "Polypharmacy", "EHR", "FHIR", "Clinical Informatics", "Patient Safety", "Data Architecture", "SuvroGhosh"]
published: true
color: "red"
---

<TTS />

<Pi src="IMG-20260425-WA0013.jpg" alt="Article illustration for clinical decision support and complex prescribing histories" />

The list looks harmless until you ask when each item began.

That is the problem with complex prescribing history. A flat list can tell a clinician what appears to be active now. It cannot tell the story well enough: what was tried, why it was started, what changed, what failed, what caused trouble, what was stopped, what was continued by inertia, what moved from temporary rescue to permanent furniture.

Healthcare software is very good at piles.

It stores orders, diagnoses, allergies, notes, pharmacy fills, visit histories, and problem lists as separate objects. That is necessary. It is not sufficient. A person living through years of difficult care is not a pile. The case is a timeline, a sequence of guesses, responses, failures, substitutions, handoffs, and practical compromises. If the system cannot represent that sequence, the next clinician inherits fog.

Clinical Decision Support, or CDS, usually fails in two familiar ways.

One failure is the arrogant alert, the little box that interrupts with the confidence of a junior rule wearing a tie. The other failure is the exhausted alert, warning about so many ordinary things that the room learns to ignore all warnings. Complex mental health prescribing sits directly between those failures. Some risks are delayed. Some are contextual. Some depend on dose, duration, age, other substances, sleep, cognition, prior reactions, or the original reason a drug was added.

The answer is not louder alerts. It is better representation.

A serious system would treat prescribing history as a longitudinal object. Start date, stop date, dose changes, reason for use, target symptom, prescriber, response, adverse effect, reason for discontinuation, taper status, uncertainty, and source of information should be visible over time. The system should not pretend every fact is equally reliable. A patient report, a pharmacy fill, an outside note, an active order, and a clinician-confirmed statement are different kinds of evidence.

Provenance matters because memory is fragile in fragmented care.

The useful view is not merely "current drugs." It is a burden profile: sedating load, duplicate mechanisms, interaction risk, cognitive burden, monitoring needs, withdrawal complexity, and unclear continuation logic. It should separate current exposure from historical exposure and active risk from old intolerance. It should show confidence levels rather than pretending the record came down on stone tablets.

FHIR, HL7, RxNorm, SNOMED CT, and EHR modules can all help move pieces of this puzzle. But transport is not meaning. A message can arrive. A resource can validate. A code can map. The system still may not know why something was prescribed, whether it worked, or whether the next step is repeating an old mistake with a cleaner interface.

The workflow also matters.

If the system demands a long essay at the point of prescribing, clinicians will find shortcuts. Better capture is distributed. Pharmacists can document prior intolerance and supply concerns. Nurses can record observed sedation, confusion, falls, or patient-reported trouble. Primary care can reconcile outside care. Specialists can record rationale and response. Patients can contribute structured experience when the system gives them a sane way to do it.

No single heroic form should be asked to carry the whole truth.

AI may help summarize long histories, detect patterns, and surface suspicious sequences. But AI built on poor representation will scale confusion in elegant sentences. Before prediction, there must be structure. Before structure, there must be governance. Before governance, an institution has to admit that a complex prescribing history is not a side note. It is often the case itself.

In Calcutta, a stack of old prescriptions in a plastic folder can contain more continuity than the software. That should embarrass the software.

The future system does not need to be omniscient. It needs to remember honestly.
