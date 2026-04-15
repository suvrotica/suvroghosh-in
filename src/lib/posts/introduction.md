---
title: "Intro"
description: "From parallel computing to clinical data and cab drivers, a look back at 20 years of wrangling enterprise architecture and preparing for the era of black-box AI."
date: "2026-04-04"
category: "career"
published: true
color: "blue"
---

<TTS />

This isn’t about introducing myself. It’s about establishing context for the kind of problems I work on, and the ones I’m interested in solving going forward.

I’ve spent most of my professional life inside healthcare data systems that were never designed to do what we now expect them to do.

That matters.

Because when people talk about applying AI to healthcare, they usually start at the model. Or the framework. Or the promise. Almost never at the substrate the model has to operate on.

That substrate is where I’ve worked.

Across VA systems, UTHSCSA research environments, and clinical trial data platforms, the recurring pattern has been the same: heterogeneous data sources, inconsistent representations, fragile mappings, and workflows shaped more by billing, compliance, and legacy constraints than by clinical cognition.

This isn’t a complaint. It’s a description of the system as it actually exists.

You don’t struggle to build intelligent systems in healthcare because the models are insufficient. You struggle because the underlying data is not just “dirty.” It is structurally misaligned with the questions you want to ask.

Flat files from MUMPS hierarchies. Relational reconstructions in SQL Server. SAS datasets with implicit semantics. HL7 messages carrying state without context. CDISC models enforcing structure without guaranteeing meaning.

Each of these is internally consistent. None of them align cleanly with each other.

So what you get is not a data pipeline. You get a translation pipeline. And every translation introduces loss.

That loss is where most AI initiatives quietly fail.

Over the years, I’ve worked on building data warehouses from VA operational systems, designing registries for NIH-funded studies, implementing ETL pipelines across incompatible formats, and supporting clinical trials where the system had to satisfy both regulatory rigor and analytical usability.

The consistent constraint has not been scale. It has been meaning.

You can scale storage. You can scale compute. You cannot trivially scale semantic alignment.

And AI systems—especially the current generation—are extremely sensitive to that.

They don’t fix ambiguity. They absorb it.

They don’t resolve inconsistency. They generalize over it.

That’s useful in some domains. In healthcare, it can be dangerous.

This is why most conversations around “AI in healthcare” feel incomplete. They assume that once data is available, intelligence can be layered on top. In practice, the opposite is true. Intelligence is constrained, and often defined, by how the data is modeled, transformed, and contextualized upstream.

This is not a theoretical position. It’s an operational one.

If you’ve worked with EHR data long enough, you know that a diagnosis code is not a diagnosis. It’s an encoding of an event shaped by documentation practices, reimbursement rules, and system affordances.

If you’ve worked with clinical trials, you know that a variable in an SDTM dataset is not a fact. It’s the result of protocol design, site behavior, and validation logic interacting over time.

If you’ve built ETL pipelines, you know that “data integration” is often just synchronized inconsistency.

These are not edge cases. They are the norm.

So when I think about AI in healthcare, I’m not thinking about models first. I’m thinking about representation, transformation, and constraint.

What is the system actually capturing?

What is it losing?

What is it forcing into structure that doesn’t belong there?

And how do those decisions propagate into any downstream intelligence we try to build?

This is where I’m focusing now.

Not on abstract AI capability, but on its interaction with real healthcare systems: EHRs that optimize for documentation and billing, HIE layers that move data without harmonizing meaning, clinical data models that standardize structure while preserving ambiguity.

There is a path forward. But it doesn’t start where most people are looking.

It starts with accepting that the system is not broken in a simple way. It is layered, constrained, and internally consistent in ways that resist naive optimization.

AI can be transformative in healthcare. But only if it is grounded in the realities of how healthcare data is actually produced, shaped, and constrained.

That’s the space I work in.

And that’s the space I’m interested in pushing forward.