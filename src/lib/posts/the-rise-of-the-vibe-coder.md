---
title: 'Vibe'
thumbnail: "/images/p3.jpeg"
description: "A critical look at the dangerous trend of 'coding by atmosphere' in healthcare IT, where AI hallucination meets the demand for absolute determinism."
category: "engineering"
published: true
color: "black"
date: "2026-04-04"
---

<TTS />

I recently watched a young developer in a Salt Lake coffee shop in Kolkata lean back, sip an iced Americano, and tell his laptop to "make the EHR integration more robust." He wasn't typing. He was whispering to an AI agent like it was a waiter at a high-end restaurant. This is what the industry now calls "vibe coding." As someone who spent the early 2000s manually simulating wireless protocols at the University of Texas at San Antonio and wrestling with the rigid, unforgiving syntax of SQL Server, I find this shift toward "coding by atmosphere" to be both fascinating and deeply terrifying.

In healthcare, "vibes" are generally what we try to eliminate through rigorous data analysis and evidence-based clinical trials. Yet, we are now inviting a motley crew of AI agents into the very heart of our hospital systems to write the code that handles patient lives.

## The Anatomy of an AI-Generated Disaster

The danger of an AI agent writing healthcare code isn't just that it might make a mistake; it's that it makes mistakes with the confidence of a tenured surgeon. When you ask an LLM-driven agent to build a FHIR R4 interface, it understands the pattern of the JSON, but it rarely understands the consequence of a misaligned element.

* **Non-Deterministic Architecture:** Healthcare requires absolute determinism. If I am managing data security and privacy for a clinical trial system, I need to know exactly how a Patient resource is being handled. An AI agent might "vibe" its way into an elegant-looking function that inadvertently leaks PHI (Protected Health Information) because it prioritized code brevity over HIPAA-compliant data masking.
* **The Hallucinated Schema:** I’ve seen agents invent entirely new HL7 segments because they "felt" logical in the context of a prompt. In the world of healthcare architecture, a hallucinated field isn't just a bug; it’s a systematic failure that breaks interoperability across the entire health information exchange.
* **The Knowledge Transfer Void:** My role as an architect involves knowledge transfer and troubleshooting. When a "vibe coder" uses a swarm of agents to generate 10,000 lines of code in an afternoon, no one actually knows how the system works. They just know that, for now, the dashboard looks pretty in the demo.

## The Architect’s Critique: Speed vs. Reliability

Throughout my two decades in American healthcare and research, the greatest challenge has always been ensuring the reliability of new products. The "vibe coder" operates under the delusion that if the code compiles and the UI doesn't crash, the job is done.

But in a clinical trial management system, the code is the least important part. The important part is the data integrity. If your AI agent decides to "optimize" a database query and accidentally merges two patients with similar names—a classic "vibe" move—no amount of sleek Javascript framework (even my beloved Svelte) can fix the resulting clinical catastrophe.

## A Quiet Resignation

I am not a Luddite. I have spent my career at the intersection of medical machine learning and AI data analytics. But there is a fundamental difference between using AI to discover truths through data analysis and letting a black box write the infrastructure that keeps people alive.

I finished my tea and left the coffee shop before the young man could ask his AI to "optimize the billing logic." Some things are better left unobserved. I’ll stick to my UML standards, my documentation, and my stubborn insistence that if you don't understand the underlying HL7 FHIR resource structure, you probably shouldn't be "prompting" it into existence.