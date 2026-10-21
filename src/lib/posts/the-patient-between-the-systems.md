---
title: "The Patient Between the Systems"
seoTitle: "OpenHIE Explained: The Patient Between the Systems"
description: "An interactive OpenHIE instrument follows a fictional patient's information through identity, terminology, permissions and a shared health record."
date: "2026-10-22"
thumbnail: "/images/visualizations/openhie/openhie-social.png"
thumbnailAlt: "A dimensional exchange instrument with an identity indexing drum, terminology reference wheel, routing turntable and shared-record archive"
category: "Visualizations"
tags: ["Healthcare", "OpenHIE", "Health Information Exchange", "Interoperability", "Healthcare IT", "FHIR", "Systems Architecture", "Data Quality", "Patient Identity", "Data Provenance"]
pinnedTags: ["Healthcare", "OpenHIE", "Health Information Exchange", "Interoperability", "Healthcare IT", "FHIR", "Systems Architecture", "Data Quality", "Patient Identity", "Data Provenance"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#427B80"
author: "Suvro Ghosh"
readingTime: "10 min"
inPlainEnglish: "Sharing a health record requires systems to agree whose record it is, what its contents mean, where it came from and who may use it. This synthetic OpenHIE instrument makes those separate responsibilities visible, including the moments when an honest system must stop."
keyTerms: ["OpenHIE", "Client Registry", "Interoperability Layer", "Terminology Service", "Shared Health Record", "Identity resolution", "Provenance", "Idempotency"]
faq:
  - question: "Is OpenHIE a single application or database?"
    answer: "OpenHIE describes an architecture and exchange patterns built from distinct responsibilities. Implementations choose and configure components for their setting; this instrument is a simplified educational model of selected responsibilities."
  - question: "Does every OpenHIE transaction visit every registry?"
    answer: "No. The services involved depend on the workflow and its prerequisites. The instrument shows a deliberately selected journey, rather than a mandatory sequence for every implementation."
  - question: "Does a successful technical response prove that the clinical information is usable?"
    answer: "It proves only the success defined by that technical interaction. Identity, meaning, permissions, context, persistence and the receiving workflow need their own evidence."
  - question: "Is the instrument a working OpenHIE deployment?"
    answer: "No. It is a deterministic browser-local teaching model using synthetic information. Its simplified exchange payloads are illustrative, and it does not establish protocol conformance, clinical safety or real service performance."
---

<script>
	import OpenHIE from '$lib/components/visualizations/openhie/OpenHIE.svelte';
</script>

The patient arrives at the clinic as one person. Her information arrives as several identifiers, a local code, a timestamp, an attachment, and a collection of institutional assumptions. Somewhere between those two arrivals, architecture acquires consequences. This instrument opens that middle space and lets us watch the responsibilities move.

<OpenHIE />

<TTS />

<noscript>
	<figure>
		<img
			src="/images/visualizations/openhie/openhie-social.png"
			alt="A dimensional exchange instrument with an identity indexing drum, terminology reference wheel, routing turntable and shared-record archive"
			width="1200"
			height="630"
			loading="eager"
			decoding="async"
		/>
		<figcaption>
			The interactive instrument requires JavaScript. The essay below explains the same
			selected OpenHIE responsibilities, synthetic scenarios and limits without scripts.
		</figcaption>
	</figure>
</noscript>

## Begin with the person

Follow Asha from Clinic A to a district laboratory and onward to Hospital B. Everything about this case is synthetic. The encounter and laboratory result begin in separate local registers. The question is whether the next person involved in her care can find and use the information that belongs to her.

The instrument gives that question several mechanisms. An indexing drum resolves identity. A reference wheel checks terminology. An archive holds the shareable clinical record. A routing turntable coordinates the exchange. These are teaching metaphors, made deliberately inspectable. The actual systems exchange messages and maintain records; they do not turn brass wheels beneath a hospital.

Change the scenario and watch where its certainty ends. Each moving part has to answer a question and explain what causes the next event.

## A diagram acquires an institution

[OpenHIE describes a pattern for health information exchange](https://guides.ohie.org/arch-spec/architecture-specification), with a logical architecture that implementations make more specific. Buying a product with a reassuring name leaves much of that specification work ahead.

Its separation of responsibilities follows ordinary questions: who received care, who provided it, where it happened, and what happened. A Client Registry concerns patient identity. Facility and Health Worker Registries concern the places and people providing services. Terminology Services concern shared definitions. A Shared Health Record supports clinical information exchange. The [architecture overview](https://guides.ohie.org/arch-spec/architecture-specification/overview-of-the-architecture) situates these alongside other business services.

The questions sound small until two institutions answer them differently. One hospital's facility code may identify a campus; another's may identify a consulting room. A provider identifier may persist while the person's employment and authority change. A patient can acquire a new local registration without acquiring a new life.

Architecture makes those differences explicit enough to govern. The meeting about identifiers is consequently part of the patient pathway, even when the patient has wisely declined to attend it.

## The indexing drum asks whose story this is

A local patient number has meaning inside an assigning organisation. Carrying the characters elsewhere does not automatically carry that authority. The receiving system needs the identifier's source and a defensible relationship to the person it already knows.

OpenHIE's [Client Registry specification](https://guides.ohie.org/arch-spec/openhie-component-specifications-1/client-registry) addresses identity across fragmented systems, including linking and deduplication. Matching rules and human review belong to that operational problem.

The instrument's ambiguous-identity scenario stops the association. Two plausible candidates remain two candidates. It does not reward us with a confident patient merely because a match would keep the animation moving.

The consequence is inconvenient: someone must reconcile the uncertainty, and the person's usable history remains incomplete meanwhile. Guessing can be more convenient for the interface and much less convenient for the person whose allergy has just been borrowed from somebody else.

This is a choice about evidence and accountability. A matching score is evidence produced under rules. Its attractive decimal places cannot accept responsibility for the resulting link.

## The reference wheel asks what survived translation

Suppose a laboratory sends a local test code and a value. The bytes arrive intact. A receiving clinician still needs to know which test, which specimen, which unit, which method or qualification matters, and what status the result has acquired.

The [Terminology Service](https://guides.ohie.org/arch-spec/openhie-component-specifications-1/openhie-terminology-service-ts) supplies shared code systems, definitions, value sets and mappings. Code existence, membership and translation are distinct operations. Their answers depend on the relevant terminology and version.

In the terminology-failure scenario, the model withholds a usable mapping instead of selecting a friendly-looking word. A reference wheel can align what it has been taught. It cannot discover an undocumented laboratory convention by looking industrious.

Even a valid mapping leaves clinical context to preserve. A corrected result needs its correction history. A measurement needs its unit. A narrative qualification may matter more than the neat numeric field beside it. Semantic work requires someone to say which distinctions must survive, then verify that they survived.

Calling this data cleaning suggests that someone with a spreadsheet can finish it before lunch. The harder task is agreeing what the data is allowed to mean.

## The archive keeps context as well as content

The [Shared Health Record specification](https://guides.ohie.org/arch-spec/openhie-component-specifications-1/openhie-shared-health-record-shr) describes selected normalised patient information shared across authorised systems. It distinguishes this operational record from a data warehouse and includes preserving submission context and record versions among its recommendations.

That boundary matters. The record used to continue care, the local application used to deliver care, and the analytical model used to count care have different jobs. They may share facts while requiring different representations and controls.

Time is part of the representation. The specimen collection time, the result issue time and the exchange receipt time describe different events. A late-arriving record remains late-arriving; its arrival does not make the clinical event new. A correction arriving today may change our understanding of something that happened yesterday.

FHIR can carry distinctions of this kind. An [Observation](https://hl7.org/fhir/R4/observation.html) has an effective clinical time, an issued time, status and contextual references. This instrument instead uses simplified example records and a fictional teaching vocabulary. It does not implement a complete FHIR resource or certify a conformant exchange.

Keep the source, original identifiers, versions and relevant clocks close to the fact. Otherwise a well-travelled value can arrive with excellent posture and no recoverable biography.

## The turntable coordinates work

The [Interoperability Layer](https://guides.ohie.org/arch-spec/openhie-component-specifications-1/openhie-interoperability-layer-iol) provides the exchange entry point, routing, security and audit responsibilities. Its orchestration can consult other services to complete a transaction. The services consulted depend on the selected workflow and its prerequisites.

The instrument therefore uses the turntable as a coordinator. Registry lookups return information to the exchange; they are not hospital departments through which a patient must physically travel. A future deployment may arrange software and infrastructure quite differently while retaining those responsibilities.

Its permission-denied scenario is separate from an unavailable service. The first says that this attempted access is disallowed under the model's declared policy. The second says that an operation cannot currently complete. Waiting longer cannot confer permission, and a permissive policy cannot restore a failed connection.

Likewise, technical receipt and a completed clinical handoff need separate evidence. A receiver can acknowledge a message while later work remains unresolved. Someone must define what each acknowledgement promises. Otherwise the green dashboard becomes a rather expensive way to say that a different department now owns the problem.

## Six experiments with the same responsibility

The scenarios deliberately separate failure meanings:

1. **Successful exchange:** follow the selected information through its checks and into a usable shared-record outcome. Inspect the evidence behind that conclusion.
2. **Ambiguous identity:** stop at an association the evidence cannot safely establish. Notice what remains unresolved for the patient.
3. **Terminology failure:** preserve the incoming information while refusing an unsupported interpretation. Arrival and usable meaning separate here.
4. **Access denied:** inspect the declared permission boundary. The record's existence does not grant every requester access.
5. **Service outage:** the fixture fails before the write commits. A real timeout may leave persistence unknown and require reconciliation. Unavailable evidence does not establish absence.
6. **Duplicate delivery:** repeat the same logical submission and inspect the resulting clinical-record count. The model's deduplication rule is an explicit design choice; it is not a universal property supplied by OpenHIE's name.

These are authored cases, not measured failure frequencies. The successful run supplies a reference for understanding the changes. It says nothing about how often an actual hospital would experience any of them.

## Three views, one account

The Patient, Clinician and Architect lenses inspect the same underlying snapshot. Changing the lens cannot repair a failed exchange or quietly improve its ending.

For the patient, the useful account concerns what information is available, what remains uncertain and what needs to happen next. For the clinician, it concerns whether the information can be used and where reconciliation or follow-up is required. For the architect, it concerns identifiers, transitions, service responsibilities and the evidence carried across each boundary.

Those perspectives should be able to disagree about priorities without disagreeing about events. If the technical view says completion while the patient view says unresolved, the discrepancy needs explanation in the model. Presentation should never settle it by changing the adjective.

The same principle governs playback. Speed changes the pace of explanation. It cannot change the outcome, create a record or erase an error. A faster animation is a shorter demonstration, with no claim about a faster health service.

## What the instrument leaves outside

This is a small deterministic TypeScript model running locally in the browser. Its people, records, identifiers, policy decisions and service responses are synthetic. It connects to no real exchange, authenticates no clinical user and processes no patient upload.

It models selected OpenHIE responsibilities and a deliberately bounded journey. It does not reproduce a national health system, probabilistic identity engine, terminology server, consent framework, clinical decision support service or standards-conformance test. The permission case expresses one example policy rather than a jurisdiction's law. The outage and duplicate cases express declared application behaviour rather than guarantees about distributed systems in general.

The physical arrangement is also an analogy. Records do not become safer because an archive has convincing drawers. The model earns its explanation through consistent transitions and visible limits; the dimensional drawing helps us inspect them.

What remains outside is the institution that must choose, maintain and answer for the rules. Who owns a disputed identity link? Who approves a changed mapping? Who receives the failure queue after the demonstration ends? Which person notices that a result was delivered but never used?

The patient has already arrived. The architecture's continuing work is to help her information arrive with enough of its meaning, history and authority intact that the next act of care can begin.

## Read alongside

- [HIE from First Principles](/blog/healthcare-it/hie-first-principles-openhie), on the architectural responsibilities beneath the acronyms.
- [Building VA Data Warehouses](/blog/healthcare-it/va_data_warehouse_reality), on grain, chronology and provenance when operational records become analytical memory.
- [The Prior Authorization Machine](/blog/visualizations/the-prior-authorization-machine), on the different clocks inside a patient's administrative journey.

The visual approach was prompted by Better Stack's [introduction to Anatomy](https://youtu.be/lyGYidIZK4I) and the [Anatomy project's physical-mechanism approach](https://github.com/wheresryan22/anatomy). OpenHIE's official specifications supply the architectural reference; this instrument supplies one controlled explanation of it.
