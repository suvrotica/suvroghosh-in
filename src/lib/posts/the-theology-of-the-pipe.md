---
title: "HL7 V2 to FHIR"
thumbnail: "/images/p1.jpeg"
description: "A reflection on the evolution of healthcare interoperability, from HL7 v2 pipes to FHIR RESTful resources, and the persistent absurdity of vendor jargon."
category: 'engineering'
published: true
color: "blue"
date: "2026-04-04"
---

<TTS />

I recently found myself in a Zoom room with a vendor who used the word "interoperability" seventeen times in the first four minutes. It is a lovely word, really—polysyllabic, expensive-sounding, and perfectly designed to mask the fact that their underlying database architecture looks like a game of Tetris played by someone who has never seen a square. As I sat there, staring at my second cup of Darjeeling and wondering if my soul was slowly leaking out through my headset, I realized we are still fighting the same war I saw twenty years ago in Texas. Only now, the weapons have better branding.

In the old days of HL7 v2, we dealt with "The Pipe." If you’ve spent any time in a basement server room, you know the v2 message: a string of segments separated by vertical bars (`|`) and carets (`^`) that looks remarkably like a cat walked across a keyboard while holding the Shift key. It was tribal. You needed a secret decoder ring and a deep, personal relationship with a specific interface engine to understand why a patient's middle initial was currently residing in the "Gender" field.

## The R4 Gospel: Stability as a Service

Enter FHIR (Fast Healthcare Interoperability Resources). Specifically, R4.

For the uninitiated—or those blessed enough to have a job that doesn't involve parsing JSON at 2 AM—R4 is the "Goldilocks" version. It’s the version where the industry finally decided to stop moving the furniture every six months. In R4, the core resources (Patient, Observation, Encounter) reached "Normative" status. This means they are stable. They are the bedrock.

As an architect, R4 is the first time I felt we weren't building on quicksand. We moved from "messaging" (throwing a bottle into the ocean and hoping someone on the other shore likes the message) to RESTful APIs.

* **Resources are our building blocks:** Think of them as the LEGO bricks of healthcare data.
* **The API approach:** Instead of sending the whole medical record because a patient sneezed, we can simply GET the specific Observation resource we need.

## The R5 Horizon: When "More" Becomes "Exhausting"

Then there is R5. If R4 is the reliable family sedan, R5 is the luxury SUV with far too many buttons on the dashboard.

R5 introduces over 30 new resources and significant changes to the Subscription model. It attempts to solve the "cross-version" problem and adds layers for complex clinical research and genomics—fields I spent a decade navigating at UTHSCSA. It’s technically superior, certainly. It handles many-to-many relationships with the grace of a ballet dancer.

But here is the industry critique: Most hospitals are still struggling to move a basic Lab Result from Point A to Point B without it turning into a digital game of "Telephone." Seeing a CIO clamor for R5's advanced `EvidenceVariable` resource when their EHR still can't consistently reconcile a medication list is like watching someone buy a Ferrari to drive through a flooded alley in South Calcutta.

## The Architect’s Reality Check

The true challenge isn't the version number; it’s the Extension. FHIR allows for "extensions" because, apparently, no two doctors in the history of medicine have ever agreed on what constitutes a "standard" way to record a blood pressure reading.

Extensions are where the "standard" goes to die a quiet, customized death. You can have the most beautiful R4 server in the world, but if 40% of your data is tucked away in custom extensions that no one else can read, you haven't achieved interoperability. You’ve just built a more expensive silo.

## A Quiet Resignation

We spend our lives debating R4 vs. R5, JSON vs. XML, and whether the `Patient.contact` element should be mandatory or optional. We build these magnificent, soaring architectures of data.

Yet, at the end of the day, a patient is still sitting in a waiting room somewhere, filling out their name, address, and insurance policy number on a clipboard with a pen that is chained to the desk. All our "Fast" Interoperability hasn't quite figured out how to replace that piece of plastic.

I suppose I'll go back to the Zoom call now. The vendor is currently explaining how their AI-driven FHIR wrapper uses blockchain to "synergize" patient outcomes. I might need a third cup of tea.