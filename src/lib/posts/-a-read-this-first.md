---
title: "An Architect's Education"
description: 'A Calcutta self-portrait of a technology architect stitched from school shame, books, reading, sketches, politics, survival, and the stubborn habit of staying mentally alive.'
date: '2024-01-01'
thumbnail: '/images/Compress_20260509_172719_9415.jpg'
category: 'Personal'
tags:
  [
    'Personal Essay',
    'Calcutta Blog',
    'Kolkata Memoir',
    'Bengali Writer',
    'Middle Class Life',
    'Mental Health Essay',
    'Reading Culture',
    'Book Lover',
    'School Memories',
    'Childhood in Calcutta',
    'North Kolkata',
    'Indian Middle Class',
    'Atheist Writer',
    'Political Satire',
    'Personal Blog',
    'Creative Nonfiction',
    'Autobiographical Essay',
    'Humor Essay',
    'SuvroGhosh'
  ]
published: true
color: 'orange'
---

<TTS />

<Pi src="Compress_20260509_172719_9415.jpg" alt="Article illustration for An Architect's Education" />

## The Weight of Foundations

There is a peculiar truth about buildings that most people only notice when the ceiling leaks: the part that matters most is the part you never see. The foundation. The plumbing. The load-bearing walls disguised as ordinary plaster. We celebrate the glass façade and the rooftop view, but the structure's real argument with gravity happens underground, in silence, in concrete.

This is not merely an architectural observation. It is a philosophy of work, and it is the only honest way to understand how I came to spend two decades thinking about healthcare data.

My path did not begin with a corporate master plan. It began in Calcutta, in the dense, argumentative, intellectually voracious ecosystem of a traditional middle-class family where education was not an extracurricular activity but the primary engine of social mobility. In the competitive crucible of English-medium schooling, one learned early that clarity of thought and precision of language were not polite accomplishments; they were instruments of leverage. While the world around me offered its comforts and distractions, I found my bearings elsewhere—in books, in the austere satisfactions of foundational mathematics, and in a persistent, almost tactile curiosity about how complex systems hold themselves together.

That curiosity is a dangerous thing. It does not let you rest with surfaces. It compels you to ask what lies beneath the interface, beneath the protocol, beneath the presentation. It is the instinct that makes an architect out of a programmer, and a skeptic out of an enthusiast.

## The Grammar of Systems

My formal introduction to programming came at Jadavpur University in the mid-1990s, when the internet was still maturing from text to the hesitant display of images, and the world seemed to offer itself up as a system of manipulable knobs. We began with Pascal, that rigid, elegant language that teaches structure before it teaches convenience, and moved through the old guard—FORTRAN, COBOL, and later C and C++. At the undergraduate level, comprehension is always hazy; one grasps at concepts before truly understanding them. But even then, two subjects cut through the fog with uncommon clarity: digital logic and databases. I was drawn to relational database concepts with an almost physical attraction—the beauty of SQL, the intellectual satisfaction of constraints, the way a well-designed schema imposes order on chaos without tyrannizing it.

Those four years instilled a dangerous optimism: the belief that the world was easy to manipulate, that programming provided all the necessary levers, and that sufficient cleverness could bend any system to one's will. I would spend the next two decades unlearning that assumption.

Graduate studies at the University of Texas at San Antonio deepened the inquiry. I worked with C, C++, and a dialect called Proto-C, packaged with a simulation tool named OPNET that allowed event-driven, finite-state-machine-oriented modeling. I was simulating wireless protocols for ad-hoc networks—protocols that would eventually integrate seamlessly into the mobile infrastructure we now take for granted. My thesis explored distributed databases with parallel computing, a problem the world would later, with characteristic marketing enthusiasm, lump under the umbrella of "Big Data processing." But in 2000, it was simply the hard work of making data move and compute across boundaries without losing its coherence.

## One Suitcase and a Carry On

In August 1998, I crossed an ocean with a single suitcase, reserves that could be described charitably as modest, and a determination that could be described accurately as stubborn. The destination was the United States, and the objective was not merely a degree in computer science but an immersion in the deeper grammar of technical systems—the logic, the constraints, and the often unspoken assumptions embedded in software architecture.

