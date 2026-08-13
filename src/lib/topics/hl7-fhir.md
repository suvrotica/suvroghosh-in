---
title: 'HL7, FHIR, and Healthcare Interoperability'
shortTitle: 'HL7 & FHIR'
slug: 'hl7-fhir'
group: 'Healthcare and technology'
description: >-
  A practical route from hospital messages and FHIR resources to identity, terminology, provenance, implementation guides, data warehouses, and real health-system constraints.
date: '2026-07-26'
dateModified: '2026-08-13'
primaryTag: 'fhir'
sourceTags:
  - 'fhir'
  - 'hl7'
  - 'health-level-seven'
  - 'hl7-version'
  - 'hie'
  - 'openhie'
  - 'interoperability'
  - 'healthcare-interoperability'
  - 'semantic-interoperability'
sourceCategories: []
includePaths:
  - '/blog/healthcare-it/hl7-vs-fhir-explained-simply'
  - '/blog/healthcare-it/fhir-the-universal-language-of-health-data'
  - '/blog/healthcare-it/hie-first-principles-openhie'
  - '/blog/healthcare-it/explaining-the-healthcare-it-gap-as-continuity'
  - '/blog/healthcare-it/va-healthcare-data-systems-mumps-to-sql'
  - '/blog/healthcare-it/va_data_warehouse_reality'
  - '/blog/healthcare-it/india-ehr-hie-ai-constraints'
  - '/blog/healthcare-it/questions_change_systems_uthscsa_va'
  - '/blog/healthcare-it/latent-space-in-healthcare-data'
  - '/blog/games/healthcare-it-crossword-systems-rounds'
excludePaths:
  - '/blog/mental-models/randomness-chaos-complexity-calcutta'
  - '/blog/public-health/sitala-manasa-public-health-superstition'
  - '/blog/healthcare-systems/homeopathy-pseudoscience-persistence'
bestStartingArticle: '/blog/healthcare-it/hl7-vs-fhir-explained-simply'
startHereReason: >-
  Start here to learn why HL7 v2 messages and FHIR resources are complementary tools, not rival generations in a simple replacement story.
readingPaths:
  beginner:
    description: >-
      Start with the repeated-clipboard problem, then widen from one API standard to the governance and shared services required for exchange.
    items:
      - '/blog/healthcare-it/fhir-the-universal-language-of-health-data'
      - '/blog/healthcare-it/hie-first-principles-openhie'
  intermediate:
    description: >-
      Follow health data from operational systems into enterprise architecture, where translation, provenance, and institutional memory become unavoidable.
    items:
      - '/blog/healthcare-it/explaining-the-healthcare-it-gap-as-continuity'
      - '/blog/healthcare-it/va-healthcare-data-systems-mumps-to-sql'
      - '/blog/healthcare-it/va_data_warehouse_reality'
  deep:
    description: >-
      Examine national constraints, longitudinal data architecture, and what happens when clinical reality is compressed into learned representations.
    items:
      - '/blog/healthcare-it/india-ehr-hie-ai-constraints'
      - '/blog/healthcare-it/questions_change_systems_uthscsa_va'
      - '/blog/healthcare-it/latent-space-in-healthcare-data'
relatedResources:
  visualizations: []
  games:
    - '/blog/games/healthcare-it-crossword-systems-rounds'
  other: []
glossary:
  - term: 'HL7 v2'
    definition: >-
      A widely deployed family of event messages used by hospitals to send admissions, orders, results, and other operational updates between systems.
    relatedPath: '/blog/healthcare-it/hl7-vs-fhir-explained-simply'
  - term: 'FHIR'
    definition: >-
      Fast Healthcare Interoperability Resources, an HL7 standard that represents health information as modular resources and exposes it through web-friendly exchange patterns.
    relatedPath: '/blog/healthcare-it/fhir-the-universal-language-of-health-data'
  - term: 'FHIR resource'
    definition: >-
      A structured unit such as Patient, Observation, Condition, or MedicationRequest with a defined purpose and standard representation.
  - term: 'Profile'
    definition: >-
      A constrained statement of how a FHIR resource is used for a particular country, program, workflow, or exchange requirement.
  - term: 'Implementation guide'
    definition: >-
      A published package of profiles, terminology bindings, examples, rules, and guidance that makes a broad standard implementable in a specific context.
  - term: 'Terminology'
    definition: >-
      Controlled codes and naming systems used to preserve clinical meaning, such as identifiers for tests, diagnoses, medications, and observations.
  - term: 'HIE'
    definition: >-
      Health Information Exchange: the technical and governance arrangement that lets information move among otherwise separate healthcare organizations.
    relatedPath: '/blog/healthcare-it/hie-first-principles-openhie'
  - term: 'Provenance'
    definition: >-
      Evidence of where data came from, who or what changed it, when the change occurred, and which transformation produced the current form.
  - term: 'Semantic interoperability'
    definition: >-
      The ability of receiving systems and people to preserve and use the meaning of exchanged data, not merely parse its syntax.
    relatedPath: '/blog/healthcare-it/va-healthcare-data-systems-mumps-to-sql'
  - term: 'Patient identity'
    definition: >-
      The difficult process of deciding which records from different systems refer to the same person without merging different people or splitting one person's history.
