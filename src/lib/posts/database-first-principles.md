---
title: "Databases and Data Warehouses"
description: "A system-level explanation of databases and data warehouses—what they actually do, where they break, and why architecture matters more than tooling."
date: "2026-04-21"
category: "data-architecture"
published: true
color: "indigo"
---

<TTS />

This isn’t a storage problem. It never was.  

It’s a representation problem—how reality gets flattened, encoded, constrained, and later reconstructed under pressure.

A database is not “where data lives.” It is where assumptions about the world get frozen into structure.

A data warehouse is not “a bigger database.” It is a system that admits those assumptions were wrong—or at least insufficient—and tries to reconcile them after the fact.

Short sentence.  

That’s the tension.

---

### Core Insight

Operational systems capture events under constraint. Analytical systems reinterpret those events without those constraints.

You are not moving data between systems. You are moving meaning across incompatible representations.

And meaning leaks at every boundary.

---

### System-Level Breakdown

Start with the simplest possible abstraction.

You observe something:

- A patient registers  
- A lab result arrives  
- A medication is ordered  

Reality is continuous, messy, context-rich.

A database cannot store that.

So it does something more brutal. It discretizes.

It breaks the world into:

- Tables (entities)
- Rows (instances)
- Columns (attributes)

Relational databases impose structure through normalization—removing redundancy, enforcing referential integrity, decomposing reality into minimal units.

This works beautifully for transactions.

Insert. Update. Delete.

Small, precise, consistent.

The design goal here is not truth. It is correctness under concurrency.

ACID:

- Atomicity
- Consistency
- Isolation
- Durability

Notice what’s missing.

Meaning.

---

Now stretch that system across an enterprise.

You don’t get one database. You get many.

Each one optimized locally:

- EHR storing encounters
- Billing system storing claims
- Lab system storing results
- Pharmacy system storing orders

Each internally consistent. None aligned.

So integration begins.

HL7 v2 messages move events across systems. But they carry state fragments, not full context.

You receive:

- PID (Patient Identification)
- OBX (Observation Result)

You do not receive:

- Why the observation was ordered
- What clinical reasoning led to it
- How it relates longitudinally

So you store the message.

Or worse—you map it.

Now you have transformed data.

And lost something subtle but important.

---

Enter the data warehouse.

Not as a luxury. As a necessity.

Because operational systems cannot answer analytical questions:

- What is the trend of HbA1c across populations?
- Which interventions reduce readmission rates?
- What patterns precede adverse events?

Operational databases are optimized for writes. Warehouses are optimized for reads.

So the architecture flips.

From normalized → denormalized  
From transaction-oriented → query-oriented  
From current-state → historical-state  

ETL (Extract, Transform, Load) pipelines begin pulling data out of source systems.

This is where the real work happens.

Not extraction.

Transformation.

---

### Failure Points

The first failure is assuming data is stable.

It isn’t.

Schemas change. Codes evolve. Clinical practices shift.

Your warehouse is always lagging reality.

Second failure: assuming mappings preserve meaning.

They don’t.

A diagnosis code in one system is not equivalent to the same code in another if:

- Coding practices differ
- Incentives differ (billing vs clinical documentation)
- Context is missing

Third failure: temporal distortion.

Operational systems often overwrite state.

Warehouses reconstruct history.

But reconstruction is inference, not recovery.

You are guessing what the system meant at a point in time based on fragments.

Fourth failure: granularity mismatch.

Some systems store events.

Others store aggregates.

When you combine them, you introduce artificial precision or artificial smoothing.

Both are wrong in different ways.

---

### Deeper Truth

The persistence of these problems is not technical incompetence.

It is structural inevitability.

Operational systems are designed under constraints:

- Performance
- Usability
- Regulatory compliance
- Billing requirements

They encode reality in ways that serve immediate workflows.

Data warehouses arrive later, asking different questions:

- Longitudinal analysis
- Population insights
- Predictive modeling

But they depend entirely on upstream representations.

So they inherit:

- Bias
- Loss
- Inconsistency

And amplify them.

This is why “single source of truth” is a comforting fiction.

There is no single truth.

There are multiple partial truths, each shaped by the system that captured them.

---

### Architectural Direction

If you treat databases and warehouses as storage layers, you will keep rebuilding them.

If you treat them as representation systems, you can start designing intentionally.

A few hard-won directions:

First: embrace event orientation early.

Store immutable events where possible.

Not just current state.

State is a projection. Events are closer to reality.

Second: preserve raw data alongside transformed data.

You will need to revisit assumptions.

You will be wrong.

Design for that.

Third: make transformations explicit and versioned.

Every mapping, every derivation, every aggregation should be traceable.

Lineage is not optional. It is the only way to debug meaning.

Fourth: separate semantic models from physical models.

FHIR (Fast Healthcare Interoperability Resources) attempts this by defining resource structures.

But structure is not semantics.

You still need domain-aligned models that reflect how clinicians think, not how systems store.

Fifth: accept latency.

Real-time analytics sounds attractive.

But most “real-time” pipelines propagate inconsistencies faster.

Sometimes delay is accuracy.

---

Short line.

A database tells you what happened—according to a system.

A data warehouse tells you what might have happened—according to your transformations.

Neither tells you reality.

That’s not a flaw.

That’s the system doing exactly what it was designed to do.
