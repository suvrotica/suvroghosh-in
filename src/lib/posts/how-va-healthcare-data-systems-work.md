---
title: "VistA, MUMPS, and the Warehouse After Midnight"
description: "A Calcutta-grounded essay on how VA healthcare data moves from VistA's MUMPS and FileMan world into SQL warehouses, and why that translation is historical, clinical, and technical all at once."
date: "2026-06-24"
thumbnail: "/images/IMG-20260425-WA0005.jpg"
category: "Healthcare-IT"
tags: ["Oracle Cerner","Microsoft SQL Server","VA Corporate Data","Veterans Affairs","Layer Cake","VistA","MUMPS","SQL","VA","FileMan"]
published: true
color: "#1a4d8f"
---

<TTS />

<Pi src="IMG-20260425-WA0005.jpg" />

A server room has a particular smell.

Not always. Not in the glossy photographs. But in the real rooms, the ones with old labels on cables and a rack door that does not close properly, there is often a dry electrical smell, a mixture of dust, cooling air, metal, and institutional endurance. In Calcutta I have seen rooms like that in offices where the air conditioner is treated less like comfort and more like life support. The machines keep working because everyone is afraid of what will happen if they stop.

That is a good way to enter the world of VA healthcare data.

Somewhere inside the Department of Veterans Affairs, under newer layers of interfaces, reports, dashboards, contractors, modernization programs, and executive language, there remains an older machine-world called VistA. The full name is Veterans Health Information Systems and Technology Architecture. It has been one of the digital backbones of the largest integrated healthcare system in the United States for more than four decades.

VistA runs on MUMPS.

MUMPS stands for Massachusetts General Hospital Utility Multi-Programming System, a name from an earlier age of computing when acronyms were allowed to look like furniture assembled in poor light. It emerged in the 1960s for a practical reason: medical data had to be stored and retrieved quickly on machines with very little memory. MUMPS is both a programming language and a built-in hierarchical database. It is not quite like the relational databases that later became normal. It stores information in globals, which are persistent tree-like structures. A global is not global in the worldly sense. It is a named data structure that lives on disk and survives after the routine ends.

If SQL is a city of tables, MUMPS is a tree with handwritten signs nailed to the branches.

The surprising thing is not that such a system became old. Everything becomes old. The surprising thing is that it worked so well, for so long, in a domain where failure is not an amusing outage but a human event.

## The System That Grew Rather Than Arrived

VistA did not fall from the sky as a product.

It grew.

The Veterans Administration, later the Department of Veterans Affairs, had a large network of hospitals and clinics. In the late 1960s and 1970s, computers were expensive and limited. Paper, phones, local memory, and institutional habits did much of the work. The idea that a clinician in one facility could quickly see the relevant history of a veteran treated elsewhere was not yet ordinary.

MUMPS entered because it fit the constraints of the time. Neil Pappalardo and colleagues at Massachusetts General Hospital helped create it. It was compact, fast, and comfortable with sparse hierarchical data. It did not need the heavy machinery that later database systems would require.

At the VA, FileMan became the other crucial piece. Developed by George Timson and others in the 1970s, FileMan provided a way to define files, fields, relationships, and forms on top of the MUMPS database. It gave VistA a schema layer, though not a rigid one in the SQL sense. It also gave non-specialists more power to shape the data structures of their own work.

That mattered.

Modern enterprise systems often behave as if every change must pass through a small ministry of approvals. FileMan came from another mood. A new clinical application, a new field, a local workflow, a local need: these could be represented with surprising speed. Clinicians and technically minded staff could shape the system closer to the work. The boundary between user and builder was more porous.

This flexibility was a gift.

It was also a debt.

When a system allows local adaptation for decades, the local adaptations become part of the record. They become habits. They become unspoken knowledge. They become fields whose names make sense only to people in one facility. They become routines that still run because everyone has forgotten the meeting where their behavior was decided.

That is not bad design in the simple sense. It is history.

## VistA Is Not One Thing

VistA is not a single program.

It is an ecosystem of more than one hundred integrated software packages handling registration, scheduling, laboratory reporting, pharmacy operations, billing, clinical documentation, ordering, and the electronic record itself. The clinician-facing record system is CPRS, the Computerized Patient Record System.

