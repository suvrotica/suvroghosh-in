---
title: "SQL, or Sequel: The Immortal Language of Data"
description: "How SQL grew from an IBM research project into the enduring language that quietly powers databases, software, and modern artificial intelligence."
date: "2026-07-31"
dateModified: "2026-08-01"
thumbnail: "/thumbnail/Compress_20260801_150709_9094.jpg"
thumbnailAlt: "Rows of database servers inside a modern data centre."
category: "Engineering Blog"
tags: ["PostgreSQL Global Development","Stack Overflow","Developer Survey","Young Researchers Accidentally","Apache Cassandra","SQL","Relational","Database","Codd","Query"]
published: true
color: "#336791"
---

<TTS />

<Pi
  src="/thumbnail/Compress_20260801_150709_9094.jpg"
  alt="Rows of database servers in a data center"
/>

# The Invisible Cathedral

I want you to picture, for a moment, something vast and almost entirely unseen.

Not the internet—that tired metaphor of tubes and clouds and glowing fiber-optic threads snaking beneath oceans, which at least has the decency to announce itself with blinking routers and the occasional submarine-cable map. No. I want you to picture something older, quieter, more ruthlessly organized: a considerable portion of the accumulated structured knowledge of human civilization, sitting in tables, rows, and columns, waiting patiently to be asked questions.

Think of bank transactions. Flight bookings. Medical records. Payrolls. Tax returns. Inventory counts. Hotel reservations. Insurance claims. Manufacturing orders. Customer accounts. Laboratory results. Election rolls. The little bureaucratic fossils left behind whenever a person, machine, company, or government does something and decides it may later need to prove that the thing occurred.

Not all data lives in relational databases. An enormous amount now resides in object stores, document databases, key-value systems, search indexes, graphs, event streams, log files, spreadsheets, image archives, and digital cupboards nobody has dared open since 2008. But a remarkable share of civilization’s operational memory still passes through relational systems. And most of those systems speak some dialect of the same language.

SQL.

Or, if you are of a certain vintage, or simply prefer a pronunciation with fewer corners: *sequel*.

In Stack Overflow’s 2025 Developer Survey, 58.6% of all respondents said they had done extensive work in SQL during the previous year. Among the survey’s programming, scripting, and markup technologies, SQL ranked third—behind JavaScript and HTML/CSS and just ahead of Python.[^stackoverflow-tech] This was not a census of Earth. No developer survey is. But it was a useful reminder that a language born before the IBM PC, before the World Wide Web, and before the commercial internet remains embedded in everyday technical work.[^ibm-pc]

And here we are, in the roaring summer of 2026, with artificial intelligence models generating code, poetry, protein structures, legal boilerplate, architectural plans, and mildly unhinged social-media posts at a scale that would have seemed like sorcery to the people who invented SQL. Large language models can now write Python, Rust, JavaScript, Java, and COBOL with the breezy confidence of a caffeinated intern. They can produce entire applications from a paragraph, though the resulting plumbing may occasionally resemble something assembled at three in the morning by raccoons.

And still.

*Still.*

SQL persists. SQL thrives. SQL evolves.

How?

That is the question this essay intends to chase through the labyrinthine corridors of history, mathematics, corporate ambition, engineering pragmatism, and the peculiar, stubborn genius of a language that refuses to be replaced. We will move from the big picture—the cathedral of civilization’s data—downward into the increasingly intimate mechanics of how the language works, why it works, who made it work, where its limits lie, and what happens now that machines are learning to speak it on our behalf.

So. Let us begin where many good stories about technology begin: with a mathematician who was annoyed.

---

## The Man Who Saw Tables Everywhere

His name was Edgar Frank Codd, though he was known universally to colleagues and friends as Ted, and if you had encountered him at IBM’s San Jose Research Laboratory in the late 1960s, you might have mistaken him for a particularly thoughtful British accountant rather than the man who was about to place the entire field of database management on a new scientific foundation.[^codd-memorial]

Codd was an Oxford-educated mathematician who had served in the Royal Air Force during the Second World War. He moved to the United States after the war and joined IBM in 1949 as a programming mathematician. He worked on the Selective Sequence Electronic Calculator, the IBM 701, and the immense STRETCH computer. He had, by any reasonable measure, already lived several consequential technical lives before he turned his attention to what was then a genuinely maddening problem: databases were a complete and utter mess.

The prevailing systems were largely **navigational**. Hierarchical databases arranged data like an organizational chart or family tree. Network databases connected records through elaborate webs of links and pointers. Indexed-file systems provided efficient access but still required application programmers to know a great deal about paths, record layouts, and physical organization.

If you wanted a fact, you often had to know not merely *what* the fact was but how to travel through the machinery to reach it. The application code carried a little map of the database’s intestines. Change the physical layout, and the program might need surgery.

It was, as Codd’s later colleague Chris Date memorably described the state of the field, “completely ad hoc and higgledy-piggledy.”[^date-tribute]

Codd was a mathematician. Mathematicians do not tolerate higgledy-piggledy for long. They may tolerate cluttered offices, missing socks, and coffee cups that have developed their own microbial weather systems, but they become restless when a subject lacks abstraction, rigor, and proof.

So in June 1970, Codd published a paper in *Communications of the ACM* with a title so deceptively modest that it barely hints at the intellectual detonation contained within: “A Relational Model of Data for Large Shared Data Banks.”[^codd-paper]

The central idea was almost insultingly simple, which is often what happens after a difficult idea has finally been understood.

What if users did not have to care how records were physically arranged on disk?

What if applications dealt with the logical meaning of data while the database system dealt with tracks, blocks, pointers, indexes, and access paths?

What if information could be represented as mathematical **relations**, and questions about that information could be expressed through operations grounded in set theory and predicate logic?

A relation, in the formal model, is a set of **tuples**. A tuple is not, strictly speaking, an ordered list. It associates named attributes with values. A table is the familiar two-dimensional representation: tuples appear as rows, attributes as columns, and the whole thing looks comfortingly like a ledger maintained by a clerk with excellent posture.

The order of those rows is not part of the relation. Nor is the left-to-right order of attributes mathematically fundamental. The rectangle is a human convenience, not the underlying truth.

Codd’s relational model also placed enormous emphasis on **data independence**: the separation of the logical view presented to users from the physical arrangements used to store and retrieve information. You should be able to ask for the facts without supplying turn-by-turn directions to the sectors in which they happen to live.

This was the intellectual equivalent of giving someone your street address rather than a twenty-seven-step description involving a banyan tree, a shuttered pharmacy, two suspicious dogs, and the lane immediately after the man who repairs umbrellas.

The route became the system’s problem.

Codd’s work established a framework for keys, normalization, relational operations, integrity, and logical database design. It provided the scientific soil from which relational algebra, relational calculus, and the modern theory of relational databases would grow.

SQL would later inherit this model, though not with perfect doctrinal purity. Mathematical relations contain no duplicate tuples; SQL preserves duplicate rows unless `DISTINCT` is requested. Classical predicate logic has true and false; SQL’s `NULL` introduces a third condition, unknown, which has spent decades causing otherwise competent programmers to stare at query results as though betrayed by a close relative.[^sql-semantics]

SQL is therefore not identical to Codd’s relational model. It is the model’s commercially successful, practically minded, occasionally eccentric descendant.

