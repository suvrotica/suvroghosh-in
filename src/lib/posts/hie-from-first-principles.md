---
title: "HIE From First Principles, With The Patient Still In The Room"
description: "A Calcutta-grounded essay on Health Information Exchange, OpenHIE, and why interoperability is less about software than continuity, governance, trust, and memory."
date: "2026-04-21"
thumbnail: "/images/IMG-20260423-WA0021.jpg"
category: "healthcare-it"
tags: ["Community Health Workers","Interoperability Layer","United States","Data Quality","OpenHIE Shape","HIE","OpenHIE","Health","Systems","FHIR"]
published: true
color: "blue"
---

<TTS />

<Pi src="IMG-20260423-WA0021.jpg" />

The paper folder arrives with the patient, if it arrives at all.

It may be held under one arm, softened at the corners, with old reports folded into newer ones and a few test results tucked loose like afterthoughts. In a crowded Calcutta clinic, this folder often does more work than the computer. It remembers what the system forgot to carry. It also tears, gets wet, gets lost, and depends on a frightened person or a relative becoming the courier of clinical memory.

Health Information Exchange exists because that arrangement is not good enough.

HIE means the electronic movement of health-related information among organizations: hospitals, clinics, laboratories, pharmacies, public health agencies, insurers, registries, and research systems. That definition is correct and bloodless. The real purpose is simpler.

The patient's story should not restart at every door.

An emergency ward should not treat a person as a blank slate because the prior record sits in another institution. A clinic should not repeat tests because results cannot cross a boundary. A public health team should not learn too late that cases are rising because data is trapped in paper or vendor silos.

HIE is an attempt to make healthcare remember across institutions.

OpenHIE is one of the clearest architectural responses to that need, especially in resource-constrained settings where fragmentation is not an inconvenience but a structural condition.

## From Episode To Continuity

Healthcare systems often treat care as episodes.

A visit. A claim. A lab request. An admission. A referral. A discharge. These are administratively convenient units. The body does not live that way. The body is continuous. A condition begins before the visit. A result matters after the discharge. A referral depends on what happened elsewhere. A vaccine record, an allergy, a prior procedure, a diagnosis, a lab trend, a pregnancy history, a chronic disease plan - these are not episodes. They are parts of a moving life.

Before electronic systems, records lived in paper charts, local cabinets, private files, memory, and habit. That could work inside small communities and long relationships. It broke under specialization, urban mobility, complex therapies, fragmented public-private systems, and multiple facilities touching the same patient.

Electronic health records solved part of the problem by digitizing data. They also created a new one. A digital silo is still a silo.

The HITECH Act of 2009 in the United States pushed broad EHR adoption and meaningful use. It accelerated digitization, but digitization did not automatically produce exchange. Hospitals and vendors still had incentives to retain data. Systems used different standards, different identifiers, different workflows, different governance rules.

In global health, the problem looked different and sometimes sharper. Countries in sub-Saharan Africa, South Asia, and Southeast Asia often faced paper registers, disease-specific donor systems, district reporting tools, immunization systems, HIV systems, tuberculosis systems, logistics systems, and local applications that did not speak to one another. A patient's HIV status might sit on a card. A vaccine record might sit in a register. A national dashboard might receive aggregate data weeks late.

OpenHIE emerged in that world.

It grew out of work around OpenHIM, the Open Health Information Mediator, and broader global health collaboration around 2013. It is not a single product. It is an architectural framework and open-source community for building national or regional health information exchanges. It is designed for brownfield reality: existing systems, limited budgets, intermittent connectivity, scarce technical staff, vertical programs, and the need to integrate rather than replace everything at once.

That last point matters.

OpenHIE does not begin by saying: burn down the old systems.

It begins by saying: mediate between them.

## The OpenHIE Shape

At the center of OpenHIE is the interoperability layer, often implemented with OpenHIM.

Think of it as a translator, traffic controller, policy enforcer, and audit clerk. Point-of-service systems - EHRs, lab systems, pharmacy systems, logistics systems, mobile tools, registries - connect to the interoperability layer rather than building custom links to every other system. The layer handles routing, authentication, transformation, logging, error management, and policy enforcement.

This avoids the pairwise integration trap. If every system has to connect directly to every other system, complexity grows too quickly. A hub-and-spoke pattern lets each system connect once, then lets the hub manage communication.

This is not only technical elegance.

It is governance made executable.

The interoperability layer can enforce who may send what, who may receive what, what must be logged, which transformations are allowed, and how failures are tracked. Health data is sensitive. Exchange without governance is not interoperability. It is exposure.

Around the interoperability layer sit key registries and shared services.

The Client Registry answers an old question: is this the same person? Names change spelling. Dates are entered wrong. Middle names appear and disappear. Addresses shift. A patient may attend multiple facilities. The client registry links records using identifiers and probabilistic matching. It may use PIX/PDQ patterns or FHIR Patient resources. Its job is to keep a person from becoming scattered encounters.

