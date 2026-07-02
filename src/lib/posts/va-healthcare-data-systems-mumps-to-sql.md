---
title: "How VA Healthcare Data Systems Work: From MUMPS to SQL"
description: "A technical explanation of how Veterans Affairs healthcare data moves from VistA’s MUMPS and FileMan world into SQL warehouses, and why that translation is never merely a database conversion."
thumbnail :  "/images/IMG-20260425-WA0005.jpg" 
date: "2026-04-25"
category: "Healthcare IT"
tags: ["SuvroGhosh", "Healthcare IT", "VA Healthcare Data Systems Mumps To Sql", "Healthcare Data", "Suvro Ghosh", "Calcutta", "Kolkata", "Bengali Essay", "Indian Middle Class", "Lower Middle Class India", "Kolkata Bengali Writing", "Longform Essay", "Personal Blog", "Systems Thinking", "India", "South Asia", "Urban India", "Clinical Informatics", "Health IT Architecture", "Medical Data Systems", "Interoperability", "Artificial Intelligence", "AI Commentary", "AI Ethics", "AI Safety", "Large Language Models", "AI in India", "Agentic AI", "Technology Culture", "Kolkata Life", "Calcutta Bengali", "Bengali Culture", "West Bengal", "Urban Kolkata", "Mental Health", "Bipolar Depression", "Anxiety", "Depression Writing", "Mental Health India", "Loneliness", "Middle Age", "Personal Essay"]
published: true
color: "blue"
---



<Pi src="IMG-20260425-WA0005.jpg" />




Acronyms used in this post: VA [Veterans Affairs, the United States department responsible for veteran benefits and healthcare]. VHA [Veterans Health Administration, the healthcare arm of VA]. VistA [Veterans Health Information Systems and Technology Architecture, the long-running VA clinical and administrative health information system]. MUMPS [Massachusetts General Hospital Utility Multi-Programming System, a language and database environment built around persistent hierarchical globals]. SQL [Structured Query Language, the standard language used to query relational databases]. FileMan [VA File Manager, the database management layer that defines and governs much of VistA data]. CPRS [Computerized Patient Record System, the classic clinical front end used with VistA]. CDW [Corporate Data Warehouse, the enterprise warehouse that consolidates VA healthcare data for reporting, analytics, research, and operations]. ETL [Extract, Transform, Load, the pipeline pattern used to move and reshape data from source systems into target databases]. HL7 v2 [Health Level Seven version 2, a widely used healthcare messaging standard]. FHIR [Fast Healthcare Interoperability Resources, a modern healthcare interoperability standard based on modular resources and APIs]. ODBC [Open Database Connectivity, a common method for applications to connect to databases]. ICD [International Classification of Diseases, a diagnosis classification system used for reporting, billing, and epidemiology]. LOINC [Logical Observation Identifiers Names and Codes, a standard for laboratory and clinical observations]. RxNorm [a normalized medication terminology]. SNOMED CT [Systematized Nomenclature of Medicine Clinical Terms, a broad clinical terminology].

<TTS />

---

VA healthcare data did not begin life as a polite row in a table. It began in MUMPS globals, those strange, persistent, tree-like structures that look to a SQL person like a banyan tree wandered into an accounting office and refused to leave.

That one fact explains half the trouble.

People who grew up with SQL imagine healthcare data as a city planned by civil engineers. Patient here, encounter there, medication over there, lab result on the next block, all joined by well-behaved keys wearing clean shoes. But VistA did not grow like Chandigarh. It grew like old Calcutta. Lanes behind lanes. A sweet shop under a staircase. A lawyer’s office above a pharmacy. A magnificent old building with a new water pipe tied to it by faith, rope, and procurement delay. It is not chaos. It is history in executable form.

And history, as any middle-class Bengali with an electricity bill knows, does not normalize easily.

The MUMPS world is not just a storage choice. In VistA, the application and the database sit close together, almost cheek to cheek, like two passengers in an overcrowded minibus on Gariahat Road. Clinical logic, storage patterns, prompts, validation rules, cross-references, package behavior, user workflow, and local configuration all live near the data. The data is not a dead thing waiting for analytics. It is part of work being done.