IBM recognized that Codd’s proposal was potentially transformational. But a beautiful theory does not automatically become a useful machine. A relational system had to be built, tested, optimized, and made fast enough that ordinary organizations could trust it with work more urgent than demonstrating a theorem.

In 1973, IBM researchers began the project that became known as **System R**, an industrial-strength attempt to prove that Codd’s ideas could survive contact with actual hardware, actual users, and actual corporate impatience.[^ibm-codd]

This is where our story pivots from the austere realm of mathematical relations into the gloriously compromised human world of engineering.

Because creating the model was one thing.

Creating the language—the bridge between human curiosity and mathematical relation—was something else entirely.

---

## SEQUEL, or: How Two Young Researchers Accidentally Built the Latin of Computing

Donald Chamberlin had completed his doctorate at Stanford and joined IBM Research permanently in 1971. Raymond Boyce had completed his doctorate at Purdue and joined IBM’s Yorktown Heights laboratory soon afterward. They were young, mathematically capable, and working in a field whose conventions had not yet hardened into stone.

In 1972, Chamberlin and Boyce attended a symposium at which Codd explained the relational model. Chamberlin had been working with the old CODASYL approach, in which a sufficiently complicated query could require pages of navigational instructions. Codd showed that the same question could sometimes be reduced to a compact relational expression.

It was, Chamberlin later recalled, a conversion experience.[^chamberlin-oral-history]

The two researchers began experimenting with a language called **SQUARE**:

**Specifying Queries As Relational Expressions.**

SQUARE was powerful and relationally complete. It was also burdened with mathematical notation, subscripts, superscripts, and symbols that demanded either specialized equipment or a typist who had recently completed a minor degree in hieroglyphics.[^square]

Chamberlin and Boyce loved Codd’s ideas. They loved data independence. They loved tables. They loved the possibility of compressing pages of navigation into a short declaration.

What they did not love was having to type Greek letters.

At the end of 1972, IBM decided to consolidate much of its relational work in San Jose. Chamberlin, Boyce, and several colleagues moved to California in early 1973 and joined the group that would become System R.

Their mission was to create a successor to SQUARE that actual human beings could use—professional programmers, certainly, but also the “more infrequent database user” who should not have to become a logician merely to locate the employees in Department 14.

They called it **SEQUEL**:

**Structured English Query Language.**

The name was also an ordinary English joke. This new language was a *sequel* to SQUARE: the next attempt, this time replacing much of the mathematical notation with recognizable English keywords.

The first SEQUEL paper, written by Chamberlin and Boyce, was published in May 1974. It described a language built from consistent English templates and intended for both professional programmers and less frequent database users.[^sequel-paper]

In modern SQL, a query in the spirit of their design might look like this:

```sql
SELECT name, salary
FROM employees
WHERE department = 'RESEARCH';
```

Look at that.

Just look at it.

More than five decades later, you can walk into virtually any software company, bank, hospital, university, government department, analytics office, or moderately ambitious bicycle-rental startup and find someone writing something recognizably similar.

The verbs—`SELECT`, `FROM`, `WHERE`—are so plain, so aggressively un-magical, that they border on the insultingly obvious.

And that, precisely, is the genius.

You do not tell the database which disk page to inspect. You do not specify a pointer chain, a B-tree descent, a hash probe, or a join algorithm. You state the result you want and the conditions it must satisfy.

This is what computer scientists call a **declarative language**.

In an imperative language, you write a recipe:

Do this.  
Then do that.  
Check this condition.  
Repeat until the machine becomes resentful.

In a declarative language, you write a wish:

*Give me the names and salaries of employees in research.*

The database system becomes responsible for turning logical intent into physical work.

That shift—from describing *how* to retrieve data to declaring *what* data is wanted—is one of the most consequential abstractions in the history of computing. It allows the same query to survive changes in storage, indexing, memory, processors, parallelism, and machine architecture. The words remain steady while the machinery beneath them evolves.

But SEQUEL had a problem.

Not a mathematical problem.

Not a performance problem.

A legal problem.

The name collided with a trademark held by the Hawker Siddeley aircraft company in Britain. IBM’s lawyers objected, and the language lost its vowels. SEQUEL became SQL, following the respectable computing tradition of names that look as though they were devised during a temporary worldwide shortage of letters.[^sql-reunion]

The reduced name came to stand for **Structured Query Language**.

Both pronunciations survived. *Sequel* preserves the original name. *Ess-cue-el* reads the initials. No technical distinction hangs on the choice, and no database has yet refused a query on phonetic grounds.

I shall use both arbitrarily, because linguistic consistency seems a rather small demand to place upon a language whose implementations cannot agree on how to quote an identifier.

---

## From Laboratory Curiosity to Commercial Empire

Brilliant research does not, by itself, change the world.

Brilliant research needs hardware. Product teams. Manuals. Salespeople. Support contracts. Standards committees. Hungry entrepreneurs. Executives willing to spend money before the outcome is obvious and lawyers prepared to explain why the resulting product name cannot contain vowels.

In 1977, Larry Ellison, Bob Miner, and Ed Oates founded a company called Software Development Laboratories. It later became Relational Software, Inc., and eventually Oracle.

The founders saw commercial opportunity in the relational model and SQL. In 1979, Relational Software released Oracle Version 2 for the DEC PDP-11. Oracle describes it as the first commercially available SQL-based relational database management system. Computing history contains enough rival definitions of *first* to furnish a small courthouse, so “one of the earliest commercial SQL systems” is the safer formulation.[^oracle-history]

The “Version 2” label has become part of company folklore. There had been no commercially released Version 1. According to the customary account, Version 2 sounded reassuringly mature, whereas Version 1 sounded like something that might erase the payroll and then request a reboot.

Oracle Version 3 followed in 1983. Rewritten in C, it could be ported across a much wider range of machines. This mattered enormously. A database was no longer tied as tightly to one hardware kingdom. It could travel.

IBM, meanwhile, was hardly idle. System R had shown that a relational database could be practical, and Patricia Selinger’s work on cost-based query optimization helped demonstrate that declarative queries did not have to be condemned to a life of scholarly elegance and appalling performance.

IBM announced SQL/DS in 1981 and launched DB2 for mainframes in 1983.[^ibm-selinger]

The company that had produced Codd’s relational model and the language that became SQL had now placed its institutional weight behind commercial relational products. Competitors listened. Customers listened. Developers listened. Alternative relational languages, including QUEL from the Ingres project at the University of California, Berkeley, continued to exist but gradually lost the market contest for a common interface.

SQL’s greatest commercial advantage was no longer merely that it was good.

It was that other people were already using it.

This is the point at which a language begins to acquire **network effects**. Books appear. Courses appear. Consultants appear. Job descriptions appear. People solve problems, publish the solutions, and teach them to other people. Tools accumulate like barnacles. A language stops being only syntax and becomes an economy.

But growth without standards is merely tribal warfare conducted with semicolons.

Every vendor had incentives to add proprietary features, preserve customer dependence, and interpret ambiguous behavior in ways most convenient to itself. A query written for one system might fail on another. Data types differed. Functions differed. Transaction behavior differed. Even apparently simple matters such as limiting a result set became a dialect festival: `LIMIT`, `TOP`, `FETCH FIRST`, `ROWNUM`, and whatever local incantation had been approved by the village elders.

ANSI’s X3H2 database committee, formed in 1978, eventually took up the task of formal SQL standardization. On October 16, 1986, ANSI approved X3.135-1986, the first formal SQL standard. ISO followed in 1987 with ISO 9075.[^ansi-sql][^iso-1987]

