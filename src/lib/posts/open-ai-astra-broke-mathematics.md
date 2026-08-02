---
title: "The Machine That Ate Ten Theorems: How OpenAI's Unreleased Astra Model Produced Ten Mathematical Advances"
description: "An assessment of ten AI-generated advances, their Lean formalizations, unresolved questions, and OpenAI's reported $2,000 token estimate."
date: "2026-08-02"
dateModified: "2026-08-02"
thumbnail: "/thumbnail/Compress_20260801_131236_6396.jpg"
thumbnailAlt: "Abstract digital artwork combining theorem notation with geometric computational patterns."
category: "Artificial Intelligence"
tags: ["Operator Algebras","Connes Rigidity Conjecture","Reinforcement Learning","Peer Review","Sol API Rates","Astra","Mathematical","OpenAI","Arguments","Formal"]
published: true
color: "#10a37f"
---

<TTS />

<Pi src="/thumbnail/Compress_20260801_131236_6396.jpg" />

# The Machine That Ate Ten Theorems

I did not wake up on the first of August, 2026, expecting to witness the collapse of a particular kind of human exceptionalism.

And yet, there it was—announced not with the thunderclap of a Fields Medal ceremony at the International Congress of Mathematicians, but with the distinctly Silicon Valley hum of a blog post, a GitHub repository, and a post from OpenAI researcher Sébastien Bubeck, who wrote, with what I can only describe as mathematically restrained euphoria, that “nonsofic groups exist,” and that this was merely one of “many new beautiful results” from a model the world had not yet been allowed to touch.

The model is called Astra.

It is, according to OpenAI, its “next major model”—a phrase that manages to be simultaneously grandiose and maddeningly vague, like calling the Pacific Ocean “a notable body of water”—and on that August morning, the company revealed that an internal version of this unreleased system had generated the mathematical arguments behind ten substantial new results across mathematics and theoretical computer science.

Some of those results resolve long-standing questions outright. Some disprove conjectures. Others improve bounds that had resisted improvement for decades. It is important to make that distinction, because “Astra solved ten open problems” is the sort of sentence that races around the internet in its underpants before accuracy has located its spectacles.

OpenAI itself calls them ten advances.

The problems had all been open, with no progress on their central result for at least a decade, and in most cases considerably longer. Their histories range from questions formulated around the turn of this century to Ehrhart’s volume problem, which dates to 1964, and a high-dimensional sphere-packing exponent that had not been generally improved since 1978.

And then there was the number.

Roughly two thousand dollars.

I want you to sit with that figure for a moment, because I certainly had to—but not before attaching to it the large warning label that most headlines promptly left in the box.

OpenAI did not say that Astra cost two thousand dollars to build. It did not say that the entire research programme cost two thousand dollars. It did not say that training the model, running the data centres, paying the researchers, selecting the problems, preparing 249 pages of manuscripts, formalizing the results, checking the files, or pursuing unsuccessful directions cost two thousand dollars.

Its claim is narrower and stranger: the total number of tokens needed to find the ten successful solutions would have cost roughly $2,000 at Sol API rates.

That is an API-equivalent price for the solution-finding inference tokens, not an audited account of the factory that produced them. It is the price printed on the flour packet, not the cost of constructing the mill, irrigating the wheat field, employing the baker, or persuading a government inspector that the bread will not kill anyone.

Even with that distinction nailed firmly to the furniture, the number is startling.

Two thousand dollars is less than the price of a decent used motorcycle. It is less than what a single graduate student in algebraic topology might spend on coffee and despair over the course of a PhD. It suggests—not proves, but suggests—that once an advanced research model exists, the marginal price of asking it to hunt for certain frontier mathematical arguments may be astonishingly low.

For those solution-finding tokens, according to OpenAI, Astra constructed an explicit non-sofic group, settling a central question in group theory whose foundations were laid by Mikhail Gromov in 1999 and which Benjamin Weiss explicitly formulated in 2000. It produced a counterexample to Connes’s rigidity conjecture in operator algebras. It proved the sharp inequality in Ehrhart’s volume conjecture in every dimension, although the complete classification of equality cases remains open. It established exponential parallel repetition for every finite two-player entangled game. It resolved three problems from Paul Erdős’s catalogue: one concerning multicolour Ramsey numbers and two concerning extremal graph theory.

It also improved the general asymptotic upper bound for high-dimensional sphere packing for the first time since 1978, determining the exact asymptotic strength of the Cohn–Elkies linear-programming method. It produced exponentially stronger bounds for binary and spherical codes. It established new lower bounds for computing the permanent with arithmetic circuits and formulas. And it proved polynomial-factor hardness of approximation for the Euclidean closest vector problem through a direct reduction from 3SAT.

I am not, by temperament, a person who is easily impressed by press releases. I have watched too many AI companies announce “breakthroughs” that turned out to be carefully cultivated benchmarks, too many “revolutionary” systems that could not, when pressed, reliably summarize a PDF or tell me whether the chicken or the egg came first without spiralling into ontological hand-waving.

But this was different.

Not because corporate enthusiasm had suddenly become evidence.

Not because all ten papers had already passed through years of independent peer review. They had not.

Not because formal verification abolishes every remaining question. It does not.

It was different because these were concrete mathematical claims, accompanied by manuscripts, machine-checkable formalizations, and enough exposed structure for specialists outside OpenAI to begin trying to break them.

This was not merely a benchmark.

This was mathematics entering the most severe part of mathematics: the part where everyone else gets to check.

## What, Exactly, Did the Machine Do?

Let me begin with the surface, because the surface is where most of us live, and because the surface of this particular story is already deep enough to drown in if you are not careful.

OpenAI published a 249-page collection containing the ten results. It released Lean 4 formalizations for all ten in a public GitHub repository. The repository’s own metadata reports zero unfinished `sorry` placeholders in the main results and provides instructions for building the files and checking them independently.