That is why “MUMPS to SQL” sounds easier than it is. The phrase makes it sound like a carpenter’s job. Take this old wooden cupboard, sand it, polish it, put it in the new flat. But the cupboard contains legal papers, grandfather’s spectacles, expired medicine, one rupee coins, and a key to a lock nobody has seen since 1989. You can move the wood. The meaning is another matter.

FileMan is the great interpreter inside this older VA universe. It tells VistA what files exist, what fields mean, what values are permitted, what prompts users see, what cross-references fire, what pointers connect one thing to another, and how values should be entered or displayed. To a SQL person, a FileMan file can look like a table, a record like a row, and a field like a column. That resemblance is useful, but it is also a trap. A coconut and a skull are both round. You should still be careful which one you crack open.

FileMan supports hierarchy naturally. A patient record can contain multiples, and those multiples can contain more detail. SQL prefers separate tables and relationships through keys. This is not a moral difference. It is a difference in worldview. FileMan is comfortable saying, “Here is this patient, and inside this patient’s record are nested clinical facts.” SQL says, “Please stand in separate queues, bring identifiers, and do not crowd the counter.”

SQL is wonderful for counting across populations. It is wonderful for joins, aggregation, reporting, dashboards, registries, research cohorts, quality measures, and the grand national question: what is happening across the system? But VistA was built to support the more immediate question: what needs to happen now for this veteran, in this facility, inside this workflow, with these rules, orders, signatures, alerts, and human beings who have ten minutes and no appetite for metaphysics?

Both questions matter. They are not the same question.

A medication order in VistA is not merely a medication row. It is pharmacy workflow, formulary configuration, provider authority, order status, renewal behavior, discontinuation logic, timing, signature, verification, dispensing, administration, and local practice folded into a single operational event. A lab result is not merely a number sitting in a chair. It comes with specimen context, collection time, result time, verification time, units, reference ranges, abnormal flags, accession rules, local test names, and terminology mapping that may or may not behave like a civilized citizen.

When these things move into SQL, they gain visibility but can lose smell, texture, and street address.

The SQL warehouse wants a clean representation. It wants a lab table, medication table, patient table, visit table, provider table, diagnosis table, procedure table. This is necessary. No national analytics program can operate by rummaging directly through every local operational corner forever. CDW exists because VHA needs enterprise reporting, research data, population health analytics, quality measurement, operations management, surveillance, planning, and accountability. You cannot run a national health system by shouting into local databases one at a time.

So the data travels. Local VistA systems store clinical and administrative facts in MUMPS globals governed by FileMan and package logic. Extraction processes pull selected data. Transformation logic reshapes it. Mapping logic tries to make local terms behave nationally. Loading processes put it into SQL structures. Analysts, researchers, dashboard developers, informaticists, and program offices query it downstream.

That is the brochure version. In production, every verb in that paragraph has a small knife.

Extraction is not innocent. What you choose to extract is already an opinion. Transformation is not innocent. What you rename, flatten, split, merge, exclude, default, or standardize is an opinion wearing a clean shirt. Loading is not innocent either, because the warehouse schema tells future users what kind of questions are easy, what kind are awkward, and what kind nobody will ask because the data has been made invisible.

This is where many healthcare data discussions go wrong. Someone sees mismatched counts, missing fields, duplicate-looking rows, conflicting dates, odd statuses, or weird local codes and says, with the confidence of a man who has just discovered tea stains on a government file, “Bad data.”

Sometimes yes. Healthcare has bad data. It has typos, rushed entries, duplicate records, wrong selections, interface failures, stale values, impossible dates, and human workarounds that became unofficial architecture because the official one was designed by someone far from the clinic desk. Let us not become romantic about it.

But often the problem is not bad data. It is bad representation.

A value can be perfectly meaningful inside its native workflow and nearly useless in a warehouse unless its context travels with it. A status can be obvious to a VistA package and ambiguous in SQL. A date can mean entered date, event date, collection date, release date, signature date, discharge date, verification date, update date, or load date. A note title can support clinical documentation but fail as a research phenotype. A clinic name can mean one thing in one facility and something slightly different in another. A local lab test can map imperfectly to LOINC. A medication can look simple until RxNorm, local formulary rules, active status, fills, administrations, and discontinued orders all arrive for dinner and begin arguing.