The Facility Registry gives consistent identity to places: hospitals, clinics, laboratories, pharmacies, outreach posts. In many health systems, facility lists are duplicated across ministries, programs, spreadsheets, and donor systems. A facility may exist twice under slightly different names or not appear where it should. Planning becomes corrupted by naming errors. The facility registry makes place legible.

The Health Worker Registry tracks clinicians, nurses, community health workers, lab staff, and other workers. It supports workforce planning, credentialing, service mapping, and accountability.

The Shared Health Record, sometimes called the longitudinal health record, holds the cumulative clinical story assembled from different systems: allergies, diagnoses, procedures, immunizations, lab results, encounters, and care summaries. It is not every local database copied into one giant pot. Done properly, it is a curated shared memory.

The Terminology Service manages meaning. If one system says hypertension, another says essential primary hypertension, and a third uses a local term, the terminology service helps map those to standard code systems such as ICD-10, SNOMED CT, or LOINC.

Together these components form an ecosystem. HIE is not one database in the sky. It is mediation, identity, terminology, governance, routing, and trust working together.

## The Alphabet Soup Is Necessary

Interoperability without standards is theater.

HL7, Health Level Seven, has been central to clinical data exchange for decades. HL7 v2, born in the late 1980s, still moves admission, discharge, transfer, orders, results, and observation messages through many systems. It is pipe-delimited, widely deployed, and famously flexible. That flexibility is why it survived and why it frustrates implementers.

HL7 FHIR, Fast Healthcare Interoperability Resources, is newer and web-native. It uses RESTful APIs and JSON or XML. It represents clinical concepts as resources such as Patient, Observation, Condition, Encounter, and DiagnosticReport. FHIR has become especially important in the United States because modern patient access rules under the 21st Century Cures Act pushed standardized APIs.

IHE, Integrating the Healthcare Enterprise, is not one standard but a set of profiles showing how standards can be combined for specific workflows, such as document sharing or imaging exchange.

DICOM governs medical imaging. LOINC standardizes lab tests and observations. SNOMED CT provides broad clinical terminology. ICD-10 and ICD-11 classify diseases for reporting, epidemiology, and billing. OpenHIE Architecture Governance patterns describe how these pieces can fit in low-resource settings.

The acronyms are annoying because the problem is hard.

They are also what make agreement possible.

## Who Actually Builds It

HIE is a sociotechnical system. That word is often used lazily, but here it is exact.

National ministries of health make policy choices: centralized or federated, national or regional, open-source or vendor-led, patient-level or aggregate-first, public-only or public-private. These choices last years. They affect budgets, procurement, privacy law, workforce planning, and trust.

Architects and implementers translate those choices into running systems. They know a FHIR server is not a strategy. They know data quality at the point of entry determines whether national analytics can be trusted. They know connectivity, power, training, local language, device availability, and maintenance contracts can defeat elegant diagrams.

Clinicians and community health workers are both users and sources of data. If HIE adds burden without returning value, they will work around it. The best data is often captured as a byproduct of care, not as a separate ritual for some distant dashboard.

Patients are supposed to benefit, though they are often least consulted. They need continuity, privacy, safety, and control. They do not want to become raw material for surveillance or commercial extraction. Their trust is the deepest infrastructure.

Vendors, donors, standards bodies, open-source communities, researchers, and consultants all bring their own incentives. A donor may want measurable results within a grant cycle. A vendor wants a contract. A ministry wants political durability. An open-source community wants contribution and maintenance. A researcher wants evidence. These incentives rarely align naturally.

When HIE fails, it is seldom one bug. It fails because governance is unclear, training is weak, infrastructure is unfunded, a political champion leaves, a vendor disappears, data quality collapses, privacy rules are contradictory, or users do not trust the outputs.

The technology is difficult.

The institution is harder.

## Where It Has Been Tried

OpenHIE was shaped heavily by the global South.

Rwanda is often cited for a national HIE built with OpenHIM and FHIR patterns, connecting hospitals, health centers, and community-based insurance systems after the health system was rebuilt following the 1994 genocide. The example matters because it shows how political will, technical capacity, and international support can align.

Tanzania uses DHIS2 as a national health management information platform, with OpenHIE patterns guiding how facility-level data moves upward for tracking immunization, outbreaks, and facility performance.

India's Ayushman Bharat Digital Mission is one of the most ambitious HIE efforts anywhere, attempting to link public and private providers across a massive and pluralistic health system. ABHA, the Ayushman Bharat Health Account number, functions as a national digital health identifier. The scale is enormous. The implementation is ongoing and contested, as any effort of that scope would be.