It also released a separate 62-page document called *How the Ideas Came Together*.

This document should not be mistaken for a raw transcript of Astra’s private thoughts, assuming “private thoughts” is even a coherent phrase to apply to a statistical machine. The notes say explicitly that they were written by an AI model that read the original internal chains of thought together with the completed mathematical papers and then reconstructed how each proof developed: which ideas first appeared promising, which approaches struck genuine obstacles, which changes of perspective exposed the underlying structure, and how the decisive insights became final arguments.

That makes the document unusually revealing by the standards of commercial AI research.

It does not make it raw chain of thought.

It is a retrospective mathematical narrative—a model-written reconstruction of the expedition after the explorers had returned, washed the mud from their boots, and agreed which ravine had nearly killed them.

OpenAI describes the sequence of work as follows. Astra generated the mathematical arguments. Human researchers then used the same model to prepare those arguments as manuscripts. Afterward, the model formalized each argument in Lean.

That word—*afterward*—matters.

The release does not establish that Lean sat inside Astra’s discovery process like a small, furious magistrate, rejecting every bad inference and sending the model back to prison until it produced a compiling proof. Perhaps machine checking influenced portions of the work. Perhaps other internal verification tools were involved. But OpenAI has not disclosed an automatic loop in which Astra proposed a proof, Lean rejected it, and Astra tried again thousands of times.

What has been released is impressive enough without installing imaginary plumbing.

The problems themselves span eight broad territories: high-dimensional geometry, coding theory, arithmetic circuit complexity, group theory, operator algebras, quantum complexity, lattice theory and cryptography, and extremal combinatorics. The ten entries are not ten members of the same family wearing different hats. They live in regions of mathematics whose residents do not always share notation, intuition, proof techniques, or even a common idea of what constitutes a civilised afternoon.

There is the high-dimensional sphere-packing problem, which asks how densely congruent spheres can be arranged in spaces with more dimensions than any human being can visualize without developing a headache.

In three dimensions, sphere packing is the oranges-at-the-market problem. In eight dimensions it helped produce one of the great modern proofs in geometry. In several hundred dimensions it becomes a creature made almost entirely of equations, because our visual imagination, having served valiantly through length, width, and height, files a union grievance and leaves.

Astra’s result does not solve high-dimensional sphere packing in its entirety. It determines the exact asymptotic strength of the Cohn–Elkies linear-programming method and thereby improves the best general high-dimensional packing exponent for the first time since 1978. It also shows that no auxiliary function within that particular method can push the exponent further.

This is a limit of a powerful method, not the final limit imposed by the universe. Another technique might someday do better. Mathematics has a long history of watching a supposedly exhausted road end at a forest, only for somebody to arrive with an axe.

There are binary and spherical codes, mathematical arrangements concerned with packing distinguishable signals far enough apart that noise does not cause one to be mistaken for another. These ideas belong to the foundations of reliable communication and storage. They help us understand what error-correcting systems can and cannot achieve.

Astra produced exponentially improved upper bounds for fixed-distance binary codes across all parameters, with analogous improvements for high-dimensional spherical codes.

This does not mean your next text message will travel faster, your bank transaction will become magically more encrypted, or your mobile network will wake tomorrow morning with a new personality. Asymptotic bounds in coding theory may eventually influence the design and understanding of real systems, but the papers do not announce an immediate engineering upgrade to the world’s telecommunications infrastructure.

There is the closest vector problem, a foundational question in lattice theory. Given a lattice—a regularly repeating arrangement of points in many-dimensional space—and a target point, one asks which lattice point lies closest to the target.

This problem is related to the mathematical world from which much post-quantum cryptography has grown. Astra’s result establishes that approximating Euclidean CVP within a factor of \(n^{1/400}\) is NP-hard through a direct deterministic reduction from 3SAT.

That is a substantial complexity-theoretic result.

It is not a new security proof for the cryptographic standards currently being installed in governments, browsers, banks, and nervous infrastructure departments. The paper itself notes that deployed lattice-based cryptographic schemes rely on structured or average-case assumptions, not directly on the worst-case NP-hardness of CVP. The result strengthens our understanding of a fundamental lattice problem; it does not hand every post-quantum cryptosystem a fresh concrete wall and a ceremonial guard dog.

And then there is the non-sofic group.

I need to pause here, because this result, more than any other in the package, seems designed to make even professional mathematicians sit a little straighter.

A group, in the abstract algebraist’s lexicon, is a collection of reversible symmetries or operations obeying a small set of rules. The rotations of a cube form a group. So do permutations, translations, and many structures so abstract that a cube would be grateful not to understand them.

A countable group is called sofic, roughly speaking, when every finite portion of its multiplication behaviour can be approximated by permutations of a sufficiently large finite set. Mikhail Gromov introduced the underlying approximation property in work published in 1999. Benjamin Weiss subsequently gave sofic groups their name and explicitly asked in 2000 whether a non-sofic group exists.

For more than a quarter of a century, no one had produced one.

Astra’s argument constructs an explicit non-sofic group, thereby showing that not every countable group can be approximated in this way.

This is not a minor technicality. It resolves a central question in group theory that had survived repeated attacks, partial approaches, neighbouring breakthroughs, and the special kind of institutional humiliation that mathematics reserves for questions everyone can state and nobody can settle.

The machine did not merely say that such a group probably exists.

It gave one.

Or, more precisely, it generated an argument constructing one, that argument was prepared into a manuscript, and its central formal statement was encoded in Lean.

The distinctions matter. So does the achievement.

## Who Is in the Room When a Machine Proves a Theorem?

The cast of characters is larger and stranger than one might expect.

There is, of course, OpenAI itself—the San Francisco company that has travelled, in only a few years, from research laboratory to commercial giant to geopolitical participant, an organisation whose model releases are now covered with the breathless urgency once reserved for papal conclaves, moon landings, and the arrival of a new iPhone containing one additional camera.

