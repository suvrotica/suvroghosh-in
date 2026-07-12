---
title: "FHIR and the Clerk With the Clipboard"
description: "A Calcutta-grounded essay on FHIR, the health data standard that tries to make clinics, labs, apps, and public health systems speak to one another without losing meaning."
date: "2026-06-23"
thumbnail: "/images/IMG-20260427-WA0009.jpg"
category: "Healthcare-IT"
tags: ["Implementation Guides","United States","Cures Act","Blood Pressure","Public Health","FHIR","Health","JSON","Resource","HL7"]
published: true
color: "#0D7377"
---

<TTS />

<Pi src="IMG-20260427-WA0009.jpg" alt="Article illustration for FHIR healthcare data interoperability" />

The clipboard arrives before the doctor.

It is usually a little bent at the corner, with a cheap pen tied to it by a string that has lost faith in human beings. In Calcutta, the form may sit on a counter beside a cracked plastic tray, a bottle of sanitizer, a register with ruled pages, and a printer that makes a noise like it is remembering an older civilization. Name. Age. Address. Phone number. Past illnesses. Allergies. Prior surgery. Family history. The same questions, again.

You answer them because the room asks you to answer them.

The strange thing is not that healthcare needs information. Of course it does. The strange thing is that the information often already exists somewhere else and still cannot arrive where it is needed in a useful form. It is trapped inside another clinic's software, another laboratory's database, another hospital's record system, another portal with another password, another vendor's private understanding of what a human body looks like when flattened into fields.

This is the quiet insult at the center of modern health data. We digitized the chart but did not always liberate the information. We converted paper into screens and then discovered that screens can also become cupboards.

FHIR was created for this cupboard problem.

FHIR, pronounced "fire," stands for Fast Healthcare Interoperability Resources. It is a standard for exchanging healthcare information electronically. More specifically, it is a way for different health systems to describe patients, visits, lab results, diagnoses, allergies, procedures, insurance details, device readings, genomic data, and public health reports in a form that other systems can read without needing a private translator in the back room.

That sounds modest. It is not.

In healthcare IT, getting two systems to agree on meaning can be harder than getting two relatives to agree on property. The first system says "patient." The second system says "member." A third says "subject." One system stores a blood pressure as one combined value. Another splits it into systolic and diastolic parts. One system uses a local code written years ago by someone who has retired. Another uses LOINC, SNOMED CT, ICD-10, or a billing code that means almost the same thing until it suddenly does not.

FHIR tries to say: here is the common grammar. Use this.

## Before FHIR, The Old Pipes

Healthcare data standards did not begin with FHIR.

HL7, or Health Level Seven International, is a not-for-profit standards organization that has been working in this area since 1987. Its earlier workhorse was HL7 v2, a messaging standard from the 1980s that still carries an astonishing amount of clinical information around the world. If a lab result travels from a laboratory system into an electronic health record, there is still a fair chance that HL7 v2 is somewhere in the pipe.

HL7 v2 deserves respect. It worked. It still works. But it is not pleasant company.

It is pipe-delimited, cryptic, and full of optionality. One informatics joke, bitter enough to qualify as operational knowledge, is that HL7 v2 is a standard with thousands of optional fields and too few firm requirements. Two systems can both "support HL7" and still behave like cousins who stopped speaking after a family dispute. The message may be syntactically valid and practically useless.

Then came HL7 v3, released in 2005 after years of effort. It was built around the Reference Information Model, or RIM, a serious attempt to describe healthcare concepts through a rigorous top-down model. Intellectually, it had elegance. Practically, it became too heavy for many implementers. The mappings were complex, the abstractions demanding, and the cost of doing it properly too high for widespread everyday adoption, especially in the United States. It found some use in Europe and Canada, but it did not become the common operating language many had hoped for.

Meanwhile, outside healthcare, the web had learned to move quickly.

HTTP, the protocol your browser uses to request pages, became universal. RESTful APIs became the ordinary way software talked across networks. JSON became the familiar format of modern web development. Smartphones arrived. Developers grew used to building apps that asked a server for data and received something readable, structured, and usable.

Healthcare looked at this world from behind its thick glass wall.

