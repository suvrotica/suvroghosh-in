---
title: "Vector Databases"
description: "A system-level examination of vector databases for healthcare IT and serious technical readers. This post separates the glamour of embeddings from the harder realities of retrieval, semantics, filtering, latency, and representational loss."
thumbnail : "/images/IMG-20260423-WA0024.jpg"
date: "2026-04-23"
category: "healthcare it"
tags: ["Vector Databases", "Vector Search", "Semantic Search", "AI Search", "Embeddings", "Embedding Models", "Retrieval Augmented Generation", "RAG", "Healthcare IT", "Healthcare AI", "Clinical Data Architecture", "FHIR", "HL7", "HL7 v2", "CDA", "EHR", "Interoperability", "Semantic Interoperability", "Healthcare Data Platforms", "AI Architecture", "Healthcare Data Engineering", "Data Governance", "Clinical Informatics", "Knowledge Retrieval", "Enterprise Search", "Hybrid Search", "Approximate Nearest Neighbor Search", "ANN", "HNSW", "Vector Indexing", "LLM Applications", "Large Language Models", "Production AI", "Healthcare Integration", "SuvroGhosh", "Engineering Blog", "Video"]
published: true
color: "indigo"
---

<TTS />

<Pi src="IMG-20260423-WA0024.jpg" />


Acronyms used in this post: Artificial Intelligence [AI, software systems that perform tasks normally associated with human reasoning or pattern recognition]. Approximate Nearest Neighbor [ANN, a family of search methods that finds very close matches quickly without checking every possible item exactly]. Clinical Document Architecture [CDA, an older Health Level Seven document standard used for structured clinical documents]. Electronic Health Record [EHR, the clinical system where patient care is documented and operationally managed]. Fast Healthcare Interoperability Resources [FHIR, the modern Health Level Seven standard that represents clinical data as modular resources exchanged through web-friendly interfaces]. Health Level Seven [HL7, the family of healthcare messaging and data exchange standards]. Health Level Seven version 2 [HL7 v2, the older but still widely used event-message standard that moves clinical data between operational systems]. Hierarchical Navigable Small World [HNSW, a graph-based ANN indexing method used for fast vector search]. Large Language Model [LLM, a statistical language system trained to generate and interpret text]. Retrieval-Augmented Generation [RAG, a design pattern where an AI system retrieves external evidence before generating an answer]. Application Programming Interface [API, a controlled software doorway through which systems exchange requests and responses].

---

A vector database is a very clever filing clerk who has forgotten the alphabet and now arranges documents by smell, mood, cousinship, and geometric nearness. This is not an insult. It is the whole point. Ordinary search asks, “Which document contains these words?” Vector search asks, “Which stored thing feels mathematically close to this new thing?” That sounds like a party trick until you realize how much of life, medicine, law, research, and human confusion is not stored in exact words.

You say “heart attack.” The note says “myocardial infarction.” The old system says “MI.” The billing extract says something coded. The cardiologist writes a sentence with the emotional warmth of a railway timetable. Keyword search may stand there like a clerk in a government office, adjusting its spectacles and saying, “No exact match, come tomorrow.” Vector search at least has the decency to squint and say, “These may be related.”

That is the good part.

The bad part is that people hear this and immediately start building a temple.

A vector database does not understand medicine. It does not understand your patient, your hospital, your research study, your billing logic, your Veterans Affairs [VA] data extract, your clinician’s weary note written at 11:42 p.m., or the small tragedy hiding inside the phrase “patient lost to follow-up.” It stores numbers. Many numbers. Each document, sentence, image, form, paragraph, or chunk of text is turned into an embedding, which is a dense numerical representation created by an embedding model. That embedding becomes a point in a high-dimensional space. Search then becomes a geometry problem.

This is both beautiful and faintly ridiculous. We took language, that old street dog of civilization, and converted it into coordinates.

The central architectural fact is this: vector databases do not store meaning. They store representations of meaning produced by some model under some assumptions at some time. If the representation is weak, biased, badly chunked, stripped of context, or pointed at the wrong question, the database will preserve the mistake with impressive speed.

This is why a vector database is less like a brain and more like a pressure cooker. Useful, powerful, slightly dangerous, and not improved by worship.

In a typical modern AI system, the raw material may be documents, clinical notes, policies, research protocols, product manuals, lab narratives, discharge summaries, PDFs, emails, transcripts, or helpdesk tickets. The system breaks them into chunks. Then it sends those chunks through an embedding model. The resulting vectors are stored in the vector database along with metadata such as source, date, patient, document type, department, author, tenant, or security boundary. When a user asks a question, that question is also converted into a vector. The database then finds stored vectors near it.

Near is the dangerous word.

