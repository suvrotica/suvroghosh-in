---
title: "Depression as Mathematics: States, Switches, Attractors, and the Treacherous Algebra of Mood"
description: "A technical but readable exploration of how low mood, activation shifts, feedback loops, thresholds, state transitions, and recovery patterns can be described using mathematical language."
thumbnail: "/images/Compress_20260506_103338_8816.jpg"
date: "2026-05-06"
category: "Mental Health Systems"
tags: ["Video", "Engineering Blog", "SuvroGhosh", "Mental Health", "Mental Health Systems", "Depression As Mathematics", "Mathematics", "Calcutta", "Kolkata", "Bengali Essay", "Longform Essay", "Personal Blog", "Systems Thinking", "Healthcare IT", "Healthcare Data", "Clinical Informatics", "Health IT Architecture", "Medical Data Systems", "Interoperability", "Artificial Intelligence", "Statistics", "Science Writing", "Education", "First Principles"]
published: true
color: "slate"
---

<TTS />

<Pi src="Compress_20260506_103338_8816.jpg" />

Acronyms used: AI means Artificial Intelligence. EHR means Electronic Health Record. IT means Information Technology.

Mood, if forced onto a blackboard, would not become one number called sadness.

It would become a moving system. Variables would refuse to sit politely in one row. Sleep, energy, attention, rumination, activity, bodily load, social input, money stress, weather, memory, and habit would all enter the equation, each tugging on the others like wires behind an old switchboard in a Calcutta flat.

Ordinary speech treats low mood as a feeling. Clinical speech often treats it as a syndrome. Mathematics would treat it as a trajectory through a state space. A person is not merely "sad." The person is moving, slowing, looping, sinking, recovering, overshooting, stalling, or appearing outwardly functional while the internal system runs on a nearly spent battery.

Arithmetic is too innocent for this. The better language comes from dynamical systems, which study things that change over time; stochastic processes, which handle noise and randomness; control theory, which studies regulation and feedback; graph theory, which can model thoughts, habits, people, triggers, and institutions as connected nodes; and topology, because mood is not only where one is but what regions of experience remain reachable from there.

A basic symbol might be $x(t)$, the state of a person at time $t$. But $x(t)$ cannot be only mood. It needs to be a vector, a bundle of variables traveling together:

$x(t)=(m(t),e(t),s(t),r(t),a(t),c(t),p(t))$.

Here $m(t)$ might represent mood valence, $e(t)$ energy or activation, $s(t)$ sleep regularity, $r(t)$ rumination, $a(t)$ activity, $c(t)$ cognitive flexibility, and $p(t)$ physiological load. A real person is not one line on one chart. The system has dimensions.

Then the state changes according to a rule like:

$\frac{dx}{dt}=f(x,u,\lambda,\eta,t)$.

This says the direction of change depends on the current state $x$, external inputs $u$, vulnerability parameters $\lambda$, noise $\eta$, and time $t$. It looks tidy. It is not tidy. It is a polite mathematical cloth placed over a coal mine.

Inputs might include work stress, isolation, grief, family conflict, money pressure, sunlight, alcohol, social media, sleep disruption, illness, or the daily abrasions of living inside systems designed by committees and maintained by tired clerks. Parameters are slower features: temperament, chronic illness, social position, economic fragility, early learning, and grooves cut into the nervous system over years. Noise is there because life does not behave like a clean experiment under laboratory light.

An attractor is one of the most useful ideas here. Imagine a marble rolling in a landscape. If it falls into a bowl, it stays there unless enough force pushes it out. In mood systems, a person may drift toward certain regions again and again. One person's system bends back toward ordinary functioning after a bad day. Another person's system falls into a deeper basin and stays.

That basin is not a moral failure. It is a system shape.

A crude model for mood might look like:

$\frac{dm}{dt}=-\alpha(m-m_0)-\beta r+\gamma u+\eta$.

Here $m$ is mood, $m_0$ a baseline, $\alpha$ the return force toward baseline, $r$ rumination, $u$ supportive input, and $\eta$ noise. In a more resilient system, the return force is strong enough that bad days bend back toward ordinary days. In a more vulnerable system, rumination strengthens, recovery weakens, and the baseline may drift downward. The mathematics begins to resemble a damaged thermostat in a cold house.

Hysteresis also matters. Hysteresis means the path down is not the same as the path up. The conditions that caused a collapse may no longer be present, but the system does not automatically return. Saying "things are better now" can miss the point. The bridge may know the flood has passed. The bridge may still be broken.

Some mood systems also need switching models. They are not always governed by one continuous rule. They move among operating modes. Low mood and low activation are one region. High activation with unstable judgment is another. Agitated low mood is another. A person may shift gradually or cross a threshold quickly. The important object is not only the state but the transition architecture.

That is why mood and energy must be modeled separately. Ordinary imagination assumes they move together. Low mood means low energy. High mood means high energy. Real life is less tidy. Energy can rise while mood remains dark. Activity can collapse while thoughts accelerate. Exhaustion can sit beside agitation. A line is not enough. At minimum, we need a plane, probably a multidimensional warehouse with poor labeling.