Grahame Grieve, an Australian informaticist and long-time HL7 standards figure, helped lead the move toward a different approach. Instead of another grand, top-down model that demanded reverence before use, FHIR would use the ordinary technologies of the web: HTTP, REST, JSON, XML where needed, OAuth-style authorization, and modular units called resources.

"Fast" was the promise. "Resources" was the design choice. "Interoperability" was the wound it was trying to close.

FHIR was first released in 2014. FHIR R4, published in 2019, became the most widely implemented release. FHIR R5 followed in 2023. The standard keeps evolving because healthcare keeps producing exceptions, and exceptions are what healthcare does almost professionally.

## Resources, Or Small Boxes With Names

The basic unit of FHIR is the resource.

A resource is a structured packet of health information with a known shape. A Patient resource describes demographic and administrative details. An Observation resource describes something observed or measured, such as a lab result or a vital sign. A Condition resource records a diagnosis or problem. An Encounter resource records a visit or contact with care. A Coverage resource can describe insurance information. A DiagnosticReport can gather results into a report. A Bundle can carry a collection of resources together.

Every resource has a `resourceType`, usually an `id`, and a set of elements. The idea is simple: make the pieces small enough to exchange and large enough to mean something.

This is different from shipping an entire medical record as a giant document. A monolithic record is heavy. It is hard to query. It says, in effect, "Here is everything; good luck." FHIR says, "Here is a specific object with a known structure. Ask for what you need."

That modularity matters. A patient-facing app may only need recent lab Observations. A billing system may need Encounter and Coverage information. A public health system may need case reports. A research database may need standardized observations across thousands or millions of people. FHIR lets systems exchange particular pieces without dragging the whole cupboard across the floor.

FHIR usually represents these resources in JSON or XML. JSON, JavaScript Object Notation, is the common format of web APIs. It looks like organized text with braces, colons, names, and values. XML is older and more verbose, but still useful in many enterprise contexts. FHIR also has an RDF representation for semantic web use, though JSON is the everyday workhorse.

The result is not magic. It is a contract. If one system sends an Observation with a LOINC code for a blood pressure panel, another system can understand that it is not merely a random number. It is a measured fact about a particular patient, at a particular time, expressed through a standard vocabulary.

The small box has a name. The name carries meaning.

## The Web, But For Health Data

FHIR works through RESTful APIs. API means application programming interface, a doorway through which one piece of software asks another piece of software for something. REST is an architectural style that uses the ordinary verbs of the web: GET to retrieve, POST to create, PUT to update, DELETE to remove.

If a patient app wants recent lab results, it can send an HTTP request to a FHIR server, perhaps asking for Observations for a particular patient and category. The server can respond with a Bundle containing the matching resources. The app parses the JSON and displays the result.

This is the same basic mental model behind many modern services. The difference is that the stakes are higher, the privacy rules are sharper, and the data is messier than a shopping cart or a weather forecast.

FHIR inherits the strengths of the web. HTTP is ubiquitous. HTTPS, meaning HTTP over TLS, encrypts data in transit. JSON is familiar to developers. REST makes the interaction pattern easier to learn. A developer who has built a normal web service is no longer forced to enter healthcare through a narrow gate guarded by ancient message formats.

This lowering of the barrier is one of FHIR's quiet achievements. It does not make healthcare simple. Nothing does. But it makes health data less exotic to the software world.

SMART on FHIR adds the authorization layer many real systems need. SMART stands for Substitutable Medical Applications, Reusable Technologies. It defines how apps can connect to FHIR systems using OAuth 2.0, the authorization framework familiar from "log in with Google" or "allow this app to access that account" patterns. In healthcare, the rules must be stricter because the data is sensitive and governed by laws such as HIPAA in the United States.

The ordinary idea is this: an app asks for access, the person signs in, the system grants a limited token, and the app can only see what it has permission to see. It is not perfect. No security model is. But it gives FHIR a practical way to support patient-facing and clinician-facing apps without turning every connection into a custom negotiation.

## Profiles, Extensions, And The Local Argument

Healthcare refuses uniformity.