In mathematics, near has a clean smell. In human affairs, near can be a swamp. “Diabetes medication held before surgery” may be near “diabetes medication started after discharge,” but clinically they are not the same animal. “No evidence of pneumonia” may be near “evidence of pneumonia” if the embedding is sloppy or the chunk is stupidly cut. A patient’s mother having cancer is not the same as the patient having cancer, though both can sit in the same sentence like two suspicious uncles at a wedding.

This is why healthcare makes vector search nervous. Healthcare data is full of negation, temporality, family history, uncertainty, copy-forward residue, billing distortion, operational shortcuts, and human fatigue. It is not merely text. It is workflow sediment.

The distinction between data transport and semantic meaning matters here. You can move an HL7 v2 message perfectly from one system to another and still misunderstand what the message means. You can expose a FHIR resource through a clean API and still lose the clinical context that made the data meaningful. In the same way, you can insert vectors perfectly into a database and still retrieve the wrong evidence. Transport says the parcel arrived. Semantics asks whether anyone knows what is inside the parcel, why it was sent, whether it is current, and whether touching it will cause trouble.

Most bad vector systems fail because they confuse these two things. They think successful movement equals successful understanding.

It does not.

The first ugly little goblin is chunking. Chunking sounds harmless, like cutting fish before frying it. But in retrieval architecture, chunking is an act of philosophy performed by tired engineers under deadline pressure. You are deciding what a unit of meaning is. Is it a sentence? A paragraph? A section? A whole clinical note? A FHIR resource? A visit? A patient timeline? A discharge summary plus the medication list plus the lab trend? Each answer creates a different world.

Cut too small and you lose context. Cut too large and the embedding becomes a semantic khichuri where everything is mixed, warm, and impossible to separate. A paragraph about kidney disease, diabetes, medication adherence, transport difficulty, and insurance denial may be meaningful to a human because the human sees the story. The embedding model may compress it into a vague blob of “chronic illness things.” Then a search asks a specific question, and the system returns a cousin of the answer rather than the answer.

This is not always a data quality problem.

That phrase, “data quality problem,” is one of the great dustbins of enterprise life. Everything embarrassing is thrown into it. Bad mapping? Data quality. Bad workflow? Data quality. Bad model? Data quality. Bad governance? Data quality. Representation failure? Also data quality. Soon the phrase means nothing except “something hurt us and we lack the courage to name it.”

Many vector failures are representation failures. The source data may be perfectly adequate for its original purpose. A note may make sense to the clinician who wrote it. An HL7 v2 message may work fine for operational routing. A CDA document may satisfy the medico-legal document requirement. But once you flatten, chunk, strip, embed, and index it, you may lose the very relationships needed for retrieval. The data did not rot. The representation did.

This is not a small distinction. It changes the remedy. If the data is bad, you clean the data. If the representation is bad, you redesign the pipeline.

The second goblin is filtering. In demo-land, you ask the vector database a question and it cheerfully returns beautiful matches from the whole corpus. In production, some grim adult enters the room and says: only this patient, only this facility, only this study, only this tenant, only this date range, only this consent class, only this document type, only what this user is allowed to see. At that point the lovely open meadow of vector search becomes a Kolkata lane during monsoon, with one scooter, three goats, a taxi, a political procession, and an electrical cable hanging at face level.

Vector search is easy when it can search everything. Healthcare search must not search everything. It must search what is allowed, relevant, current, and safe. That means metadata is not garnish. Metadata is architecture.

If patient identity, encounter date, source system, document class, authoring workflow, security label, and provenance are not carried alongside the embedding, the vector database becomes a reckless gossip. It may know interesting things, but it has no discipline.

The third goblin is versioning. Embeddings are not eternal truths. They are coordinates created by a specific model. Change the embedding model and the geometry changes. Change the preprocessing and the geometry changes. Change the chunking strategy and the geometry changes. Add new documents and old neighborhoods shift in importance. Keep mixing vectors from different model versions without tracking lineage and you have built a small museum of incompatible maps.

This is especially dangerous because the system may still work well enough to fool you. Bad architecture rarely collapses on the first day. It smiles. It gives plausible answers. It passes a few demos. Then one month later someone asks why a new policy is not being retrieved, why an old note outranks a current one, why pediatric content appears in an adult workflow, or why two semantically different concepts have become neighbors in the machine’s little geometry bazaar.

The answer is usually not one thing. It is five things wearing one raincoat.

The fourth goblin is the fantasy that vector databases can replace structured systems. They cannot. A relational database remains better for exact facts, transactions, joins, counts, constraints, and well-defined records. A terminology service remains better for controlled vocabulary relationships. A graph database may be better for explicit networks of entities and relationships. A time-series system may be better for ordered measurements. A document store may be better for preserving document shape. A vector database is for similarity retrieval. That is a powerful job. It is not every job.

