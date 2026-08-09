---
title: "The Prior Authorization Machine: a patient, an MRI, and the invisible decisions between them"
description: "Follow one fictional MRI request through portal/fax and FHIR-enabled pathways to see transaction time, human work, and patient waiting diverge."
date: "2026-08-09"
dateModified: "2026-08-09"
thumbnail: "/images/visualizations/prior-authorization-machine.png"
thumbnailAlt: "Cutaway diagram of a synthetic lumbar MRI request moving through clinical, payer, and scheduling queues while three clocks record different kinds of time"
category: "Visualizations"
tags: ["Prior Authorization","FHIR","Interoperability","Healthcare IT","Data Visualization","Syntactically Valid","SMART App Launch","Authorization API","Automated Processing","PAS"]
pinnedTags: ["Prior Authorization", "FHIR", "Interoperability", "Healthcare IT", "Data Visualization"]
series: ["The Patient Through the Machine"]
seriesId: "patient-through-machine"
seriesPart: 1
seriesChapter: "WAIT"
published: true
interactiveFirst: true
immersiveLead: true
color: "#315A76"
author: "Suvro Ghosh"
readingTime: "22 min"
inPlainEnglish: "A computer can deliver a prior-authorisation message almost instantly while a patient still waits through inboxes, reviews, missing evidence, and appointment queues. This synthetic case keeps those different kinds of time separate."
keyTerms: ["Prior authorization", "FHIR R4", "CRD", "DTR", "PAS", "CDS Hooks", "SMART App Launch", "ClaimResponse", "OperationOutcome", "X12 278", "Patient elapsed time", "Active human work"]
---

<script>
	import {
		PriorAuthorizationMachine,
		StandardsManifest
	} from '$lib/components/visualizations/prior-authorization';
</script>

<PriorAuthorizationMachine />

<TTS />

<p><small>Published <time datetime="2026-08-09">9 August 2026</time> · Updated <time datetime="2026-08-09">9 August 2026</time></small></p>

> **The Patient Through the Machine — Part 1 · WAIT**

> **Synthetic-case notice:** Maya Sen, her coverage, her lumbar MRI order, the payer policy, every identifier, and every duration on this page are fictional. Nothing here is patient data, an observed average, or a promise about an actual payer.

The electronic transaction in this essay can finish before a person has taken a sip of tea. Maya can still be waiting eleven days later.

That is not a contradiction. It is what happens when software time, working time, and lived time are mistaken for one another. The machine above keeps them apart.

## 1. The order and the first clock

Maya Sen already has a non-urgent outpatient lumbar MRI order. In the synthetic record it is a FHIR R4 `ServiceRequest`, associated with fictional coverage and the deliberately unmistakable identifier `urn:example:synthetic:maya-sen`. It contains no address, telephone number, email address, real organisation, or plausible medical-record number.

The fictional policy asks for four categories of evidence: a documented current problem or indication, a prior-management history, a recent clinical assessment, and an ordering-clinician attestation. One required fact is present only in a narrative note. A person can find and assess that sentence. The model does not pretend that software may safely turn suggestive prose into a structured clinical answer by confidence and good manners.

At **Day 0**, the order enters the administrative machine. For Maya there is one experience: the scan has not happened. Inside the system, however, coverage is checked, requirements are discovered, evidence is assembled, identifiers are matched, messages move, queues form, a reviewer decides, an authorisation acquires an end date, and an appointment is sought.

The patient experiences one delay. The architecture records many events.

The visualisation therefore keeps Maya at the edge of the machinery throughout. She is not an input token that disappears once the interesting plumbing begins. At every milestone the Patient lens says what is known, what remains uncertain, how long she has waited, and what happens next. The Clinician lens exposes the work created or avoided. The Architect lens shows the exchange semantics, identifiers, resources, evidence references, and distinct technical and business states. All three inspect the same immutable run; changing lens cannot change the facts or improve the outcome.

## 2. Before the FHIR pathway