A pediatric hospital does not have the same needs as an oncology center. A national health service does not look like a fragmented insurance market. A research study may need a very specific field that an ordinary clinic never captures. A country may require particular demographic fields for reporting. A vendor may support one set of operations and not another.

FHIR handles this through profiles and extensions.

A profile is a constrained version of a resource for a specific use case. It can say which fields are required, which codes are allowed, and which rules a system must follow. US Core, for example, defines profiles used in the United States and has become central to many regulatory and patient access requirements.

An extension is a formal way to add information that the base resource does not include. This is safer than letting every vendor invent private fields in a dark corner. A proper FHIR extension has an identity and a structure. It can be documented, validated, and reused.

This flexibility is both the beauty and the danger.

Used well, profiles and extensions let FHIR adapt to reality without breaking. Used badly, they create dialects. A vendor can claim support for FHIR while implementing only a thin slice, wrapping the rest in proprietary extensions, and making interoperability feel like a locked door with a polite label on it. People call this FHIR-washing, and the phrase has the tired accuracy of someone who has debugged too many integrations.

Standards always live between purity and compromise. FHIR is no exception. It survives because it compromises better than many standards before it.

## Policy Lit The Fuse

FHIR did not become important only because engineers liked it.

Policy pushed it.

In 2009, the United States passed the HITECH Act as part of the American Recovery and Reinvestment Act. HITECH poured billions of dollars into incentives for hospitals and physicians to adopt electronic health records. The result was dramatic digitization. By 2017, more than 95 percent of hospitals and about 80 percent of office-based physicians had implemented certified EHR technology.

But digitized is not the same as interoperable.

Many systems were designed for billing, compliance, and internal workflow more than clean data exchange. Clinicians complained about cluttered screens and slow workflows. Data existed, but it did not flow. The chart had become electronic without becoming portable.

Then came the 21st Century Cures Act of 2016. Among many other provisions, it attacked information blocking, the practice of interfering with access, exchange, or use of electronic health information. In 2020, the Office of the National Coordinator for Health Information Technology, or ONC, issued final rules requiring standardized APIs for patient access, explicitly using FHIR. Vendors who wanted to sell certified health IT in the United States could no longer treat interoperability as a decorative brochure word.

This changed the market.

Epic, Cerner (now Oracle Health), Meditech, Allscripts, athenahealth, eClinicalWorks, and others moved toward FHIR support. Apple Health Records used FHIR to pull health records from participating organizations into the iPhone Health app. Amazon Web Services, Google Cloud, and Microsoft Azure developed FHIR-compatible health data services such as AWS HealthLake, Google Cloud Healthcare API, and Azure API for FHIR.

The market spoke, but it spoke after the government cleared its throat.

COVID-19 then exposed the weakness of public health data infrastructure in a brutal way. Case reporting, vaccination appointment search, telehealth integration, research datasets, outbreak tracking, and agency reporting all needed faster, cleaner data movement. FHIR did not solve everything. It was not ready for every urgent need. But it proved useful enough to accelerate adoption and to show why fax-era infrastructure was no longer merely embarrassing. It was dangerous.

## Meaning Is The Hard Part

Moving data is not the same as preserving meaning.

If one system says "diabetes," what does it mean? Type 1, Type 2, a history, an active condition, a billing code, a suspected diagnosis, a poorly mapped local label? Healthcare is full of words that appear simple until a computer is asked to act on them.

FHIR does not replace medical vocabularies. It uses them.

SNOMED CT is a vast clinical terminology with more than 300,000 concepts. LOINC standardizes lab tests and clinical observations. ICD-10 supports diagnoses for billing, reporting, and epidemiology. RxNorm standardizes prescription-related concepts in the United States. FHIR can bind coded elements to these terminologies so that one system's data is less likely to become another system's guess.

Terminology services help manage this work. A FHIR terminology server can answer questions such as whether a code is valid, which version of a code system is current, what codes belong in a ValueSet, or how one code maps to another through a ConceptMap. FHIR includes resources such as CodeSystem, ValueSet, and ConceptMap for this purpose.

This is not glamorous. It is also not optional. A clean API carrying ambiguous data is just a faster way to be wrong.

