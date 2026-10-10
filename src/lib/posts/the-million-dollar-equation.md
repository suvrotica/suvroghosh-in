---
title: "The Million-Dollar Equation: AI, Troubled Waters, and a Very Human Mess"
description: "An AI-generated Navier–Stokes proof, two centuries of unruly fluids, and a dispute over what counts as solving a problem and who deserves the credit."
date: "2026-10-10"
thumbnail: "/images/the-million-dollar-equation.jpg"
thumbnailAlt: "A robotic hand holds a golden spoon dripping liquid into a porcelain teacup containing a swirling fluid vortex and mathematical grid, held by a human hand."
category: "Science"
tags: ["Mathematics","AI","Navier-Stokes","Millennium Prize","Fluid Dynamics","OpenAI","SuvroGhosh","Navier Stokes","AI Troubled Waters","Eighty-Eight Hours Plus"]
pinnedTags: ["Mathematics", "AI", "Navier-Stokes", "Millennium Prize", "Fluid Dynamics", "OpenAI", "SuvroGhosh"]
published: true
color: "#1a5276"
---

<TTS />

<Pi src="/images/the-million-dollar-equation.jpg" alt="A robotic hand holds a golden spoon dripping liquid into a porcelain teacup containing a swirling fluid vortex and mathematical grid, held by a human hand." />

# The Million-Dollar Equation: AI, Troubled Waters, and a Very Human Mess

## Act I — The Rather Embarrassing Problem With Water

Here is a fact I find humiliating, and I say this with affection for my entire species: humanity can split the atom, land rocket boosters on floating barges, and read the genetic instructions of a tardigrade, yet a sufficiently awkward question about flowing water can still bring the room to a standstill.

Not the practical question of what happens when you stir your tea. Your tea will almost certainly survive the experience. Engineers have been using fluid mathematics to design aircraft, pumps, and turbines for generations. The embarrassment concerns something less visible: whether a remarkably successful set of equations always produces a mathematically well-behaved answer.

We have had these equations, in recognizable form, since the nineteenth century. They fit on an index card. Their consequences can occupy a career.

They are called the Navier–Stokes equations. Under suitable assumptions, they describe how pressure, motion, and viscosity interact in a fluid. But in three dimensions, the question of whether smooth motion must remain smooth became one of mathematics' most stubborn unfinished pieces of business.

Could an initially well-behaved flow develop a singularity, with speed growing without bound as a finite moment approaches?

Infinity, arriving before teatime.

That would be a failure of a particular mathematical description under particular conditions. It would not mean a real cup of tea had discovered an economical method of destroying the universe. The distinction matters, although it is less likely to sell a newspaper.

In September 2026, OpenAI announced an AI-generated proof of such a breakdown under a specially constructed smooth external force. It released a mathematical manuscript and a formalization in Lean, a system for checking proofs by computer.

The mathematical world promptly caught fire.

By October 10, there was a claimed resolution of an officially permitted version of the Millennium Prize Problem, a continuing question about unforced flow, a dispute over credit and research data, and fresh scrutiny of how the written proof related to its computer-checked counterpart. Clay's own website labeled the problem “Active.”

The water, somehow, remained the comparatively straightforward participant.

## Act II — Two Centuries of Very Clever People Thinking About Water

### The Swissman, the Frenchman, and the Irishman

Our story begins with someone leaving out viscosity.

In the eighteenth century, Leonhard Euler developed equations for an ideal fluid without internal friction. This was a useful idealization, not an oversight by a man who had never encountered honey. Science advances partly by leaving things out and then discovering, sometimes expensively, which omissions matter.

Claude-Louis Navier incorporated viscous effects in the 1820s. George Gabriel Stokes, born in Ireland and working at Cambridge, developed the theory further in his 1845 work. Other people contributed along the way. Scientific equations, like old houses, generally have more builders than the plaque admits.

The underlying idea is Newton's second law: force equals mass times acceleration. Apply it to a tiny moving parcel of fluid. Pressure pushes it. Internal friction redistributes its motion. External forces may act on it. The complication is that the parcel is moving through a fluid that is itself moving, changing, and pushing back.

The water transports its own disturbances. It is both the traffic and part of the traffic-management problem.

