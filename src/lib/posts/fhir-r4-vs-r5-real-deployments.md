---
title: "FHIR R4 vs R5"
description: "A system-level analysis of HL7 FHIR R4 versus R5, focusing on what materially impacts production healthcare architectures, interoperability layers, and clinical data platforms."
date: "2026-04-16"
category: "interoperability"
published: true
color: "blue"
---

<TTS />

This isn’t a versioning problem. It’s a contract stability problem disguised as progress.

R4 (Release 4) of HL7 FHIR (Fast Healthcare Interoperability Resources) is the first version where the standard stopped moving under your feet long enough for real systems to form around it. R5 (Release 5) is technically more complete, more expressive, more internally consistent. None of that guarantees deployability.

In production environments—EHR (Electronic Health Record) systems, HIEs (Health Information Exchanges), payer-provider integrations—the question is not “what’s better.” It’s “what breaks if I move.”

That’s the only question that matters.

---

### System-Level Reality

A deployed FHIR ecosystem is not a specification. It is a layered system:

- Resource models (Patient, Observation, Encounter)
- Profiles (US Core, national IGs)
- Terminology bindings (SNOMED CT, LOINC, ICD)
- API contracts (RESTful endpoints)
- Data persistence (relational or document stores)
- Integration glue (ETL pipelines, message brokers, legacy bridges)

R4 sits at the center of a massive gravitational field:

- US Core Implementation Guide anchored to R4
- SMART on FHIR ecosystem stabilized on R4
- EHR vendors exposing R4 endpoints (often partially implemented)
- Regulatory frameworks (ONC in the US) referencing R4 explicitly

This matters more than any feature delta.

Because interoperability is not about capability. It is about alignment.

---

### What R5 Actually Changes

R5 introduces structural and semantic improvements. Some are genuinely important.

**1. Workflow and Event Modeling**

R5 refines the event pattern across resources:

- Better alignment between Request, Event, and Definition resources
- More consistent lifecycle states

This matters if you are building orchestration-heavy systems—clinical workflows, order management, care pathways.

But most deployments are not. They are extracting, transforming, and exposing data.

So the benefit is real but often unrealized.

---

**2. Resource Maturity and Normalization**

More resources reach higher maturity levels.

New resources introduced:

- `Ingredient`
- `SubscriptionTopic`
- Enhanced `Evidence` and `EvidenceReport`

Existing resources cleaned up:

- Reduced duplication
- Better cardinality constraints
- More consistent use of extensions vs core elements

This improves model integrity. It does not fix upstream inconsistency.

If your source is an HL7 v2 feed with overloaded OBX segments, R5 does not rescue semantic ambiguity.

---

**3. Subscriptions Overhaul**

This is one of the few changes that matters operationally.

R4 subscriptions are fragile:

- Polling-heavy
- Limited filtering
- Poor scalability under load

R5 introduces:

- Topic-based subscriptions (`SubscriptionTopic`)
- Event-driven patterns
- Better alignment with modern messaging systems (Kafka, AMQP)

This is the closest thing to a real architectural upgrade.

If you are building near-real-time clinical data pipelines, R5 gives you a cleaner abstraction.

But—and this is the recurring theme—you can implement equivalent behavior outside FHIR today using event brokers.

So again, improvement. Not a forcing function.

---

**4. Terminology and Canonical Handling**

R5 improves:

- Canonical URL handling
- Versioning of artifacts
- Cross-resource references

This reduces friction in large-scale IG-driven ecosystems.

But terminology inconsistency is not a FHIR problem. It is an institutional one.

No version fixes competing coding practices across departments.

---

### Where Reality Breaks

You don’t upgrade FHIR in isolation. You upgrade an ecosystem.

And that ecosystem includes:

- Vendor APIs that only partially implement R4
- Custom profiles tightly coupled to R4 structures
- Downstream analytics pipelines expecting specific JSON shapes
- Regulatory constraints that lag behind the spec

Three failure modes show up immediately.

---

**1. Profile Fragmentation**

Your system is not using “FHIR R4.” It is using:

- R4 + US Core 3.1.1
- + internal extensions
- + vendor-specific deviations

R5 compatibility is not about the base spec. It is about whether your profiles migrate cleanly.

They rarely do.

---

**2. Data Contract Instability**

Every downstream system depends on:

- Field presence
- Cardinality assumptions
- Extension semantics

Even small changes ripple:

- Analytics pipelines break silently
- Validation rules fail
- ETL transformations require rework

This is not visible in spec comparison tables. It shows up at 2 AM in production.

---

**3. Vendor Lag**

EHR vendors are not spec-driven. They are roadmap-driven.

R4 is “done enough” for certification.

R5 is optional.

So you end up with:

- Clients asking for R5 features
- Servers stuck on R4
- Middleware translating between versions

Which is exactly the problem FHIR was supposed to reduce.

---

### The Deeper Truth

FHIR versions don’t fail. Incentives do.

Healthcare interoperability is shaped by:

- Regulatory compliance, not architectural elegance
- Billing workflows, not clinical cognition
- Vendor differentiation, not standard alignment

R4 succeeded not because it was perfect, but because it was stable long enough for institutions to commit.

R5 is better. But stability beats improvement in distributed systems.

Especially in healthcare, where:

- Change is expensive
- Validation is slow
- Risk tolerance is low

So the system resists movement.

Not irrationally.

---

### What Actually Matters in Deployment

If you are operating in a real environment—EHR integration, HIE platform, clinical data warehouse—the decision framework is brutally simple.

---

**Stay on R4 if:**

- You depend on US Core or national IGs
- You integrate with major EHR vendors
- Your system is already in production
- Your primary problem is data quality, not model expressiveness

This is most systems.

---

**Consider R5 if:**

- You are building a greenfield platform
- You control both producer and consumer sides
- You need advanced subscription/event patterns
- You are investing in workflow orchestration, not just data exchange

Even then, expect to maintain R4 compatibility layers.

---

**Architectural Pattern That Actually Works**

- Canonical internal model (not FHIR-bound)
- Inbound adapters (HL7 v2, CDA, FHIR R4)
- Transformation layer (normalization + enrichment)
- Outbound FHIR APIs (R4 externally, optionally R5 internally)
- Event backbone (Kafka or equivalent, not FHIR-native)

FHIR becomes an interface layer. Not the system of record.

This is the only way to survive version churn.

---

### Final Constraint That Doesn’t Go Away

You can upgrade FHIR versions.

You cannot upgrade meaning.

A diagnosis code is still shaped by documentation behavior.

An Observation still depends on how a lab system encodes context.

An Encounter still reflects administrative boundaries more than clinical reality.

R5 does not change that.

It just describes it more cleanly.

And clean description is not the same as clean data.