There is Sébastien Bubeck, the OpenAI researcher who announced that non-sofic groups exist with the air of a man revealing both the answer to a twenty-six-year-old problem and the fact that there were nine more where that came from.

There is Noam Brown, another OpenAI researcher, who remarked that the package contained no Millennium Prize Problems—yet—and that considerably more test-time computation could be applied. He also acknowledged that the team had tried other major problems without success.

That last fact matters.

Astra is not an oracle seated on a cloud, waiting for humanity to submit the correct parchment. OpenAI describes these ten results as a selection. Some attempted problems failed. We do not yet know the denominator: how many problems were tried, how they were chosen, how much work went into failures, which kinds of problem resisted the system, or how representative these successes are of Astra’s general ability.

Ten arrows struck remarkable targets.

We have not yet been shown the entire field into which the arrows were fired.

There are the human researchers who selected problems, interacted with the model, prepared the manuscripts, checked the mathematics, organised the release, constructed the public repository, and took responsibility for correctness. OpenAI’s authorship position is unusually explicit: it says that attributing the mathematical arguments to humans would misrepresent how the work was produced, while the humans remain responsible for preparing, formalizing, and standing behind the results.

There are the external mathematicians who had already encountered OpenAI’s mathematical ambitions through a separate result announced in May 2026. In that case, an internal general-purpose model disproved a long-standing conjecture concerning Erdős’s planar unit-distance problem. Tim Gowers, a Fields Medalist, wrote that if a human had submitted that paper to the *Annals of Mathematics* and he had been asked for a quick opinion, he would have recommended acceptance without hesitation.

That was praise for the earlier unit-distance result, not a completed referee report on these ten new papers. It nevertheless set the atmospheric pressure for what followed.

There is also Shuoxing Zhou, whose presence complicates any clean tale of solitary machine conquest. OpenAI’s manuscript acknowledges independent and concurrent work by Zhou establishing another counterexample to Connes’s rigidity conjecture, developed partly with assistance from GPT-5.6 Sol.

This does not erase Astra’s result. It does remind us that priority in mathematics can still arrive by two doors at once, even when one of the mathematicians in the room is made largely of matrix multiplication.

And then there is the machine itself.

I find myself reluctant to call Astra an “it,” not because I believe it possesses consciousness—there is no evidence presented for that, and the philosophical swamp of machine sentience already contains enough people shouting from partially submerged furniture—but because the pronoun feels inadequate.

Astra is not a person.

It is also not exactly a tool in the old sense, not in the way a slide rule is a tool, or a calculator, or even an ordinary symbolic algebra package. A calculator extends arithmetic. A proof assistant verifies formal derivations supplied through a human-guided process, although modern proof assistants contain considerable automation. Astra, according to OpenAI’s account, generated novel high-level mathematical arguments across several advanced fields.

We do not yet have stable language for such a thing.

“Collaborator” gives it too much social substance.

“Instrument” gives it too little intellectual agency.

“System” is technically safe and emotionally useless, the linguistic equivalent of identifying a tiger as a multicellular arrangement.

There is also the mathematical community, although we should be careful not to manufacture a consensus from one day of social-media reaction. Early responses have ranged from exhilaration to caution. The manuscripts must still be read by specialists in each field. The formal statements must be compared carefully with the informal claims. Novelty and priority must be examined. The arguments must survive independent reconstruction, criticism, and the sustained attentions of people who have spent twenty years learning where proofs in their particular subject tend to hide bodies.

In June 2026, before this announcement, mathematicians published the Leiden Declaration on Artificial Intelligence and Mathematics. It was later endorsed by the International Mathematical Union. The Declaration warns about inadequate attribution, the use of mathematical work as training data without consent, pressure on academic independence, unreliable machine-generated arguments, industrial concentration, and the temptation to replace peer review with corporate announcements.

It recommends disclosing tool use, providing formal proofs where appropriate, retaining human responsibility for correctness, crediting prior work aggressively, and publishing results through venues where independent scrutiny can occur. It says, with admirable directness, that press releases and blog posts may support publication but cannot replace peer review.

I read OpenAI’s August release as an implicit answer to some of those concerns.

The company disclosed the model’s role. It refused to launder machine-generated arguments into conventional human authorship. It released manuscripts rather than slogans alone. It provided Lean formalizations and public code. It acknowledged concurrent work. It invited the mathematical community to examine the results.

That addresses some of the Declaration’s complaints.

It does not answer all of them.

The release does not tell us what mathematical writing entered Astra’s training data, under what permissions, or with what mechanisms for attribution. It does not place the system under public governance. It does not substitute for journal review. It does not settle the argument over whether authorship belongs only to humans, as the Leiden Declaration insists, or whether assigning the arguments to the model is the more honest description, as OpenAI maintains.

The disagreement is not cosmetic. It concerns who receives credit, who bears responsibility, whose labour becomes invisible, and who gets to define the rules when commercial systems begin producing results inside disciplines older than the companies that built them.

And finally, there is us.

The readers. The bystanders. The people who may not know what a von Neumann algebra is—and I assure you, until recently, I belonged comfortably among your number—but who are nonetheless living through a moment when the boundary between human and machine mathematical production is being redrawn in public, one formal certificate at a time.

## When Did Mathematics Become a Compute Problem?

The convenient answer is: gradually, then suddenly.

The accurate answer is: gradually, repeatedly, and with several earlier sudden moments that history has already half-forgotten.

In 1956, the year of the Dartmouth gathering that helped give artificial intelligence its name, Allen Newell, Herbert Simon, and Cliff Shaw developed the Logic Theorist, a program designed to prove theorems from *Principia Mathematica*. It was tiny by modern standards, operating in a symbolic world narrower than the gap beneath a closed door, but it established something philosophically outrageous: a machine could search for a chain of logical deductions and produce a mathematical proof.