The standard did not make every implementation identical. It did something more practical: it established a shared center of gravity.

A programmer trained on one relational system could recognize another. Applications still required adaptation, sometimes modest and sometimes resembling invasive surgery, but the core language became portable enough to sustain an industry.

The `SELECT`.  
The `FROM`.  
The `WHERE`.  
The `JOIN`.  
The `GROUP BY`.  
The `INSERT`.  
The `UPDATE`.  
The `DELETE`.

Vendors continued to add extensions. They still do. They always will. It is in their financial DNA.

But SQL had acquired something more durable than any one product.

It had become a common grammar.

---

## The Grammar of Civilization: How SQL Actually Works

SQL is a **domain-specific language** centered on defining, querying, securing, and changing data and database structures. It is not a general-purpose language like Python, C++, or Java.

You cannot sensibly write a video game entirely in SQL.

You cannot sensibly write an operating system entirely in SQL.

You cannot sensibly build a web browser entirely in SQL.

The word *sensibly* is carrying a great deal of weight in those sentences. Human beings have repeatedly demonstrated that, given sufficient boredom and access to a compiler, they will implement almost anything in almost anything else.

Practitioners and textbooks often divide SQL informally into several functional sublanguages. This taxonomy is useful, though it is not a single sacred partition dictated by the ISO standard.

**Data Query Language**, or DQL, is the glamorous face of SQL—the part people encounter first, the part that makes the novice feel briefly omniscient.

This is `SELECT`.

Show me all customers who spent more than five hundred dollars last month.

Show me the average temperature reported by each sensor between midnight and four a.m.

Show me every patient with a recorded allergy to penicillin.

Show me the employees who report to someone who reports to someone whose surname begins with M, because organizational charts are apparently too straightforward.

**Data Manipulation Language**, or DML, contains the verbs of change:

`INSERT`  
`UPDATE`  
`DELETE`  
and, in many systems, `MERGE`

These are the statements by which new facts enter the system, old facts are revised, and regrettable facts are removed—although backups, audit logs, replicas, and compliance departments may ensure that removal remains a somewhat philosophical concept.

**Data Definition Language**, or DDL, is the architect’s toolkit:

`CREATE`  
`ALTER`  
`DROP`

This is where tables are born, columns are added, constraints are declared, indexes are created, and entire schemas are demolished because somebody ran a migration against the wrong environment.

DDL is the language of structure and ontology. It decides what kinds of things may exist, what attributes they possess, which values are permitted, and how those things relate to one another.

**Data Control Language**, or DCL, governs authority:

`GRANT`  
`REVOKE`

It determines who may read, change, execute, or administer what. This is less glamorous than `SELECT` but considerably more important when the database contains salaries, medical histories, national identifiers, unreleased financial results, or the private correspondence of people who confidently assumed the interns could not see it.

Transaction-control statements such as `COMMIT`, `ROLLBACK`, and `SAVEPOINT` manage groups of changes as units. They let several operations succeed together or fail together rather than leaving the database in a half-finished state—money removed from one account but never added to another, for example, which is the sort of distributed existential crisis banks prefer to avoid.

Together, these facilities form a surprisingly complete environment for working with data.

But the central philosophical trick remains declarative expression.

When you write:

```sql
SELECT *
FROM orders
WHERE total > 1000;
```

you do not normally tell the database how to find those orders.

You do not say:

1. Open this file.
2. Follow that pointer.
3. Descend this B-tree.
4. Read these pages into memory.
5. Probe this hash table.
6. Pray that the statistics were collected sometime after the invention of electricity.

You state a logical requirement:

*Return the rows whose total exceeds one thousand.*

The database’s query optimizer then chooses a physical strategy based on the tables, indexes, statistics, partitions, available memory, parallel resources, and implementation rules of that particular system.

This separation of **logical intent** from **physical execution** is the abstraction that allowed relational databases to survive radical changes in hardware. A query written decades ago may still run today. It may run much faster without having changed at all because the database now has better indexes, better statistics, more memory, parallel processors, improved storage, or a smarter optimizer.

The machine does not necessarily learn merely because the query has been executed before. Traditional optimizers are not genies accumulating wisdom from each wish. But as the surrounding system improves, the same declaration can receive a better plan.

This is the essential bargain SQL offers:

You specify the result.

The database negotiates with reality.

---

## The Long March Through Standards: SQL’s Evolutionary Tree

Had SQL remained frozen in its 1986 form, it would now be a museum piece: historically important, academically instructive, and insufficient for much of modern computing.

But SQL did not freeze.

It accreted.

It absorbed.

It developed new limbs, some elegant, some awkward, some appearing to have been attached after a vigorous committee meeting in a badly ventilated conference room.

The history of SQL standardization is not a simple sequence of monolithic language releases. Modern SQL is a family of multipart standards covering the core language, call-level interfaces, stored modules, external data, Java bindings, XML, multidimensional arrays, property graphs, and other concerns. Vendors implement different portions at different speeds and then add proprietary features of their own.[^sql-2023-framework]

Even so, the major editions form a useful geological record.

**SQL-86 and SQL-87** established the first standardized core: schema definition, data manipulation, queries, views, authorization, and embedded use with conventional programming languages.

**SQL-89** refined and extended the first standard, including work around integrity and referential relationships. It was less a revolution than the standards equivalent of returning to a newly built house and discovering which doors scraped the floor.

**SQL-92**, often called SQL2, was the first great expansion. It standardized richer data types, more expressive joins, subqueries, integrity constraints, schema facilities, transaction behavior, and multiple conformance levels. Much of what developers now think of as ordinary SQL took recognizable shape here.

**SQL:1999**, sometimes called SQL3, moved into object-relational territory. It introduced recursive queries, triggers, procedural facilities, user-defined types, and other machinery intended to stretch the relational system beyond flat business tables.

**SQL:2003** strengthened analytical SQL, including standardized window functions, and developed facilities involving XML, sequences, generated values, and richer database programming.

Window functions deserve a moment of reverence. They allow calculations across related rows without collapsing those rows into a single aggregate result. Running totals, rankings, moving averages, comparisons with previous values—all the analytical tricks that once required elaborate self-joins or application code could increasingly be expressed inside SQL itself.

**SQL:2008** consolidated and refined the growing language, clarifying behavior and extending existing facilities rather than unveiling one single civilization-altering idea.

**SQL:2011** standardized temporal features for representing periods and system-versioned information. A database could more directly express not merely what is true now but what was recorded as true at an earlier time.

This is a subtle shift. Ordinary tables describe a world. Temporal tables describe a world and its administrative memory of itself.

**SQL:2016** brought major facilities for JSON and row-pattern recognition. The standard was acknowledging what developers had already demonstrated with great enthusiasm: not all useful data arrives obediently shaped like a rectangular tax form.

**SQL/MDA**, standardized as a separate part in 2019 and revised in 2023, addressed multidimensional arrays—important for scientific, geospatial, image, and analytical workloads.

**SQL:2023** continued the long campaign of absorption. Its foundation incorporated a native JSON type and associated facilities, while a new Part 16 standardized property-graph queries through SQL/PGQ.[^sql-pgq]

This does not mean every database suddenly implemented every SQL:2023 feature. Standards are not software releases. ISO does not descend from the clouds, blow a silver trumpet, and cause all vendor documentation to update simultaneously.

Implementation is uneven.