Architecture begins when you stop asking one machine to become all machines.

This matters for RAG, because RAG is now where many vector databases are sold, installed, praised, cursed, and quietly misunderstood. In RAG, the system retrieves relevant material and gives it to an LLM so the LLM can answer with some grounding. This is sensible. It is also fragile. The LLM is only as good as the evidence retrieved. If retrieval brings the wrong chunk, stale chunk, context-free chunk, or legally forbidden chunk, the LLM may produce a confident answer with the moral authority of a drunk uncle quoting Wikipedia from memory.

The charm of language models is fluency. The danger of language models is also fluency. A bad SQL query often looks ugly. A bad generated answer can look like it went to finishing school.

So the retrieval layer must be judged separately from the generation layer. Did it find the right evidence? Did it preserve source links? Did it respect metadata filters? Did it rank recent and authoritative material correctly? Did it handle negation? Did it distinguish “suspected” from “confirmed,” “family history” from “personal history,” “ordered” from “administered,” “active” from “discontinued”? Did it return nothing when nothing safe and relevant existed?

Nothing is an underrated answer. Many systems would be safer if they learned to say it.

The non-obvious architectural insight is that vector databases are not mainly search infrastructure. They are representation infrastructure. The real design decision is not “Which vector database should we buy?” It is “What are we willing to turn into geometry, what context must remain outside geometry, and how do we keep the two tied together without pretending they are the same?”

For healthcare IT, this means the vector layer should be downstream and derived. The EHR remains the operational source. The warehouse or lakehouse may remain the analytical substrate. The terminology service remains the guardian of coded meaning. The integration engine remains the traffic controller for HL7 v2 and other feeds. The vector database should sit as a retrieval accelerator, not as the throne room of truth.

Use vectors to find candidates. Use metadata to constrain the search. Use structured systems to verify facts. Use reranking to improve relevance. Use provenance to show where evidence came from. Use governance to decide what may be retrieved. Use human review where the task carries clinical, legal, or operational consequence.

This is not glamorous. Good architecture rarely is. It is mostly preventing tomorrow’s disaster from being born today.

A practical design starts with boring questions. What exactly is being retrieved? Policies? Clinical notes? Prior authorization rules? Research eligibility criteria? Patient education material? Interface documentation? Incident tickets? What is the acceptable failure mode? Is missing a result worse than returning a noisy result? Must the system explain itself? Does the answer need source citations? Are users allowed to see all retrieved material? How fresh must the index be? Does the source data change every minute, every night, or once every committee finally stops arguing?

Then come the technical questions. Which embedding model? What chunk size? What overlap? What metadata schema? What ANN index? What hybrid search method? What reranker? What monitoring? What evaluation set? What re-embedding plan? What rollback plan? What happens when the embedding model changes or the vendor changes its pricing or the API develops indigestion during a release window?

The realistic constraint is that clean solutions are often impossible because healthcare systems are already old cities, not empty plots of land. There are legacy feeds, vendor contracts, half-documented interfaces, departmental databases, research spreadsheets, compliance rules, and unofficial workflows that became official by surviving long enough. You cannot march into this with a shiny vector database and announce semantic liberation. The old systems will look at you, sip tea, and continue being old systems.

So the sensible path is incremental. Start with bounded retrieval. Choose a corpus whose purpose is clear. Preserve source identifiers. Keep metadata rich. Evaluate with real questions from real users. Track failures. Separate retrieval quality from answer quality. Do not use the vector store as a dumping ground for everything with text in it. Do not let a successful demo become production policy. Do not confuse “the answer sounds good” with “the evidence is correct.”

Vector databases are useful because human language is slippery and enterprise data is worse. They help us search across paraphrase, abbreviation, and conceptual resemblance. In healthcare, that is valuable. A good vector layer can help an analyst find relevant documentation, help an engineer search interface notes, help a clinical informaticist compare protocols, help a support team retrieve prior incidents, and help an AI assistant ground its answer in local knowledge rather than floating away into generic cloud vapor.

But the machine is not understanding in the old human sense. It is arranging shadows in a mathematical room. Sometimes the shadows reveal the object better than a keyword ever could. Sometimes they merge two objects that should never be merged. The architect’s job is to know the difference before some poor user has to discover it at 2 a.m.

That, finally, is the sober beauty of vector databases. They are not magic. They are not nonsense either. They are a new retrieval instrument, sharp and useful, but only when held by people who remember that meaning does not live in the index alone. Meaning lives in workflow, context, time, provenance, permission, terminology, and human purpose. The vector only points. The architecture must decide whether it is pointing at the truth, a cousin of the truth, or a well-dressed lie.