There is no single historical workflow called “the fax process”. One organisation may use a payer portal, another a clearing-house, another a telephone call followed by an uploaded document, and another some combination held together by local habit. The comparison here is a declared counterfactual, not a claim that every American provider works in the same way.

In this portal-and-fax route, staff leave the ordinary clinical workflow to discover requirements, sign into a separate portal, re-key information already held in the electronic health record, assemble attachments, wait for an inbox or fax acknowledgement, and follow up when the status is unclear. Some of that work is careful and clinically necessary. Some is transport friction. The ledger labels the difference rather than calling every human action waste.

The X12 278 transaction remains part of the United States administrative-transactions landscape. It has not vanished because a FHIR API exists. At the same time, HHS enforcement discretion permits a covered entity implementing the all-FHIR prior-authorisation API workflow described by CMS-0057-F to omit X12 278 from that particular API flow. That is why the Architect view shows **FHIR only ↔ FHIR plus X12/intermediary** as an optional branch, not a compulsory tunnel and not an obituary for X12 ([CMS enforcement-discretion guidance](https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/hipaa-transaction-enforcement-discretion)).

The electronic counterfactual changes the plumbing: discovery can occur in context, some structured facts can be prepopulated, and the request and its acknowledgement can move without a person copying every field. It does not change Maya, the MRI, her coverage, the fictional evidence rule, the reviewer’s responsibility, or the imaging centre’s calendar.

**Same patient. Same policy. Different plumbing.**

## 3. Three clocks, three kinds of time

The page calculates three clocks independently from the event ledger.

| Clock | What it counts | What it does not claim |
|---|---|---|
| **Patient elapsed** | Wall time from the order to the current outcome, including nights, queues, inbox delay, review, rework, and scheduling | That someone was actively working throughout |
| **Active human work** | Declared hands-on seconds and minutes across the clinical office, payer, and imaging/scheduling roles | A continuous elapsed duration, or a complete labour-cost study |
| **Automated processing** | Declared network and software-processing milliseconds or seconds | The time to a clinical decision, an approval, or a scan |

They must not be added together. Two people may work at once. Machine processing may occur inside a much longer queue interval. A week can pass with only minutes of active work. The patient’s elapsed time is decomposed into disjoint wall-time segments; the human and machine counters are separate measures attached to events.

The two canonical baseline runs therefore end with these exact fixture totals:

| Fictional pathway | Patient elapsed | Active human work | Automated processing |
|---|---:|---:|---:|
| Portal and fax | 18 days | 2 hours 36 minutes | 1.630 seconds |
| FHIR-enabled | 11 days | 64 minutes | 2.880 seconds |

The machine total is not a speed score: the FHIR-enabled run deliberately records more automated processing while producing less re-keying and less human work. The difference in elapsed days comes from the declared workflow and queue assumptions, not from pretending that milliseconds turn directly into days saved.

The canonical FHIR-enabled fixture culminates in this deliberately narrow sentence:

> **In this fictional case, one transaction took 400 ms. The journey took 11 days.**

The machine treats those two values as exact because they are authored integer values in a deterministic fixture: 400 milliseconds for one declared transaction and 15,840 minutes from order to scan. There is no statistical margin around either number because neither is an estimate from a sample. Adding an error bar would falsely dress an invented case as measured evidence.

Margins and distributions belong around empirical estimates: real network latency, real staff effort, real payer turnaround, and real appointment availability would need populations, measurement conditions, percentiles, missing-data analysis, and uncertainty. This essay has none of those. Its exact assertions are equality checks inside the model; its visible assumptions are the warning label outside it. Every other duration shown by the experience has the same status unless explicitly sourced otherwise.

The 400 milliseconds prove only that a computer exchange can be brief. They do not explain the eleven days. Open the elapsed-time breakdown and the long intervals belong to inboxes, review, an evidence handoff, and external scheduling—not to an HTTP connection held open for eleven days.

## 4. CRD is not DTR is not PAS

The FHIR-enabled route is easiest to understand as three different jobs.