Dialects remain.

PostgreSQL is not Oracle. Oracle is not SQL Server. SQL Server is not MySQL. MySQL is not SQLite. Snowflake is not BigQuery. A query that works beautifully in one may cause another to respond with an error message of such compressed hostility that it seems personally disappointed in you.

But the long pattern is unmistakable.

XML appears; SQL absorbs XML.

JSON appears; SQL absorbs JSON.

Analytical systems flourish; SQL expands its analytical grammar.

Temporal data becomes important; SQL acquires temporal machinery.

Property graphs become useful; SQL grows a graph-querying part.

This is not merely a language chasing trends. It is a language acting as a **standard of standards**, a gravitational center that continually draws useful ideas into its orbit.

SQL’s preferred method of defeating a rival is not to destroy it.

It is to digest it.

---

## The NoSQL Rebellion and the Inevitable Return

No history of SQL would be complete without the rebellion.

The uprising.

The brief, heady period when many intelligent people became convinced that relational databases had reached the end of their natural lives and should be allowed to die with dignity beneath a tasteful plaque reading:

> HERE LIES THE JOIN  
> IT COULD NOT SCALE

In the late 2000s and early 2010s, companies operating at internet scale faced workloads that did not fit comfortably inside the conventional architecture of a single relational database server. They needed to distribute enormous volumes of data across fleets of commodity machines. They needed high write rates, geographic replication, flexible structures, specialized access patterns, and continued operation despite failures that were no longer exceptional events but part of the weather.

A broad family of systems emerged under the name **NoSQL**.

The movement was never one coherent theory. It was a crowded railway platform containing people traveling in several different directions while sharing a common dislike of the old timetable.

Document databases such as MongoDB stored JSON-like records.

Key-value systems such as DynamoDB emphasized direct access by key.

Wide-column systems such as Cassandra and HBase distributed sparse data across clusters.

Graph databases such as Neo4j treated relationships as first-class structures.

Search systems such as Elasticsearch optimized text retrieval, relevance, and aggregation.

Many early NoSQL systems traded some combination of broad transactions, joins, rigid schemas, relational abstraction, and ad hoc querying for easier distribution, specialized data models, or predictable performance at enormous scale.

The trade-offs differed sharply from system to system. It is inaccurate to say that NoSQL simply discarded ACID—Atomicity, Consistency, Isolation, and Durability—as though an entire industry had collectively decided that correctness was bourgeois. Some systems offered narrow transactional guarantees. Some later added broader ones. Some were never intended to replace financial ledgers or hospital records in the first place.

The rebellion was useful because many of its complaints were correct.

Relational systems could be rigid.

Horizontal distribution was difficult.

Cross-machine joins could become expensive.

A normalized schema designed for integrity might be awkward for an application whose dominant requirement was retrieving one enormous aggregate object at low latency.

There are problems for which a document, graph, key-value, time-series, search, or column-family model is more natural than a conventional relational design. Pretending otherwise is not devotion to mathematical purity. It is merely bad engineering in a tie.

And yet the NoSQL revolt encountered an inconvenient fact.

Users still needed to ask questions.

At first, some new systems offered APIs tied closely to their internal data models. This worked beautifully until people wanted reporting, analytics, exploratory querying, business intelligence, ad hoc investigation, and all the other activities that begin with a manager saying, “Could you quickly tell me—” and end three weeks later with a data engineer quietly applying for agricultural work.

SQL began returning through the side door.

Amazon DynamoDB adopted **PartiQL**, which provides SQL-compatible access to structured, semi-structured, and nested data.[^partiql]

Apache Cassandra developed **CQL**, the Cassandra Query Language, whose syntax deliberately resembles SQL even though its distributed model and query restrictions are very different.[^cassandra-cql]

Elasticsearch added an SQL interface that translates SQL-like queries into operations against the search engine.[^elasticsearch-sql]

MongoDB’s Atlas SQL Interface became generally available in 2023, aimed particularly at analytics and business-intelligence tools that expected tabular, SQL-accessible data.[^mongodb-sql]

The pattern was not universal, and these interfaces did not magically turn nonrelational systems into ordinary relational databases. CQL is not PostgreSQL wearing a different hat. PartiQL against DynamoDB must still respect DynamoDB’s partitioning and access model. Elasticsearch SQL inherits the capabilities and limitations of Elasticsearch.

But the recurring demand was unmistakable.

Users wanted SQL—or something close enough to SQL that their accumulated knowledge remained useful.

Database researchers Michael Stonebraker and Andrew Pavlo have argued that this pattern repeats across generations: new systems reject the relational model or SQL, solve a genuine problem, and later converge toward relational features or SQL-like interfaces as their users demand broader functionality.[^stonebraker-pavlo]

Meanwhile, relational systems learned from the rebellion.

PostgreSQL’s `JSONB` type allowed semi-structured documents to be stored, queried, and indexed alongside conventional relational data.[^postgresql-json]

Cloud databases improved replication and distribution.

Distributed SQL systems such as Google Spanner, CockroachDB, and YugabyteDB attempted to preserve relational semantics and SQL interfaces while scaling across machines and regions.

Analytical databases became columnar, parallel, distributed, and cloud-native.

The boundary between SQL and NoSQL blurred until the old slogans became less useful than the actual workload.

The NoSQL movement did not kill SQL.

It forced SQL systems to become broader, more distributed, and less doctrinaire.

And SQL, displaying the survival strategy that has served it for half a century, absorbed the best parts of the attack.

---

## Where It Lives: The Ubiquitous Geography of SQL

Where, exactly, does SQL operate?

The easy answer is “everywhere,” but easy answers are how technological mythology begins.

The more accurate answer is that SQL appears across an astonishing range of systems wherever structured or semi-structured data must be queried, transformed, governed, or analyzed.

SQL lives in mainframes processing banking, insurance, government, retail, and airline workloads on descendants of systems first deployed when office telephones had cords and executives believed sideburns indicated dangerous radicalism.

It lives in Oracle and IBM Db2 estates that have accumulated decades of procedures, controls, integrations, specialist knowledge, and carefully negotiated fear.

It lives in Microsoft SQL Server, the corporate workhorse behind innumerable business applications, hospital systems, reporting platforms, manufacturing processes, and government databases.

It lives in PostgreSQL, an extensible open-source system capable of behaving like a conventional relational database, a document store, a geospatial platform, a full-text engine, a time-series foundation, and—given sufficient extensions and ambition—something resembling a municipal government.

It lives in MySQL, a pillar of the LAMP stack that powered a substantial portion of the early web and continues to support countless WordPress, Drupal, e-commerce, and custom applications.

It lives in **data warehouses** such as Snowflake, BigQuery, Redshift, and Databricks SQL, where analytical queries scan terabytes or petabytes rather than the few thousand rows that once made an office database feel important.

It lives in **data lakes** and lakehouses, where engines such as Trino and Presto can issue SQL queries against files stored in object systems without first transforming the whole lake into a traditional database.

It lives in **stream-processing systems** such as Apache Flink and ksqlDB, where SQL-like statements operate continuously against events still arriving. The table is no longer a placid rectangle sitting on disk. It is a moving river temporarily persuaded to behave like one.

It lives inside applications through **SQLite**, a self-contained, serverless, zero-configuration SQL engine embedded in phones, computers, browsers, desktop software, appliances, and an incalculable population of devices whose owners have no idea they are running a database.[^sqlite]

You have probably used SQLite today.

