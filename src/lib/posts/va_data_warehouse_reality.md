---
title: "Building VA Data Warehouses"
description: "A high-level but technically serious primer on VA data warehouses, operational systems, semantic stability, ETL, provenance, and the difference between copying data and preserving meaning."
date: "2026-04-23"
thumbnail: "/images/IMG-20260423-WA0020.jpg"
category: "Healthcare-IT"
tags: ["VA", "Data Warehousing", "Healthcare IT", "VistA", "SQL", "ETL", "Clinical Data", "Data Governance", "SuvroGhosh"]
published: true
color: "blue"
---

<TTS />

<Pi src="IMG-20260423-WA0020.jpg" alt="Article illustration for VA healthcare data warehouses" />

A data warehouse is not a godown where old hospital data sleeps in sacks.

It is closer to reconstructing an entire journey from tickets, platform announcements, guard notes, delayed signals, revised timetables, and the memory of people who know the line. The patient was seen. The order was placed. The lab resulted. The note was signed. Fine. The warehouse must answer the harder question: what exactly happened, when, to whom, under which workflow, and what does that fact mean after leaving the screen where it was born?

The VA makes this problem unusually interesting.

Operational systems such as VistA were built to run care. They care about local workflow, queues, permissions, orders, results, notes, scheduling, and the practical survival of a very large healthcare system. A data warehouse exists so the institution can ask questions later: performance, quality, safety, utilization, research, operations, planning, and accountability.

Copying data is the easy fantasy.

The difficult work is semantic stability. A local field may be meaningful inside its original package but ambiguous downstream. A status may make sense to a clinic but not to an analyst. A date may mean entry time, event time, result time, signature time, update time, or load time. A diagnosis code may serve different purposes depending on context. A lab name may require mapping. A facility may use a local convention that disappears in enterprise tables.

ETL, extract-transform-load, is therefore not plumbing in the simple sense.

Extraction asks what can be pulled. Transformation asks what the value should become. Loading asks where it should live. But underneath all three is a governance question: what meaning are we preserving, changing, or losing?

A good VA warehouse needs layers.

Raw intake preserves source reality as much as possible. Staging organizes the data for processing. Curated models define stable enterprise views. Analytic marts serve specific domains. Metadata and lineage explain where values came from and how they changed. Data quality checks catch impossible dates, broken mappings, missing keys, duplicate identities, and values that shifted after a system change.

Without lineage, trust becomes folklore.

The analyst may see a clean column and not know the transformations behind it. The researcher may define a cohort without understanding local capture. The dashboard may compare facilities while silently mixing different documentation habits. A warehouse can produce impressive wrongness if it hides its own ancestry.

Source of record and source of truth also differ.

The source of record is where a transaction officially lives. The source of truth is the representation the organization trusts for a particular decision. For identity, a master patient index may dominate. For lab trends, curated result tables may be trusted. For utilization, encounter logic may matter more than raw visit records. For quality reporting, a downstream warehouse may become the practical truth while still depending on operational sources.

That difference should be explicit, not discovered during a crisis.

The VA context also teaches humility about legacy. Old systems are not automatically bad. New systems are not automatically clear. A legacy platform may contain decades of workflow intelligence. A modern warehouse may accidentally flatten the very context that made the source meaningful. Modernization should translate carefully, not simply repaint.

In Calcutta terms, the warehouse is not the clean new apartment replacing the old house. It is an archive built from the old house's rooms, repairs, odd switches, handwritten labels, and memories. If you remove every scar, you may remove the explanation.

Building a VA data warehouse means shaping noisy, local, time-bound records into national knowledge without pretending the noise never existed.

That is not copying data. It is disciplined remembering.