Automated theorem proving then developed through resolution methods, equational reasoning systems, specialised provers, and increasingly sophisticated search. Interactive proof assistants such as Coq, Isabelle, HOL, and later Lean gave mathematicians environments in which definitions and proofs could be encoded precisely enough for a small trusted kernel to check them.

But it would be wrong to say that these machines merely filled in tedious details and never discovered anything.

In 1996, William McCune’s EQP automated theorem prover found a proof of the Robbins conjecture, a problem in algebraic logic that had remained open for decades. Automated systems have discovered new proofs and mathematical facts before Astra. Computers have also played decisive roles in famous results such as the four-colour theorem and the Kepler conjecture, although those involved very different kinds of computation and human organisation.

The novelty of Astra is therefore not that a machine has, for the first time in history, contributed to mathematical discovery.

The novelty is the combination.

A general-purpose learned model, rather than a hand-built prover specialised for a narrow formal language, appears to have produced sophisticated natural-language arguments across a startling range of frontier fields. The same system then helped turn those arguments into manuscripts and formalized the central claims in Lean.

It is the breadth, the level, the interface, and the apparent marginal cost that make the event feel different.

Lean itself was created by Leonardo de Moura at Microsoft Research in 2013. It is both a dependently typed programming language and an interactive theorem prover. It allows mathematical statements to be expressed with enough precision that a kernel can verify whether a proposed proof follows from the encoded definitions, assumptions, and rules.

Lean is not merely a passive spell-checker for equations. It supports tactics and automation, and the wider Lean ecosystem—including the enormous community-maintained Mathlib library—provides a growing body of formalised mathematics upon which new developments can be built.

Still, Lean and Astra occupy different positions in the story.

Lean supplies a formal language and a checking mechanism.

Astra is claimed to have supplied the arguments.

The distinction resembles the one between a composer and a piano fitted with a device that refuses to play a note outside the score—except that the piano is really a logic kernel, the score is several thousand lines of dependent type theory, and the audience has become alarmingly quiet.

Large language models initially seemed poor candidates for this work. Early systems could imitate mathematical prose while committing errors that would embarrass an unusually distracted abacus. They invented lemmas, dropped hypotheses, divided by zero, confused implication with equivalence, and carried themselves throughout with the serene confidence of a man explaining tax law after three drinks.

Chain-of-thought prompting, introduced prominently in 2022, showed that asking sufficiently large models to generate intermediate reasoning steps could improve performance on arithmetic, symbolic, and commonsense problems. Later systems added reinforcement learning focused on reasoning, verifiers, search, sampling, self-correction, and greater inference-time computation.

By 2024 and 2025, models were improving rapidly on mathematical competitions, formal theorem proving, coding, and longer reasoning tasks. By May 2026, OpenAI could present the unit-distance result: a general-purpose internal model producing an argument that external mathematicians regarded as a genuine frontier contribution.

Then came Astra’s ten-result package.

This was not the moment when computation first entered mathematics. Computation had been inside the house for seventy years, quietly rearranging the furniture.

It was the moment when a general-purpose learned system appeared to walk into several rooms at once, return carrying proofs from fields with different customs, and ask whether anyone had a compiler.

## Where Does This Happen? The Geography of Machine Proof

The physical location of Astra’s computations is unknown to us.

OpenAI has not disclosed the hardware used for these discoveries, the data-centre locations, the model’s parameter count, or the exact arrangement of the systems surrounding it. We can safely imagine servers, accelerators, cooling equipment, electrical substations, networking fabric, and a quantity of industrial plumbing rarely shown in inspirational videos.

Anything more specific would be architecture by séance.

The mathematical location of the results is far more interesting.

The non-sofic group result sits at the intersection of group theory, combinatorics, dynamics, and operator-algebraic ideas. The construction uses property-\((T)\) expanders and the binary Leavitt algebra, objects whose names sound less like pieces of mathematics than rival Scandinavian metal bands.

The Connes result inhabits operator algebras and the theory of von Neumann algebras, a field so abstract that even many professional mathematicians approach it with the wary respect one extends to a chemical bottle whose label has fallen off.

The sphere-packing and coding results connect Fourier analysis, high-dimensional geometry, information theory, and extremal methods. The permanent lower bounds belong to arithmetic circuit complexity, where researchers try to understand how difficult particular polynomials are to compute under restricted models of computation.

The quantum parallel-repetition theorem deals with entangled two-player games. These are not games in the sense that anyone enjoys them. They are formal interactions used to study quantum information and computational complexity, populated by imaginary players who receive questions, produce answers, share entanglement, and never once complain that the rules are badly explained.

The Ramsey result concerns the unavoidable birth of order inside sufficiently large systems. Colour the edges of a large complete graph using several colours, and some monochromatic pattern eventually becomes inescapable. Ramsey theory is mathematics proving that if a party grows large enough, a recognisable clique will form no matter how desperately the host tries to keep everyone interesting.

The compactness and degeneracy results overturn two conjectures in extremal graph theory. Together with the Ramsey result, they resolve Erdős problems 146, 180, and 183.

What strikes me is not that Astra has proved itself an omniscient polymath. We do not know enough about its training, selection process, internal tools, or failures to say that.

What strikes me is that the public package is not narrow.

These are ten results whose statements, techniques, and mathematical habitats are genuinely diverse. A human researcher may spend an entire career becoming fluent in one of these neighbourhoods. Astra’s release arrived carrying maps from eight.

And this is where the Lean formalizations become crucial.

Mathematics is not merely about producing language that sounds persuasive. A proof must withstand attempts to identify missing cases, hidden assumptions, illegal transitions, undefined objects, and all the other small structural crimes by which elegant arguments collapse at three in the morning.

Lean checks whether a formal theorem follows from its formal definitions and assumptions.

That is extremely strong evidence.

It is not the end of scrutiny.