**Coverage Requirements Discovery (CRD)** brings context-sensitive coverage and documentation guidance into the order workflow. Around an `order-sign` CDS Hook, a payer service can indicate whether the service appears covered, whether authorisation is required or already satisfied, and what administrative or clinical documentation is expected. CRD informs the work; it does not normally complete the documentation or adjudicate the formal request ([Da Vinci CRD 2.2.1](https://hl7.org/fhir/us/davinci-crd/2.2.1/)).

**Documentation Templates and Rules (DTR)** retrieves the relevant `Questionnaire` package and its computable logic or value sets, then prepopulates answers the EHR can support. A person reviews provenance, confirms answers, and supplies what automation could not. The result can include a `QuestionnaireResponse`. DTR does not itself submit the prior-authorisation request ([Da Vinci DTR 2.2.0](https://hl7.org/fhir/us/davinci-dtr/2.2.0/)).

**Prior Authorization Support (PAS)** packages and submits the formal request and handles its business response. The client posts a FHIR `Bundle`, beginning with the appropriate prior-authorisation `Claim`, to `Claim/$submit`. A successful synchronous HTTP exchange returns a response `Bundle` beginning with `ClaimResponse`; an unprocessable request can instead receive a 4xx response with an `OperationOutcome`. A 2xx response may still say **pended** or **denied**. Transport success and authorisation success are separate propositions ([Da Vinci PAS 2.2.1 specification](https://hl7.org/fhir/us/davinci-pas/2.2.1/en/specification.html)).

If the first business response is pended, the initial HTTP request is over. A submitting client waiting for the final result uses the guide’s subscription pattern; inquiry is not a substitute for that waiting client. If more clinical information is requested, PAS can convey a `Task`, with the later evidence flow involving DTR and the Da Vinci Clinical Data Exchange attachment pattern where appropriate. The public interface calls this simply **More information requested**; the Architect inspector preserves the less simple truth ([PAS additional-information workflow](https://hl7.org/fhir/us/davinci-pas/2.2.1/en/additionalinfo.html)).

When DTR runs as an external application, **SMART App Launch** can provide application authorisation and EHR, user, and patient context. SMART is the launch and access framework, not a prior-authorisation protocol ([SMART App Launch](https://hl7.org/fhir/smart-app-launch/)).

This distinction matters because a neat chain of acronyms can otherwise become a false assembly line. CRD discovers. DTR assembles and reviews documentation. PAS submits and manages the business request. The Patient Access, Provider Access, and Payer-to-Payer APIs are adjacent CMS information-access obligations; they are not extra stops inserted between those three.

## 5. Follow the synthetic MRI request

The primary display has twelve stable conceptual states. Its underlying ledger contains smaller actions, but those actions must map back to these visible milestones rather than creating a second secret story.

1. **MRI ordered.** The draft `ServiceRequest` and active `Coverage` exist. Maya’s elapsed clock starts.
2. **Coverage requirements checked.** The portal route searches and transcribes; the FHIR route can request coverage guidance in context.
3. **Documentation requirements received.** The same fictional four-part evidence rule becomes visible through different plumbing.
4. **Supporting evidence gathered.** Structured facts can be carried; the narrative-only fact still needs a person.
5. **Human review completed.** A clinician confirms provenance, completes the attestation, and takes responsibility for the submitted answer.
6. **Authorisation request submitted.** Portal fields and attachments, or a PAS `Bundle`, leave the provider workflow.
7. **Request technically received.** This is an acknowledgement of a processable transaction, not an approval. **HTTP 200 is not approval.**
8. **Payer review.** The business question is evaluated against the same fictional policy in both pathways.
9. **More information requested.** This optional branch makes a missing or insufficient fact visible.
10. **Request supplemented or resubmitted.** One bounded additional-information cycle adds evidence without inventing it.
11. **Decision issued.** The business result may be approved, denied, or approved with an expiry condition.
12. **Scheduled and scan received.** Scheduling may begin as authorised only after approval; the appointment must also fall within the modelled validity period. **Approved is not performed.**

The Patient lens translates each state into certainty and consequence. The Clinician lens identifies what appeared inside the EHR, what was prepopulated, what required review, and which interruption generated work. The Architect lens opens the `Patient`, `Coverage`, `ServiceRequest`, `QuestionnaireResponse`, PAS `Bundle`, `ClaimResponse`, `Task`, `OperationOutcome`, and `Appointment` fragments involved at that point.

Those resource chips are not decorative technical prestige. They answer concrete questions: Which patient and coverage identifiers survived the handoff? Which answer came from structured evidence, and which was attested by a person? Was the request technically rejected, accepted but pended, or finally denied? Did the approval still exist on the appointment date?

The route selector, milestone controls, failure selector, and perspective selector always compile or reveal a declared ledger state. Changing playback speed changes only how quickly the page reveals it. It cannot alter the clocks, evidence, or ending.

## 6. What the 2026 and 2027 requirements actually say

CMS-0057-F is a final rule, published at 89 FR 8758 on 8 February 2024 and effective on 8 April 2024. Its affected categories include Medicare Advantage organisations; state Medicaid and CHIP fee-for-service programmes; Medicaid and CHIP managed-care entities; and individual-market qualified health plan issuers on Federally Facilitated Exchanges, subject to the scope qualifications in the rule. The prior-authorisation provisions discussed here concern **non-drug medical items and services**, not a general mandate for drug prior authorisation ([final rule](https://www.federalregister.gov/documents/2024/02/08/2024-00895/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-advancing-interoperability)).

Operational compliance provisions begin in **2026**. They include a specific denial-reason requirement for all impacted payers, along with specified decision-timeframe and public-metrics provisions. The new 72-hour expedited and seven-calendar-day standard limits apply to specified impacted payers, but the rule excludes QHP issuers on FFEs from that new decision-time provision. “Everyone must decide in seven days” is therefore an attractive but inaccurate summary ([CMS final-rule fact sheet](https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-prior-authorization-final-rule-cms-0057-f)).

Compliance dates for the new and enhanced APIs begin primarily on **1 January 2027**. “Beginning” matters because payer type, plan year, and rating period affect the applicable date. The payer has to make the Prior Authorization API available; CMS-0057-F does not compel every clinician or EHR to use it. Nor does the rule require a real-time decision, automatic approval, a universal gold-card programme, abolition of portal/fax/telephone routes, or one universal authorisation-validity period ([CMS Prior Authorization API FAQ](https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/frequently-asked-questions/prior-authorization-api)).

The rule establishes a FHIR-based technical baseline. CMS strongly recommends applicable implementation guides, but CMS-0057-F does **not** currently mandate CRD, DTR, and PAS by name. The difference between required capability and recommended implementation pattern is architectural, contractual, and legal—not pedantry ([CMS standards and implementation-guides FAQ](https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/standards-implementation-guides)).

<StandardsManifest />

CMS-0062-P would change parts of this landscape, but it remained a **proposed rule**, not current final law, on the verification date. Its proposed drug provisions, QHP changes, measures, and implementation-guide requirements are not silently imported into this model ([CMS-0062-P proposal](https://www.federalregister.gov/documents/2026/04/14/2026-07205/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-interoperability-standards)).

## 7. What broke

The baseline is only half an explanation. The four public failures recompile the same case and preserve every unaffected event before the break. Each records what failed, what the system did, what Maya experienced, and the next honest action.

### Identity mismatch

A coverage or demographic identifier does not support a safe join to the evidence record. The correct result is not a clever guess. The system stops the automated association, creates a human reconciliation task, and advances Maya’s elapsed clock while a person checks the discrepancy. Sometimes **not enough evidence to match** is the safest successful behaviour.

FHIR can carry identifiers consistently; it cannot decree that two uncertain records represent the same person. This failure can affect portal/fax and FHIR-enabled pathways alike.

### Narrative-only evidence

The ordinary baseline already includes one fact that DTR cannot prepopulate and a human can find. The failure is deliberately worse: the fact remains in prose, but its usable provenance or supporting attachment is missing from the request. Prepopulation stops short without crashing. A clinician must locate, review, attach, or attest to the evidence permitted by the fictional policy, and the request waits.

**FHIR can move a fact. It cannot manufacture the missing one.** A standardised envelope does not turn unverified prose into an admissible structured answer.

### Syntactically valid, clinically insufficient

The PAS package passes structural intake. The HTTP exchange succeeds, and the returned `ClaimResponse` says the business request is pended because the evidence does not support a decision. That is a green transport check followed by a separate evidence problem—not a green approval badge.

The fixture permits one bounded more-information cycle. A `Task` identifies the requested evidence; the clinical team supplements the request; the payer then issues the fixture’s final business denial because the available evidence remains insufficient under the fictional rule. A valid FHIR message can therefore end in a valid denial. The API answered. The decision did not—until a later business event did.

### Authorisation expires before scheduling

The payer approves with a declared validity interval. The first available imaging appointment falls after that interval. At the modelled expiry point, the approval changes to expired before the scan; the interface cannot continue displaying a stale green state simply because it was once true.

The next action is a new or updated authorisation workflow under the fictional rules, not quiet reuse of the expired decision. Standardised transport cannot create scanner capacity, and approval does not reserve an appointment.

Together these failures separate three statuses that dashboards often collapse: **technical status** (could the exchange be processed?), **business status** (approved, pended, denied, or more information needed?), and **authorisation status** (currently valid, expired, or not granted?). A fourth field records the eventual patient outcome. “Request received”, “authorised”, and “scan received” are not synonyms.

## 8. What FHIR can and cannot do

FHIR can give systems a shared resource grammar. CRD can return requirements in clinical context. DTR can make a questionnaire and answer provenance inspectable. PAS can package a request and separate technical errors from business responses. Common structures can reduce bespoke mapping, re-keying, and uncertainty about what a message means on the wire.

That is valuable. It is also bounded.

FHIR cannot decide whether a coverage policy is wise or even unambiguous. It cannot invent a missing clinical fact, make an unsafe identity match safe, compel a clinician to trust stale coverage information, guarantee that a denial reason is operationally useful, force an organisation to adopt an optional workflow, or make an imaging slot appear before an approval expires.

The distinction is familiar from [FHIR and the Clerk With the Clipboard](/blog/healthcare-it/fhir-the-universal-language-of-health-data): a shared grammar improves exchange without settling every question of identity, terminology, governance, provenance, and workflow. It is also part of [The Shadow Architecture of Healthcare Data](/blog/healthcare-it/explaining-the-healthcare-it-gap-as-continuity): the spreadsheet, inbox, phone call, local translation, and exception queue are not outside the architecture merely because the official diagram forgot to draw them.

The controlled comparison above therefore asks a narrower question: with the same case, policy, evidence, and imaging calendar, what changes when discovery, prepopulation, packaging, and transport use a FHIR-enabled route? The answer may be less re-keying and less active human work. It is not guaranteed approval, clinical sufficiency, or an earlier appointment.

## 9. Implementation traps

The route through the happy path is short enough to fit on a slide. The work lives in the conditions around it.

- **Stale coverage assertions.** Coverage can change between discovery, submission, decision, and service. Cache age and provenance need to be visible.
- **Patient and coverage identity.** A request must preserve identifiers across EHR, payer, intermediary, and evidence sources without inventing certainty when a match is weak.
- **Terminology and licensing.** A syntactically valid code can still have the wrong meaning, version, or licence. This essay uses generic displays rather than reproducing a proprietary payer manual.
- **Questionnaire version and effective period.** A completed response is not automatically valid against a later questionnaire or policy revision.
- **Partial prepopulation.** “Some answers found” must not become “form complete”. Provenance and human confirmation remain first-class.
- **Duplicate submission after uncertainty.** A lost response or outcome-unknown state needs durable identifiers and safe recovery. Blindly posting again may create two live requests.
- **`OperationOutcome` versus `ClaimResponse`.** The first describes technical processing issues; the second carries the business response. A 4xx can return an `OperationOutcome`, while software should not assume every server-side 5xx will provide a useful one ([PAS response semantics](https://hl7.org/fhir/us/davinci-pas/2.2.1/en/specification.html)).
- **Pended is not asynchronous HTTP.** The synchronous PAS submission has completed. The business case continues through the specified follow-up workflow.
- **Validity versus appointment date.** An approval must be evaluated at scheduling and service time, not stored forever as an undated boolean.
- **Workflow ownership.** Every exception needs an accountable queue, a due condition, and a way back into the clinical workflow. An API without exception ownership can digitise abandonment very efficiently.

The Architect lens exposes these traps without asking the Patient lens to speak in resource names. Good abstraction hides irrelevant mechanics; it does not hide the state that determines whether Maya gets the scan.

## 10. Methods and limits

This is a deterministic explanatory model, versioned and compiled from a small synthetic fixture. The case, policy, payer, evidence, identifiers, routes, durations, and outcomes are authored. Replaying the same allowlisted input returns the same ordered events and clock totals. There is no random seed because no randomness is needed.

The portal/fax and FHIR-enabled routes share one immutable case and one immutable decision policy. They differ only in declared discovery, re-keying, prepopulation, handoff, packaging, transport, inbox, and rework assumptions. This is a controlled counterfactual inside the model, not an observational comparison of organisations or patients.

The downloadable examples are small synthetic FHIR R4 fragments intended to make the architecture inspectable. They are not a conformance test suite, production payload, payer companion guide, or claim that every implementation must use the same optional choices. The page makes no runtime call to a payer, EHR, CMS, HL7, FHIR server, or artificial-intelligence service; it accepts no patient information.

The timings are illustrative assumptions, not measured averages or performance benchmarks. The 400-ms event and eleven-day journey are exact only within the canonical fixture. No confidence interval is shown because no population was sampled. The compiler therefore checks those two authored constants with exact equality, not an arbitrary ± margin. Browser rendering, interaction latency, bundle size, and other measured implementation behaviour are different: verification allows declared tolerances and engineering headroom because devices and measurement conditions vary. The comparison does not estimate a national effect, and its deltas must not be quoted as the expected benefit of FHIR.

This essay is not legal advice, a medical recommendation, a payer guarantee, or a substitute for the current rule, implementation guide, contract, and companion-guide review required by a real programme. Standards and regulations change; the manifest was checked on **9 August 2026**.

### Primary references checked

- [CMS-0057-F final-rule page](https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-prior-authorization-final-rule-cms-0057-f), [fact sheet](https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-prior-authorization-final-rule-cms-0057-f), and [89 FR 8758](https://www.federalregister.gov/documents/2024/02/08/2024-00895/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-advancing-interoperability)
- [CMS Prior Authorization API FAQ](https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/frequently-asked-questions/prior-authorization-api), [standards FAQ](https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/standards-implementation-guides), and [X12 enforcement-discretion FAQ](https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/hipaa-transaction-enforcement-discretion)
- [FHIR R4 permanent publication](https://hl7.org/fhir/R4/), [CRD 2.2.1](https://hl7.org/fhir/us/davinci-crd/2.2.1/), [DTR 2.2.0](https://hl7.org/fhir/us/davinci-dtr/2.2.0/), and [PAS 2.2.1](https://hl7.org/fhir/us/davinci-pas/2.2.1/)
- [SMART App Launch](https://hl7.org/fhir/smart-app-launch/) and the versioned [PAS additional-information specification](https://hl7.org/fhir/us/davinci-pas/2.2.1/en/additionalinfo.html)

## 11. A quiet next step

Building or reviewing an electronic prior-authorisation workflow? [I offer a fixed-scope independent review of the integration, its evidence flow, and its highest-risk assumptions](/consulting).

The useful question is not whether the diagram contains FHIR. It is whether the evidence, identifiers, business states, expiry rules, and exception queues remain honest when Maya reaches the part of the machine that is least convenient to demonstrate.
