---
title: "The Machine's Insides"
description: "A headache, an AI claim, and the possibility of understanding what we built."
date: "2026-10-20"
thumbnail: "/images/art-the-machines-insides.jpg"
thumbnailAlt: "A black cube cut open to reveal intricate circuitry and glowing amber pathways."
category: "AI"
tags: ["AI", "Science", "Neurons", "Interpretability", "Alignment", "Research", "Technology", "Calcutta", "Kolkata", "suvroghosh"]
pinnedTags: ["AI", "Science", "Neurons", "Interpretability", "Alignment", "Research", "Technology", "Calcutta", "Kolkata", "suvroghosh"]
published: true
color: "#583E64"
---

<TTS />

<Pi src="/images/art-the-machines-insides.jpg" alt="A black cube cut open to reveal intricate circuitry and glowing amber pathways." />

I spent Ashtami and Nabami with a headache, working on things that might inspire me for one more day. That was approximately the ambition. Find something interesting enough to keep working on, follow it somewhere, get through another day without having to pretend that merely getting through it was a magnificent achievement deserving a commemorative plate.

Then I read this.

Nick Cammarata, who contributed to earlier interpretability research at OpenAI, thinks the machinery inside neural networks may be much more understandable than researchers had feared. He describes circuits as beautiful. He thinks increasingly capable AI tools could help us investigate them at enormous scale.

I wanted him to be right.

Which immediately made me suspicious of myself. Wanting something to be true is how the digestive tract gets promoted to director of research.

Anyway, what is he talking about?

Interpretability. A word with enough syllables to discourage a perfectly intelligent person before anything has actually been explained. It means trying to understand how a model produces its behavior. Mechanistic interpretability goes further into the machinery: which internal components do what, how information moves between them, and how those interactions produce a particular answer.

The distinction matters because a machine can give an answer, and then give an explanation of its answer, without that explanation being a faithful account of what happened inside it.

We have manufactured something capable of polished probabilistic patter. Asking it to explain itself can produce more patter.

Very considerate. The fog comes with a commentary track.

Imagine, strictly as an example, a delivery worker in Calcutta applying for a loan. Suppose a neural network helps assess the application. His earnings vary, his records are incomplete, and the system declines him. Nobody needs to invent a tragic childhood or arrange a photogenic tear. He wanted credit. He got a rejection.

Now suppose the explanation says his income is unstable.

Did the model actually rely on income instability? Did it lean heavily on his address? Did it find some combination of details that happens to stand in for social disadvantage? Would the decision change if one relevant fact changed, or would the system keep finding another route to the same rejection?

These are different questions. A pleasant paragraph about responsible lending does not answer them.

Keep that applicant in mind while we open the machine.

We know how to write the training code. We know the architecture, the mathematical arrangement of the components. With access to a model, we can inspect its learned numbers. The difficulty is understanding what those numbers collectively implement.

There is no supernatural occupant withholding the password.

A simple artificial neuron can be represented like this:

$$
a = \phi\left(\sum_{i=1}^{n} w_i x_i + b\right)
$$

The $x_i$ values are inputs. The $w_i$ values determine how strongly those inputs contribute. The $b$ term shifts the result. The function $\phi$ transforms it, producing an activation, $a$, that can influence later computations.

Multiply, add, transform, pass along.

The individual operation is comprehensible. Connect huge numbers of these operations, adjust their parameters through training, and the resulting system can acquire capabilities whose internal organization nobody explicitly designed.

Training repeatedly changes the parameters to improve performance on an objective. It does not require a programmer to write a separate instruction for every useful distinction the model eventually learns.

The result contains organization we have to discover afterward.

That is the part that still gets me.

Warren McCulloch and Walter Pitts published their mathematical treatment of simplified nervous activity in 1943. Their paper used logic to investigate what networks of idealized neurons could compute. These were not miniature biological brains, complete with desire, indigestion, and an opinion about the neighbors. They were abstractions. But abstractions can travel an extraordinary distance.

More than eighty years later, we are trying to understand the arrangements learned by their very distant computational descendants.

Also, parameters are not neurons.

When someone says a model has a trillion parameters, they are counting learned numerical quantities, such as weights. They are not announcing a trillion tiny scholars sitting inside the hardware, each wearing spectacles and defending a dissertation.

Now for the original difficulty.

You inspect a neuron. Certain inputs make it activate strongly. You try to identify what they have in common.

Sometimes a useful explanation emerges. Sometimes the examples appear unrelated.