CPRS is not visually fashionable. It belongs to a world of terminal habits, function keys, dense screens, and directness. It can look severe beside modern interfaces that soften every corner and hide every delay behind animation. Yet many clinicians respected it because it was fast and predictable. It showed information without pretending to be a lifestyle product.

Underneath CPRS sit MUMPS globals and FileMan files.

In SQL, one usually begins with tables, columns, data types, foreign keys, and rules. In FileMan and MUMPS, the shape can be more flexible. A field can be added quickly. A value may be stored as a string. A pointer can refer to another file. A word-processing field can store free text as a series of subnodes. A local change can exist in one place and not another.

This makes VistA adaptive.

It also makes it difficult to translate.

The same clinical reality may be represented through different local conventions. A date may need parsing. A number may arrive as text. A reference may point to something that no longer behaves neatly. Free text may contain the most important part of the story and the least computable part of the record.

The machine remembers. But it remembers in the language in which it lived.

## From DHCP To CDW

The early VA architecture was associated with the Decentralized Hospital Computer Program, or DHCP. The principle was important: each VA medical center could have its own local instance, while sharing information across a broader network. For the time, that was advanced. It also fit the federal reality: one system, many facilities, many local conditions.

In the 1980s, VistA spread through the VA. CPRS and related tools matured. The system proved that a large public healthcare organization could build and operate an electronic record before much of the private sector had anything comparable.

The 1990s brought the internet, and VistA did not simply collapse under modern networking. It adapted. MUMPS systems could communicate over TCP/IP. Web interfaces and integration layers appeared. The old architecture was not designed for the web, but its basic compactness and direct data access gave it more life than many predicted.

The 2000s changed the comparison. American healthcare broadly began chasing electronic records, especially through federal policy and incentives. Commercial EHR vendors built systems with more polish and more market muscle. The VA's own replacement efforts, including earlier work with the Department of Defense around an integrated electronic record, became cautionary tales. Replacing a working system is harder than criticizing it.

The 2010s and 2020s brought another pressure: analytics.

VistA was good at operational clinical work. But modern reporting, quality improvement, research, population health, and machine learning wanted something else: SQL tables, warehouses, standardized dimensions, query tools, extracts, dashboards, and computable data at scale.

That is where the VA Corporate Data Warehouse, or CDW, enters.

CDW is not a simple replacement for VistA. It is a companion world. It extracts data from VistA, transforms it, loads it into a SQL-based warehouse, and makes it available for reporting, analytics, quality work, and research. Historically, Microsoft SQL Server has been central to this environment, though like any large system, surrounding platforms and experiments have grown around it.

The hard part is not moving bytes.

The hard part is moving meaning.

## The Translation After Midnight

ETL means Extract, Transform, Load.

The phrase sounds harmless. It is not harmless. It hides the real work under three clean verbs.

Extraction means reading data from VistA. That may involve direct access, MUMPS routines, FileMan exports, flat files, HL7 messages, XML documents, or other intermediate formats. The source data lives in globals designed for fast transactional use, not necessarily for bulk extraction. Reading an entire global can be like trying to copy an old city by photographing every lane from a moving bus.

The system is also alive while extraction happens. Clinicians and staff may be entering data at the same time. A clean snapshot is difficult because healthcare systems run around the clock. ETL processes therefore often rely on changed-since timestamps, incremental extraction, or transaction log approaches where the MUMPS implementation supports them. The goal is to capture what changed without stopping the clinical world.

Transformation is the most delicate step.

Raw MUMPS data must be mapped into relational form. A single global may feed many SQL tables. One SQL table may draw from several globals. Pointer fields must be followed. Strings must be parsed. Dates must be converted. Numbers must be validated. Yes-or-no values may have to be inferred from local conventions or stored flags.

A typical old-style MUMPS string might contain several pieces separated by caret characters. The first piece means one thing, the second another, the third a date, the fourth a status, and so on. To a person who knows the package, it is readable. To a generic SQL engine, it is only a string. The ETL layer must split it, interpret it, map it, clean it, and remember where it came from.

Clinical events are rarely flat.

