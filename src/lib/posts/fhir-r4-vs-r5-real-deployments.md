---
title: "FHIR R4 vs R5 in Production"
description: "A system-level analysis of HL7 Fast Healthcare Interoperability Resources Release 4 and Release 5, focused on what materially changes production interoperability layers, event architectures, conformance strategy, and clinical data platform design."
date: "2026-04-23"
category: "healthcare-it"
published: true
color: "blue"
---

<TTS />

The practical question is not whether FHIR Release 5 is better than Release 4. It is. The practical question is whether its improvements are important enough, stable enough, and adopted enough to justify changing a working production architecture that is already carrying clinical data, payer data, regulatory APIs, analytics extracts, consent signals, and the usual heap of local compensations that nobody put on the brochure.

That is where the real answer starts.

Release 4, in practice usually meaning R4 plus the operating habits that grew around it, is still the center of gravity for deployed interoperability. Release 4.0.1 is a mixed normative and Standard for Trial Use release. Release 5.0.0 is the current published version, but it is still a Standard for Trial Use release, not a fully normative replacement. HL7’s own versioning guidance also makes the market reality plain enough: R4B exists as version 4.3.0 with only STU changes, and HL7 explicitly notes that it is unclear how quickly R5 will be adopted. That is not a footnote. That is the architectural backdrop. 

So the first production conclusion is blunt. If you are building a national or regional exchange, a certified API surface, a payer-provider interchange layer, an electronic health record gateway, or a clinical data acquisition tier that must interoperate broadly today, R4 remains the compatibility language. If you are building an internal platform, a conformance pipeline, a knowledge-artifact supply chain, or an event-driven architecture that you control end to end, R5 becomes much more interesting much more quickly. The divide is not philosophical. It is ecosystem exposure.

The second conclusion is even less glamorous. Most organizations are not really running “FHIR architectures.” They are running translation architectures with a FHIR boundary. HL7 v2 admission, discharge, transfer traffic still drives operational workflow. Clinical Document Architecture documents still appear where summaries, quality programs, or institutional habits demand them. Research and quality ecosystems carry their own representational assumptions. FHIR sits in the middle as the clean shirt you put on the data before taking it outside. That means the value of R5 depends less on its elegance than on whether it reduces translation loss, reduces profile sprawl, improves event semantics, or lowers the cost of governing canonical models.

That is the bar.

At the system level, R4’s great achievement was not novelty. It was the creation of a sufficiently stable substrate around which real ecosystems could standardize. US Core remained R4-based across its published versions, including later ones; CDS Hooks remained based on R4 as well. Production architects should notice what that means. The constraint is not merely that vendors move slowly. The constraint is that once implementation guides, test harnesses, certification programs, inferencing logic, access-control rules, and consumer apps settle on a release, the cost of moving is not schema migration alone. It is ecosystem coordination. 

That is why many FHIR programs fail by asking the wrong question. They ask, “What new resources did R5 add?” when the useful question is, “What parts of my platform become structurally simpler, safer, or more governable if I model in R5 even while publishing in R4?” Those are not the same thing.

What materially changes in R5 begins with conformance and computable governance, not with patient demographics or a few renamed elements. R5 introduces a more explicit architecture for specification artifacts. CanonicalResource becomes a formal interface for conformance and knowledge artifacts with shared metadata conventions such as canonical URL, version, and publication status. It is implemented by resources including CapabilityStatement, StructureDefinition, ImplementationGuide, Requirements, SearchParameter, Questionnaire, SubscriptionTopic, and others. That sounds abstract until you have had to govern hundreds of profiles, value sets, search parameters, and implementation guide dependencies across multiple teams. Then it stops being abstract very quickly. 

In R4, many organizations built governance around spreadsheets, wiki pages, and validator configurations because the standard gave them enough to publish artifacts but less help in expressing requirement traceability and actor obligations in a computable way. R5 moves that work inward. ActorDefinition describes the role of an application or human participant in data exchange, and Requirements provides a structured way to document regulatory, business, functional, and technical requirements, with traceability to the artifacts that satisfy them. This matters a great deal in large delivery systems, payer-provider networks, and research collaborations where the expensive part is not serializing a Patient resource but proving why a profile exists, which actors must implement it, and which requirement it satisfies. 

That is a production-level gain, though not an immediately visible one. It changes platform operating model more than transaction payload. Teams that maintain internal implementation guides, local accelerators, or enterprise profile registries can use R5 to collapse part of the gap between design governance and runtime conformance. It will not remove governance work. Nothing will. But it allows more of that work to be represented inside the same ecosystem as the exchange artifacts themselves.