Calling this “data quality” is sometimes like blaming the fish because your bucket has a hole.

The non-obvious architectural point is this: moving VA data from MUMPS to SQL is not mainly a database conversion. It is a change in theory of knowledge.

MUMPS and FileMan ask, “How do we support the clinical and administrative work?” SQL asks, “How do we make the work measurable across people, facilities, programs, and time?” Those are both noble questions, but they do not produce the same data shape. One is concerned with action. The other is concerned with legibility. Work first, measurement later. Except in real institutions the measurement comes back and starts controlling the work, like a school inspector who first observes the class and then rearranges the children.

The difference between data transport and semantic meaning is crucial here. HL7 v2 can move messages. FHIR can expose resources. ETL can move and reshape data. ODBC can let tools connect and query. These are transport and representation mechanisms. They help data travel. They do not guarantee that the receiving system understands what the sending system meant.

The courier can deliver the envelope. He cannot promise the letter inside is clear, truthful, current, complete, or written in a language the recipient understands.

This distinction becomes painful in analytics. A dashboard may show “active medications.” Fine. Active according to whom? The operational order status? The pharmacy fill history? The patient’s actual use? The medication list visible to the clinician? The research definition? The safety program definition? The quality measure definition? The answer changes depending on purpose. One phrase, five meanings, all wearing the same badge.

This is why source of record and source of truth must be separated. The source of record is where a transaction officially lives. The source of truth is the representation an organization trusts for a decision. For some medication questions, pharmacy data may dominate. For identity, a master patient index may override local demographics. For utilization, curated encounter logic may matter more than raw visit records. For quality reporting, CDW may become the practical truth even though it is downstream from operational systems.

This sounds untidy because it is untidy. Large healthcare institutions are not single machines. They are federations of departments, incentives, regulations, clinical habits, local histories, budget scars, and software layers. The data architecture records that federalism. If a patient has one body but six official representations, that is not because architects are fools. It is because each representation was produced by a different piece of the institution trying to survive its own day.

The MUMPS-to-SQL crossing also changes time. In the operational system, a clinician may see a current state. In the warehouse, the same fact may arrive after extraction, transformation, validation, and loading. A patient discharged at noon may not appear discharged downstream yet. A consult may be closed administratively but not clinically resolved. A lab may be collected, resulted, verified, and loaded at different times. For a casual report this may be tolerable. For safety surveillance or operational intervention, it can be the difference between useful and misleading.

Time in healthcare data is not one column. It is a family dispute.

Then comes provenance. Who asserted the fact? A clinician? A nurse? A pharmacist? A clerk? A device? An interface? A batch correction? A migration script? A default? A mapping table? A downstream derivation? Without provenance, SQL can become beautifully organized gossip. It has table names, indexes, and permissions, but it has forgotten who said what and why.

A serious VA data architecture must therefore preserve more than values. It must preserve interpretability. Keep source identifiers. Keep local codes beside national mappings. Keep raw timestamps beside curated timestamps. Version terminology maps. Track load dates separately from clinical event dates. Preserve internal values when external display values are seductive but lossy. Document transformation logic where human beings can actually find it, not in some swamp of tribal SQL fragments and heroic stored procedures known only to two contractors and one retired analyst in Arizona.

The practical artifact every important data product needs is not just a schema. It needs an interpretation contract.

A schema says: here are the columns. An interpretation contract says: here is what this row claims to represent; here is how it was derived; here are the source domains; here are the timestamps; here is what counts and what does not; here are the known ambiguities; here is how local variation is handled; here is the terminology mapping; here is the update behavior; here is what you must not use this for unless you enjoy public embarrassment.

This matters especially for research and quality measurement. A cohort definition is not “just a query.” It is a clinical argument expressed in SQL. A hypertension cohort, a diabetes registry, a suicide-risk analytic extract, a readmission measure, a medication safety dashboard, a cancer screening numerator—each is a claim about reality. The SQL may run successfully and still be wrong in the way a neatly printed train ticket can be wrong if it sends you to Siliguri when you meant Sealdah.