An order may have a status, a signing clinician, a verifier, a start date, a stop date, a renewal, a related fill event, a billing implication, and free-text comments. A lab result may connect to a specimen, a test, a reference range, a performing location, and a report. A visit may contain many observations, orders, notes, diagnoses, and administrative details. Translating this into SQL requires understanding workflow, not just syntax.

Loading is the next step. The transformed data enters the warehouse, usually optimized for analytical use rather than live transaction processing. That can mean denormalized tables, star schemas, precomputed aggregates, indexes, partitions, and other warehouse techniques. The warehouse exists so analysts and researchers can ask questions at scale without hammering the operational VistA systems.

Validation is the step that saves everyone from false confidence.

Counts must reconcile. Samples must be reviewed. Distributions must be checked. Unexpected blanks must be investigated. A researcher finding an anomaly in CDW data may need someone to trace it back to the original VistA global and determine whether the anomaly belongs to the clinical record, the extraction, the mapping, or the interpretation.

Perfection is not available.

Traceability is.

## The Stack Is A Layer Cake

At the bottom sits MUMPS, often through GT.M, now known as YottaDB in its open-source continuation. It runs on Linux and provides the fast, reliable global storage that VistA needs. It is not fashionable. It does not exist to satisfy modern developer expectations. Its strengths are speed, compactness, transactional reliability, and a directness that newer stacks sometimes bury under ceremony.

FileMan sits above that as the data definition and management layer. It defines files, fields, data types, relationships, input transforms, and other structures. It is not a modern relational database management system, but within VistA it performs a similar civilizing role.

The extraction layer may use MUMPS routines, official VA utilities, local tools, contractor-built components, or interfaces that developed over time. Some are formal products. Some began as local solutions and spread because they solved a problem better than the official answer.

The ETL layer belongs more visibly to the modern enterprise world. Tools such as Informatica, Microsoft SQL Server Integration Services, Talend, and custom pipelines in Python, Java, and other languages may perform scheduling, monitoring, error handling, transformation, and loading. These pipelines may run on servers, virtual machines, or cautiously adopted cloud environments such as Amazon Web Services or Microsoft Azure.

The warehouse layer is primarily SQL, with Microsoft SQL Server long central to the VA Corporate Data Warehouse. There have been experiments and adjacent uses involving PostgreSQL, Oracle, Snowflake, BigQuery, and other platforms, but SQL Server has been the dominant warehouse technology.

On top of the warehouse live reporting and analytics tools: Business Objects, Tableau, Power BI, and custom applications. These tools want tables. They want joins. They want columns that behave. They do not want to learn the personality of a MUMPS global.

Above that comes the newer appetite: machine learning and artificial intelligence. Predictive models, natural language processing of clinical notes, image analysis of radiology studies, risk models, operational forecasting. These efforts depend on the warehouse. The warehouse depends on the translation. The translation depends on people who know where the bodies of meaning are buried in the old system.

## The Misunderstanding

The shallow misunderstanding is that this is a database migration.

It is not.

Moving from MUMPS to SQL is not like moving furniture from one flat to another. It is closer to translating a city record written in one administrative language into another language with different categories, different habits, and different suspicions.

MUMPS and FileMan tolerate organic growth. They allow local shape. They store ambiguity because clinical work produces ambiguity. SQL asks for decision. What table? What column? What data type? What key? What is primary? What is secondary? Is this value valid? What should happen when two things disagree?

Those questions look technical until you answer them.

Then they become clinical, administrative, and sometimes ethical.

The trade-off is flexibility versus consistency. VistA's flexibility allowed it to survive and adapt. SQL's consistency allows reporting and analysis across a national system. CDW tries to stand between them, preserving enough mess to remain honest and imposing enough structure to become useful.

Every transformation rule is a small act of interpretation.

Some rules are written by committees. Some by contractors. Some by programmers working under deadlines. Once placed into ETL code and production pipelines, they acquire a strange authority. The warehouse becomes not merely a mirror of the old system, but a reading of it.

That should make us cautious.

## The Replacement Problem

The VA has tried for years to move beyond VistA.