A formal proof may perfectly establish the wrong formal statement. A definition may fail to match the ordinary mathematical concept it was intended to encode. An informal theorem may contain a nuance that disappears during translation. A result may be correct but not novel. A manuscript may overlook prior work. A proof may be valid and its claimed significance still inflated.

Lean can inspect the bridge bolt by bolt.

It cannot, by itself, tell us whether the bridge has been built across the river named in the brochure.

The released certificates therefore alter the epistemic status of the work without making human mathematical judgement obsolete. They move the results far beyond “a chatbot said so.” They provide inspectable formal objects that independent users can compile, compare, and challenge.

The manuscripts provide narrative, context, intuition, definitions, and the route through the forest.

The Lean files provide machine-checkable claims about where that route leads.

The discovery notes reconstruct how the expedition appears to have unfolded.

Together, they form a new sort of mathematical artefact: human-prepared prose built from machine-generated arguments, accompanied by machine-generated formalizations, checked by a small formal kernel, released into a human community that must decide what the whole arrangement means.

## Why Should Anyone Who Is Not a Mathematician Care?

This is the question I kept asking myself as I read through the announcement, because I am aware that to most people “non-sofic groups” sounds like a medical condition, and “Connes’s rigidity conjecture” like a clause in a rental agreement drafted by a landlord with unusually theoretical ambitions.

But here is why I think this matters.

First, there is the economic argument.

OpenAI estimates that the tokens used to find the ten solutions would have cost roughly $2,000 at Sol API rates.

Again, this is not the cost of creating Astra. Training frontier models requires enormous capital, specialised hardware, energy, research labour, data preparation, software infrastructure, and institutional experience. The announcement does not provide a complete project budget. Nor does it tell us how the cost of failed searches on other problems should be counted.

The number measures something narrower: the API-equivalent inference price associated with finding these particular successful solutions.

But narrow measurements can still change the world.

Suppose a research system costs billions to create but can then attempt difficult scientific problems at a marginal price small enough for universities, laboratories, or eventually individuals to afford. The economic transformation would not lie in the factory becoming cheap. It would lie in the products of the factory becoming plentiful.

The printing press was not cheap because metal, labour, paper, transport, and literacy had ceased to cost money. It mattered because once the machinery existed, another copy of a book became dramatically cheaper than another roomful of scribes.

The $2,000 figure may be an early hint of a similar shift in mathematical search.

Or it may turn out to be unusually favourable accounting applied to a hand-picked set of successes.

We do not yet know.

Second, there is the philosophical argument.

Mathematics has often been presented as a citadel of human reason. We gradually accepted that machines could calculate faster, search larger spaces, beat champions at chess and Go, fold proteins, optimise routes, and generate images of Napoleon riding a bicycle through Times Square.

But research mathematics seemed different.

It appeared to require taste: knowing which question mattered.

It required intuition: sensing that two remote ideas might secretly touch.

It required invention: constructing an object nobody had previously imagined.

It required endurance: following a technical argument through months or years of failed approaches.

And it required explanation: turning whatever strange private insight occurred into a proof another mind could inspect.

If OpenAI’s account holds up under independent scrutiny, Astra has participated in several of these activities—not as a person participates, and not necessarily through anything resembling human intuition, but in a manner sufficient to generate arguments that experts must now take seriously.

That does not prove that the model is conscious.

It does not prove that it understands a group as a mathematician understands one.

It does not settle whether next-token prediction, reinforcement learning, search, and inference-time computation amount to “thinking.”

It does make the old dismissal—“merely autocomplete”—sound increasingly like describing an aircraft as merely air moving around metal.

The description is not entirely false.

It has simply failed to explain why the thing is above your house.

Third, there is the practical argument, although this must be handled without attaching a rocket to every theorem.

High-dimensional packing and coding bounds deepen our understanding of geometric and information-theoretic limits. The closest-vector result advances the complexity theory of lattices. The permanent bounds tell us something about restricted forms of algebraic computation. Quantum parallel repetition strengthens a foundational principle in quantum complexity.

These fields connect, at various distances, to communications, storage, cryptography, algorithms, and quantum information.

“Connect” does not mean “will appear in a commercial product next Tuesday.”

Pure mathematics often takes a route to application so indirect that entire generations die while the theorem is still changing trains. Number theory was once celebrated for its useless purity; it now sits beneath digital cryptography. Non-Euclidean geometry seemed a magnificent intellectual diversion until general relativity needed somewhere to live.

The honest claim is not that Astra’s ten results have already redesigned technology.

The honest claim is that a system capable of repeatedly contributing to the mathematical foundations of technology could eventually accelerate the production of ideas from which applications grow.

That is a conditional sentence.

It is also a very large one.

## How Does It Work? The Honest Gap Beneath the Miracle

I am going to attempt something here that I find both necessary and slightly absurd: explain what can be said about how a modern AI system produces mathematical work without quietly replacing the unknown parts with a technical fairy tale.

The honest answer is that OpenAI has not disclosed enough detail to explain exactly how Astra found these results.

It has not published Astra’s parameter count.

It has not described its detailed architecture.

It has not identified the hardware used for the discovery runs.

It has not disclosed the model’s training corpus.

It has not explained whether the system used multiple coordinated agents, a single long-running process, external search tools, retrieval systems, private mathematical databases, specialised verifiers, or some combination of these.

It has not provided a complete account of how the problems were selected, how prompts were constructed, how candidate arguments were filtered, or how much human judgement entered between one model run and the next.

Noam Brown’s comments indicate that test-time computation matters and could be pushed considerably further.

That tells us something.

It does not reveal the gearbox.

Astra belongs to the lineage of modern learned reasoning systems, whose broader foundations include neural language models, reinforcement learning, formal methods, and inference-time search. Systems in this lineage generate sequences of tokens while representing extraordinarily complicated statistical relationships among concepts, symbols, proof patterns, definitions, and pieces of language.

At the simplest descriptive level, a language model predicts what token should come next.