The term for apparently multiple meanings is polysemanticity. Already the common reader has been asked to swallow another linguistic suppository, although the underlying question is ordinary enough: why does this same component respond to several different things?

One influential explanation has been superposition.

Here the word concerns how information can be represented in overlapping directions within a network. It does not require quantum machinery. Features can be distributed across neurons, and representations can overlap while remaining useful to the model.

Think of several conversations occupying the same room. Distinguishing them requires attending to patterns across the sound, rather than assigning one entire voice to each cubic foot of air.

The analogy has limits. The important point is that a single coordinate need not correspond neatly to a single concept.

Nelson Elhage and colleagues demonstrated superposition in controlled toy models in 2022. That work gives researchers a concrete phenomenon to investigate. It does not, by itself, settle how every important feature is represented in every large model.

Methods such as sparse autoencoders try to recover more interpretable features from patterns of internal activity. Broadly, they learn another representation that reconstructs the activity using relatively few active features at a time.

A kind of learned dictionary.

Useful, potentially. But a dictionary of the parts still leaves questions about how the parts work together.

Cammarata revisits a famous image-model neuron that responded to cats and cars. He argues that a shared V-shaped pattern explains its behavior.

I like this example because I can understand the mistake.

We arrive with our categories. Cat. Car. Obviously different. One sheds; the other depreciates. If a component responds to both, we suspect some bizarre internal storage arrangement.

But our categories need not be the useful ones for the computation. A visual relationship can cross boundaries that matter enormously to us and very little to a shape detector.

The machine is under no obligation to arrange its discoveries according to the chapter headings in our textbooks.

His broader proposed explanation is recursive generalization: learned distinctions can develop related extensions. Something that looks like a miscellaneous heap may have an intelligible history.

That possibility is exciting.

It also needs testing beyond how satisfying it feels to describe.

In 2023, OpenAI researchers used GPT-4 to generate and score explanations of neurons in GPT-2. The screenshot's reference to roughly 2% legibility belongs to that earlier effort and its measures.

It does not mean somebody established that humans could understand precisely 2% of artificial intelligence, leaving the remaining 98% submerged in consecrated rectal vapor.

An explanation method can fail because the behavior is complicated, because its description is inadequate, because its tests are inadequate, or because it is looking for the wrong sort of pattern. The original research explicitly distinguished describing correlations from explaining the mechanisms producing them.

A bad result can reveal a limitation of the instrument.

It can also reveal a difficult object.

You have to investigate which.

Cammarata's preliminary Qwen3-32B audit estimates that roughly 90% of neuron poles have one main job. “Poles” concerns positive and negative activation behavior, and classification thresholds affect the figure.

That is not a directly comparable upgrade from 2% understanding to 90% understanding. Different models, tools, and criteria are involved.

Nor would successfully labeling most components establish that we understand all the behavior produced by their interactions.

Knowing what the individual instruments do does not tell you how the orchestra arrived at that particular noise, especially when the orchestra contains enough interacting parts to make a musicologist request agricultural employment.

So how do we move beyond labels?

We make predictions and interfere with the machinery.

Suppose we think a feature contributes to recognizing a particular concept. We test unfamiliar examples. We look for counterexamples. We increase or suppress its activity and check what changes. We investigate what feeds into it and what reads its output.

If our explanation survives attempts to break it, confidence grows. If it fails, we revise it.

This is where the science becomes more interesting than the announcement.

In 2024, Anthropic reported experiments identifying interpretable features inside Claude 3 Sonnet. Artificially amplifying a feature associated with the Golden Gate Bridge made the model bring the bridge into responses where it had no business appearing, even describing itself as the bridge.

An enormous language model, temporarily consumed by suspension infrastructure.

There is humor in that, certainly, but there is also evidence. Manipulating internal activity caused a corresponding behavioral change. The researchers were doing more than attaching an attractive name to a numerical pattern.

Their 2025 circuit-tracing work went further into interactions. In one example, intervening on an intermediate representation changed an answer from the capital of Texas to the capital of California. The experiments also illustrated why a model's written account of its reasoning cannot simply be accepted as a transcript of its computation.

A fluent explanation can be a convincing performance.

The machinery has to testify separately.

This is where automated investigation becomes useful. An AI agent can be given tools to inspect activations, propose an explanation, construct tests, run them, and revise its hypothesis. Repeat across components and connections.

The scientific work still needs standards. Automation supplies labor. It does not automatically supply judgment.

I would want tests the explanation has not already been tailored to pass. I would want other investigators to reproduce important results. I would want to know where interventions have unexpected effects, where a label becomes vague, where the method stops helping.