That desire is understandable. The MUMPS workforce is aging. New MUMPS programmers are rare. Institutional knowledge is thinning. Many people who understand the old packages, the odd fields, the local modifications, and the unwritten behavior of routines are retiring or already gone. A system can become unmaintainable not because the disks fail, but because the human memory around it disappears.

At the same time, VistA persists because it works. Not perfectly. Not elegantly by current fashion. But reliably enough that replacing it carries real risk. In healthcare, a migration failure is not merely a project-management embarrassment. It can disrupt care.

The Oracle Cerner Millennium deployment in the VA has shown how difficult replacement can be. It has faced delays, cost overruns, and clinical concerns. None of that means modernization should stop. It means the old system cannot be dismissed as junk simply because it is old.

Legacy systems are often ugly in the way old bridges are ugly. They were built under constraints. They have patches. They have hidden strengths. They carry more weight than their critics understand. And one day they must be repaired or replaced without dropping the people who cross them.

This is not a VA-only problem. Banks, governments, airlines, insurers, hospitals, universities, courts, power grids: all of them stand on older systems that still work because generations of people kept them working. Modernization is not an act of contempt toward the past. Done properly, it is an act of careful inheritance.

## Why It Matters

The VA is not just another enterprise.

It is a public promise made to veterans. The data in VistA is not abstract. It is the operational memory of care across facilities, years, and clinical episodes. It contains visits, orders, results, notes, referrals, procedures, schedules, and the hard administrative facts that allow a large system to keep serving people who have already given something serious to the state.

When this data enters CDW, new uses become possible.

A researcher can look for patterns across large populations. A quality team can compare facilities. An administrator can see whether a process is failing. A clinician-facing tool can be designed from evidence rather than anecdote. A national system can ask questions no single facility could answer alone.

But if the translation is wrong, the answers are wrong with confidence.

That is the special danger of warehouses. They look clean. Tables reassure the eye. A dashboard gives numbers with a kind of theatrical precision. But a beautiful chart built from misunderstood source data is still a misunderstanding. It has merely dressed well.

This is why the old knowledge matters. The person who knows that a field changed meaning in 1998 matters. The person who knows that one facility used a local file differently matters. The person who knows that a pointer can be stale, that a free-text field carries the real explanation, that a status code has a history, matters.

Data governance is not just policy. It is memory management.

## The Warehouse After Midnight

There is something almost archaeological about the work.

The ETL job runs. It reads globals. It follows pointers. It parses carets. It lifts pieces of an older system into newer tables. It checks counts. It fails occasionally. Someone reads a log. Someone writes a correction. Someone asks whether the source is wrong or the mapping is wrong. Somewhere a report waits for the morning.

This is not glamorous work. It is also not secondary work. The visible part of healthcare IT is the screen. The consequential part is often beneath it: the data structures, mappings, interfaces, validators, naming conventions, and people who remember what a field meant before a modernization program renamed it.

In Calcutta, old buildings often carry new cables across older walls. Fiber runs past damp brick. A digital payment sign hangs beside a shop ledger. The new does not replace the old cleanly. It hangs from it, argues with it, borrows from it, and occasionally pretends it was always there.

The VA's MUMPS-to-SQL world feels like that.

One era was optimized for scarce hardware and close clinical adaptation. Another era is optimized for abundant data, analytics, dashboards, research, and machine learning. The translation between them is not a straight road. It is a negotiated passage through history.

The veteran at the center of all this does not need to know MUMPS, FileMan, CDW, SQL Server, ETL, GT.M, YottaDB, CPRS, or the politics of Oracle Cerner. They need the system to remember correctly. They need the next person caring for them to see what matters. They need the promise to survive the translation.

The server room keeps its dry electrical smell. The old globals remain on their disks. The warehouse grows table by table. Somewhere, after midnight, a job finishes, a count reconciles closely enough, and the morning's report waits in silence.

---

## P.S. References

VA Office of Information and Technology technical documentation.

Department of Veterans Affairs, VistA Monograph.

MUMPS Development Committee, *MUMPS: The Complete Standard*.

YottaDB/GT.M documentation.

VA Corporate Data Warehouse technical specifications.

Hardhats.org, history of VistA.

Oracle Cerner Millennium VA implementation reports, 2020-2025.
