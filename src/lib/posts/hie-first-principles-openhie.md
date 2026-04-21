---
title: "HIE from First Principles"
description: "A system-level dissection of Health Information Exchange (HIE) from first principles, using OpenHIE as the architectural lens."
date: "2026-04-21"
category: "healthcare-it"
published: true
color: "blue"
---

<TTS />

This isn’t an interoperability problem.

It’s a state reconstruction problem.

Every Health Information Exchange (HIE) you’ve ever touched is trying to answer a deceptively simple question: *what happened to this patient, across systems that were never designed to agree with each other?*

Not “what data exists.”  
Not “what messages were sent.”  

What actually happened.

Those are not the same.

---

At first principles, an HIE is not a database. It’s not even an integration layer.

It is a distributed system attempting to reconstruct longitudinal clinical state from fragmented, asynchronous, lossy signals emitted by independent actors.

Hospitals. Labs. Pharmacies. Registries.

Each of them emitting events in their own dialect.

HL7 v2 messages with implicit context.  
CDA (Clinical Document Architecture) documents with narrative-heavy payloads.  
FHIR (Fast Healthcare Interoperability Resources) resources with improved structure but still partial semantics.

Each internally consistent.  
Collectively incoherent.

---

OpenHIE enters here not as a product, but as a reference architecture attempting to impose order on this chaos.

Not by forcing uniformity.

By introducing coordination points.

---

The OpenHIE architecture decomposes the HIE into a set of core services, each solving a specific aspect of the reconstruction problem.

Client Registry.  
Health Worker Registry.  
Facility Registry.  
Shared Health Record.  
Interoperability Layer (often an enterprise service bus).  
Terminology Service.

It looks clean on paper.

It is not clean in reality.

---

Start with identity.

The Client Registry attempts to answer: *who is this patient across systems that do not share identifiers?*

This is not a lookup problem. It’s probabilistic matching under uncertainty.

Names with spelling variation.  
Dates of birth approximated or missing.  
Identifiers duplicated or reused.

The registry does not resolve identity. It negotiates it.

And every downstream system inherits that uncertainty.

---

Now consider the Shared Health Record.

This is often misunderstood as a central database.

It is not.

It is a curated aggregation of clinical artifacts—documents, observations, encounters—indexed and retrievable, but rarely canonical.

Because canonical implies agreement.

Agreement requires shared semantics.

That’s the part most HIEs quietly avoid.

---

The Interoperability Layer—often implemented as an enterprise service bus (ESB)—handles message routing, transformation, and orchestration.

HL7 v2 → internal format  
CDA → extracted structured elements  
FHIR → partial normalization

Every transformation step is a lossy compression of intent.

Because HL7 v2 messages carry event signals without full context.

Because CDA documents embed meaning in narrative sections that resist structured extraction.

Because FHIR improves structure but does not enforce semantic alignment across implementations.

So what you get is not integration.

You get synchronized approximation.

---

Terminology services are supposed to fix this.

SNOMED CT. LOINC. ICD.

Mapping local codes to standard vocabularies.

But terminology normalization does not equal semantic interoperability.

Two systems can use the same code and still mean different things operationally.

A diagnosis code in an EHR is often a billing artifact.

A diagnosis in a clinical registry is a curated assertion.

Same code. Different epistemology.

---

Where OpenHIE is strongest is in acknowledging these separations explicitly.

Identity is separate from clinical data.  
Clinical data is separate from transport.  
Transport is separate from semantics.

This decomposition is correct.

It is also incomplete.

---

Because the failure modes are not at the boundaries alone.

They are in the interactions.

---

Failure Point 1: Event Without Context

HL7 v2 messages dominate real-world HIE feeds.

ADT (Admission, Discharge, Transfer). ORU (Observation Result).

They tell you that something happened.

They rarely tell you *why*, *how*, or *what it means longitudinally*.

So the HIE accumulates events.

But cannot reliably construct trajectories.

---

Failure Point 2: Document Without Computability

CDA documents carry rich clinical narratives.

Discharge summaries. Progress notes.

They are human-readable.

They are barely machine-actionable.

Extraction pipelines attempt to structure them.

What you get is partial structure over narrative ambiguity.

---

Failure Point 3: Resource Without Agreement

FHIR promises resource-level granularity.

Patient. Observation. Encounter.

Better.

But FHIR does not enforce how systems *use* those resources.

Profiles attempt to constrain usage.

Implementation guides attempt to align behavior.

In practice, variability persists.

So the same “Observation” resource can represent subtly different realities across systems.

---

Failure Point 4: Identity Drift

Even with a Client Registry, identity is not static.

Merges. Splits. Corrections.

Downstream systems rarely reconcile these changes cleanly.

So longitudinal records fracture.

Silently.

---

Failure Point 5: Latency as a System Property

Data does not arrive in order.

Lab results arrive after encounters.  
Corrections arrive after submissions.  
Updates overwrite prior states without version lineage.

The HIE is always temporally inconsistent.

Real-time is an illusion.

---

The deeper truth is this:

HIEs do not fail because of lack of standards.

They struggle because standards describe structure, not meaning.

And meaning in healthcare is shaped by workflow, incentives, and context—not just data models.

---

An EHR is optimized for documentation and billing.

A lab system is optimized for result delivery.

A registry is optimized for reporting.

An HIE is expected to unify all three.

Without controlling any of them.

---

So the HIE becomes a translation layer.

Not just across formats.

Across intent.

Every transformation is a negotiation between what the source meant and what the destination expects.

That negotiation is rarely explicit.

---

OpenHIE’s architectural direction is still the right one.

Decompose. Isolate concerns. Introduce shared services.

But if you stop there, you get a technically correct system that still cannot support higher-order use cases.

Population health.  
Predictive modeling.  
Longitudinal analytics.

Because those require not just data aggregation.

They require coherent representation.

---

The practical direction forward is not more pipelines.

It is tighter control over representation at the edges.

Constrain FHIR profiles aggressively.  
Version identity resolution decisions explicitly.  
Treat terminology mapping as a first-class, versioned artifact—not a background service.  
Capture provenance for every transformation step.

And most importantly:

Acknowledge that the Shared Health Record is not a source of truth.

It is a constructed view.

That view must be explainable.

Traceable.

And revisable.

---

Because what you are building is not an exchange.

You are building a continuously negotiated model of reality.

And reality, in healthcare systems, does not sit still long enough to be cleanly integrated.