That sounds trivial because the sentence leaves almost everything important inside the verb *predicts*.

A weather model predicts whether it will rain. A physicist predicts the orbit of a spacecraft. A chess engine predicts which lines of play survive. The intellectual content lies in the representation, computation, and structure that make the prediction possible.

Modern reasoning systems can be given more inference-time computation so that they do not merely produce one immediate answer. In general, such systems may generate multiple candidates, extend arguments, revise them, compare alternatives, reject dead ends, or use verifiers and tools.

That is the general technological landscape.

We do not know Astra’s precise route through it.

The public chronology is simpler.

Astra generated mathematical arguments.

Humans used the same model to prepare those arguments into manuscripts.

Afterward, Astra formalized the arguments in Lean 4.

The public repository’s metadata describes the formalization process as agent-based, using Astra through Codex, and reports approximately one week of wall-clock time for that formalization work. This gives us a glimpse of the later stage. It does not prove that the original mathematical discoveries emerged through the same process.

Lean, meanwhile, is unforgiving in a very particular way.

It does not judge whether a proof is beautiful, natural, historically interesting, or likely to be invited to a conference in Oberwolfach. It checks whether a formal term inhabits the required type—whether the conclusion follows under the encoded logical rules and assumptions.

If a formal proof contains an unjustified step, the kernel will not nod politely because the surrounding prose is elegant.

But even here, caution is necessary. The model formalized the arguments after they had been discovered and prepared. The release does not say that Lean automatically guided the original search by rejecting every failed argument and rewarding every successful one.

That loop is plausible as a general method.

It is not part of the disclosed evidence for these discoveries.

Is any of this “thinking”?

I genuinely do not know.

I suspect the question may eventually appear as quaint as asking whether a submarine truly swims. It does not swim as a fish swims. It does something functionally related through a mechanism so different that the shared verb becomes both useful and misleading.

Astra does not appear to reason as a human mathematician reasons.

It may not possess concepts in anything resembling our phenomenological sense.

But it generated mathematical arguments that humans had not found, across problems humans regarded as important, and translated their central claims into formal objects that a proof assistant can inspect.

Whatever verb we eventually choose must account for that.

## Which Technologies, Systems, and Discoveries Made This Possible?

The concentric circles keep narrowing. We have moved from announcement to result, from result to verification, from verification to the large dark patch marked *methodology undisclosed*.

What remains is not Astra’s bill of materials, because OpenAI has not supplied one, but the intellectual and technical ecosystem from which a system like Astra could emerge.

There is the transformer architecture, introduced in the 2017 paper *Attention Is All You Need*. Transformers allowed models to relate different parts of an input through attention mechanisms and became the foundation of the modern large-language-model era.

We do not know whether every significant component of Astra is a conventional transformer or what alterations OpenAI has made. It is nevertheless reasonable to place Astra inside the technological lineage that transformers opened.

There is reinforcement learning, through which models can be trained not merely to imitate text but to favour behaviours that receive stronger rewards. In mathematical systems, rewards may come from correct answers, verifiers, proof completion, formal checking, or other signals.

That does not mean OpenAI has disclosed Lean verification as Astra’s training reward.

It means that the broader field has learned how to turn correctness signals into pressure that shapes reasoning behaviour.

There is inference-time scaling: allocating more computation after training, when the model is confronting a particular problem. Instead of demanding an answer in the computational equivalent of one breath, the system may be allowed to spend longer searching, revising, or extending an argument.

This changes the economic unit of intelligence.

A traditional software system has a fairly fixed algorithmic path. A reasoning model can, in principle, be given a larger budget for a harder problem, much as a human researcher may spend ten minutes on one question and ten years on another, except without the intervening grant applications and departmental meetings.

There is Lean 4 and the formal-mathematics ecosystem surrounding it.

A proof assistant does not merely catch arithmetic slips. It demands that definitions, hypotheses, and conclusions be stated with a precision natural-language mathematics often postpones to the reader’s professional charity.

Mathlib and related libraries represent immense accumulations of human labour: definitions, lemmas, abstractions, notation, tactics, and connective tissue formalized by a community over years. Astra’s Lean work does not float in an empty logical universe. It stands upon infrastructure created by mathematicians and programmers, one theorem declaration at a time.

There is compute.

Whatever exact hardware Astra used, systems at this frontier depend on accelerators, distributed software, storage, networking, power, cooling, monitoring, and engineering on a scale that makes the phrase “cloud computing” sound charmingly meteorological.

The cloud is not a cloud.

It is a factory with excellent branding.

And there is mathematical writing.

OpenAI has not disclosed Astra’s training corpus, so we should not claim that it ingested every paper, textbook, arXiv preprint, MathOverflow discussion, and handwritten grocery list containing a commutative diagram.

But no model of this kind emerges independently of human intellectual culture. Its capabilities depend, directly or indirectly, on mathematical language, examples, proof styles, formal libraries, feedback, and research traditions created by people over centuries.

Astra stands on the shoulders of giants, but unlike Newton it may have difficulty producing a complete bibliography of the giants involved.

That is one reason attribution has become such a combustible issue.

Finally, there are the humans around the model.

Someone chose the problems.

Someone built the evaluations.

Someone recognised that an output might contain a genuine idea rather than an especially sophisticated hallucination.

Someone checked definitions, reconstructed arguments, wrote exposition, searched the literature, compared the claims with previous work, formalized missing infrastructure, organised the repository, and accepted responsibility for releasing the package.

The achievement cannot be understood as “the machine alone” any more than a telescope’s discovery can be separated entirely from the people who built the mirror, selected the patch of sky, interpreted the signal, and checked that the smudge was not a fingerprint.

But neither can it honestly be reduced to the humans merely using a passive tool.

The mathematical arguments, OpenAI says, came from Astra.

It is the combination—learned model, inference-time computation, formal infrastructure, vast compute, accumulated mathematical culture, and human curation—that has produced the event.