What followed was a twenty-year apprenticeship in one of the most demanding classrooms available: the architectural core of American healthcare information technology. But the journey there was not linear. It began, improbably, with a simulation tool. OPNET landed me a job at Surgient Networks in Austin during the Y2K period—that strange interlude when the world held its breath for an apocalyptic date-glitch-induced catastrophe that never arrived. I was part of a small research group, tasked with simulating video caching behavior using in-house algorithms. It was here that I was introduced to statistics in a way I had not encountered before: the revelation that what remains invisible at the individual level becomes starkly visible at the level of aggregation.

I learned about the Zipf distribution, the mathematical formalization of what lay vocabulary calls the 80/20 rule. The servers were inundated with requests for a small percentage of popular videos; the caching optimizations had to account for this brutal statistical reality. You would not waste precious storage real estate on content that was statistically unlikely to be requested. This was my first encounter with a principle that would recur throughout my career: **the architecture of a system must account for the behavior of the aggregate, not merely the intentions of the individual.**

That company lost its momentum after a failed deal with IBM, and I began a different life—one that would fuse my passions for biology, scientific programming, and databases. In 2002, I joined the University of Texas Health Science Center at San Antonio. The genetic work was largely an exercise in tree data structures and string manipulations, but it was also my official foray into machine learning algorithms. The term was not yet fashionable; it was simply another statistical tool, a way to fit models to data so that new predictions could be made. Everything we understand about database constraints—domain integrity, referential integrity, efficiency—played a critical role in the design. The data was scattered, and much of my code, written first in VBA, then in SAS and SQL, was devoted to the unglamorous but essential work of cleaning it.

I was also database administrator and systems analyst for clinical trials run at the hospital. This was where I learned that data in healthcare is not merely information; it is testimony. It carries the weight of human vulnerability, and its mishandling is not a technical error but a moral one.

## The Clinician's Revenge

There is a particular kind of hubris common in software engineering, and I encountered it repeatedly during those years. It is the belief that a system designed elegantly in a vacuum will necessarily function elegantly in the wild. Early electronic health record implementations, for all their good intentions, often created more friction than they solved. The reason was not technological failure; it was anthropological failure. They were engineered by individuals who had never stood in a clinic at 2 AM, who had never watched a physician wrestle with a workflow that did not match the software's assumptions, who had never felt the visceral urgency of a clinical decision made under time pressure.

This realization shaped my professional philosophy with the force of a correction: **true digital health architecture requires an uncompromising alignment between engineering execution and clinical intent.** You cannot draw the blueprint without understanding the living structure that must inhabit it. The database schema must respect the clinical narrative. The ETL pipeline must honor the physician's cognitive workflow. The interface must serve the patient, not the other way around.

Years of working with enterprise standards like **HL7** and evolving frameworks like **FHIR** (Fast Healthcare Interoperability Resources) reinforced this conviction. Standards are necessary but insufficient. They are the grammar of a language; the poetry is in the implementation. And the poetry is always harder than it looks.

My work often involved the foundational modernization of medical records: the high-stakes, painstaking migration of critical clinical data from legacy hierarchical databases like **MUMPS** (a venerable but idiosyncratic system that powers much of American healthcare infrastructure) into robust, relational **SQL** environments. This was not a technical exercise in the abstract. It was archaeology. It was translation. It was diplomacy. You are not merely moving bits from one format to another; you are deciphering decades of undocumented clinical intent, institutional habit, and silent assumptions baked into data structures that predate the modern internet. You learn, very quickly, that **interoperability**—the ability of different systems to exchange and make sense of information—is not a checkbox feature. It is a form of semantic liquidity. It requires that data not only travel, but arrive with its meaning intact.

Throughout this period, my toolkit expanded in the way that a craftsman's workshop accumulates tools: not through acquisition for its own sake, but through necessity. Tableau and Excel for exploration and visualization. Python and SPSS for statistical analysis. Data warehouse and ETL tools for SQL Server. Crystal Reports for presentation. Each tool was a response to a specific problem, and each problem taught me that the tool is less important than the hand that wields it.

## The Return to Build in a Different Key

Eventually, life completed its arc and brought me back to India. But before that return, there was a detour through the South Pacific: a brief stint teaching computer science at the University of Fiji, followed by a role at Taxicharge in Auckland, New Zealand, where I served as SQL Server administrator and Crystal Reports programmer. These were not glamorous positions, but they taught me something that elite institutions often fail to impart: **the dignity of maintenance, the intellectual challenge of keeping a system running, and the humility of serving a user's immediate need.**