The clean solution, naturally, does not exist. That sentence should be embroidered above every healthcare architecture meeting room.

Why not? Because legacy systems cannot simply stop while everyone redesigns meaning. Regulations keep moving. Clinical work continues. Budgets arrive with strings. Procurement creates its own weather. Local facilities have real workflows. National programs need comparable measures. Modernization introduces hybrid periods where VistA, newer EHR systems, community care data, national services, interfaces, claims-adjacent feeds, and migrated history all coexist like relatives at a wedding who know too much about each other.

VA EHR modernization changes the source landscape, but it does not abolish the semantic problem. Replacing or supplementing old systems can improve many things, but it does not repeal ambiguity. Modern platforms still have configuration, interface queues, local workflow, documentation burden, data conversion issues, reporting definitions, and user workarounds. A shiny system can produce old confusion at higher speed and with better fonts.

So what is the architectural direction?

First, stop treating MUMPS-to-SQL as plumbing. Treat it as translation with evidence. The source data, the transformation, the warehouse model, and the analytic use case must all be visible in the chain. If meaning changes, say where. If meaning is uncertain, say that too. Silence is not rigor. It is deferred damage.

Second, separate replication from curation. Replicated source-like data is useful because it preserves closeness to the operational system. Curated analytic domains are useful because they make enterprise questions answerable. Published metrics are useful because they support decisions. But these layers should not be confused. The closer you get to official reporting, the more the logic must be governed, tested, explained, and versioned.

Third, involve the people who know the workflow. Database engineers can move data. Informaticists can interpret clinical meaning. Analysts can test patterns. Clinicians can detect nonsense. Integration engineers can understand message behavior. Data stewards can maintain definitions. Leave any one group out and the system develops a limp.

Fourth, keep local variation visible long enough to understand it. Standardization is necessary, but premature standardization is a semantic meat grinder. If two facilities use similar labels differently, do not erase the difference too early. Map, yes. Normalize, yes. But preserve enough lineage to audit the mapping later, when someone discovers that the national count is elegant and wrong.

Fifth, design for correction. Healthcare data systems should assume future reinterpretation. Terminologies change. Measures change. clinical knowledge changes. Workflows change. Old mappings become suspect. New use cases appear. A warehouse that cannot explain its past is a warehouse that will eventually lie with confidence.

The best mental model is simple. VistA in MUMPS/FileMan is the operational memory of care. SQL warehouses like CDW are the enterprise memory of measurement. One remembers the clinic in motion. The other makes the institution legible to itself. The crossing between them is where architecture earns its rice and lentils.

And that crossing is not merely technical. It is moral in the ordinary, unglamorous sense. Bad representation can move resources, miscount work, distort quality, mislead research, burden clinicians, and make a veteran disappear statistically while still sitting very much alive in the waiting room.

The map is not the territory. Fine. We all learned that. But in healthcare, the map schedules care, drives dashboards, justifies budgets, flags risk, builds cohorts, measures performance, and tells the institution what it thinks it knows. So the map had better come with a legend, a date, a source, a warning label, and someone accountable enough to admit where the road turns into a goat path.

That is the real story of VA healthcare data systems. Not old MUMPS becoming respectable SQL. Not legacy giving way to modernity like a sepia photograph fading into a cloud dashboard. The real story is harder and more interesting: a vast healthcare system trying to convert the messy, local, time-bound grammar of care into national knowledge without squeezing the patient out of the sentence.




## Related Posts

- [Latent Space in Healthcare Data, From the Beginning](/blog/healthcare-it/latent-space-in-healthcare-data)
- [Building VA Data Warehouses](/blog/healthcare-it/va_data_warehouse_reality)
- [FHIR](/blog/healthcare-it/fhir-for-a-curious-student-in-calcutta)
- [Applied Multivariate Statistical Modeling in Healthcare IT](/blog/healthcare-it/multivariate-statistical-modeling-in-healthcare-it)