SQLite did not feel the need to inform you.

It lives in managed cloud services—Amazon RDS, Azure SQL Database, Google Cloud SQL, AlloyDB, Oracle Autonomous AI Database—where the provider handles some combination of provisioning, replication, backups, patching, failover, and the emotionally draining business of discovering at two in the morning that a certificate expired yesterday.

SQL also lives increasingly beside artificial intelligence.

SQL Server 2025 includes a native `VECTOR` type and functions for generating and comparing embeddings. Its approximate vector-index and vector-search facilities remain documented as preview features, but the architectural direction is clear: vector data can live beside conventional relational records rather than being exiled automatically to a separate specialist service.[^sqlserver-vector]

Oracle introduced AI Vector Search under the Database 23ai name and replaced that product name with **Oracle AI Database 26ai** in October 2025. Oracle’s Select AI facilities can translate natural-language prompts into SQL, support retrieval-augmented generation over vector stores, and connect language models to governed database data.[^oracle-26ai][^oracle-select-ai]

The relational database is therefore learning to store not only customer numbers, invoice dates, and medication codes but numerical representations of meaning itself.

This does not make every relational database a perfect vector database. Nor does it eliminate the case for specialized systems. It means the old cathedral has acquired another wing.

SQL has become a lingua franca for data—not the only language, and not equally native everywhere, but the shared tongue spoken across an extraordinary archipelago of transactional systems, warehouses, lakes, streams, applications, and analytical platforms.

When you learn SQL, you are not learning one product.

You are learning a transferable core.

Sooner or later, of course, every product reveals its local dialect: proprietary types, functions, procedural languages, locking behavior, optimizer hints, partitioning rules, deployment machinery, and syntax that seems to have been added during a period of regional unrest.

Moving a simple `SELECT` statement is easy.

Moving twenty years of stored procedures, triggers, security rules, operational assumptions, and month-end reporting is when the furniture begins coming through the window.

Still, the common grammar matters.

It allows knowledge to travel.

---

## Why It Matters: The Moral Weight of Structured Inquiry

We have covered the who, the what, the when, and the where.

Now we must confront the why.

Why should anyone who does not write database code for a living care about a fifty-year-old query language?

SQL matters because it is one of the most successful formal languages ever created for asking questions of recorded human activity.

Not truth.

Recorded activity.

That distinction is not pedantry. It is the difference between a database and an oracle, and databases are dangerous enough without granting them prophetic status.

Consider what a database actually contains.

It does not contain reality.

It contains assertions about reality:

This payment occurred.  
This patient has this allergy.  
This citizen lives at this address.  
This product costs this amount.  
This employee worked these hours.  
This aircraft seat belongs to this passenger.

Those assertions may be accurate.

They may also be stale, incomplete, duplicated, miscoded, misunderstood, fraudulently entered, or attached to the wrong person because two hospitals disagreed about whether a middle name was optional.

A database is not merely a warehouse. Warehouses store things inertly. A database is closer to a **theater of memory**—a system designed not only to hold recorded claims but to let those claims be selected, related, transformed, aggregated, constrained, and challenged.

When you write SQL, you perform a structured act of reasoning.

You define a population.

You establish conditions.

You state relationships.

You group evidence.

You count, compare, rank, and calculate.

Under a fixed database state and defined semantics, the engine evaluates the query reproducibly. It does not improvise an answer in the manner of a generative language model.

But reproducibility is not truth.

A syntactically perfect query may encode the wrong business rule.

A logically valid join may multiply records and double-count revenue.

A filter may exclude `NULL` values the author forgot existed.

A query without `ORDER BY` has no guarantee of returning rows in any particular order, however many times the developer observes them arriving in the same comforting arrangement.

A `SUM` over an approximate floating-point type can indeed lose cents. Financial correctness comes from exact numeric types, explicit rounding rules, reconciliation, constraints, testing, and controls—not from the mystical benevolence of the aggregate function.[^postgresql-numeric]

SQL’s epistemic advantage is therefore not infallibility.

It is **auditability**.

The query can be read.

The data lineage can be traced.

The result can be reproduced.

The assumptions can be inspected.

The statement can be tested against known cases, compared with an independent calculation, placed under version control, and challenged by somebody who understands the domain well enough to ask why the left join has quietly turned into an inner join.

This is profoundly valuable in an age of algorithmic fog.

A language model may produce a fluent explanation without revealing a stable chain from evidence to conclusion. A SQL query, by contrast, leaves an executable artifact. It may be wrong, but it is wrong in a form that can be examined.

There is a difference between a machine inventing a plausible answer and a machine executing a precisely stated bad idea.

The second problem is hardly harmless, but at least it leaves fingerprints.

When a hospital queries its systems for a recorded drug allergy, the SQL statement forms one link in a much larger safety chain. Correctness also depends on patient identification, data capture, terminology mapping, integration, timing, clinical workflow, interface design, professional judgment, and whether the allergy was ever entered in the first place.

The query matters.

It does not carry the entire moral burden alone.

When a bank calculates an account balance, SQL may participate in the calculation, but trustworthy money also depends on transaction isolation, exact decimal representation, double-entry controls, audit trails, reconciliation, authorization, and the institutional suspicion that has served accountants so well for several thousand years.

SQL scales from the trivial to the profound.

It can retrieve a high score from a mobile game.

It can determine which patients meet criteria for a clinical study.

It can help allocate government benefits.

It can calculate exposure across a financial institution.

It can support the census data from which representation, funding, and policy decisions are made.

The grammar is similar.

The consequences are not.

SQL also matters because it is unusually accessible.

Tables, rows, columns, and relationships correspond reasonably well to familiar human ways of organizing information. A beginner can learn a simple `SELECT` statement in an afternoon and immediately begin asking useful questions.

The first steps are gentle.

Advanced SQL is not.

A serious query involving recursive common-table expressions, lateral joins, nested window functions, temporal conditions, and conditional aggregation can resemble a plumbing diagram drawn by an octopus during an earthquake.

But the on-ramp remains broad. SQL has allowed generations of analysts, scientists, clinicians, journalists, administrators, economists, and curious amateurs to work directly with data without first becoming general-purpose software engineers.

It democratizes structured inquiry—not perfectly, not automatically, and certainly not without opportunities for catastrophe, but more successfully than almost any other formal language in common use.

---

## Inside the Query Engine

We have spoken about SQL as history, grammar, and philosophy.

Now let us follow a query into the machinery.

Database implementations differ, sometimes dramatically, but a modern relational engine commonly passes a statement through several broad stages: parsing, semantic analysis, optimization, and execution.

First comes the **parser**.

The parser reads the characters of the SQL statement and checks whether they form a valid sentence in the language. It recognizes keywords, identifiers, expressions, operators, clauses, and punctuation. It converts the text into a structured internal representation, often an **abstract syntax tree**.

If you have forgotten a comma, misplaced a parenthesis, or written `FORM` instead of `FROM`, this is where the database objects.

The error message may be helpful.

It may also announce merely that something is wrong “at or near” a location containing six nested parentheses, leaving you to conduct a small archaeological excavation.

Next comes semantic analysis, often called **binding** or **resolution**.

Do the referenced tables exist?

Do the columns belong to those tables?

Which `id` did you mean when four joined tables each contain one?

Are the data types compatible?

Does the current user possess permission to perform the operation?