In India, I founded a web development company focused on helping hospitals manage their data and clinical trials. This was an exposure to the full stack of modern development: HTML5, CSS, JavaScript, preprocessing libraries, frameworks, APIs, UML standards, and testing. I focused on the high-level architecture of software systems from end to end—features, data security, privacy issues. One innovation was a cloud-based virtual browser: a headless browser invoked on Amazon's cloud, first built on a customized version of Gecko, later on WebKit. This ensured patient privacy and secure hospital connectivity for telemedicine applications.

Later, in separate data consulting roles, I spent more time with analysis and visualization tools like D3 and a Python-based tool called Orange. Often, these were roles where I helped translate the bigger picture for engineers to do the coding. I was becoming, by necessity and inclination, a translator between worlds: between the technical and the clinical, between the engineer and the stakeholder, between the complex and the comprehensible.

Then came the cab aggregation ventures—one in Chennai in 2017, another in Kolkata in 2020, the latter in partnership with Onde, a cab management software company in Belarus, and Taxi Butler out of the Netherlands. These were, on the surface, departures from healthcare. But they taught me something that no manual could: **reality never matches what is in the manual.** The cab drivers in Chennai threw up problems that a software team could not even imagine—variables unconsidered, situations dynamic, human behavior resistant to elegant modeling. When working with human beings, it is essential to be flexible, accommodating, and to match their wavelength for effective communication.

This is not a lesson in software engineering. It is a lesson in architecture. The foundation must account for the soil it sits in.

## The Manager as Architect

In my various managerial avatars, the principal roles were deceptively simple: managing timelines and expectations, staying within budget, orchestrating communication between development teams and stakeholders. But the real work was translation—unwrapping jargon, ensuring that complexity was rendered in colloquial language, that best practices were understood not as commandments but as shared agreements.

On the technical side, my priorities were architectural: translating requirements into UML, overseeing usability testing, facilitating knowledge transfer, designing support services, troubleshooting, documentation, managing version control, and shepherding iterations through the product life cycle. These are not glamorous activities. They are the load-bearing walls of software development—the parts you never see until they fail.

## First Principles in an Age of Noise

Today, the technology landscape is loud. It is a marketplace of marketing hype, automated shortcuts, and the relentless promise that artificial intelligence will solve problems we have not yet bothered to define properly. As the industry rushes toward deploying AI and predictive modeling in healthcare, my focus has narrowed rather than expanded. I am interested in the substrate.

Because here is the uncomfortable truth that no one puts on a billboard: **AI in healthcare does not fail at the algorithmic layer. It fails at the data layer.** It fails when the underlying data architecture is brittle, semantically ambiguous, or structurally incoherent. It fails when the training data carries the scars of poor interoperability, inconsistent terminology, and undocumented clinical assumptions. A predictive model is only as intelligent as the data it ingests, and most healthcare data is not yet intelligent enough to be trusted.

My work today is anchored in **first-principles thinking**—the disciplined refusal to accept inherited assumptions without interrogation. Before we talk about models, we must talk about meaning. Before we talk about automation, we must talk about governance. Before we talk about intelligence, we must talk about integrity.

Currently, I am working on setting up a data science training programme and on a book proposal that draws from my experience in the United States during those formative years. The book is not a memoir in the conventional sense; it is an attempt to document the grammar of a discipline that too often mistakes vocabulary for understanding.

## What This Space Is For

This platform is a reflection of that ongoing commitment. It is not a chronicle of industry trends. It is not a repository of product reviews or a megaphone for the latest acronym. It is a space dedicated to looking past the superficial layers of technology and focusing on the rigorous engineering, statistical modeling, and architectural governance required to make digital systems genuinely useful in the domain where usefulness matters most: human health.

I write and design not to follow the market, but to document a persistent intellectual journey. The subject is the hard, hidden work of our field—the structural decisions that determine whether a system will endure or collapse, whether data will illuminate or mislead, whether technology will serve the clinician or merely impress the boardroom.

For anyone navigating the intersection of complex systems, technical data, and systemic transformation, this record is an invitation. Not to agree with every conclusion, but to look at architecture from the ground up. Because the foundation is where the argument with gravity happens. Everything else is just decoration.