“Navier–Stokes” also names a family of models, not one universal recipe for every liquid and gas. The Millennium Problem concerns a three-dimensional, incompressible fluid with constant density and positive viscosity. Air can require compressible equations; blood can require additional descriptions of its material behavior. The same basic framework is extraordinarily useful without being a magic instruction sheet for everything wet.

Nor is the prize asking whether these equations are “true” as laws of nature. Models have assumptions and limits. The mathematical question is what follows if we accept the stated equations and assumptions exactly.

### Turbulence: Where the Trouble Acquires Smaller Trouble

You have seen turbulence behind a boulder in a stream, in a gust worrying a flag, or in the tangled plume above something hot. Large swirls interact with smaller ones, which interact with smaller ones again. In the familiar three-dimensional picture, energy passes toward scales where viscosity can dissipate it.

Lewis Fry Richardson captured the idea in his verse about large whirls feeding smaller whirls, continuing down to viscosity. Few scientific disciplines have had their central difficulty summarized so economically by something resembling a nursery rhyme.

The difficulty is the enormous range of scales. Tracking all the dynamically relevant eddies in a demanding engineering flow can require prohibitive amounts of computation.

This does not mean a fluid simulation must follow every molecule. The equations deliberately replace molecules with a continuous medium. Even with that enormous saving, resolving every relevant feature of a turbulent flow may be beyond a practical computer budget.

Engineers therefore use approximations, averages, and models of unresolved motion. They compare predictions with experiments and work within known limitations. This is applied mathematics doing its job, not secretly failing to do pure mathematics.

Turbulence and singularity are also different difficulties. A flow can be violently turbulent while its mathematical solution remains smooth. “Smooth” does not mean calm, slow, or suitable for a relaxing bath. It means that the relevant derivatives exist and behave properly.

A mathematician can call something smooth while an engineer is fastening everything to the floor.

### The Million-Dollar Question, With the Small Print Included

In 2000, the Clay Mathematics Institute announced seven Millennium Prize Problems, each carrying a million-dollar award. The list included the Riemann hypothesis, P versus NP, and the Poincaré conjecture, later resolved by Grigori Perelman, who declined the prize.

Charles Fefferman wrote the official Navier–Stokes formulation. It offers four routes:

- **A:** Prove global smoothness for the unforced equations throughout three-dimensional space, under the specified conditions.
- **B:** Prove the corresponding unforced result in a periodic setting, where the flow repeats across opposite faces of a box.
- **C:** Construct a breakdown in the whole-space setting, allowing a smooth external force.
- **D:** Construct a corresponding breakdown in the periodic setting, again allowing smooth forcing.

The A/B distinction concerns the spatial setting. Both are unforced. The C/D alternatives permit forcing. Establishing one of the four is the requested mathematical target.

Notice the asymmetry. A forced counterexample can meet the prize's formulation without disproving global smoothness for unforced flow. That qualification will shortly become the hinge on which a considerable amount of public excitement swings.

And none of these settings is literally your teacup, with its ceramic wall, spoon, surface, and increasingly impatient owner.

In 1934, Jean Leray proved the existence of global weak solutions in three dimensions. “Weak” is a technical term: the equations hold in an integrated sense that permits less regular behavior. These are not merely engineering averages or slightly unconvincing solutions.

The outstanding difficulty was controlling smoothness. We already knew smooth solutions exist for a short time under the standard assumptions. There were global results in two dimensions and for sufficiently small initial data in three. The problem was extending the guarantee to arbitrary admissible three-dimensional data.

A perfectly still, unforced fluid stays still. The challenge is not persuading resting water to misbehave without a cause.

### The Route Toward a Breakdown

In 2013, Guo Luo and Thomas Hou reported influential numerical evidence of a possible Euler singularity in a cylindrical setting. Euler, remember, leaves out viscosity. Their computations were an important part of a much larger research history, not proof that the full Clay problem had fallen.

Another approach developed through the work of Diego Córdoba and Luis Martínez-Zoroa. Their constructions used successive layers of motion, with activity at one scale amplifying behavior at smaller scales.

The word “layers” is helpful provided we do not imagine stacking independent solutions like pancakes. These equations are nonlinear. Add two solutions and the result need not be another solution. The interactions are precisely where the difficulty lives.

Their 2023 Euler work produced blowup with forcing less regular than the Millennium conditions require. “Less regular” does not necessarily mean discontinuous; a force can have continuous derivatives and still fall short of the demanded smoothness. In 2024, work with Fan Zheng extended the approach to certain hypodissipative Navier–Stokes equations, whose smoothing term is weaker than the standard one.

