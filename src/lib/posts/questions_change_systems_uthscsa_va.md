---
title: "The Questions You Ask"
description: "A Healthcare IT essay on how questions change across academic medical centers and VA systems, and why data architecture determines what can be known."
date: "2026-04-21"
thumbnail: "/images/IMG-20260423-WA0010.jpg"
category: "Healthcare-IT"
tags: ["Healthcare IT", "VA", "UTHSCSA", "Clinical Data", "Data Warehousing", "Longitudinal Analysis", "EHR", "Research Data", "SuvroGhosh"]
published: true
color: "indigo"
---

<TTS />

<Pi src="IMG-20260423-WA0010.jpg" alt="Article illustration for healthcare data questions across UTHSCSA and VA systems" />

The first mistake is thinking a better question always produces a better answer.

Sometimes it does. Sometimes it produces a more beautiful falsehood, suitable for a slide deck and later regret. In healthcare data, the same question behaves differently depending on where it is asked. Ask it inside an academic medical center and it may reflect grants, clinics, departments, referrals, local registries, and specialist workflows. Ask it inside the VA and it may reflect continuity, national scale, VistA history, enterprise warehouses, and old local meanings that have survived migration.

The question changes because the system changes.

UTHSCSA, like many academic health science environments, sits at the intersection of care, research, teaching, specialty practice, local improvisation, and grant-funded data work. Data may be rich in one domain and thin in another. Research datasets may be carefully curated for a protocol while routine operational data remains messy. Departmental systems may know things the enterprise layer does not. The architecture is intellectually alive and administratively uneven.

The VA is different.

The Veterans Health Administration has a long history of electronic clinical systems, including VistA and CPRS, and a national data warehouse ecosystem built over years of operational necessity. That gives it unusual longitudinal power. Patients may have long records inside the same federal healthcare organism. Patterns can be followed across time in ways that fragmented systems struggle to match.

But continuity does not mean simplicity.

VA data carries legacy complexity, local package behavior, evolving national models, facility variation, historical code meanings, migrations, and the translation of MUMPS/FileMan realities into SQL-shaped analytics. A national warehouse may make large questions possible while also requiring careful interpretation of how local care became enterprise data.

So the architect must ask: what kind of system produced this answer?

An academic environment may be better for certain research questions, specialist cohorts, trial infrastructure, local innovation, and deep domain collaboration. A VA environment may be better for longitudinal patterns, system-wide comparisons, chronic care trajectories, and large-scale operational analysis. Neither is pure. Each illuminates some darkness and misses another kind.

The data question has to match the institutional shape.

"How often did this happen?" depends on capture. "What happened after discharge?" depends on continuity. "Which patients were missed?" depends on the system's boundaries. "Did care improve?" depends on definitions, time windows, and whether the measurement survived a workflow change. "Can we predict risk?" depends not only on variables, but on whether the variables were available at the moment of decision.

Healthcare analytics often fails by pretending the question floats above the system.

It does not. The question lands on a database with a history. It lands on tables shaped by workflow, policy, software, funding, and staff. It lands on definitions that may have changed. It lands on missingness that may reflect access. It lands on local exceptions that were never documented because everyone at the site simply knew.

In UTHSCSA-like settings, the danger may be fragmentation: rich pockets, uneven integration, local brilliance, and hard boundaries. In VA-like settings, the danger may be overconfidence in scale: the belief that national data automatically means uniform meaning. Scale can hide local variation as easily as it reveals patterns.

Good architecture treats questions as instruments.

Point one instrument at an academic bazaar and it catches fragments, specialists, referrals, studies, and clever repairs. Point another at a federal tunnel and it catches continuity, history, and marks on the wall whose meanings have partly survived and partly changed. The architect's job is not to worship either instrument.

It is to know what kind of darkness each one fails to illuminate.
