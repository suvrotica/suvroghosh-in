---
title: "Building VA Data Warehouses"
description: "A high-level but technically serious primer on how data warehouses are actually built from Department of Veterans Affairs operational systems. It explains why extraction is the easy part, why semantic stability is the hard part, and where warehousing efforts usually go wrong."
thumbnail : "/images/IMG-20260423-WA0020.jpg"
date: "2026-04-23"
category: "healthcare-it"
tags: ["Healthcare IT", "Data Warehouse", "SuvroGhosh", "healthcare-it", "VA Data Warehouse Reality", "Healthcare Data", "Suvro Ghosh", "Calcutta", "Kolkata", "Bengali Essay", "Indian Middle Class", "Lower Middle Class India", "Kolkata Bengali Writing", "Longform Essay", "Personal Blog", "Systems Thinking", "India", "South Asia", "Urban India", "Clinical Informatics", "Health IT Architecture", "Medical Data Systems", "Interoperability", "Artificial Intelligence", "AI Commentary", "AI Ethics", "AI Safety", "Large Language Models", "AI in India", "Agentic AI", "Technology Culture", "Kolkata Life", "Calcutta Bengali", "Bengali Culture", "West Bengal", "Urban Kolkata", "India Commentary", "Indian Politics", "Indian Society", "Indian Economy", "Public Systems"]
published: true
color: "blue"
---

<TTS />

<Pi src="IMG-20260423-WA0020.jpg" />

Acronyms expanded in this post:
- AI: Artificial Intelligence. software that generates, classifies, predicts, summarizes, or acts on patterns in data.
- API: Application Programming Interface. a controlled doorway through which software systems exchange data or actions.
- CPT: Current Procedural Terminology. a United States coding system for medical procedures and services.
- ETL: Extract, Transform, Load. a data pipeline pattern for pulling, reshaping, and loading data.
- FHIR: Fast Healthcare Interoperability Resources. the modern web-friendly Health Level Seven healthcare data exchange standard.
- HL7: Health Level Seven. the family of healthcare messaging and data exchange standards.
- HL7 v2: Health Level Seven version 2. the older event-message standard still running much hospital integration.
- ICD: International Classification of Diseases. a diagnosis classification system used for reporting, billing, and statistics.
- IT: Information Technology. the practice of building, operating, and supporting computing systems.
- SQL: Structured Query Language. the language commonly used to query relational databases.
- VA: Veterans Affairs. the United States public healthcare system serving military veterans.
- VistA: Veterans Health Information Systems and Technology Architecture. the long-running Veterans Affairs clinical and administrative software ecosystem.

---

A VA data warehouse is not a godown where old hospital data is stacked like sacks of rice until some poor analyst comes with a clipboard. It is more like trying to reconstruct an entire railway journey from ticket stubs, platform announcements, station gossip, guard whistles, half-torn timetables, and the memory of a tea seller who saw the 8:17 arrive at 8:43 but still swears it was “on time.” The train did run. The patient was seen. The order was placed. The lab resulted. The note was signed. But the warehouse must answer the nastier question: what exactly happened, when did it happen, to whom, under whose authority, inside which workflow, and what does that fact mean once removed from the screen where it was born?

That is the part the uninitiated miss. They imagine warehousing as plumbing. Put a pipe here, a pipe there, copy data from VistA or another operational system into a large database, arrange a few tables, sprinkle some SQL, and suddenly the organization has truth. This is adorable in the way a goat wearing spectacles is adorable. It has the outward appearance of intelligence but none of the interior machinery.

Operational systems and data warehouses live in different moral universes. An operational system exists so work can happen. A nurse gives a medication. A clerk schedules a visit. A physician signs a note. A lab result lands. A bed movement occurs. A consult is requested. These systems care about workflow, permissions, queues, urgency, local practice, and not getting yelled at before lunch. A warehouse exists so the institution can ask questions later. How many patients had uncontrolled diabetes? Which facilities are seeing delays? Did readmissions increase? Which medication patterns are risky? Are we measuring the same thing this year that we measured last year, or have we merely changed the shape of the bucket and congratulated ourselves on the water level?

The warehouse therefore begins with a small act of violence. It takes data produced for action and repurposes it for memory. That sounds harmless until you notice that human institutions are very bad at memory. We remember selectively, defensively, locally, and with a great love of making our earlier decisions look more rational than they were. Healthcare systems are no different. They encode history through forms, codes, timestamps, statuses, defaults, templates, local workarounds, old interfaces, new regulations, and the mysterious habits of people who discovered in 2007 that if they entered “X” before “Y” the report came out less wrong.

VA systems make this both harder and more interesting. The VA is not a tiny private clinic with one billing system and one bored administrator named Debbie who knows where everything is. It is a vast healthcare civilization with hospitals, clinics, research programs, administrative systems, legacy software, modernization efforts, and decades of operational sediment. VistA, in particular, is not just “an old system” in the cartoon sense. It is a sprawling clinical ecosystem that grew with the peculiar genius and peculiar bruises of the VA itself. Local sites learned to live inside it. Packages evolved. Workflows adapted. People built unofficial rituals around official software, as humans always do, whether in a hospital in Texas or a para in north Calcutta where the electricity behaves like a philosophical suggestion.

