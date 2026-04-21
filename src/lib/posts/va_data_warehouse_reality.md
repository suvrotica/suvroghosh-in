---
title: "VA data warehousing"
description: "Why VA data warehousing is fundamentally a problem of representation, not storage—examining HL7, MUMPS, and downstream analytics constraints."
date: "2026-04-21"
category: "healthcare-it"
published: true
color: "blue"
---

<TTS />

This isn’t a data warehouse problem. It’s a semantic reconstruction problem forced to masquerade as one.

VA operational systems—rooted in MUMPS (Massachusetts General Hospital Utility Multi-Programming System)—were never designed for analytical workloads. They were designed for transactional continuity in clinical environments where uptime mattered more than structure, and locality of access mattered more than global coherence. The consequence is predictable: what looks like a database is actually a loosely coupled graph of hierarchical globals, each internally consistent, none globally aligned.

You’re not extracting tables. You’re extracting fragments of intent.

The typical pipeline starts with VistA (Veterans Health Information Systems and Technology Architecture) globals, often accessed through FileMan abstractions. Data is then flattened into relational constructs—usually SQL Server or Oracle—through ETL (Extract, Transform, Load) processes that attempt to impose schema where none truly exists. This is where the first loss occurs.

Not corruption. Loss.

Because a MUMPS global encodes not just data, but access patterns, implicit relationships, and workflow assumptions. When you flatten it, you preserve values but discard context. A patient record becomes rows. A clinical event becomes a timestamp. A progression becomes a set of disconnected states.

Then comes HL7 v2.

Messages flowing out of VA systems—ADT (Admit, Discharge, Transfer), ORU (Observation Result), SIU (Scheduling Information Unsolicited)—carry events, not state. They tell you that something happened, not what the system believes to be true at any given moment. Warehousing these messages requires reconstructing state from sequences of events, often with incomplete ordering guarantees and inconsistent identifiers.

So you build reconciliation logic. You infer state.

And every inference is an assumption.

CDA (Clinical Document Architecture) tries to help by packaging clinical narratives into structured XML documents. But CDA is document-centric, not data-centric. It preserves human readability at the cost of computational clarity. Parsing CDA into warehouse-friendly structures introduces another layer of transformation—section headers become tables, entries become rows, but the narrative cohesion is lost.

FHIR (Fast Healthcare Interoperability Resources) improves this by introducing resource-level granularity—Patient, Observation, Encounter—but even FHIR does not solve semantic alignment. It standardizes structure, not meaning. Two Observation resources can represent the same clinical fact with different codes, units, and contexts. The warehouse now has consistency of shape, but not of interpretation.

So the architecture evolves into a layered translation system:

- MUMPS globals → relational staging
- HL7 v2 messages → event normalization
- CDA documents → document decomposition
- FHIR resources → resource aggregation

Each layer adds structure. Each layer introduces loss.

What emerges downstream is not a canonical dataset. It’s a negotiated one.

Failure shows up in predictable places.

Patient identity resolution becomes probabilistic because identifiers across systems are not stable. You rely on MPI (Master Patient Index) strategies—deterministic where possible, fuzzy where necessary—but the underlying systems were never aligned on identity semantics to begin with.

Temporal alignment breaks because timestamps are recorded at different stages of workflow. An order timestamp in VistA does not necessarily correspond to when the clinical action occurred. In the warehouse, time becomes a best-effort approximation.

Clinical concepts fragment because coding systems—ICD (International Classification of Diseases), CPT (Current Procedural Terminology), LOINC (Logical Observation Identifiers Names and Codes)—are applied inconsistently across sites and over time. Normalization pipelines attempt to map these into unified vocabularies, but mappings are lossy and often context-dependent.

And then there’s latency.

Not computational latency. Cognitive latency.

By the time data is extracted, transformed, validated, and loaded, it no longer reflects the operational reality clinicians are acting on. The warehouse becomes historically accurate but operationally irrelevant for real-time decision support.

This is where most architectures quietly fail. Not in ingestion. In interpretation.

Because the deeper issue isn’t technical fragmentation. It’s ontological misalignment.

VA systems encode reality in ways shaped by clinical workflows, documentation practices, and decades of incremental evolution. Warehouses attempt to re-encode that reality into analytical models optimized for aggregation, reporting, and increasingly, machine learning.

These two representations are not isomorphic.

You cannot map one to the other without distortion.

The persistence of this problem has little to do with tooling and everything to do with incentives. Operational systems are optimized for care delivery and compliance. Warehouses are optimized for insight and reporting. There is no natural convergence point between these objectives.

So the industry builds translation layers. ETL pipelines. Canonical models. Terminology services.

And each layer adds complexity without resolving the underlying mismatch.

The architectural direction forward is not more aggressive normalization. It is explicit representation of uncertainty and provenance.

Instead of forcing convergence, systems need to preserve divergence:

- Store original representations alongside transformed ones
- Track transformation lineage at the field level
- Represent temporal uncertainty explicitly, not implicitly
- Treat identity as a managed hypothesis, not a resolved fact

Event-driven architectures—where HL7 v2 messages or FHIR subscriptions feed into immutable event stores—offer a partial path forward. Not because they simplify the system, but because they make its complexity observable. State can then be reconstructed as needed, rather than prematurely fixed during ingestion.

Semantic layers—built on top of raw and normalized data—can provide context-specific interpretations without overwriting source ambiguity. This is where meaningful analytics can emerge, not from a single “source of truth,” but from multiple, well-understood representations.

The shift is subtle but critical.

From integration to interpretation.

From normalization to contextualization.

From pretending the data is clean to admitting that it isn’t—and designing systems that can still reason over it.