Córdoba and Martínez-Zoroa also obtained a smooth-source singularity construction for the incompressible porous media equation, another related system.

These were substantial advances, but changing the equation, the domain, or the allowed force changes the problem. Mathematics is rather unforgiving about almost arriving.

Córdoba supplied the memorable personal detail. As Quanta reported, he joked: “I don't use AI: I have Luis.”

The machines were about to join a conversation that had been going on for years.

## Act III — Enter Artificial Intelligence

### Eighty-Eight Hours, Plus the Part Afterward

On September 8, OpenAI announced its result. According to the company's account, the successful group involved roughly 10,000 concurrent agents. The Navier–Stokes effort generated about 130 billion output tokens and 2.7 million messages.

The agents reached their proposed resolution after approximately 88 hours. Formalization and checking in Lean took another 17 hours. The widely repeated long weekend therefore needs a small extension.

These agents were software processes using a model and tools, not ten thousand independently educated mathematicians. Humans organized the effort, redirected resources, and used Codex to consolidate intermediate findings across groups.

The scale is remarkable. So is the temptation to start the historical stopwatch at the first prompt and quietly exclude the mathematics, training, infrastructure, and engineering that made the prompt useful.

Nobody should time the last flight of stairs and announce that the building took four days.

OpenAI's manuscript constructs a flow starting from zero velocity, driven by a smooth force confined to a bounded region of space and a finite interval of time. The claimed velocity becomes unbounded in finite time while total kinetic energy remains bounded. The construction targets alternatives C and D.

That is a formidable claim. Its force is carefully tailored, but it does not simply smuggle an infinite shove into the assumptions.

Meanwhile, on September 7, Tristan Buckmaster of NYU and Levent Alpöge, a number theorist employed by Anthropic, had announced AI-assisted smooth-forcing blowup results for Euler and two related systems. Their collaboration was personal rather than an official joint project between their employers.

Their results and OpenAI's were related, but not identical. The race cannot be described accurately as two teams handing in the same answer twelve hours apart.

### What the Claimed Construction Does

Let me explain it at three depths.

**For a ten-year-old:** Imagine a mathematical fluid that can be divided into smaller and smaller pieces forever. Arrange perfectly smooth pushes throughout it. Could those pushes help create a whirlpool whose fastest part becomes narrower and faster without any upper speed limit, all before a particular time? OpenAI's construction says yes. Real water is made of molecules, so this is a question about the mathematical model, not instructions for creating an infinite-speed bathtub.

**For the scientifically curious:** Viscosity smooths differences in motion. The nonlinear dynamics can concentrate them. The proposed flow arranges these competing effects so that an increasingly narrow region develops unbounded speed despite viscosity. Bounded total energy is compatible with that concentration: extremely large values need not produce an infinite integral if the region containing them shrinks sufficiently fast. The force remains smooth, but “smooth” does not mean simple, weak, or easy to build in a laboratory.

**For those who want a little more:** The manuscript combines a collapsing vortex profile with oscillatory corrections. Start with a desired velocity and pressure, insert them into the equations, and examine the leftover term that would have to act as an external force. For a badly chosen flow, that leftover becomes singular too, which defeats the purpose. The construction aims to cancel the singular contributions while preserving the velocity blowup.

It is mathematical choreography of a particularly unforgiving kind. Four drunk acrobats balancing on a wire would at least have the option of falling off. Here the entire argument depends on showing exactly how the dangerous terms balance.

The vortex has inward spiraling and axial outflow; its radial width contracts faster than its axial scale. “Spaghetti” is a reasonable picture of the changing proportions, provided nobody mistakes the picture for the proof.

### What Lean Checks

Lean is a programming language and proof assistant. Its kernel checks whether a formally stated conclusion follows from the definitions, assumptions, and logical rules supplied to it.

That is an enormous advance over asking a language model whether it feels confident.

But several separate jobs remain. The formal statement must express the intended mathematical question. The proof must use acceptable assumptions. And if someone says a particular written argument has been verified, the formal argument must actually support that written argument.

A correct formal proof can establish a theorem by a different route from the prose. It can also establish a weaker intermediate claim than the prose advertises. Neither possibility means Lean has malfunctioned.