The first lesson is that moving data is not the same as preserving meaning. HL7 v2 can move a message. FHIR can expose a resource. SQL can retrieve a row. An API can deliver a payload. None of these guarantees that the warehouse now understands the clinical event. Transport answers, “Did the thing arrive?” Meaning asks, “What is this thing, really?” That distinction is the whole game.

Consider a lab result. It appears simple. Patient, test, value, unit, date. Very civilized. Almost British in its false confidence. Then the real world opens its mouth. Was the date the specimen collection time, result time, verification time, interface transmission time, or warehouse load time? Was the value corrected? Was the unit standardized? Was the test local, mapped, renamed, retired, or replaced by another test that looks similar but is not quite the same? Was the result associated with an outpatient visit, inpatient stay, emergency department encounter, research protocol, or some hybrid creature with the paperwork habits of a tax office?

At small scale, people wave this away. At VA scale, the waving becomes architecture, and architecture is not allowed to be a hand gesture.

A warehouse usually needs layers. The first layer should be boring and faithful. Pull the source data in with as much original context as possible: source identifiers, facility identifiers, event timestamps, load timestamps, status values, local codes, user or system provenance, and enough metadata to reconstruct the crime scene later. This raw layer is not there to please executives or make dashboards. It is there so that when someone says the numbers are wrong, you do not stand there like a man in a Kolkata ration shop arguing with a ledger he never kept.

The next layer is where the data begins to acquire enterprise manners. Patient identities are reconciled. Facility hierarchies are standardized. Local codes are mapped, carefully, not with the drunken optimism of a weekend spreadsheet. Dates are interpreted. Statuses are converted into usable state logic. Facts are assigned a grain. That word, grain, sounds harmless, but it is one of the most important words in warehouse design. It means the level at which a row exists. Is one row one patient? One visit? One order? One lab result? One medication administration? One diagnosis claim? One problem-list entry? One bed movement?

If you get the grain wrong, the warehouse becomes a machine for manufacturing confusion. You count visits and accidentally count orders. You count active medications and accidentally count historical entries. You count diagnoses and accidentally count billing echoes. You count patients and accidentally count identities. Then someone makes a bar chart, and the bar chart enters a PowerPoint, and the PowerPoint enters a meeting, and suddenly the error has shoes and a badge.

This is why many warehouse problems called “data quality issues” are not really data quality issues. They are representation failures. The data may have arrived correctly. The column may be populated. The code may be valid. The timestamp may be real. The trouble is that the warehouse represented the source event at the wrong level of meaning. It treated a workflow artifact as a clinical fact, or a billing code as a diagnosis, or a documentation timestamp as an occurrence timestamp, or a local operational convention as an enterprise truth. The data is not dirty in the usual sense. The model is under-describing reality.

That sentence is worth keeping in the pocket like a tram ticket from another age: many data quality failures are actually failed acts of representation.

The third layer is the curated layer, where normal human beings are allowed to ask questions without walking barefoot across broken glass. Here you build subject-area tables, marts, semantic views, and controlled data products. A quality team may need one view of diabetes. A research team may need another. An operations team may need access metrics by facility and service line. Leadership may need stable enterprise measures that do not change every time an analyst discovers a new edge case hiding under the sofa.

This does not mean everyone gets their own private truth. That way lies spreadsheet feudalism, a medieval condition in which every department has a castle, a moat, a slightly different denominator, and a deep suspicion of neighboring peasants. It means the warehouse must separate raw truth, integrated truth, and usable truth, with rules visible enough that disagreements can be argued honestly.

The VA world especially punishes lazy identity work. The same veteran can touch multiple facilities, multiple clinics, multiple systems, and multiple administrative contexts over time. If identity reconciliation is weak, the warehouse loses the patient’s story. It may split one person into several shadows or merge shadows that should never have met. This is not a clerical annoyance. It breaks longitudinal care analysis, population health, utilization trends, readmission logic, cohort building, and research reproducibility.

Time is the next demon. Healthcare data has more clocks than Howrah station, and all of them are capable of betraying you. There is the time something happened, the time someone documented it, the time it was verified, the time it was corrected, the time it was transmitted, and the time the warehouse swallowed it. A beginner sees a date column and relaxes. An experienced warehouse architect sees a date column and reaches for tea, because trouble has arrived wearing a clean shirt.

A medication order, for example, is not one event. It may be ordered, signed, held, verified, dispensed, administered, discontinued, renewed, or documented later. Each stage answers a different question. Did the clinician intend therapy? Did pharmacy verify it? Did the patient receive it? Was it active on a given day? Did it appear on the medication list because it was clinically current or because some historical artifact refused to die? If your warehouse collapses all of that into one “medication” fact, it will look tidy and lie fluently.

Status fields are another place where operational meaning goes to molt. Active, pending, complete, discontinued, corrected, entered-in-error, historical, held, expired. These are not decorative labels. They are small state machines. In the source system, the screen and workflow often tell users how to interpret them. In the warehouse, detached from the workflow, they become orphans unless modeled deliberately.