The next material change is eventing. R4 subscriptions were useful, but also undercooked enough that many architects treated them with caution and drifted toward vendor webhooks, message brokers, or custom change-data-capture patterns. R5 reworks the subscriptions framework substantially. A Subscription is now tied to a SubscriptionTopic; topics can cover multiple resource types and define filters; channel guidance is clearer; and the framework explicitly contemplates REST hooks, websockets, FHIR messaging, email, and custom channels, including message queues and cloud-specific protocols. HL7’s own release history calls subscriptions a “complete rework.” 

For production architecture, that matters more than many of the headline resource additions. Healthcare data platforms increasingly need near-real-time event flows for prior authorization state changes, public health notifications, inbox work queues, patient-generated data ingestion, and operational triggers. But healthcare eventing is a swamp. Some consumers need durable delivery. Some need low latency. Some need replay. Some live behind brittle firewalls. Some can receive an HTTPS callback; many cannot. R5 does not magically solve those problems. It does, however, provide a much saner canonical model for modeling topic-based notification intent.

That changes design options in a meaningful way. An R5-native event layer can define enterprise topics once, map them to internal broker infrastructure, expose REST hooks where appropriate, websockets where clients cannot host endpoints, and custom channels where guaranteed delivery matters. You still need Kafka, a queue, or an equivalent durable event fabric if the business requires reliable delivery. R5 explicitly leaves room for that. The point is not that FHIR replaces enterprise messaging. The point is that R5 lets the semantic contract for notifications become cleaner and less ad hoc. 

The third materially important change is representational flexibility, especially through CodeableReference. In R5, CodeableReference allows an element to point either to a concept in terminology or to a concrete resource instance. HL7 describes it plainly: a reference to a resource by instance, or instead a reference to a concept defined in a terminology or ontology by class. This is one of those changes that looks small until you have lived through years of awkward profile design around whether a field should contain a code, a reference, or a choice type that creates downstream misery. 

In clinical platforms, this matters because real healthcare records often oscillate between intent-level semantics and instance-level semantics. Sometimes a record means “this class of medication,” not “this exact Medication resource.” Sometimes it means “this kind of condition,” not “this previously instantiated Condition.” In R4, representing that ambiguity often pushed profile authors into extensions, local conventions, or annoying polymorphism that increased mapping burden. In R5, many resources can model that duality more directly.

But here is the caution, and it is not small. CodeableReference itself is still draft in R5. Some resources already use it, and the R5 diff pages show concrete changes such as DeviceRequest moving from code[x] to code with CodeableReference. That can simplify authoring and interpretation, but it also creates a migration and tooling problem because you are trading familiar R4 patterns for a newer datatype with uneven downstream support. If your platform relies on generated classes, search indexes, analytics flattening, or profile-specific ETL, that datatype change is not just a model improvement. It is a real refactoring event. 

This is where production realism matters. More expressive datatypes are not automatically a net gain if your surrounding stack cannot validate, store, index, query, and transform them without custom work. In many organizations, the narrowest pipe is not the FHIR server. It is the analytics warehouse, the terminology service, the search layer, or the contract-testing pipeline.

R5 also adds and reshapes resources that matter for longitudinal and operational modeling. EncounterHistory, for example, did not exist in R4. That is not trivia. Encounter in real production systems is overloaded shamelessly. People want it to be a visit shell, a billing event, a workflow container, a location tracker, a status timeline, and a legal boundary all at once. R5’s introduction of EncounterHistory acknowledges, in a rather polite standards way, that shoving the entire historical state progression into Encounter was not ideal. 

For clinical data platforms, that is useful because encounter state changes are analytically and operationally important. Bed assignment, arrival, in-progress, discharged, cancelled, transferred, on leave, and a dozen local variants all matter. Separating historical milestones from the core encounter record can improve change capture, auditability, and temporal analytics. It also maps better to event-driven storage patterns. Yet again the caution is practical: once you adopt the cleaner model internally, you may still need to publish back into R4 Encounter shapes for external consumers. The standard got cleaner. Your integration burden may not.

DeviceAssociation is another example of R5 acknowledging a modeling seam that mattered in practice: the relationship between a device and a subject or operator. If you are building device-heavy workflows, inpatient telemetry, implant tracking, or home monitoring pipelines, that additional specificity helps. If you are not, it does not move the architecture much. Not every new resource deserves equal emotional investment. 

Search and exchange behavior are less dramatically transformed than many people hope. R5 does improve and formalize pieces around operations, artifact packaging, and conformance metadata, but it does not abolish the hard parts of production search. Token normalization, chained search cost, compartment-based authorization, terminology expansion latency, include explosion, and denormalized indexing remain your problem. FHIR search is not a data platform query language. It is an interoperability query contract. Confusing those two is how teams build APIs that are technically conformant and operationally miserable.