A sentence can be grammatically valid and still meaningless. “Select the salary from the moon where the color is Tuesday” has an admirably SQL-like rhythm but may prove difficult to bind against the accounting schema.

Then comes the extraordinary part: **query optimization**.

The database must translate the logical query into a physical plan.

Suppose you join three tables. The engine may have several possible join orders. For each join it may consider a nested-loop join, hash join, or merge join. It may scan an entire table or use an index. It may filter rows early or late. It may execute serially or in parallel. It may read from partitions, replicas, memory, local storage, or remote sources.

The number of theoretically possible plans can grow explosively. A practical optimizer does not calmly enumerate every conceivable strategy as though comparing wallpaper samples. It searches a constrained space, applies transformation rules, estimates costs, prunes unlikely choices, and chooses a plan it believes will be efficient.

This entire tradition owes an enormous debt to Patricia Selinger and her colleagues on System R.

Their landmark 1979 paper described a cost-based approach to access-path selection. The optimizer estimated the cost of alternative plans using statistics about the data and selected among them rather than requiring the user to prescribe a navigational path.[^selinger-paper]

This helped make relational databases practical.

Codd had separated logical questions from physical storage.

The optimizer made that separation fast enough to survive commerce.

Modern optimizers may use:

**Predicate pushdown**, moving filters closer to the data source so unwanted rows are discarded early.

**Join reordering**, choosing a sequence that avoids creating enormous intermediate results.

**Partition pruning**, ignoring partitions that cannot contain relevant rows.

**Index selection**, deciding whether an index saves work or merely adds expensive detours.

**Cardinality estimation**, predicting how many rows each operation will produce.

**Vectorized execution**, processing batches of values rather than one row at a time.

**Parallel execution**, dividing work among cores, processes, or machines.

**Materialized-view rewriting**, recognizing that a precomputed result can satisfy part of the query.

Some modern systems also use adaptive execution or feedback, changing plans when observed conditions differ sharply from estimates. But this is not universal, and optimizers remain vulnerable to bad statistics, correlated data, skewed distributions, parameter sensitivity, and queries written by humans who have created a cross join large enough to acquire weather.

Once a plan has been chosen, the **executor** runs it.

It reads pages or column segments.

It applies filters.

It probes indexes.

It joins row sets.

It sorts, groups, aggregates, ranks, and projects.

It spills intermediate data to disk when memory runs short and does so with the weary dignity of a restaurant discovering that a coach party of sixty has arrived without a reservation.

Beneath the executor lies the storage and transaction machinery.

Different engines use different combinations of B-trees, hash indexes, log-structured merge trees, heaps, clustered storage, columnar formats, compression, caching, and partitioning.

They manage buffer pools so frequently accessed data remains in memory.

They maintain write-ahead logs so committed changes can be recovered after a crash.

They coordinate concurrent readers and writers through locks, multiversion concurrency control, timestamps, or other mechanisms.

They replicate data.

They checkpoint state.

They recover from failure.

They enforce constraints.

They attempt to guarantee that a transaction is atomic, consistent under the system’s declared rules, isolated according to a chosen level, and durable after commitment.

This is not simple software.

It is software refined over half a century under conditions of extraordinary hostility: power failures, disk failures, network partitions, overloaded servers, corrupted statistics, application bugs, impatient executives, auditors, financial deadlines, and users who begin a transaction before lunch and leave it open until Thursday.

Replacing SQL would not mean replacing a handful of keywords.

It would mean replacing an ecosystem of optimizers, transaction managers, storage engines, security models, replication systems, drivers, administration tools, monitoring platforms, migration systems, standards, training, and institutional memory.

The syntax is merely the visible doorway.

Behind it lies the city.

---

## When Machines Write the Queries

And now we arrive at the anxious present.

What becomes of SQL when artificial intelligence can write code?

The evidence is both unsettling and oddly reassuring.

AI systems already generate SQL.

GitHub Copilot and other coding assistants suggest queries inside editors.

Business-intelligence tools accept natural-language questions.

Database vendors increasingly translate conversational prompts into SQL.

Text-to-SQL has become a major research and engineering problem because organizations would very much like employees to ask, “Which products lost money in Bengal last quarter?” without first learning the physical schema, the approved revenue definition, and the unfortunate history of the table called `sales_final_v7_revised_REAL`.

Uber’s QueryGPT, described publicly in 2024, uses generative AI, schema information, retrieved examples, and other contextual material to translate natural-language questions into SQL for Uber’s data environment.[^querygpt]

Oracle Select AI performs a related translation inside its database ecosystem.

Other products offer comparable interfaces.

The narrative writes itself.

First AI writes the queries.

Then AI designs the schema.

Then AI tunes the indexes.

Then AI administers the database.

Then human SQL knowledge becomes a quaint hobby like calligraphy, blacksmithing, or knowing how to configure a printer without crying.

Except.

Here is what is actually happening.

AI is not abolishing SQL.

AI is generating SQL.

That is a very different event.

A large language model is a probabilistic generator trained to model patterns in language and code. It may produce a query that resembles solutions found in its training data and fits the schema information supplied in the prompt.

But the generated query must still be authorized, parsed, bound, optimized, executed, and interpreted by a database system.

The AI may compose the question.

The database still performs the formal work.

And a generated query can fail in several distinct ways.

It can be syntactically invalid.

It can mention tables or columns that do not exist.

It can misunderstand the user’s intent.

It can choose the wrong date field.

It can confuse gross revenue with net revenue.

It can join two one-to-many relationships and multiply the result.

It can omit a tenant filter.

It can expose data the user is not permitted to see.

It can perform a full scan across billions of rows.

It can issue a destructive statement with impeccable grammar.

It can be almost right.

That last category is especially dangerous. Obvious nonsense is easy to reject. A plausible query returning plausible numbers may travel into a presentation, report, clinical decision, or executive dashboard before anyone notices that it counted refunded orders as completed sales.

Stack Overflow’s 2025 Developer Survey captured this tension. Eighty-four percent of respondents said they were using or planned to use AI tools in software development. Yet 46% distrusted the accuracy of AI output, compared with 33% who trusted it. The most common frustration, reported by roughly two-thirds of respondents, was that AI solutions were “almost right, but not quite.”[^stackoverflow-ai]

That phrase could be engraved above the entrance to the text-to-SQL industry.

AI-generated SQL can be genuinely useful.

It can accelerate boilerplate.

It can help beginners discover syntax.

It can produce a first draft of a complicated query.

It can explain an unfamiliar statement.

It can translate between dialects.

It can suggest tests and indexes.

It can help an expert move faster.

But generated SQL still requires context that may not exist in the schema itself.

What does *active customer* mean?

Which timestamp defines a sale?

Should cancelled transactions be included?

Is revenue recognized when an order is placed, shipped, paid, or no longer refundable?

Which patient identifier is authoritative across three hospital systems?

Why does the supposedly unique member table contain duplicates from the 2018 migration?

These are not merely language questions.

They are institutional questions.

The database schema often contains only the fossilized remains of the answer.

Deep SQL expertise therefore becomes less valuable for typing boilerplate and more valuable for judging meaning, performance, security, data quality, and correctness.

The job shifts upward.

A calculator did not eliminate mathematics. It made arithmetic cheaper and exposed how much of mathematics had never been arithmetic in the first place.

Text-to-SQL may do something similar.

There is also a deeper complementarity between AI and formal systems.

Natural language is rich, flexible, contextual, and ambiguous.

SQL is constrained, explicit, executable, and inspectable.