Especially there.

A method that tells us exactly where it becomes unreliable is doing something valuable. A method that keeps producing confident explanations after it loses its footing is producing computational intestinal confetti.

The underlying essay presents itself as a working hypothesis and points toward a technical companion paper. Its most ambitious conclusions remain claims to investigate.

I can be interested without swallowing the whole research program sideways.

Cammarata also invokes Rich Sutton's “The Bitter Lesson,” the 2019 essay arguing that general methods able to exploit increasing computation have repeatedly outperformed approaches built around elaborate human knowledge.

Applied here, the suggestion is that a scalable cycle of inspection and experiment might accomplish more than researchers expected.

That is a research bet. Throwing more computation at an unreliable test can make you wrong with previously unattainable efficiency.

And alignment?

Broadly, alignment concerns getting AI systems to behave in accordance with intended goals and constraints, including when circumstances change or supervision becomes weak. Understanding internal mechanisms could help us detect failures, investigate misleading behavior, and assess whether a proposed correction actually changes the process we care about.

Could help.

Understanding an engine does not decide where it should be driven or who gets run over.

Return to the delivery worker.

Suppose investigators establish that the lending model uses his neighborhood as a strong negative signal. That discovery might help expose an unjustified shortcut. It could support a challenge to the decision, a correction to the system, or a demand for different data.

But suppose the lender understands the mechanism perfectly and likes the result.

There we are.

The difficulty has moved into incentives, rules, and power. The applicant still needs a way to contest the decision. Someone must have the authority and willingness to change it.

An intelligible machine can serve an objectionable purpose with excellent technical clarity.

And whose goals are being aligned? The lender's? The applicant's? The institution buying the software? A system might serve its purchaser faithfully while making life worse for everyone subjected to it.

That question survives every improvement in the microscope.

For people whose income, access to services, or ability to work can depend on an automated decision, understanding the system matters because its errors have consequences they may be poorly equipped to absorb. A rejected application is not an amusing benchmark failure when it is your application.

I do not need to pretend I have conducted years of interviews to see the significance of that distinction. The hypothetical applicant deserves better than being recruited as emotional decoration for a story about clever machinery.

He needs a useful explanation and some recourse.

Cammarata suggests interpretability might be the world's most important scientific problem. I understand the urgency behind that judgment. I would still hesitate to rank everybody else's emergencies from inside one field's excitement.

But this is an important problem. We are building systems with expanding capabilities, and understanding their learned mechanisms could improve our ability to evaluate and control them.

It could also reveal things worth knowing for their own sake.

That part keeps getting buried under the sales pitch and the catastrophe pitch, both of which seem to require me to surrender my ordinary curiosity and enlist immediately.

I want to know how a useful distinction forms. How it changes during training. How several partial representations cooperate to produce an answer. Why a component responds to an example that looks unrelated until somebody asks a better question.

There is wonder in finding that your explanation was wrong and the object was doing something more coherent than you had recognized.

An uncomfortable wonder. You have to give up being right first.

I spent those two days trying to work through a headache and find something that would hold my interest for a little longer. None of this obliges me to announce a personal renaissance. A promising research claim cannot be applied to the forehead, and I would appreciate it if every flicker of interest did not have to become a triumphant story about the human spirit.

Still, I want to see the tests.

Show me a component whose behavior defeats the first explanation. Follow its connections. Try a counterexample. Turn it down and see what breaks.

Then show me the one that still refuses to make sense.

P.S. References

Nick Cammarata, “Neural Networks Are Already Clean,” October 2026: https://already-clean.goodfire.com/

Warren S. McCulloch and Walter Pitts, “A Logical Calculus of the Ideas Immanent in Nervous Activity,” 1943: https://link.springer.com/article/10.1007/BF02478259

Nelson Elhage and colleagues, “Toy Models of Superposition,” 2022: https://transformer-circuits.pub/2022/toy_model/index.html

OpenAI, “Language Models Can Explain Neurons in Language Models,” 2023: https://openai.com/index/language-models-can-explain-neurons-in-language-models/

Anthropic, “Mapping the Mind of a Large Language Model,” 2024: https://www.anthropic.com/research/mapping-mind-language-model

Anthropic, “Tracing the Thoughts of a Large Language Model,” 2025: https://www.anthropic.com/research/tracing-thoughts-language-model

Rich Sutton, “The Bitter Lesson,” 2019, university-hosted copy: https://www.cs.utexas.edu/~eunsol/courses/data/bitter_lesson.pdf