Velocity matters too:

$\frac{dx}{dt}$.

How fast is the state changing? Is it drifting, cycling, accelerating, oscillating, or snapping across a threshold? Two people may look similar in a snapshot, but one system may be slowly returning while another is near a switch. A snapshot can be true and still misleading.

Healthcare data often fails here. If an EHR records "low mood" without activation, sleep, sequence, prior transitions, treatment timing, mixed features, family history, and temporal order, the representation is too thin for the phenomenon. Calling the data dirty misses the deeper failure. The model of reality is too small.

A note may say "stable." A code may say one thing. A message may imply another. But the actual clinical object is temporal and relational. It lives in sequences: sleep before mood shift, stress before collapse, increased activity before reduced sleep, withdrawal before worsening, improved function after support. Disconnected facts do not become a life because they have timestamps.

Latency is another useful idea. A cause may not show itself immediately. Poor sleep today may alter next week's state. Withdrawal may reduce discomfort tonight and deepen the basin over months. A supportive routine may help slowly. A bad week may not matter until the system is already near a threshold.

So we need lags:

$m(t)=a_1m(t-1)+a_2s(t-\tau)+a_3r(t-\tau)+\eta(t)$.

The symbol $\tau$ is the delay between cause and visible consequence. In ordinary terms, it is the fuse burning beneath the floorboards.

Thresholds matter. A person may absorb stress for weeks and appear unchanged, then cross into another regime. We can call the threshold $\theta$. If stress load $L(t)$ exceeds $\theta$, risk changes. But thresholds are not stone gates. They move with sleep, illness, money pressure, support, age, weather, and accumulated burden. The nervous system is not a spreadsheet. It is an orchestra tuning itself during an earthquake.

Nonlinearity is the plain name for this mismatch between input and output. A small event can have a large effect if the system is close to a threshold. A large event can sometimes produce little visible change if buffers are strong. This is how a person can survive a major crisis and then be undone by a minor insult over tea. The insult is not the whole cause. It is the last gram placed on a structure already groaning.

Graph theory helps with rumination. Rumination is not simply "thinking too much." It is a network with high recurrence and few exits. Nodes are memories, fears, predictions, bodily sensations, self-judgments, and imagined futures. Edges are associations. In a narrowed state, the graph becomes overconnected around painful nodes, like a city whose roads all lead to one damp municipal office where hope waits in line.

Control theory asks an unsentimental question: what are the control inputs, and why do they fail? Sleep regularity, light exposure, exercise, meaningful work, social rhythm, reduced alcohol use, financial stability, and timely care can all act as regulatory inputs. But control is constrained by real life. A person cannot always sleep well while unemployed, overworked, grieving, poor, isolated, or living in a noisy house where nobody has enough room.

Clean solutions fail when they ignore the systems around the person.

This matters for AI as well. A model trained on weak representations will not discover the missing ontology by magic. It may learn labels, but labels are often administrative fossils. A code tells what was documented, suspected, inherited from a previous chart, selected under time pressure, or required by billing. It does not necessarily describe the governing dynamics of the person's state.

The clean mathematical dream would be to estimate each person's parameters, identify attractors, detect early warning signals, and recommend stabilizing inputs before the system crosses a threshold. In symbols, infer $\hat{\lambda}$ from longitudinal data, estimate transition risk, and apply an input $u^*$ that minimizes harm.

Lovely. Also not fully available.

Real data is sparse. Privacy matters. Notes are uneven. Sensors are noisy. People are not dashboards. Families are complicated. A person may reasonably refuse to have the most difficult parts of life turned into a chart.

Still, the mathematical language helps because it refuses moral laziness. It does not ask why someone cannot simply cheer up. It asks about attractor depth, damping, feedback, thresholds, noise, lag, coupling, and state transitions. It does not say "you seemed fine yesterday." It asks what variables were hidden.

A bifurcation is when a system's behavior changes qualitatively as a parameter changes. Heat water and nothing dramatic happens for a while; then it boils. Cool it and it freezes. Human beings are not water, but the metaphor earns its keep. Accumulated sleep disruption, stress, isolation, illness, grief, or destabilizing events may alter parameters until the old equilibrium disappears.

Then the person is not failing to return to normal. The old normal is no longer stable.

Mathematics cannot capture the taste of despair, the humiliation of explaining it, or the administrative comedy of seeking help while the mind is struggling to organize the day. But it gives a sharper grammar. It shows why the old vocabulary is too flat.

If low mood were mathematical, sadness would be only one variable. The real object would be a nonlinear stochastic system with attractors, feedback, thresholds, lags, hidden variables, and transitions. The symbols would not cure anyone. Symbols are not care. But they can rescue the conversation from stupidity, and that is not nothing.

A good equation does not explain away suffering. It gives suffering a shape precise enough to stop blaming the sufferer for the geometry of the trap.