The stamp is meaningful. You still have to inspect what was stamped.

### The Humans in the Loop

The history resists both easy slogans.

Córdoba and Martínez-Zoroa developed the crucial program of constructions before this announcement. Buckmaster and Alpöge explicitly credited them and used models from both Anthropic and OpenAI in their own work. OpenAI's manuscript also places its construction within a wider mathematical literature.

The contribution of the machines should not disappear into the phrase “just a tool.” Producing a working extension, finding the right estimates, or completing a formal argument can be the hard part. A map is not the same thing as reaching the summit.

But neither should the prior mathematics vanish beneath a corporate logo.

The interesting achievement lies in the combination, and in finding out precisely which parts of the combination did what. That requires a research history, not merely a stopwatch.

## Act IV — The Controversy

### A Meeting That Did Not Improve Anybody's Afternoon

Buckmaster's public account describes a September 6 discussion with OpenAI researchers, including Sébastien Bubeck. He says he was offered a leading role in presenting OpenAI's Navier–Stokes work, with Alpöge excluded from that authorship because of his employment at Anthropic.

He also reports being asked, after saying he might go public, “Why would you ruin your career?”

These are Buckmaster's allegations about the conversation. Bubeck's response disputes the interpretation. He says he never sought to remove Alpöge from authorship of Alpöge's own work; his concern involved an Anthropic employee authoring a presentation of OpenAI's result or receiving access to its internal technology.

Bubeck apologized for his choice of words about Buckmaster's career and said he had retracted them during the conversation.

The distinction between the two accounts matters. So does the remarkable fact that a discussion about fluid equations had acquired the conversational atmosphere of a disputed inheritance.

Buckmaster also asked whether the research drafts he and Alpöge had put through Codex could have influenced OpenAI's effort. In his initial statement, he explicitly said he did not know whether their data had been used and had not seen OpenAI's proof.

That last detail is worth retaining. He recognized the proposed direction of attack; he was not reporting a side-by-side inspection of two proofs.

OpenAI denies accessing their work to obtain its result. Its September 10 update makes a more specific claim: following an investigation, Buckmaster's Codex prompts from the preceding two months could not have influenced the system, including through training.

That updated position belongs in an October account. Repeating only the company's earlier uncertainty would leave the reader with a stale version of the dispute. Equally, the company's statement is its account of its investigation, not an independently reproduced public audit of the entire collaboration.

Using the same published mathematical program does not, by itself, demonstrate access to private drafts. Nor does a denial resolve every question about research practices, authorship, or the imbalance between a tool provider and a researcher using its tools.

The theorem's validity and the conduct of the people involved are separate questions. One cannot be used as a convenient solvent for the other.

### A Proof Is Also Supposed to Explain Something

The published Navier–Stokes manuscript runs to 166 pages. Length alone is no indictment; mathematics has survived much heavier furniture. The concern is whether readers can identify the ideas, check the dependencies, and learn something they can use elsewhere.

Buckmaster acknowledged a similar problem in his own team's hurried release, calling its Euler writeup “AI slop.” This was not simply humans complaining about a machine-produced paper from the opposing camp.

On September 11, a declaration titled *A Severe Misalignment of AI in Mathematics* appeared with 25 initial signatories, all Fields Medalists. It argued that producing answers at increasing speed could undermine the slower processes through which ideas become understood, students become mathematicians, and discoveries become useful parts of a shared discipline.

You need not regard a Fields Medal as a certificate of infallibility to take that concern seriously.

A difficult proof can still establish something valuable. Human comprehension need not arrive all at once or belong to a single heroic reader. But a field cannot indefinitely outsource explanation to the phrase “the computer checked it.”

Nor is understanding permanently impossible. On September 28, Zhen Lei and Xiao Ren posted an exposition intended to make the profile-construction part of OpenAI's argument accessible. That is concrete work toward comprehension, not proof that every question has been settled.

The interesting story is people beginning to unpack the result. “Humanity learned nothing” makes a splendid headline and an increasingly poor description of an ongoing process.

### The October Complication

On October 6, Alexander Bastounis, Fabian Circelli, and Anders C. Hansen posted a paper examining the translation from written mathematics into Lean. They identified discrepancies between parts of OpenAI's natural-language proof and the corresponding formalized arguments, including an intermediate estimate for which the Lean version requires stronger assumptions.