Terminology mapping is equally treacherous. ICD codes, CPT codes, local lab codes, local procedure names, pharmacy vocabularies, problem-list terms, note templates, and research classifications all carry their own little kingdoms of meaning. Mapping them into a standard terminology is necessary. It is also lossy. The source may distinguish things the target collapses. The target may require distinctions the source never captured. Sometimes a local code is not merely a clinical concept; it is a workflow habit wearing a code-shaped hat.

This is where FHIR helps but does not rescue us. FHIR is useful because it gives healthcare data a modern exchange grammar. It is modular, web-friendly, and much easier for many developers to reason about than older interface patterns. But a FHIR Observation does not magically solve whether your lab result is comparable across time, site, unit, method, and local convention. A FHIR Encounter does not magically solve whether two facilities used encounter boundaries in the same way. A FHIR resource can carry data across the road. It cannot guarantee that the data knows where it lives once it reaches the other side.

So the practical design implication is this: do not build the warehouse as if standards eliminate interpretation. Build it as if standards make interpretation inspectable.

That means provenance should be first-class. Every important analytic fact should be traceable back to source system, source key, facility, load process, transformation version, and business rule. If a measure changed because the source changed, say so. If it changed because the mapping changed, say so. If it changed because the warehouse team corrected a long-standing interpretation error, say so loudly before some administrator builds a mythology around the trend line.

It also means governance cannot be a monthly meeting where exhausted people approve column names. Real governance defines meaning. It decides whether an “encounter” is visit-based, billing-based, clinical-contact-based, or reporting-based for a specific use case. It decides which source wins when two systems disagree. It defines what counts as active, current, completed, corrected, and excluded. It records why the rule exists. Governance is not the lace curtain on the warehouse. It is the load-bearing wall.

There is a non-obvious architectural insight here. In a mature healthcare system, the warehouse does not merely reflect clinical work. It reflects organizational structure. If pharmacy, scheduling, primary care, specialty care, finance, research, and quality each own different fragments of meaning, that ownership pattern eventually appears in the data model. Clean domains often indicate clean accountability. Muddy joins often indicate political weather. A table can look technical and still be a map of institutional compromise.

That is why clean solutions are rare. The constraint is not only technical debt. It is operational debt, regulatory debt, workflow debt, procurement debt, and human debt. A hospital cannot stop being a hospital while architects refactor its meaning. The VA cannot freeze care delivery until every old code is mapped, every timestamp clarified, every identity edge case resolved, and every local workaround retired with a garland and a pension. Care continues. Reports are due. Research needs cohorts. Leaders want numbers. Modernization arrives while legacy systems remain alive. The road is being repaired while buses, goats, ambulances, and wedding processions are all using it.

So what should the beginner take away?

First, preserve the raw source carefully. Never be too elegant too early. Elegance in the raw layer is often just data loss with better posture.

Second, model the grain of each fact explicitly. A warehouse row must know what kind of event it represents. Otherwise it becomes a gossiping auntie: full of information, low on accountability.

Third, separate transport from meaning. An HL7 v2 message, a FHIR API call, an ETL pipeline, or a SQL load can prove that data moved. It cannot prove that the warehouse interpreted it correctly.

Fourth, treat time as architecture. Store the different clocks. Name them properly. Use them deliberately. Never let “date” sit there like a smug little noun.

Fifth, build semantic contracts. For important tables and metrics, document what the object means, what it excludes, which source rules govern it, what timestamps matter, how corrections behave, and what the object must not be used for. “Do not use this for X” is one of the most honest sentences in data architecture.

Sixth, accept that denormalization is not a sin and normalization is not a religion. Normalize where you need discipline. Denormalize where users need stable access. But do not flatten away clinical context just to make a dashboard load faster. A fast wrong answer is still wrong, only now it has good performance.

Finally, keep humility in the design. A VA warehouse is not a marble temple of truth. It is a working kitchen in a very large public hospital, built from old utensils, new appliances, strict rules, improvising humans, and recipes translated between generations. Some days the dal burns. Some days the rice is perfect. The job is not to pretend the kitchen is spotless. The job is to know which pot produced which meal, who changed the salt, why yesterday’s recipe no longer matches today’s stove, and whether the person eating the result can trust it enough to make a decision.

That, in the end, is what building a data warehouse from VA operational systems really means. Not copying data. Not worshipping tools. Not reciting standards like Sanskrit mantras at a procurement puja. It means taking the noisy, stubborn, half-local, half-enterprise record of care and shaping it into something honest enough for analysis without shaving off the scars that explain it.

## Related Posts

- [How VA Healthcare Data Systems Work: From MUMPS to SQL](/blog/healthcare-it/va-healthcare-data-systems-mumps-to-sql)
- [Latent Space in Healthcare Data, From the Beginning](/blog/healthcare-it/latent-space-in-healthcare-data)
- [FHIR](/blog/healthcare-it/fhir-for-a-curious-student-in-calcutta)
- [HIE from First Principles](/blog/healthcare-it/hie-first-principles-openhie)
