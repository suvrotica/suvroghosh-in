---
title: "FHIR for a Curious Student in Calcutta"
description: "A rigorous but readable introduction to HL7 FHIR, what it is, what it improves, what it cannot fix, and why healthcare interoperability is still a problem of meaning."
date: "2026-04-23"
thumbnail: "/images/IMG-20260423-WA0007.jpg"
category: "Healthcare-IT"
tags: ["FHIR", "HL7", "Healthcare IT", "Interoperability", "Health Data Standards", "APIs", "Clinical Informatics", "Digital Health", "SuvroGhosh"]
published: true
color: "blue"
---

<TTS />

<Pi src="IMG-20260423-WA0007.jpg" alt="Article illustration for FHIR healthcare interoperability" />

The form on the clinic counter asks the same questions again.

Name. Age. Phone number. Address. Past illness. Allergies. Prior procedures. In Calcutta, the form may sit beside a plastic pen tied to a string, a register with ruled pages, and a printer that sounds faintly offended by its own existence. The odd thing is not that healthcare needs information. Of course it does. The odd thing is that the same information often exists somewhere else and still cannot arrive usefully.

FHIR was created for that cupboard problem.

FHIR stands for Fast Healthcare Interoperability Resources. It is a modern HL7 standard for representing and exchanging healthcare data using web-friendly ideas: resources, URLs, HTTP, JSON, XML, search, profiles, and APIs. In plain language, it gives software systems a common grammar for asking for specific pieces of health information.

The basic unit is the resource.

A Patient resource describes a patient. An Observation resource describes something measured or observed, such as a lab result or vital sign. An Encounter resource describes a care contact. A Condition resource records a problem or diagnosis. A DiagnosticReport gathers related results into a report. A Bundle carries several resources together.

This sounds simple. In healthcare, simple is an achievement with bruises.

Before FHIR, a great deal of healthcare exchange moved through older standards. HL7 v2, born in the 1980s, still moves enormous amounts of operational data. It is event-driven, compact, pipe-delimited, and deeply embedded in hospitals. A lab result comes back. A patient is admitted. A demographic update happens. A message moves. HL7 v2 deserves respect because it worked and still works, though it can be cryptic and locally idiosyncratic.

FHIR did not arrive to erase all of that. It arrived because modern software expected data to be reachable in smaller, clearer, web-style pieces.

If HL7 v2 often says, "Something happened; here is a message," FHIR often says, "Here is a structured object; ask for what you need." That difference matters for patient apps, public health feeds, analytics, care coordination, research, and modern developer workflows.

But FHIR is not a magic solvent.

It can standardize structure without fully solving meaning. A valid FHIR resource may still carry a local code, a vague status, a stale field, a partial history, or a fact whose clinical context was lost before it reached the API. Profiles and implementation guides help by constraining use. Terminology services help by mapping codes. Governance helps by deciding what must be recorded and how. Without those, FHIR can become a clean envelope carrying an ambiguous letter.

That is the central lesson for a serious beginner.

FHIR is not "the healthcare database." It is not "the EHR." It is not "the AI layer." It is a standard way to represent and exchange health information. It is plumbing with grammar. It can make integration easier, but it cannot make institutions agree by decree. It cannot repair poor workflow, missing governance, weak identity matching, unclear consent, bad source data, or a culture that treats documentation as clerical waste until the analytics team wants truth.

Still, progress matters.

FHIR makes healthcare data more approachable for developers. It supports modular exchange. It lets apps ask for specific resources rather than whole documents. It fits better with modern security patterns and web architecture. It gives health systems a language that can be tested, profiled, validated, and argued over in public.

That last point is underrated. A shared standard gives disagreement a table.

In the end, FHIR is a map. All maps omit. The question is whether the omission is honest enough for the journey. FHIR lies less than much of what came before. In Healthcare IT, that is not paradise.

It is progress.