Their conclusion needs careful handling. They explicitly do **not** claim to determine whether OpenAI's written proof is correct. Their point is that the formalization does not automatically certify every argument and intermediate assertion in the prose.

A different valid proof of the intended theorem could still establish that theorem. Conversely, successfully checking some formal text does not guarantee that an accompanying document has been faithfully checked.

This is a live technical issue, not a license to declare either complete vindication or complete collapse.

There are enough actual complications here without manufacturing an extra one for the headline.

### Did the AI Solve the Wrong Problem?

The phrase is irresistible. The situation is more interesting than the phrase.

The official prize formulation expressly allows a smooth external force in alternatives C and D. If the construction meets those conditions, it addresses an authorized version of the problem. Calling that mere cheating by small print understates the mathematics.

But the unforced question remains separate. Can a fluid, starting with admissible smooth motion and receiving no external forcing afterward, develop a singularity?

A forced construction does not answer that.

On September 17, Peter Constantin, Mihaela Ignatova, and Vlad Vicol posted a result restricting this route. Under specified structural assumptions shared by OpenAI's construction, they proved regularity with analytic forcing and ruled out the required blowup when the force vanishes near the proposed singularity.

That is an obstruction to extending this construction while keeping those features. It is not a proof that every conceivable modification or every approach to unforced blowup must fail.

The distinction is rather like discovering that the bridge you have designed cannot reach the opposite bank. It is useful information about the bridge. It is not a theorem that the river cannot be crossed.

And externally forced flows are hardly irrelevant to physics. Pumps, winds, and machinery have been imposing themselves on fluids for some time. What remains unclear is how this highly specialized construction relates to ordinary physical flows and to the broader theory.

### Meanwhile, the Prize Has Its Own Clock

As of October 10, Clay's website listed Navier–Stokes as “Active.” Its prize rules require publication in a qualifying outlet, at least two years after that publication, and general acceptance by the global mathematical community before a proposed solution is considered.

A blog announcement does not start a simple two-year countdown to a check.

OpenAI says it does not intend to claim the award. That does not make the institute's assessment irrelevant. The distinction between a dramatic announcement and a settled place in mathematical knowledge remains.

The company also released a much larger collection on October 6. Its repository listed 719 manuscripts organized into 372 families of related results, with about 42 percent of top-level results formalized in Lean. It explicitly warned that some unformalized results could contain issues.

That is not the same as 372 independently accepted breakthroughs.

It is, however, quite a lot to leave on the mathematical community's desk.

## Act V — What This Could Mean for Humanity

### What It Does Not Give Us

Nobody has acquired perfect weather forecasts, effortless turbulence simulation, or an aircraft design button labeled “Make Excellent.”

The existence of a specially constructed singularity is a statement about a mathematical model. It does not provide a general solution formula, and it does not tell an engineer how to resolve every eddy around a wing.

Nor does a continuum singularity require real molecules to move infinitely fast. Other physical effects and the limits of the continuum approximation intervene. The mathematics can reveal where a model ceases to provide a smooth description without implying that nature has suffered an arithmetic accident.

Your kettle has not received new instructions.

The case also does not establish that every difficult scientific problem can be conquered by deploying enough agents. Mathematics has an unusual advantage: once a theorem is properly formalized, its proof can be checked against explicit logical rules. A proposed drug still has to work in a body. A proposed material still has to be made.

Reality does not compile.

### What It Might Change

The events do suggest that AI can contribute substantially to difficult research, including work well beyond routine calculation. How much of that contribution transfers to other problems, at what cost, and with what reliability remains something to establish rather than announce.

For mathematics, the pressure falls on more than proof production. Someone has to choose useful questions, identify the main ideas, connect results, explain them, and train people capable of doing all those things again.

Those activities already mattered. The danger is that they become harder to fund and recognize just as a flood of new results makes them more necessary.

Imagine a machine that can deliver a thousand complicated answers before breakfast. If nobody knows which questions mattered, which arguments are sound, or how one answer helps with the next, the breakfast table is impressive but unusable.

There is also a question of power. A mathematician with a research budget and a company with an internal model, vast computing resources, and control over a research platform are not equally equipped competitors. It is reasonable to ask how access, confidentiality, and credit should work before declaring the competition an uncomplicated improvement.