That distinction becomes sharper, not softer, when comparing R4 and R5. R5 gives you better tools for conformance assets and some cleaner modeling constructs. It does not turn a transactional FHIR repository into a longitudinal analytics store. Clinical data platforms still need separation of concerns: ingest layer, identity layer, terminology normalization, event/log layer, canonical persistence, serving APIs, and analytical marts. The temptation to use one FHIR store as the entire architecture remains as dangerous in R5 as it was in R4.

Where R5 does help clinical data platforms is in making the conformance estate more computable and the event semantics more disciplined. That is useful for organizations trying to run internal platform engineering, not merely endpoint exchange. A mature platform can model enterprise requirements in Requirements, actor responsibilities in ActorDefinition, canonical artifacts under a more coherent metadata interface, and enterprise events with SubscriptionTopic-backed semantics. That combination supports something healthcare IT has historically done badly: traceable platform governance that is not entirely trapped in prose documents.

Now the failure points.

The first is ecosystem lag. External partners, certification programs, and national guides do not move because your internal architecture wants elegance. They move when governance, regulation, vendor roadmaps, and testing ecosystems align. That alignment is usually slow because the blast radius is large. A hospital or payer can survive ugly profile conventions much longer than it can survive breaking its partner network.

The second is cross-version burden. HL7 provides version-management policy, conversion guidance, and extension strategies for inter-version differences. That helps. It does not make cross-version transformation free. Every mixed-version environment eventually invents a translation boundary, whether it calls it that or not. You can push R5 inward and keep R4 outward, but then you own the semantic impedance mismatch and its test coverage. HL7’s own guidance points implementers to CapabilityStatement, MIME type parameters, and meta.profile as ways to identify version context. That is helpful but also revealing: version remains operational state you must manage explicitly. 

The third is tooling asymmetry. Even when the specification is cleaner, validator behavior, package management, code generation, search implementation, profile publishing, and downstream SDK support may still be stronger around R4 because the ecosystem has simply had longer to harden. Standards do not arrive in production as documents. They arrive as validators, package registries, inferencing engines, synthetic data sets, SDKs, reference servers, test suites, and contract failures at two in the morning.

The fourth is organizational semantics. More expressive resources do not rescue weak governance. If your enterprise cannot decide whether “problem list,” “encounter diagnosis,” and “billing diagnosis” are three views of one thing or three distinct business objects, no release of FHIR will save you. What gets labeled interoperability failure is often ungoverned local ontology colliding with someone else’s ungoverned local ontology.

That is the deeper truth underneath the version comparison.

R4 succeeded because it froze enough of the surface area for the industry to coordinate. R5 is valuable because it pushes FHIR from being only an exchange syntax toward being a more self-describing architecture for conformance, requirements traceability, and event semantics. Those are real gains. They are also the kind of gains that matter most to organizations sophisticated enough to run platform governance as an engineering discipline rather than as a side effect of interface development.

So what should production architects do.

Keep external exchange surfaces on R4 unless there is a concrete and defensible reason not to. That still maximizes interoperability reach.

Use R4B where its STU changes help and where your stack supports it, but do not confuse that with a broad ecosystem move to R5. HL7 classifies R4B as 4.3.0 with STU-only changes, which is precisely why it has been attractive as a conservative increment. 

Evaluate R5 first for internal architecture, not public endpoints. The strongest early candidates are artifact governance, requirement traceability, and eventing. If you run a large interoperability platform, these may produce more value than new clinical resource details.

Adopt R5-native modeling selectively where it removes persistent pain. SubscriptionTopic is a serious candidate. Requirements and ActorDefinition are serious candidates for implementation-guide-heavy enterprises. CodeableReference is a candidate only where its representational gain clearly outweighs tooling disruption.

Design an explicit version mediation layer. Do not pretend version coexistence will be temporary. Assume it will be a medium-term operating reality. Build transformation, validation, and regression testing accordingly.

Keep your canonical platform model distinct from your exchange contract. Sometimes that canonical model will be FHIR-shaped. Sometimes it should not be. A clinical data platform exists to preserve meaning, lineage, temporal behavior, and analytical usability under constraint. It is not morally obliged to mirror the wire format everywhere.

And above all, resist the oldest mistake in healthcare interoperability: mistaking a release upgrade for semantic progress. The difficult part is still not serialization. It is agreeing what the data means, when it is authoritative, which actor is accountable, what temporal state it represents, and how much distortion you can tolerate when one system says more, less, or something subtly different than another.

R5 improves the machinery around that problem.

It does not repeal the problem.