FHIR also borrows from the semantic web, the idea that data on the web should be linked in ways machines can understand. RDF, OWL, and SPARQL belong to that world. FHIR resources have identifiers and references. An Observation can refer to a Patient. A DiagnosticReport can refer to Observations. A graph begins to form.

Most implementers will not spend their day thinking about RDF. They will think about endpoints, validation errors, auth tokens, and why the other system did something unexpected at 4:30 p.m. But underneath the practical work sits a larger idea: health information becomes more useful when it can be linked, queried, and reasoned over.

## The People And Institutions Behind It

Standards are not born from clouds. They are argued into existence by people.

Grahame Grieve, FHIR's product director and chair of the HL7 FHIR Management Group, has been central from the beginning. He brought together clinical understanding, software discipline, and the patience required to keep a standards community from eating itself. The core FHIR world also includes people such as Lloyd McKenzie, Ewout Kramer, James Agnew, and many others who contributed resources, tooling, servers, validators, and implementation knowledge. HAPI FHIR, created by James Agnew, became one of the most widely used open-source FHIR servers. Smile CDR became another important commercial FHIR platform.

The Argonaut Project, formed in 2014 by EHR vendors, health systems, and technology companies, helped turn FHIR from promise into implementation. Founding participants included Epic, Cerner, athenahealth, McKesson, Meditech, Surescripts, The Advisory Board Company, and several large health systems. Argonaut developed implementation guides and practical testing around patient access and data query use cases. Its work helped shape later regulatory requirements.

Government agencies then supplied pressure. The ONC drove interoperability policy. CMS, through its control of enormous federal healthcare payment flows, pushed FHIR use in specific domains. Donald Rucker, National Coordinator from 2017 to 2021, strongly advocated API-based interoperability and helped push the Cures Act Final Rule into practical consequence.

This is how standards often succeed: not by technical virtue alone, but by a triangle of code, policy, and institutional pain.

## A Small Walkthrough

Imagine Maria Hernandez, born March 12, 1985, visiting a clinic. A nurse records a blood pressure reading of 142 over 88 at 9:30 in the morning.

In a FHIR-enabled system, that measurement can become an Observation resource. The resource can say its status is final. It can identify itself as a vital sign. It can use LOINC code 85354-9 for the blood pressure panel, 8480-6 for systolic blood pressure, and 8462-4 for diastolic blood pressure. It can link to Maria's Patient resource through a subject reference. It can store the values 142 and 88 with units of millimeters of mercury.

That is more than a number in a table.

It is a computable statement: this measured thing belongs to this person, at this time, using these standard codes, with these component values. Another system can request recent vital signs through a FHIR endpoint, receive a Bundle, parse the JSON, and display a chart. A referral workflow can send the relevant information to another practice without asking Maria to become the courier of her own body.

The promise is ordinary. That is what makes it important.

No fax. No duplicate clipboard. No mystery portal with a forgotten password. No nurse retyping the same facts because two machines are too proud to speak.

In real life, of course, this promise is unevenly delivered. That is the next part.

## What FHIR Cannot Fix Alone

FHIR is a standard, not a moral transformation.

The implementation gap remains wide. A vendor can support FHIR while supporting only a limited set of resources, operations, and search parameters. Implementation guides narrow the field, but they do not eliminate variation. Testing tools such as Inferno, the ONC testing framework, can catch many conformance problems, but no tool can catch every local shortcut or business obstruction.

The identity problem remains stubborn. The United States has no universal patient identifier, largely because of privacy and political concerns. Patient matching, also called record linkage, still relies on names, dates of birth, addresses, phone numbers, and other demographic clues. These are often incomplete, outdated, misspelled, duplicated, or shared by more than one person. A mismatch can join the wrong records or split the right ones.

FHIR can carry identifiers. It cannot invent a national consensus.

The semantic gap remains. A blood pressure of 142 over 88 may carry different significance depending on age, context, measurement method, and clinical history. A diagnosis label may hide several different realities. Narrative notes can carry nuance that structured fields flatten. FHIR can include narrative text, but it cannot automatically make every sentence computable.

The business of blocking remains. The Cures Act prohibits information blocking, but prohibition is not elimination. Excessive fees, burdensome app registration, opaque documentation, deliberately narrow functionality, and slow approval processes can all make legal interoperability feel like practical obstruction. Data has commercial value. Systems that profit from closed ecosystems do not become open merely because a standard exists.

