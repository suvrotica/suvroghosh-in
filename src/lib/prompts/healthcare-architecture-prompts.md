---
title: 'Healthcare Architecture Prompts'
description: 'Rigorous prompts for healthcare system design, interoperability review and migration planning across clinical and operational boundaries.'
date: '2026-07-30'
dateModified: '2026-07-30'
kind: 'prompt'
tags:
  - 'Healthcare architecture'
  - 'Interoperability'
  - 'FHIR'
  - 'HL7 v2'
  - 'Clinical safety'
  - 'Data governance'
published: true
featured: false
order: 50
thumbnail: '/images/resources/healthcare-architecture-prompts.webp'
thumbnailAlt: 'A healthcare architecture map linking clinical workflows, standards, identity, terminology and audit trails'
estimatedLength: '3 architecture briefs'
related:
  - 'lists/medical-verbs'
  - 'prompts/research-and-verification-prompts'
  - 'prompts/codex-desktop-implementation-prompts'
language: 'en'
---

Healthcare architecture is not a standards shopping list. These prompts begin with actors, workflow, meaning and failure, then ask how FHIR, HL7 v2 and supporting services can preserve the right information across a real institutional boundary.

## Intended use

Use the master prompt for a new or substantially revised architecture. The review variation interrogates an existing proposal; the migration variation turns a current and target state into a staged, reversible programme.

## Suitable inputs

Provide the care setting, business and clinical purpose, current systems, target capabilities, jurisdictions, users, data classes, transaction volumes, latency and downtime needs, known standards or contracts, and the decisions that are still open.

<!-- resource-copy:start -->

## Healthcare-architecture master prompt

Develop a healthcare architecture for [PROGRAMME, SERVICE OR CAPABILITY].

### Context

- Care and operational purpose: [PURPOSE]
- Care settings and organizations: [SETTINGS AND ORGANIZATIONS]
- Jurisdiction and policy context: [JURISDICTION]
- Current systems and interfaces: [CURRENT STATE]
- Target capabilities: [TARGET STATE]
- Actors and accountable owners: [CLINICIANS, PATIENTS, STAFF, SYSTEMS, ORGANIZATIONS AND AUTHORITIES]
- Data domains and sensitivity: [DATA]
- Expected scale, latency and availability: [VOLUME, LATENCY, DOWNTIME AND RECOVERY NEEDS]
- Standards or versions already mandated: [FHIR, HL7 V2, CDA, DICOM, TERMINOLOGY OR OTHER CONTRACTS]
- Constraints: [BUDGET, LEGACY, NETWORK, WORKFORCE, PROCUREMENT OR TIMELINE]
- Decisions explicitly out of scope: [OUT OF SCOPE]

Do not assume that moving data means preserving clinical meaning. Do not assume that choosing FHIR, HL7 v2 or a vendor product constitutes an architecture.

### Required analysis

#### 1. Assumptions and decision boundary

List every material assumption. Mark it as confirmed, provisional or unknown, name who can confirm it and explain what architectural decision depends on it. State the system boundary, neighbouring systems and which organization owns each side of every crossing.

#### 2. Actors and operational workflow

Describe the real workflow before the data flow:

- who initiates, records, reviews, corrects, approves, receives and acts;
- what happens during routine care, downtime, late entry, correction and transfer;
- which work queues, hand-offs and escalation paths exist;
- where staff currently use paper, spreadsheets, phone calls or duplicate entry;
- where a technically successful interface could still make work slower or less safe.

Separate patient-facing clinical decisions from billing, reporting, research and administrative use, even when they share source data.

#### 3. Information and time

For each important datum, record:

- source of truth and original purpose;
- patient, encounter, order, specimen or other identity context;
- author or asserting system;
- event, collection, documentation, result, correction, transmission and load times as applicable;
- local code, display value, standard mapping and mapping version;
- status, negation, uncertainty and correction history;
- provenance that must survive transformation;
- intended consumers and prohibited interpretations.

Do not collapse several clinically meaningful clocks into one generic timestamp. Do not treat a billing classification as a clinical assertion without explicit rules.

#### 4. Interoperability design

Address all relevant layers:

- **FHIR:** resource boundaries, profiles, implementation guides, terminology bindings, version policy, validation, search or exchange pattern and conformance testing.
- **HL7 v2:** triggering events, message types, local segments, acknowledgements, sequencing, idempotency, retries, error queues and interface ownership.
- **Documents and images:** when narrative, legal attestation, DICOM objects or a whole document must remain intact rather than being decomposed.
- **Terminology:** code systems, value sets, mapping confidence, versioning, local-code preservation, stewardship and change propagation.
- **Patient and provider identity:** match inputs, false-positive and false-negative harm, merge/unmerge, duplicate review and cross-organizational identifiers.
- **Consent and access:** purpose of use, authorization, revocation, proxy relationships, emergency access, segmentation and propagation to downstream copies.

State which standards are transport languages, which components are authoritative registries and which decisions require governance rather than middleware.

#### 5. Security, privacy and audit

