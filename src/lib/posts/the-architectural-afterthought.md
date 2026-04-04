---
title: "FHIR Evolution"
thumbnail: "/images/p2.jpeg"
description: "From digital smoke signals to RESTful FHIR APIs—a look back at healthcare's clumsy evolution and its persistent, pathological need to overcomplicate."
category: 'engineering'
published: true
color: "blue"
date: "2026-04-04"
---

<TTS />

In the year 2000, while I was finishing my Master’s degree in San Antonio and wrestling with parallel computing and distributed databases, a man named Roy Fielding was busy defining the architectural constraints of the modern internet. He called it REST (Representational State Transfer). At the time, most of us in the healthcare space were still communicating via what I like to call "Digital Smoke Signals"—HL7 v2 messages that relied on fragile, stateful connections and a prayer.

The industry eventually realized that while the rest of the world was using REST to buy books on Amazon and share pictures of cats, healthcare was still trapped in a basement, obsessing over the exact placement of a carriage return in a text file.

## The RESTful Rebellion

REST wasn't a "standard" so much as a set of rules for polite behavior on the web. It demanded statelessness—meaning the server shouldn't have to remember your life story every time you ask for a lab result—and a uniform interface.

In the early 2000s, we were seduced by SOAP (Simple Object Access Protocol). It was the "Corporate Committee" version of an API: heavy, over-engineered, and requiring a 400-page manual just to say "Hello World." As someone who spent years merging biology and scientific programming in Texas, I can tell you that SOAP was the architectural equivalent of building a cathedral just to house a single sparrow.

## The FHIR Inspiration: Stealing from the Best

Around 2011, the HL7 organization realized their latest attempt at a standard (v3) was so complex it was effectively a deterrent to interoperability. Grahame Grieve and the "Fresh Look" task force looked at the chaos and asked a radical question: *“What if we just used the same technology that makes the internet work?”*

This was the inspiration for FHIR (Fast Healthcare Interoperability Resources):

* **Resources as Objects:** Instead of a monolithic file, FHIR broke data into discrete, manageable pieces like `Patient`, `Observation`, and `Medication`.
* **The HTTP Powerhouse:** It adopted the standard verbs of the web—GET, POST, PUT, DELETE.
* **Modern Syntax:** It traded the arcane pipes and hats of HL7 v2 for JSON and XML, languages that developers under the age of 60 actually understand.

## The Architect’s Critique: The Persistence of "Custom"

As a healthcare architect, my passion lies in discovering truths through data analysis. The "truth" about FHIR is that while it is inspired by the elegance of REST, it still suffers from the healthcare industry's pathological need to be special.

We took a beautiful, stateless architectural pattern and immediately started cluttering it with "profiles" and "extensions" because every hospital system believes their way of recording a pulse is a unique snowflake that requires a custom data model. During my time at ClinZen, focusing on interoperability using HL7 FHIR and CDISC, I saw firsthand how we often spend more time debating the metadata than actually moving the data.

## A Quiet Resignation

We have moved from the "Pipe" to the "Resource," which is a monumental achievement in human history, right up there with the invention of sliced bread or the pressurized ballpoint pen.

Yet, I still find myself in meetings explaining to stakeholders that an API is not a magic wand that fixes a broken database. It is merely a more sophisticated way of looking at the same mess. I’ll keep building the architecture and ensuring product reliability, but sometimes I long for the simplicity of those wireless protocols I simulated back in 2000. At least the nodes in an ad-hoc network don't have egos or billing departments.