The global challenge remains too. FHIR is international, but adoption has been strongly shaped by United States policy. Europe has GDPR and different institutional structures. The UK National Health Service has developed extensive FHIR profiles. Other countries adapt FHIR in their own ways. Low- and middle-income countries may face limited infrastructure, fewer trained implementers, weaker regulation, and more urgent basic needs.

A standard can travel. It still has to learn the road.

## The Future Is Not Just An API

FHIR represents a shift from documents to data.

For most of medical history, the record was narrative. Notes, reports, letters, files. Early electronic records often reproduced the paper chart on a screen. FHIR belongs to a different imagination: health information as structured, computable elements that can be queried, aggregated, analyzed, and reused.

This enables useful things. Population health analytics. Clinical decision support. Public health surveillance. Research across large datasets. Patient access. App ecosystems. AI and machine learning pipelines that need standardized data rather than a thousand incompatible scraps.

But structure has a cost. A narrative note can carry doubt, tone, context, and judgment. A checkbox cannot always do that. The danger is that we begin to value only what fits the field. FHIR tries to carry both structure and narrative, but the tension will not disappear.

Research is already moving through this world. The NIH All of Us Research Program uses FHIR to structure broad health data for precision medicine. The FDA has explored FHIR for regulatory submissions and adverse event reporting. HL7 FHIR Accelerator projects support implementation guides for areas such as genomics, clinical trials, and real-world evidence. The MIMIC-IV critical care research dataset has been converted into FHIR form for researchers who want data in a more standard shape.

AI in healthcare depends on this kind of standardization. Machine learning models are hungry for clean, labeled, interoperable data. FHIR can provide part of the substrate. It does not answer the hard questions: who owns models trained on patient data, how bias is measured, how decisions are explained, how accountability works when software influences care. It only makes those questions more immediate by making the data more usable.

Consumer health adds another layer. Fitbits, Apple Watches, continuous glucose monitors, sleep trackers, and home devices generate streams of data that often sit in proprietary apps. FHIR offers a possible bridge between consumer data and clinical records through resources for device metrics, home observations, and patient-reported outcomes. The dream is continuous care rather than episodic care.

The risk is continuous surveillance instead.

The quantified self can become the classified self very quickly if insurers, employers, platforms, or governments get the wrong kind of access. FHIR is plumbing. Plumbing can carry clean water or something less welcome. Governance decides what flows and who may drink from it.

## The Standard At The Counter

FHIR is not glamorous in the way people now expect technology to be glamorous. It does not glow on a keynote screen by itself. It is not an app with a friendly icon. It is a long specification, a set of resources, profiles, extensions, terminology bindings, APIs, implementation guides, conformance tests, and committee arguments.

It is infrastructure.

Infrastructure is visible mainly when it fails. A bridge is boring until it cracks. A drain is boring until the lane floods. A data standard is boring until an emergency room cannot see an allergy, a public health agency cannot count cases quickly, a researcher cannot combine datasets, or a patient has to write the same history again while a computer sits nearby pretending helplessness.

FHIR will not fix healthcare fragmentation by itself. It will not make vendors generous. It will not make bad data good. It will not solve patient identity, semantic ambiguity, privacy risk, global inequality, or the bureaucratic gift for making simple things difficult. It may be superseded someday. Standards are agreements, and agreements can be replaced.

But the problem it addresses will remain: health information must move across organizations, disciplines, devices, countries, and moments of need without losing its meaning.

That is a hard and worthy problem.

The clipboard is still on the counter. The pen is still tied to its string. Someone is still writing down what another system already knows. Somewhere behind the wall, a server hums, ready or not, and the ordinary work of making one machine understand another continues without applause.

---

## P.S. References

HL7 International. FHIR Specification: [https://hl7.org/fhir](https://hl7.org/fhir)

SMART Health IT. SMART on FHIR: [https://smarthealthit.org](https://smarthealthit.org)

Argonaut Project archive: [https://argonautwiki.hl7.org](https://argonautwiki.hl7.org)
