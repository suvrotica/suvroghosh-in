---
title: "The Shape of Waiting: An Interactive Queue-Distribution Laboratory"
seoTitle: "The Shape of Waiting — Interactive Queue Laboratory"
description: "Change the rules of seven synthetic queues, follow the oldest ticket, and see how a better average can conceal a worse tail. Export a replayable waiting receipt."
date: "2026-10-21"
dateModified: "2026-10-21"
thumbnail: "/images/visualizations/shape-of-waiting/shape-of-waiting-social.png"
thumbnailAlt: "A warm-paper queue laboratory with a curling line of teal, amber and red waiting tickets beside mean, median and tail-wait readouts"
category: "Visualizations"
tags: ["Queueing Theory", "Probability", "Statistics", "Operations Research", "Discrete-Event Simulation", "Data Visualisation", "Fairness", "Scientific Computing", "Service Variability", "Queue Discipline"]
pinnedTags: ["Queueing Theory", "Probability", "Statistics", "Operations Research", "Discrete-Event Simulation", "Data Visualisation", "Fairness", "Scientific Computing", "Service Variability", "Queue Discipline"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#237D78"
author: "Suvro Ghosh"
readingTime: "7 min"
inPlainEnglish: "An average describes a group; it cannot tell you what happened to its unluckiest member. This laboratory lets the same synthetic people join a queue under different rules, then follows both the distribution and the person still waiting."
keyTerms: ["Waiting time", "Mean", "Median", "90th percentile", "Abandonment", "Priority ageing", "Discrete-event simulation", "Paired comparison"]
faq:
  - question: "What does waiting time mean here?"
    answer: "It is the time from joining the queue to starting service. Service duration and total time in the system are separate. The mean, median and p90 use only tickets whose service has started, with the sample size shown."
  - question: "Why show people who are still waiting separately?"
    answer: "Their eventual waiting times are unresolved. Their current waiting ages are lower bounds, rather than finished waits. The laboratory keeps their count and oldest waiting age visible instead of silently dropping them from the story."
  - question: "Does the emergency department preset predict a real hospital?"
    answer: "No. Every setting is a synthetic educational model. The urgency classes illustrate non-preemptive priority and its trade-offs; they are not a clinical triage system or a staffing recommendation."
  - question: "Is this the Calcutta Queue game?"
    answer: "No. This laboratory studies probability, service capacity and distributions. Its operational classes and scheduling rules are independent of the game's social-position mechanics."
  - question: "Can another person replay my result?"
    answer: "The waiting receipt includes a versioned configuration, seed, simulated observation time and replay link. The browser reruns the same bounded model. A single seed remains one synthetic experiment, rather than a universal finding."
---

<script>
	import ShapeOfWaiting from '$lib/components/visualizations/shape-of-waiting/ShapeOfWaiting.svelte';
</script>

The sign says *average waiting time: twenty minutes*. Somewhere near the wall, one person has begun to recognise the pattern in the upholstery. The sign can be correct. So can that person's sense that the afternoon is disappearing.

<ShapeOfWaiting />

<noscript>
	<figure>
		<img
			src="/images/visualizations/shape-of-waiting/shape-of-waiting-social.png"
			alt="A warm-paper queue laboratory with a curling line of teal, amber and red waiting tickets beside mean, median and tail-wait readouts"
			width="1200"
			height="630"
			loading="eager"
			decoding="async"
		/>
		<figcaption>
			This poster is captured from the implemented synthetic queue laboratory. JavaScript
			powers the simulation and replay controls; the explanation below remains readable
			without it. Colour shows waiting age on a fixed scale, and the readouts distinguish
			finished waits from people still waiting.
		</figcaption>
	</figure>
</noscript>

<p><small>Published <time datetime="2026-10-21">21 October 2026</time> · Updated <time datetime="2026-10-21">21 October 2026</time></small></p>

<TTS />

## Begin with the person at the edge

Each ticket belongs to one synthetic person, caller or message. It joins the line, waits, and either starts service or leaves. Position follows the scheduling order. Colour records waiting age on the same scale across the laboratory, so a red ticket cannot become reassuringly teal merely because the rest of the queue grew older.

Choose **Follow the oldest**. The inspector gives that ticket a history: when it arrived, its class, whether later arrivals entered service first, and how long it has waited. A mark on a distribution has acquired an address.

The stage is an operational picture. The histogram is its accounting. Finished waits collect into a distribution with mean, median and 90th percentile marked. The separate strip of current waiting ages shows people whose final wait is still unknown. Watch both before deciding that the system has improved.

## Three experiments, the same arrivals

Start with **One more counter**. Keep the original run as a baseline and add capacity. The paired view reuses the same arrivals and underlying demands. You can select the same ticket in both versions of the day.

Next try **Same mean, more uncertainty**. The configured expected service duration stays fixed while the spread changes. A few lengthy jobs can occupy counters while shorter jobs accumulate behind them. In a finite sample, the realised average service duration can fluctuate even though its generating distribution has the same expected value.

Finally choose **Better average, worse tail**. This is a reproducible worked example, with the affected tail measure identified in the comparison. Read the class rows as well as the headline. A policy can favour many tickets while concentrating delay among fewer tickets. A lower mean answers one question. It leaves several others open.

Changing the seed asks the model another version of the question. These are paired synthetic experiments; one attractive screenshot cannot establish a universal effect.

## Seven waiting rooms

The bank pools ordinary arrivals across counters. The railway counter receives concentrated bursts. The visa office groups work into batches, with formation delays and setup costs. The clinic admits scheduled appointments and records no-shows separately. The call centre allows finite patience. The emergency department gives synthetic urgency classes non-preemptive priority: service already in progress finishes before another ticket can take that counter. The business inbox turns people into messages with uneven amounts of work.

Each preset changes its operational assumptions. None is calibrated to a real institution. A patient and an unanswered email may share queue mathematics while carrying very different human consequences.

Open the advanced controls to change the rule. First come, first served respects arrival order. Random selection can leave an early arrival behind; its displayed queue ranking is illustrative because the next selection redraws the order. Priority favours the configured class; ageing lets time already spent waiting increase a ticket's claim on the next available server. These choices have visible consequences for who gets overtaken.

Batching has a formation rule, a maximum delay and a capacity cost. A no-show never joins the queue. Abandonment happens after joining it. Keeping those outcomes distinct prevents a system from looking efficient simply because its visitors disappeared.

## Whose average is this?

The primary waiting-time sample contains tickets whose service has started. Their wait is **service-start time minus queue-entry time**. It does not include service duration. The interface names this population and its count; during playback, its summaries are provisional.

Someone still waiting has a current age, but no observed final waiting time. If observation ends now, that eventual time lies beyond what we have seen. This is the same lower-bound idea that underlies [right-censored observations in the NIST statistical handbook](https://www.itl.nist.gov/div898/handbook/apr/section1/apr131.htm). The laboratory displays current ages separately. It does not estimate a survival curve or quietly treat unfinished waits as zero.

Abandoned tickets have a different observed outcome: time until leaving. Their count, denominator and waiting-time summary remain separate from successfully started service. A caller who hangs up has not been answered.

The median describes the middle of the served-wait sample. P90 locates its upper region according to the stated sample-quantile convention. Maximum observed wait keeps even a tiny extreme visible. A small sample is labelled as such, and an empty sample receives an em dash rather than a fabricated zero.

For a final result, arrivals stop at the configured end of the session and the system drains. Existing service finishes. If a computation bound interrupts that process, the result explicitly retains its unresolved population and stopping time. These are finite-session experiments beginning from an empty system, rather than steady-state estimates.

## Fair by which rule?

The class rows show median and p90 waits for the people each class actually served. Their gap makes a policy's distributional effect inspectable. The overtaking measure asks how many service starters saw at least one later arrival begin service first.

Those measures answer different questions. Arrival-order adherence, equal class waits and urgency-based priority express different objectives. The laboratory makes no demographic assignments and produces no universal fairness score. Its synthetic classes let you inspect the cost of a chosen operational rule.

Try following the same ticket across a comparison. Then inspect the ticket that benefited. The trade-off becomes harder to hide inside a single number.

## The clock inside the picture

The engine advances between discrete events: an arrival, a service completion, a patience deadline or an applicable batch event. A priority queue orders their simulated times, with explicit precedence and a stable tie-breaker. The [SimPy scheduling documentation](https://simpy.readthedocs.io/en/latest/topical_guides/time_and_scheduling.html) explains why events that share a displayed time still need deterministic ordering. This implementation uses its own TypeScript engine and publishes its particular tie rules in the model notes.

Animation time is separate. Playing faster changes how quickly the picture unfolds on your screen; it does not make a counter more efficient. Resizing, pausing or choosing Still leaves the model's result intact.

The same frozen snapshot supplies the stage, summaries, inspector and export. The drawing cannot invent a more photogenic queue than the accounting supports. At large populations, the view can aggregate marks, with the count labelled and the oldest waiting ticket retained; the model still accounts for every ticket.

## Take a waiting receipt

Download the PNG receipt for a compact view of the result, or the versioned JSON for the configuration and its numerical record. Both carry the seed, observation time, completion status, sample definitions and replay URL. The link opens the same bounded model and reruns it locally.

The receipt can make a claim precise: this rule, these arrivals, this population, this outcome. It cannot turn a classroom simulation into evidence about a real clinic, railway or office.

Return to the sign. Twenty minutes may still be a correct average. Now you know to look for the person it leaves outside the sentence.