AI is useful for crossing from the first world into the second. SQL is useful because the second world has rules.

A safe natural-language database interface therefore needs more than an LLM. It needs schema context, semantic definitions, permissions, query limits, read-only controls, validation, cost estimation, logging, testing, and sometimes human approval.

The model should not be handed the production database with the cheerful instruction:

> You seem clever. See what happens.

Many production AI systems use SQL or SQL-like interfaces when they need governed access to structured operational data. Others rely on APIs, document stores, search engines, graph databases, vector systems, object stores, files, and event streams.

SQL is not the whole foundation of AI.

But it is an important part of the ground beneath it.

Relational databases are also absorbing AI capabilities: vector storage, embedding functions, semantic search, model invocation, natural-language query generation, and machine-assisted optimization.

At the same time, AI systems use databases to ground generated responses in current, structured, inspectable facts.

The two technologies are not approaching each other as enemies.

They are becoming layers in the same system.

There is a beautiful irony here.

SEQUEL was created to let human beings ask questions of relational data through something resembling English.

Fifty years later, we have built machines that can interpret English and translate it back into SQL.

The circle closes.

The dream persists.

Only the typist has changed.

---

## The Bigger Picture: What SQL Teaches Us About Endurance

Computing history is a graveyard of brilliant ideas.

Betamax.

OS/2.

HD DVD.

The Newton.

The first incarnation of Google Glass.

Programming languages once expected to dominate the world.

Frameworks whose conference talks began with electric guitars and ended five years later with archived GitHub repositories.

Products announced as revolutions and remembered, if at all, as unsupported file formats.

The half-life of technical novelty can be measured in months.

SQL has lasted more than half a century and remains actively developed, taught, standardized, deployed, extended, argued over, and complained about.

Not as a preserved historical curiosity.

Not as a steam locomotive maintained by nostalgic volunteers.

As working infrastructure.

Why?

I think the answer lies in three qualities that technology rarely combines successfully: a mathematically serious foundation, an accessible human interface, and overwhelming institutional momentum.

The mathematical foundation came from Codd.

The relational model was not merely an implementation trick. It provided a formal account of data, relationships, operations, integrity, dependency, and design. It gave database researchers something they could reason about rather than merely benchmark.

SQL inherited that foundation imperfectly. Duplicates, `NULL`, vendor extensions, procedural additions, and decades of practical compromise separate commercial SQL from relational purity.

But the inheritance matters.

The language works inside a conceptual structure rather than resting upon an unexamined heap of file-handling customs.

The human interface came from Chamberlin and Boyce.

They understood that powerful ideas do not spread merely because they are correct. They must be expressible.

SQUARE was powerful.

SEQUEL was approachable.

`SELECT`, `FROM`, and `WHERE` gave human beings a vocabulary that felt close enough to ordinary language to invite experimentation while remaining formal enough for a machine to execute.

The institutional momentum came from products, standards, education, and accumulated use.

ANSI and ISO specifications.

Oracle, IBM, Microsoft, PostgreSQL, MySQL, SQLite, and their descendants.

Drivers and libraries in every major programming language.

Books, university courses, certifications, tutorials, forums, conferences, consultancies, tools, and several geological layers of Stack Overflow answers.

Millions of people know SQL.

Millions of systems depend upon it.

Billions of dollars have been invested in making it reliable.

This is not merely inertia.

Inertia can preserve a bad system long after anyone would choose it anew. SQL certainly benefits from inertia, but it also continues to solve new problems well enough that new systems repeatedly adopt its grammar.

There is a fourth reason.

SQL addresses a problem that is permanent.

Human beings keep records.

We count things.

We name things.

We classify things.

We exchange money.

We assign ownership.

We schedule events.

We track obligations.

We compare what happened with what should have happened and appoint committees to explain the difference.

As long as civilization produces structured claims about people, objects, events, and relationships, it will need ways to store those claims and ask precise questions about them.

The implementation may change.

The data may be distributed across continents.

The storage may be row-oriented, columnar, in memory, on disk, in object stores, or scattered across a cloud whose invoices suggest it has developed military ambitions.

The questions remain.

Which?

How many?

Whose?

When?

Under what conditions?

Related to what?

SQL has spent half a century becoming exceptionally good at expressing those questions.

I sometimes imagine Ted Codd, Donald Chamberlin, and Raymond Boyce sitting together in some celestial faculty lounge, watching the world of 2026 unfold.

Codd—mathematical, exacting, careful not to make extravagant claims—might be pleased that the relational model still gives structure to systems operating at scales impossible to imagine in 1970. He might also have several stern observations about `NULL`, duplicates, and the liberties taken in the name of commercial SQL.

Chamberlin might be amused that the English-like language he designed to make relational systems accessible to occasional human users is now being generated by machines trained on the entire argumentative sediment of the internet.

Boyce died suddenly in 1974, shortly after the first SEQUEL paper appeared. He did not live to see SQL standardized, commercialized, or spread across the planet.[^chamberlin-queries]

He helped build something whose consequences he never had time to witness.

Together, these researchers created a language that adapted across the mainframe, client-server, personal-computer, web, cloud, distributed-data, and AI waves.

It did not outlive those eras. Mainframes, personal computers, the web, and cloud systems are all inconveniently alive.

SQL moved through them.

It changed shape without surrendering its central bargain.

State what you want.

Let the system decide how to retrieve it.

Inspect the result.

Argue about whether you asked the right question.

That is the remarkable history of SQL.

Not a story of one final victory.

Not a story of purity.

Not a story in which every rival was foolish and every relational decision correct.

It is a story of a sound idea made usable, a usable idea made standard, and a standard repeatedly enlarged by the challenges meant to replace it.

And where does SQL stand when AI is writing the code?

Where it has stood for half a century:

between intention and execution,

between recorded facts and the questions we ask of them,

between the unruly world and our stubborn desire to arrange some part of it into rows and columns long enough to understand what happened.

Still standing.

Still querying.

Still returning results.

P.S.—Donald Chamberlin gave an illuminating interview to DataCamp’s *DataFramed* podcast for SQL’s fiftieth anniversary, discussing the language’s creation, commercialization, standardization, open-source expansion, NoSQL, and its possible future.[^datacamp] And if you have never read Codd’s original 1970 paper, do yourself the favor. It is not a modern tutorial, and some terminology has aged, but the central argument about data independence remains startlingly clear.

---

## References

[^stackoverflow-tech]: Stack Overflow. “2025 Developer Survey: Technology.” *Stack Overflow Developer Survey 2025*. https://survey.stackoverflow.co/2025/technology

[^ibm-pc]: IBM. “The IBM PC.” *IBM History*. https://www.ibm.com/history/personal-computer

[^codd-memorial]: Date, C. J. “Edgar F. Codd.” In *Memorial Tributes: Volume 12*, pp. 80–87. National Academy of Engineering, 2008. https://doi.org/10.17226/12473

[^date-tribute]: Date, C. J. “Edgar F. Codd: A Tribute and Personal Memoir.” *SIGMOD Record* 32, no. 4 (2003): 4–13. https://doi.org/10.1145/959060.959061

[^codd-paper]: Codd, E. F. “A Relational Model of Data for Large Shared Data Banks.” *Communications of the ACM* 13, no. 6 (1970): 377–387. https://doi.org/10.1145/362384.362685

