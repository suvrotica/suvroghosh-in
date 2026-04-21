---
title: "The Questions You Ask"
description: "Why longitudinal analysis, population insights, and predictive modeling diverge sharply between academic medical centers and VA systems—and what that reveals about data architecture."
date: "2026-04-21"
category: "healthcare-it"
published: true
color: "indigo"
---

<TTS />

This isn’t a data access problem. It’s a question formulation problem masquerading as one.

Same clinician. Same intent. Different system. Entirely different answers.

Ask for longitudinal analysis in a University of Texas Health Science Center at San Antonio (UTHSCSA) environment, and you’re navigating fragmented encounters stitched across departmental silos. Ask the same question inside Veterans Affairs (VA) systems, and you’re dealing with decades-long patient continuity—dense, internally consistent, but semantically uneven.

Same words. Different realities.

That divergence is architectural, not incidental.

---

At the system level, both environments appear superficially similar: Electronic Health Records (EHR), Health Level Seven (HL7) interfaces, emerging Fast Healthcare Interoperability Resources (FHIR) layers, downstream warehouses.

Underneath, they behave differently.

UTHSCSA environments are typically federated. Multiple EHR instances, research systems (Clinical Trial Management Systems—CTMS, Clinical Data Management Systems—CDMS), departmental registries, and external data feeds converge into loosely coupled data platforms. Integration is achieved through Extract-Transform-Load (ETL) pipelines, often mediated through HL7 v2 messaging or Consolidated Clinical Document Architecture (C-CDA).

The VA system, historically anchored in VistA (Veterans Health Information Systems and Technology Architecture), behaves more like a longitudinal monolith. Not clean. Not modern. But continuous. A single patient identity persists across time and geography in ways most academic systems struggle to approximate.

So when you ask a question, you’re not querying data. You’re querying architecture.

---

Longitudinal analysis is where this difference becomes immediately visible.

In UTHSCSA, a “patient timeline” is reconstructed. Encounters are aggregated across facilities, often requiring patient matching heuristics, probabilistic identity resolution, and reconciliation of differing coding practices. Temporal gaps are common. Care delivered outside the network introduces blind spots.

The system answers with a best-effort narrative.

In the VA, longitudinal analysis is native. The system has followed the patient—sometimes for decades. Medication histories, lab trends, problem lists—these exist as continuous threads, not stitched fragments.

But continuity doesn’t equal clarity.

HL7 v2 messages captured events, not intent. Problem lists evolve through documentation practices, not ontological rigor. You get temporal density, but not necessarily semantic precision.

So the question shifts.

Not “what happened over time,” but “what does the system believe happened over time.”

---

Population insights amplify the contrast.

In UTHSCSA, population health queries often depend on cohort construction across heterogeneous datasets. Inclusion criteria must account for missingness, inconsistent coding systems (ICD, CPT, LOINC), and variable data latency. The denominator is unstable.

You’re not just defining a population. You’re negotiating one.

Research datasets—especially those aligned with Clinical Data Interchange Standards Consortium (CDISC) models like Study Data Tabulation Model (SDTM)—offer more structure, but only within protocol boundaries. Outside that, variability returns.

In the VA, population queries benefit from scale and relative uniformity. National-level data aggregation allows for large cohorts with consistent identifiers. The denominator stabilizes.

But the bias shifts.

The VA population is not representative of the general population. Demographics, comorbidities, socioeconomic factors—all skew. Population insights are internally valid but externally constrained.

So again, the question changes.

Not “what does this population show,” but “what does this population represent—and what does it exclude.”

---

Predictive modeling exposes the deepest fault lines.

In UTHSCSA environments, models are often trained on fragmented, cross-sectional snapshots. Feature engineering becomes an exercise in reconstruction—aligning timestamps, imputing missing values, normalizing across systems.

The model learns patterns in reconstructed reality.

Generalizability becomes fragile.

In the VA, models benefit from longitudinal depth. Temporal features—trajectory of lab values, medication adherence patterns, progression of conditions—are more naturally captured.

But the model inherits the system’s assumptions.

If documentation practices encode billing priorities or clinical habits rather than true physiological states, the model learns those proxies. Not the underlying signal.

Prediction becomes a reflection of system behavior, not patient biology.

---

Where things fail is rarely at the algorithm.

Failure emerges upstream.

In UTHSCSA:
- Identity fragmentation leads to cohort leakage  
- Data latency distorts temporal relationships  
- ETL pipelines introduce silent transformations  

In the VA:
- Legacy data structures encode historical assumptions  
- Semantic drift accumulates over decades  
- Standardization layers (FHIR, terminologies) sit on top of non-standardized foundations  

Different failures. Same outcome.

Misaligned answers.

---

The deeper truth is less technical and more structural.

These systems were not designed to answer the questions we now ask.

UTHSCSA systems evolved around departmental autonomy, research specialization, and funding-driven architectures. Integration was added later.

VA systems evolved around continuity of care within a closed network. Interoperability was not a primary concern.

So when modern analytics—longitudinal, population-level, predictive—arrive, they stress the system in different ways.

You’re not just querying data. You’re interrogating history.

---

Architecturally, this leads to a different posture.

Stop asking identical questions across systems and expecting comparable answers.

Instead:

Reformulate longitudinal questions to explicitly encode data provenance.  
Not just “over time,” but “over which system boundaries and transformations.”

Design population queries with denominator transparency.  
Make inclusion logic explicit, versioned, and reproducible.

Treat predictive models as system-behavior models first.  
Validate not just performance metrics, but representational assumptions.

Invest in canonical data models—but accept they are translations, not truths.  
FHIR resources improve structure. They do not resolve meaning.

Most importantly:

Align the question with the system’s shape before aligning the system to the question.

Because in healthcare data, the fastest way to get a wrong answer is to ask a clean question of a messy system and assume the system understood what you meant.