No single ingredient explains it.

Convergence rarely arrives with the decency to belong to one inventor.

## The Skeptics, the Caveats, and the Uncomfortable Questions

I would be remiss if I presented this story as an unalloyed triumph, a simple narrative in which human ingenuity creates a superior mathematical successor, hands over the chalk, and retires to cultivate roses.

The reality is messier.

The messiness matters.

Gary Marcus, the cognitive scientist and persistent critic of expansive AI claims, cautioned that excellence in some forms of mathematics would not prove that Astra had solved the general reliability problems of generative AI. A system might produce formidable formal arguments and still fail on ambiguous documents, ordinary factual questions, or tasks where no proof assistant waits at the end with a red or green light.

This is a crucial point.

Mathematics is unusually favourable to verification. Statements can be formalized. Candidate proofs can be checked. A long argument either follows from its assumptions or it does not, at least once every relevant piece has been encoded correctly.

The world outside mathematics is rarely so courteous.

A medical diagnosis depends on incomplete observations, shifting probabilities, human variation, and consequences that cannot be repaired by recompiling a theorem.

A legal judgement depends on language, precedent, intent, institutions, and contested values.

A political decision may be logically coherent and still monstrous.

A model’s success in a domain with hard verification does not automatically transfer to domains in which truth arrives wearing mud, context, and three mutually hostile witnesses.

There is also selection bias.

OpenAI calls these results a selection. Noam Brown has confirmed that other major problems were attempted without success. The company has not yet published a complete experimental ledger showing every problem, every attempt, every intervention, every failure, and every token consumed.

That does not make the reported successes dishonest.

Science has always selected results worth reporting. A chemist publishes the compound that worked, not a dramatic memoir about every flask that produced brown foam.

But the denominator matters when assessing general capability.

Ten successful frontier results could indicate a system that solves a large fraction of carefully selected problems.

They could indicate a system that solves a small but still revolutionary fraction.

They could indicate a system that is astonishing in certain mathematical styles and helpless in others.

Until the methodology and broader evaluation record are available, we should resist turning ten victories into omnipotence.

Then there is the question of independent review.

The Lean formalizations are strong evidence for the encoded statements. The repository reports no unfinished proof placeholders in the main results. The files can be built and checked by others. Independent comparator configurations are also supplied.

That is excellent practice.

But formal verification does not assess every dimension of mathematical validity.

Experts must still determine whether the encoded theorem precisely matches the informal theorem. They must inspect whether the definitions capture the intended objects, whether assumptions have been altered during formalization, whether the literature search is complete, whether the contribution is genuinely new, and whether the result’s importance has been represented proportionately.

The concurrent Connes-rigidity result illustrates why this wider scrutiny matters. Correctness is only one coordinate of research. Priority, novelty, attribution, exposition, generality, and context occupy the rest of the map.

There is also the Leiden Declaration and the institutional question it raises.

Can results announced by a technology company, accompanied by public formalizations but not yet processed through conventional journals, be regarded as established mathematics?

The old answer would be: not yet.

The new answer may become more complicated.

Traditional mathematical publication can take months or years. Formal certificates can sometimes provide stronger evidence of deductive correctness than a hurried human referee. Public repositories allow immediate inspection by hundreds of specialists rather than two anonymous reviewers carrying six other overdue manuscripts and an increasingly personal hatred of email.

But journals and peer review do more than check logical derivations. They establish priority, demand engagement with prior literature, improve exposition, evaluate significance, coordinate revisions, and place work within a durable scholarly record.

A Lean file cannot phone the author and ask why Lemma 7 appears suspiciously similar to a Russian paper from 1983.

We may therefore be witnessing not the replacement of peer review but its forced mutation.

Machine-generated mathematics may require layered verification: formal checking of central statements, independent human reconstruction of the proof, automated comparison with existing literature, public disclosure of tools and compute, specialist review of significance, and durable publication under rules the mathematical community has not yet finished writing.

The mathematician’s role would not vanish.

It would shift.

Some mathematicians might originate conjectures and research programmes. Some would interpret machine-generated arguments. Some would build formal libraries. Some would audit attribution. Some would search for conceptual explanations hidden beneath proofs that are technically correct but intellectually opaque. Some would become the people who know when the machine has solved the stated problem and when it has solved its second cousin wearing the same coat.

Whether this is liberation or displacement will depend less on the existence of Astra than on who owns it, who can access it, who receives credit, and whether universities and public institutions possess enough infrastructure to participate.

A machine can democratise research only if more than three companies can afford to switch it on.

## The Bigger Picture

I want to end not with a summary, but with an image.

Imagine a library.

Not a digital library, but a physical one, with marble floors, oak shelves, and the particular smell of old paper and dust that seems to exist only in places where knowledge has accumulated slowly enough to acquire a climate.

Imagine that this library contains an immense fraction of humanity’s mathematical writing: papers, textbooks, lectures, formal proofs, failed approaches, definitions, examples, conjectures, and the footnotes in which one mathematician politely explains that another has overlooked the obvious.

Now imagine a machine trained amid patterns extracted from a mathematical culture larger than any individual could absorb. We do not know Astra’s exact corpus, so this remains a metaphor, not a technical inventory. But imagine that the machine can connect distant pieces of mathematical language, extend arguments for long periods, produce candidates at machine speed, and eventually translate successful results into a formal language that a proof kernel can inspect.

It does not understand the library as its human readers understand it.

Perhaps it understands nothing at all in the felt, conscious sense.

Perhaps “understanding” will turn out to be a bundle of capacities rather than a single sacred substance, and machines will possess some components while lacking others.

But the outputs leave the library.

They arrive as constructions, inequalities, counterexamples, lower bounds, reductions, and formal certificates.

That is no longer science fiction.