[^sql-semantics]: Oracle. “Relations, Tuples, and Attributes.” *Oracle Database Concepts*. https://docs.oracle.com/pls/topic/lookup?ctx=en/database/oracle/application-express/21.1/aeapi&id=CNCPT-GUID-A42A6EF0-20F8-4F4B-AFF7-09C100AE581E  
    PostgreSQL Global Development Group. “SELECT.” *PostgreSQL Documentation*. https://www.postgresql.org/docs/current/sql-select.html  
    PostgreSQL Global Development Group. “Comparison Functions and Operators.” *PostgreSQL Documentation*. https://www.postgresql.org/docs/current/functions-comparison.html

[^ibm-codd]: IBM. “Edgar F. Codd.” *IBM History*. https://www.ibm.com/history/edgar-codd

[^chamberlin-oral-history]: McJones, Paul, interviewer. *Oral History of Donald D. Chamberlin*. Computer History Museum, 2009. https://archive.computerhistory.org/resources/text/Oral_History/Chamberlin_Don/102702111.05.01.acc.pdf

[^square]: Boyce, R. F., D. D. Chamberlin, W. F. King, and M. M. Hammer. “Specifying Queries as Relational Expressions: The SQUARE Data Sublanguage.” *Communications of the ACM* 18, no. 11 (1975): 621–628. https://doi.org/10.1145/361219.361221

[^sequel-paper]: Chamberlin, D. D., and R. F. Boyce. “SEQUEL: A Structured English Query Language.” In *Proceedings of the 1974 ACM SIGFIDET Workshop on Data Description, Access and Control*, pp. 249–264. ACM, 1974. https://doi.org/10.1145/800296.811515

[^sql-reunion]: McJones, Paul, ed. *The 1995 SQL Reunion: People, Projects, and Politics*. Computer History Museum, 2015. https://archive.computerhistory.org/resources/access/text/2015/07/102740133-05-01-acc.pdf

[^oracle-history]: Oracle. “Brief History of Oracle Database.” *Oracle Database Concepts*. https://docs.oracle.com/en/database/oracle/oracle-database/18/cncpt/introduction-to-oracle-database.html

[^ibm-selinger]: IBM. “Patricia Selinger.” *IBM History*. https://www.ibm.com/history/patricia-selinger

[^ansi-sql]: American National Standards Institute. *ANSI X3.135-1986: Database Language SQL*. Approved October 16, 1986. Reproduced in NIST FIPS Publication 127. https://nvlpubs.nist.gov/nistpubs/Legacy/FIPS/fipspub127.pdf  
    Chamberlin, Donald D. “50 Years of Queries.” *Communications of the ACM* 67, no. 8 (2024): 110–121. https://doi.org/10.1145/3649887

[^iso-1987]: International Organization for Standardization. *ISO 9075:1987—Information Processing Systems—Database Language—SQL*. https://www.iso.org/standard/16661.html

[^sql-2023-framework]: International Organization for Standardization. *ISO/IEC 9075-1:2023—Information Technology—Database Languages SQL—Part 1: Framework (SQL/Framework)*. https://www.iso.org/standard/76583.html  
    International Organization for Standardization. *ISO/IEC 9075-2:2023—Information Technology—Database Languages SQL—Part 2: Foundation (SQL/Foundation)*. https://www.iso.org/standard/76584.html

[^sql-pgq]: International Organization for Standardization. *ISO/IEC 9075-16:2023—Information Technology—Database Languages SQL—Part 16: Property Graph Queries (SQL/PGQ)*. https://www.iso.org/standard/79473.html

[^partiql]: Amazon Web Services. “PartiQL—A SQL-Compatible Query Language for Amazon DynamoDB.” *Amazon DynamoDB Developer Guide*. https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ql-reference.html

[^cassandra-cql]: Apache Cassandra. “Overview.” *Apache Cassandra Documentation*. https://cassandra.apache.org/doc/latest/cassandra/architecture/overview.html  
    Apache Cassandra. “Cassandra Query Language.” https://cassandra.apache.org/doc/latest/cassandra/developing/cql/

[^elasticsearch-sql]: Elastic. “SQL Overview.” *Elastic Documentation*. https://www.elastic.co/docs/explore-analyze/query-filter/languages/sql

[^mongodb-sql]: MongoDB. “Real-Time Insights Through the Atlas SQL Interface, Now Generally Available.” June 26, 2023. https://www.mongodb.com/company/blog/product-release-announcements/real-time-insights-through-atlas-sql-interface

[^stonebraker-pavlo]: Stonebraker, Michael, and Andrew Pavlo. “What Goes Around Comes Around… And Around…” *SIGMOD Record* 53, no. 2 (2024): 21–37. https://doi.org/10.1145/3685980.3685984

[^postgresql-json]: PostgreSQL Global Development Group. “JSON Types.” *PostgreSQL Documentation*. https://www.postgresql.org/docs/current/datatype-json.html

[^sqlite]: SQLite. “About SQLite.” https://sqlite.org/about.html  
    SQLite. “Most Widely Deployed SQL Database Engine.” https://sqlite.org/mostdeployed.html

[^sqlserver-vector]: Microsoft. “Vector Data Type.” *SQL Server Documentation*. https://learn.microsoft.com/en-us/sql/t-sql/data-types/vector-data-type?view=sql-server-ver17  
    Microsoft. “AI_GENERATE_EMBEDDINGS.” https://learn.microsoft.com/en-us/sql/t-sql/functions/ai-generate-embeddings-transact-sql?view=sql-server-ver17  
    Microsoft. “Vector Search and Vector Index.” https://learn.microsoft.com/en-us/sql/sql-server/ai/vectors?view=sql-server-ver17

[^oracle-26ai]: Oracle. “Introducing Oracle AI Database 26ai: Next-Gen AI-Native Database for All Your Data.” October 14, 2025. https://blogs.oracle.com/database/oracle-announces-oracle-ai-database-26ai

[^oracle-select-ai]: Oracle. “About Select AI.” *Oracle AI Database Documentation*. https://docs.oracle.com/en/database/oracle/oracle-database/26/selai/select-ai-about.html

[^postgresql-numeric]: PostgreSQL Global Development Group. “Numeric Types.” *PostgreSQL Documentation*. https://www.postgresql.org/docs/current/datatype-numeric.html

[^selinger-paper]: Selinger, Patricia G., Morton M. Astrahan, Donald D. Chamberlin, Raymond A. Lorie, and Thomas G. Price. “Access Path Selection in a Relational Database Management System.” In *Proceedings of the 1979 ACM SIGMOD International Conference on Management of Data*, pp. 23–34. ACM, 1979. https://doi.org/10.1145/582095.582099

[^querygpt]: Uber Engineering. “QueryGPT—Natural Language to SQL Using Generative AI.” September 18, 2024. https://www.uber.com/blog/query-gpt/

[^stackoverflow-ai]: Stack Overflow. “2025 Developer Survey: AI.” *Stack Overflow Developer Survey 2025*. https://survey.stackoverflow.co/2025/ai

[^chamberlin-queries]: Chamberlin, Donald D. “50 Years of Queries.” *Communications of the ACM* 67, no. 8 (2024): 110–121. https://doi.org/10.1145/3649887

[^datacamp]: DataCamp. “50 Years of SQL with Don Chamberlin, Computer Scientist and Co-Inventor of SQL.” *DataFramed*, episode 200, April 22, 2024. https://www.datacamp.com/podcast/50-years-of-sql-with-don-chamberlin