The United States has a different pattern: regional health information organizations, statewide exchanges, vendor networks, Carequality, CommonWell, and regulation around patient access. Market structure shapes everything there. Hospitals, EHR vendors, insurers, and public agencies do not always want the same kind of exchange.

These examples do not prove one universal model.

They prove the need for local fit.

What works in Rwanda may not work in Rajasthan. What works in Vermont may not work in Veracruz. HIE architecture lives inside law, politics, trust, financing, public-private structure, and state capacity.

## Why It Matters

When information does not flow, care becomes guesswork.

Tests are repeated. Allergies are missed. Prior results are unavailable. Prescribing becomes riskier. Public health signals arrive late. Surveillance breaks. Referrals lose context. A clinician meets a patient at a critical moment and has to reconstruct a life from memory, paper, and fragments.

HIE matters for individual care.

It also matters for health system intelligence. A ministry cannot allocate resources equitably if it cannot see where disease burden is concentrated. A district manager cannot respond to an outbreak if reports arrive weeks late. A national program cannot evaluate policy if the data is trapped in incompatible systems.

COVID-19 made this painfully obvious. Real-time data on cases, capacity, testing, vaccines, and outcomes became part of state capacity itself. Public health without data flow is delayed reaction.

Research also depends on exchange. A learning health system, where routine care generates knowledge that improves future care, requires interoperable, ethical, analyzable data. Pharmacovigilance, precision medicine, clinical AI, and health services research all depend on information that can move without losing meaning.

## New Pressure On Old Architecture

Cloud computing changes infrastructure economics. A national exchange can use scalable managed infrastructure rather than building every data center from scratch. The trade-offs include dependence on foreign providers, data sovereignty concerns, connectivity, and procurement complexity.

Mobile technology changes the point of capture. Community health workers can register births, track immunization, report cases, and use decision support in the field, sometimes offline with later synchronization.

Blockchain has been proposed for audit trails, patient-controlled sharing, and decentralized trust. It can help in narrow cases, but it does not solve semantic interoperability, data quality, workflow, or governance. A ledger is not a health system.

AI creates demand for cleaner, longitudinal, standardized data. Good HIE can support clinical AI, population health, and analytics. Bad HIE can feed models with fragmented error at scale.

FHIR continues to expand into genomics, social determinants of health, patient-reported outcomes, and device data. SMART on FHIR lets apps connect using standardized authentication and access patterns. Patient portals, personal health records, and health apps shift some access toward individuals.

Each new technology adds power and risk. More exchange means more security surface. More patient access means more design burden. More AI means more need for governance. More cloud means more questions about sovereignty and dependency.

The HIE of 2030 will be more distributed, real-time, patient-facing, AI-aware, cloud-shaped, and complex than the HIE of 2015.

## What To Unlearn

HIE is not primarily a technical problem. The technical problems are real, but governance, sustainability, trust, law, workflow, and incentives are usually harder.

If you build it, they will not simply come. Adoption requires training, feedback, change management, and visible value for the people doing the work.

HIE does not have to mean losing control of data. Good exchange uses access control, audit logging, consent management, minimization, and clear policy. The goal is authorized sharing, not reckless exposure.

One national database is not always better than many connected systems. Centralization gives consistency and scale, but it also creates single points of failure, political risk, and reduced local adaptability. Federated designs keep data closer to source but add coordination complexity. Context decides.

HIE rarely saves money immediately. Infrastructure costs before it pays back, and the benefits are long-term and diffuse.

Patient matching is not solved. National IDs, biometrics, and probabilistic matching all have limits and privacy risks. In countries with weak civil registration, knowing who is who can itself be a major project.

Open source is not free in the lazy sense. It gives freedom to inspect, adapt, and share. It does not eliminate implementation, training, hosting, governance, and maintenance costs.

## The System Remembering

HIE is ultimately about continuity.

A medical record is a partial biography, constrained by codes and forms but still a biography of a body moving through time. HIE tries to keep that biography from being torn apart by institutional borders.

That is why OpenHIE's humility matters. It does not pretend one product can erase complexity. It offers patterns: mediate, identify, standardize, govern, audit, adapt. It treats health information architecture as a commons rather than a trophy.

In Calcutta, continuity often depends on the folder under the arm, the relative who remembers, the previous report kept safe in a plastic sleeve, the old prescription shown at the counter, the phone call to someone who knows someone. These are human HIEs, fragile and improvised.

The digital version should be better than that without becoming colder than that.

The folder is still on the desk. The patient is still waiting. Somewhere, two systems know two halves of the story and have not yet learned to speak. The work of HIE is to make the story arrive before it is too late, without pretending that arrival is easy.

---

## P.S. References

For deeper technical grounding, see the OpenHIE Architecture Specification and the HL7 FHIR R4 specification. Both should be treated as living architecture rather than static scripture.