Define trust zones, authentication, service and human authorization, least privilege, encryption boundaries, key or secret ownership, tenant or organization isolation, data minimization and retention. Specify an audit trail that can answer who accessed or changed what, under which role and purpose, when, from where and with what outcome. Include break-glass review and tamper-evidence where required.

Do not claim legal, regulatory, privacy or security compliance merely because a checklist is complete. Produce a traceability table from [APPLICABLE REQUIREMENTS] to controls and evidence, and identify items requiring legal, privacy, security or clinical governance review.

#### 6. Resilience and operations

Design for:

- dependency outage, network partition and slow response;
- duplicated, delayed, missing, malformed and out-of-order messages;
- replay and reconciliation;
- terminology or identity service unavailability;
- corrupted mapping or configuration rollout;
- partial regional or facility outage;
- downtime operation and recovery without silent data loss;
- observability, alert ownership, runbooks, service levels and recovery objectives.

Explain which operations fail closed, fail open, queue, degrade or require human escalation, and why.

#### 7. Data quality and semantic safety

Separate syntactic validity, completeness, plausibility, consistency, timeliness, identity confidence and fitness for a specific use. For each quality rule, state where it runs, whether it blocks or warns, who resolves exceptions and whether the original value is preserved. Never let a canonical model erase source context merely to make a dashboard simpler.

#### 8. Clinical safety

Treat clinical safety as distinct from ordinary software correctness. Identify hazards where a correct technical operation could still cause:

- wrong-patient association;
- missed or duplicated result;
- stale medication or allergy information;
- misleading normalization or unit conversion;
- hidden uncertainty or correction;
- alert overload or a stranded work item;
- unsafe downtime or recovery behaviour.

For each hazard, give cause, affected actor, clinical consequence, preventive control, detection, mitigation, residual risk and accountable clinical owner. Do not present this as medical advice or a substitute for a formal clinical safety process.

### Required outputs

Return:

1. executive summary and decision statement;
2. confirmed, provisional and unknown assumptions;
3. system-context diagram and boundary narrative;
4. actor and responsibility table;
5. current and proposed workflow;
6. canonical data-flow inventory with sources, destinations, standards, timing, identity, terminology, consent and provenance;
7. component responsibilities and explicit non-responsibilities;
8. security, audit, resilience and operations design;
9. clinical-safety hazard table separate from the software risk register;
10. failure-mode table covering technical, semantic, operational and organizational failures;
11. major trade-offs with at least two viable alternatives and rejection reasons;
12. validation and conformance plan;
13. phased delivery plan with dependencies, reversible checkpoints and exit criteria;
14. open decisions, named decision owners and evidence still required.

Use diagrams to clarify boundaries and flow, but make the tables and prose complete enough to review without interpreting decorative arrows.

### Quality gate

Before finalizing, ask:

- Can every important datum be traced back to an actor, workflow and source?
- Are FHIR, HL7 v2, terminology, consent, identity and audit responsibilities explicit?
- Does the design preserve local meaning and correction history?
- Are failure ownership and human escalation visible?
- Are clinical hazards separated from ordinary defects and availability risks?
- Are legal or compliance statements framed as requirements to verify rather than achievements inferred from architecture?
- Could another team operate, test and migrate this design without relying on unwritten institutional memory?

## Architecture-review variation

Review [EXISTING ARCHITECTURE, DIAGRAM OR PROPOSAL] against [INTENDED OUTCOMES AND CONSTRAINTS].

Do not redesign immediately. First reconstruct its stated and implied boundaries, actors, workflows, sources of truth, trust zones and failure assumptions. Produce:

- strengths worth preserving;
- contradictions or ambiguous ownership;
- missing data, identity, terminology, consent, audit, security, resilience and workflow decisions;
- clinical-safety hazards distinct from software defects;
- standards claims that do not establish semantic interoperability;
- compliance claims lacking mapped evidence;
- prioritized findings by consequence and reversibility;
- questions that must be answered before design approval;
- a minimally disruptive correction path and, separately, a deeper alternative.

For every finding, cite the exact diagram element, statement or omission that supports it. Do not use a generic maturity checklist as proof.

## Migration-plan variation

Create a migration plan from [CURRENT HEALTHCARE SYSTEM] to [TARGET ARCHITECTURE].

Inventory interfaces, data domains, local codes, identities, consent state, audit history, reports, queues and operational workarounds before sequencing change. Define source-to-target mappings with provenance and reversibility. Include parallel run, backfill, reconciliation, duplicate control, cutover criteria, rollback, downtime, staff training, support ownership and post-cutover monitoring.

For each wave, state scope, prerequisites, transformation logic, clinical and operational risk, validation sample, sign-off owner, measurable exit criteria and rollback point. Preserve raw source values and mapping versions. Do not use a big-bang cutover unless [EVIDENCE JUSTIFYING BIG-BANG CUTOVER] demonstrates that staged coexistence is more dangerous.

<!-- resource-copy:end -->

## Usage notes

Architecture quality depends on details the prompt cannot supply: local workflow, contracts, code systems, law, clinical governance and the behaviour of legacy systems under stress. Use the output to structure review with clinicians, integration engineers, security, privacy, operations and data stewards—not to claim that multidisciplinary approval has already occurred.
