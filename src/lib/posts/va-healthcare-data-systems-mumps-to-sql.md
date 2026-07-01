---
title: "How VA Healthcare Data Systems Work: From MUMPS to SQL"
description: "A technical explanation of how VA healthcare data moves from VistA's MUMPS and FileMan world into SQL warehouses, and why translation is never merely a database conversion."
date: "2026-04-25"
thumbnail: "/images/IMG-20260425-WA0005.jpg"
category: "Healthcare-IT"
tags: ["VA", "VistA", "MUMPS", "FileMan", "SQL", "CDW", "Healthcare IT", "Data Architecture", "SuvroGhosh"]
published: true
color: "blue"
---

<TTS />

<Pi src="IMG-20260425-WA0005.jpg" alt="Article illustration for VA healthcare data moving from MUMPS to SQL" />

VA healthcare data did not begin life as a polite row in a table.

It began in MUMPS globals, those persistent hierarchical structures that can look strange to people raised on relational databases. SQL imagines tables, rows, columns, keys, and joins. VistA grew inside a different world: globals, FileMan files, local packages, clinical workflow, and decades of operational adaptation.

That one fact explains much of the trouble.

VistA was built to run care inside the Veterans Health Administration. FileMan provided a database management layer, defining files, fields, cross-references, and data dictionaries. CPRS gave clinicians a front end for interacting with the record. Underneath, the data was often stored in hierarchical structures optimized for the original system's needs.

A SQL warehouse asks different questions.

It wants patient tables, encounter tables, lab tables, provider tables, diagnosis tables, procedure tables, and curated views that can support reporting, analytics, research, quality measurement, and operations. That translation is necessary. A national healthcare system cannot answer enterprise questions by rummaging through every local operational corner forever.

But translation is not neutral.

A value can be perfectly meaningful inside its native workflow and nearly useless downstream unless its context travels with it. A status can be obvious to a VistA package and ambiguous in SQL. A date can mean different things. A local test name can require mapping to LOINC. A diagnosis can carry billing, clinical, reporting, or historical meaning. An order can contain workflow state that a simple row does not preserve.

This is why "from MUMPS to SQL" is not merely a database conversion.

It is a semantic conversion. The system must decide what the source value means, where it belongs, how to model time, what to do with local variation, how to version changes, and how to document the transformation so downstream users understand the limits.

The Corporate Data Warehouse, or CDW, exists because enterprise knowledge requires a common analytic layer. It supports reporting, population health, research, operations, planning, safety, and accountability. But a warehouse should not pretend it was born clean. It is downstream from operational systems, local practice, historical decisions, and the grammar of care.

The hardest part is not writing SQL.

The hardest part is knowing what a successful query means. A cohort definition is not just code. It is a clinical argument expressed through tables. A quality measure is not just a numerator and denominator. It is an institutional claim about who counts, when, and why. A trend line may reflect true change, a mapping change, a workflow change, or a data-load change.

Good architecture therefore carries a legend.

Lineage explains source and transformation. Metadata explains definitions. Versioning explains change. Provenance explains origin. Data quality checks explain trust. Domain stewardship explains who is accountable for meaning. Without these, SQL becomes a smooth language for asking rough questions too confidently.

FHIR and modern APIs can help expose structured data. HL7 v2 still moves many operational events. ODBC and other access patterns can connect tools. These are useful mechanisms. They do not remove the need to understand the source system's worldview.

In Calcutta, an old house may have a switch near the door that turns on a light in a room nobody expects. The wiring is not random. It has history. VistA is like that. The warehouse builder who laughs at the old wiring may cut the wrong line.

The real story of VA healthcare data is not old MUMPS becoming respectable SQL. It is a vast healthcare system trying to convert local, time-bound care into national knowledge without squeezing the patient out of the sentence.

That is harder than a migration. It is translation with consequences.