It is also not the omniscient machine from the metaphor. Astra failed on other problems. Its methodology remains undisclosed. Its results require independent review. Its training rests upon human intellectual labour whose consent and attribution remain contested. Its apparent marginal cost sits atop infrastructure whose true cost is enormous.

The sober version of the story is less cinematic than the myth.

It may also be more consequential.

We have built systems that can sometimes contribute original arguments to research mathematics.

Not every time.

Not without human institutions.

Not without inherited knowledge.

Not without the possibility of error.

But sometimes.

And once “sometimes” enters the sentence, the future changes.

If systems like Astra become more reliable, more accessible, and more capable of sustaining research across days or weeks, the immediate effect may not be the disappearance of mathematicians. It may be an explosion in the number of plausible ideas requiring mathematical judgement.

Every conjecture could acquire a tireless attacker.

Every proof could acquire a formalisation attempt.

Every field could receive arguments imported from neighbouring fields at a rate no human literature review could match.

The scarce resource might cease to be the production of candidate proofs and become the production of understanding: deciding which results matter, why a proof works, what concept it reveals, which earlier ideas it recombines, where it fails to generalise, and what new questions become visible once the old one has been closed.

That is not a small role.

A proof without understanding can establish truth while leaving mathematics intellectually hungry. The most valuable human response to machine-generated mathematics may be neither denial nor surrender, but digestion.

What has the machine actually shown us?

Why was this path available?

What had human researchers overlooked?

Which idea is reusable?

Which theorem is merely difficult, and which changes the shape of its subject?

These are not administrative leftovers. They are part of mathematics itself.

And then there is the question of human exceptionalism.

Mathematical discovery was never the exclusive product of isolated genius. It emerged from languages, schools, letters, libraries, rivalries, seminars, notebooks, institutions, collaborators, students, computers, and centuries of accumulated technique. The lone mathematician at the blackboard was always standing inside an invisible city.

Astra has entered that city.

Whether it becomes a public library, a private palace, a factory, a colleague, a competitor, or an occupying army remains undecided.

The technology does not answer the political question.

The proof does not determine the institution.

And the formal certificate does not tell us what sort of intellectual world we ought to build around it.

Mathematics is sometimes called the language of the universe. It is also a language humans constructed to make necessity visible. A proof begins with definitions and assumptions and proceeds through steps that, if valid, compel a conclusion.

That certainty is conditional, formal, and extraordinary.

It is not opinion.

It is not marketing.

It is not consensus by applause.

And if a machine can now generate new chains of such necessity—chains that withstand formal checking and specialist scrutiny—then it has become a participant in one of humanity’s oldest intellectual enterprises, even if we remain unsure what kind of participant it is.

The question is no longer simply whether machines can think.

That question has become too blunt for the evidence.

The better questions are narrower and harder.

What kinds of reasoning can they perform?

What do they understand, if anything?

When should their results be trusted?

Who deserves credit?

Who bears responsibility?

Who owns the machinery?

Who gets access?

And what becomes of human mathematical culture when the production of proofs begins to outrun the production of people able to understand them?

Astra generated the arguments behind ten major mathematical results.

OpenAI estimates that the solution-finding tokens would have cost roughly two thousand dollars at Sol API rates.

That is not the cost of Astra.

It is not the cost of training.

It is not the cost of the surrounding research programme, the human labour, the infrastructure, the failures, or the accumulated mathematical civilisation from which the system emerged.

It is nevertheless a startling measurement of how inexpensive one unit of frontier mathematical search may be becoming.

I keep returning to that number.

Not because it proves that mathematical discovery is now cheap.

It proves nothing so simple.

I return to it because it marks a possible boundary. On one side, machine-generated frontier mathematics existed as an occasional demonstration, a competition result, a specialised theorem-proving achievement, or a laboratory promise.

On the other side lies something more abundant: general-purpose systems producing multiple research-level arguments across unrelated fields, with marginal inference costs low enough to invite repetition.

We do not yet know whether we have crossed that boundary permanently.

The papers are one day old.

The scrutiny has barely begun.

The methods remain partly hidden.

The failures remain largely uncounted.

But the door is open.

And through it has walked an explicit non-sofic group, three dead Erdős conjectures, a collection of sharper bounds, a quantum theorem, a lattice reduction, and several hundred pages of mathematics whose author is listed not as a mathematician, but as OpenAI.

That seems worth pausing over.

Preferably before someone turns it into a benchmark.

---

P.S. For those who wish to examine the claims independently—and I sincerely hope many do—OpenAI’s announcement is available at [Ten advances in mathematics and theoretical computer science](https://openai.com/index/ten-advances-in-mathematics/). The complete 249-page manuscript is available as [Ten Advances in Mathematics and Theoretical Computer Science](https://cdn.openai.com/pdf/ten-proofs-oai.pdf). The separate model-written reconstructions are available as [How the Ideas Came Together](https://cdn.openai.com/pdf/reasoning-walkthroughs.pdf), and the Lean 4 formalizations are in the public [openai/ten-proofs repository](https://github.com/openai/ten-proofs).

The mathematical community’s peer-review and independent-verification processes remain the real test of these results. The formalizations provide unusually strong evidence for the statements they encode, but specialists must still assess the translation between formal and informal claims, novelty, attribution, generality, and significance.

For the wider debate about AI, authorship, disclosure, training data, peer review, and public mathematical infrastructure, see the [Leiden Declaration on Artificial Intelligence and Mathematics](https://leidendeclaration.ai/). For historical context on earlier machine-discovered mathematics, see William McCune’s account of the automated proof of the [Robbins problem](https://www.cs.unm.edu/~mccune/papers/robbins/), and for the history of Lean, see the [Lean Focused Research Organization](https://lean-lang.org/fro/about/).

This article was written on August 2, 2026, one day after OpenAI’s announcement. Judgements about the ultimate correctness and importance of the ten results should be revised as independent mathematicians inspect, reproduce, criticise, and contextualise the work.