faqs:
  - question: 'Is FHIR replacing HL7 v2?'
    answer: >-
      Not as a universal one-for-one replacement. HL7 v2 remains deeply embedded in event-driven hospital workflows, while FHIR is often better suited to APIs, apps, patient access, and query-based exchange. Many sound architectures use both.
  - question: 'Is FHIR just JSON for healthcare?'
    answer: >-
      No. JSON is one possible serialization, but FHIR also defines resources, relationships, search behavior, conformance artifacts, and terminology expectations. A JSON document can be syntactically valid while still being clinically ambiguous or locally unusable.
  - question: 'Why do two conformant systems still fail to understand each other?'
    answer: >-
      Standards leave choices because healthcare settings differ. Systems still need shared profiles, code systems, identity rules, workflow agreements, version policies, and governance for exceptions.
  - question: 'What is the difference between an HIE and a data warehouse?'
    answer: >-
      An HIE coordinates exchange for care and operational continuity, often close to the time data is needed. A warehouse reorganizes data for analytics, reporting, research, and longitudinal use; treating one as the other creates damaging assumptions.
  - question: 'Why does provenance matter if the value looks correct?'
    answer: >-
      The same-looking value may have been measured, copied, inferred, transformed, corrected, or entered for an administrative reason. Without provenance, a consumer cannot judge which interpretation or use is safe.
  - question: 'Can a country adopt FHIR before every hospital has a mature EHR?'
    answer: >-
      It can adopt the standard, but meaningful exchange still depends on source systems, identity, terminology, workflow, connectivity, governance, and incentives. A national specification is an important coordination tool, not a substitute for the institutions that must produce and use trustworthy data.
contrarianView:
  heading: 'Transport is the easy part'
  paragraphs:
    - >-
      Interoperability is too often presented as a plumbing problem: choose the modern standard, connect the endpoints, and let information flow. Healthcare repeatedly proves that transport can succeed while meaning fails. A lab result may arrive without the local method, a diagnosis may reflect billing pressure, and a clean resource may hide an uncertain patient match. The hard work is agreeing what data represents, who may rely on it, how exceptions are governed, and which institution is accountable when the shared story is wrong. FHIR improves the language of exchange; it does not abolish the politics or archaeology of healthcare data.
relatedTopics:
  - 'healthcare-ai'
  - 'interactive-mathematics'
---

Healthcare interoperability begins with an ordinary irritation: the information already exists, yet the patient or clinician must supply it again. One hospital knows the allergy, another knows the laboratory result, a third holds the discharge summary, and none can reliably assemble the same person at the moment of care. The failure is not merely that computers use different file formats. Healthcare data carries identity, time, terminology, workflow, and institutional history. Moving a value without those conditions can move confusion faster.

HL7 v2 and FHIR address different boundaries inside that problem. HL7 v2 remains the workhorse for event messages such as admissions, orders, and results. FHIR organizes information into modular resources and uses familiar web patterns for queries, apps, patient access, and ecosystem exchange. Profiles and implementation guides narrow the broad standard for actual use. Terminology bindings try to keep two systems from using the same field to mean nearby but incompatible things.

Neither standard is a health information exchange by itself. Real exchange also needs patient matching, registries, consent and access rules, provenance, monitoring, version governance, and people empowered to resolve ambiguity. The deeper readings follow data into VA operational systems and warehouses, compare different longitudinal architectures, and examine countries where the institutional prerequisites are uneven. The goal is not to memorize acronyms. It is to understand why a message can be delivered perfectly while the clinical meaning arrives late, incomplete, or wearing the wrong patient's shoes.