None of this guarantees a comfortable future of partnership. Some tasks may be displaced. Some opportunities may expand. The result will depend partly on choices about institutions and access, not on the equations alone.

### Back at the Cup

Picture someone stirring tea and watching the small vortex fade.

The ordinary event remains ordinary. It does not become dangerous because mathematicians have found a troublesome idealization. What changes is our understanding of how much can be concealed inside a short equation, and how many different things we mean when we say a problem has been solved.

There is the claimed theorem. There is the formal statement. There is the written argument. There is the explanation another person can carry away and use. There is the official prize process. And somewhere beside all of them sits the argument about whose name belongs on the work.

It would be convenient if one check mark covered the lot.

Instead, we have a proposed mathematical breakthrough, powerful new tools, unfinished scrutiny, and a room full of people discovering that producing an answer and making knowledge are related but not identical occupations.

The tea will be cold before they finish.

---

## Sources and Further Reading

Primary sources and developments checked through October 10, 2026:

- Charles L. Fefferman, [official Navier–Stokes problem statement](https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf); Clay Mathematics Institute, [problem status](https://www.claymath.org/millennium/navier-stokes-equation/) and [Millennium Prize rules](https://www.claymath.org/millennium-problems/rules/).
- Guo Luo and Thomas Y. Hou, [*Potentially Singular Solutions of the 3D Incompressible Euler Equations*](https://arxiv.org/abs/1310.0497), 2013.
- Diego Córdoba and Luis Martínez-Zoroa, [forced Euler blowup paper](https://arxiv.org/abs/2309.08495), 2023; with Fan Zheng, [hypodissipative Navier–Stokes paper](https://arxiv.org/abs/2407.06776), first posted in 2024; Córdoba and Martínez-Zoroa, [smooth-source porous media paper](https://arxiv.org/abs/2410.22920), first posted in 2024.
- OpenAI, [*On the Navier–Stokes Millennium Prize Problem*](https://openai.com/index/navier-stokes-solution/), September 8, with the September 10 update; [mathematical manuscript](https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf); [Lean repository](https://github.com/openai/NavierStokesAndEuler).
- Tristan Buckmaster, [public statement on the results and discussions with OpenAI](https://cims.nyu.edu/~tristanb/statement.pdf), September 2026.
- Sébastien Bubeck, [public response](https://www.linkedin.com/posts/sebastien-bubeck-6b558a1a5_i-would-like-to-clarify-a-few-things-1-activity-7503148080888893440-Ny3E).
- Terence Tao, [explanation of the Alpöge–Buckmaster work](https://terrytao.wordpress.com/2026/09/07/finite-time-blowup-with-smooth-forcing-term-for-the-incompressible-porous-medium-boussinesq-and-incompressible-euler-equations/), September 7.
- [*A Severe Misalignment of AI in Mathematics*](https://mathandai.org/), September 11; [Tao's account of the 25 initial signatories](https://terrytao.wordpress.com/2026/09/11/a-severe-misalignment-of-ai-in-mathematics/).
- Peter Constantin, Mihaela Ignatova, and Vlad Vicol, [*Regularity of Asymptotically Axisymmetric Solutions to the 3D Navier–Stokes Equations with Analytic Forcing*](https://arxiv.org/abs/2609.20803), first posted September 17.
- Zhen Lei and Xiao Ren, [*Finite-Time Blowup for Navier–Stokes with Smooth Forcing, Part I*](https://arxiv.org/abs/2609.35406), first posted September 28.
- Alexander Bastounis, Fabian Circelli, and Anders C. Hansen, [*Navier–Stokes Lost in Translation*](https://arxiv.org/abs/2610.08144), October 6.
- OpenAI, [*Sharing AI Progress in Mathematics*](https://openai.com/index/sharing-ai-progress-in-mathematics/), October 6; [manuscript catalogue and verification notes](https://github.com/openai/math).
- Lean documentation, [*Axioms and Computation*](https://lean-lang.org/theorem_proving_in_lean4/Axioms-and-Computation/).

For reporting and interviews:

- Konstantin Kakaes, [*AI Has Solved One of Math's $1 Million Millennium Prize Problems*](https://www.quantamagazine.org/ai-has-solved-one-of-maths-1-million-millennium-prize-problems-20260908/), *Quanta Magazine*, September 8. Its early framing should be read alongside the later primary sources above.
