---
title: "The Words That Ate the World: A Field Guide to the New Vocabulary"
description: "A comic field guide to LLMs, GPUs, and scaling laws — the vocabulary that became unavoidable after 2022, explained for everyone."
date: "2026-09-16"
thumbnail: "/thumbnail/art-the-words-that-ate-the-world.jpg"
thumbnailAlt: "A framed black-and-white drawing of a wide-mouthed face with a protruding tongue on textured cloth canvas"
category: "Essay"
tags: ["Gradient Descent","Finishing School","Scaling Laws","Fine Print","Neural Network","Dials","Training","Neural","Network","Accelerators"]
published: true
color: "#3E4C59"
---

<TTS />

<Pi src="/thumbnail/art-the-words-that-ate-the-world.jpg" alt="A framed black-and-white drawing of a wide-mouthed face with a protruding tongue on textured cloth canvas" />

Imagine a man who fell asleep in 2019 and woke up in 2024.

He goes to his office. The young people are saying "LLM" at the water cooler the way they once said "Wi-Fi." His nephew, who could not fix a ceiling fan, now earns forty lakhs a year "doing prompts." The newspaper says a chip company has a stock-market value larger than the annual economic output of most nations — an absurd comparison between a price and a yearly flow, but newspapers enjoy the concussion — and that the chip in question descends from hardware built to draw monsters quickly in video games.

The man did, in fact, miss a plague. He missed wars. History was not idle while he snored. But none of that explains why ordinary office English now sounds like three electrical engineers arguing inside a refrigerator.

This essay is for him. It is a field guide to the new vocabulary — the words that ate the world after 2022. Not a PhD. Just enough that he can sit through a lecture from MIT or Stanford without feeling like a typewriter at a rocket launch.

## What you already know

Here is the good news. You already understand more of this than you think.

You know that a calculator does not understand mathematics; it executes it. You know that Google search does not read the internet; it indexes and ranks it. You know that the autocorrect on your phone has been embarrassing you in front of your boss for a decade. For most of your life, "artificial intelligence" (AI) was the loose name given to automation that appeared clever — a chess program, a spam filter, the ATM that counts money faster than your uncle.

That was the deal: machines computed, humans understood. The machine was a very fast clerk with no imagination.

The new deal is stranger: machines now produce things that resemble understanding — essays, code, legal arguments, love letters — while underneath they are still performing vast arrangements of comparatively simple arithmetic. Much of the revolution, the trillions of dollars, the chip shortage, the nephew's salary, rests on a handful of old ideas that finally had their lunch together.

Let us meet them one at a time.

## Block one: the clerk who only adds

The first idea is the artificial neural network, and it is almost insultingly simple.

A neural network is a machine made of many small dials. Each dial holds a number, called a weight. Information flows in — say, the brightness of pixels in a photograph — and the network multiplies each incoming signal by a weight, adds the results, and passes the sum through a small nonlinear rule. Layer after layer, these operations turn pixels into a final set of numbers: perhaps the probabilities of "cat," "dog," or "municipal councillor."

That is nearly it. Multiplication, addition, and a little mathematical bend after each sum. Crores and crores of them, but no individual operation beyond a schoolchild. The bend matters: without it, piling up layers would collapse into the equivalent of one large, dull calculation. The magic is not in any single piece of arithmetic. The magic is in the arrangement of the dials.

Think of a tea stall. The owner makes his living by adjusting three things: how much tea leaf, how much milk, how long he boils it. Every morning he tastes the first cup and turns the dials — a little more leaf, a little less boil — until the regulars stop complaining. He does not need to write down the chemistry. He has a feedback loop: taste, adjust, taste again.

A neural network learns in roughly the same fashion, except it may have millions or billions of dials instead of three, and no tongue. It makes a prediction, measures how wrong it was, and changes the dials by a tiny amount that should make the next prediction less wrong. Repeat this across enough examples, and the dials may settle into a configuration that can tell a cat from a dog.

Where the analogy stops: the tea stall owner knows he is making tea. The network has no mouth, childhood, morning craving, or private memory of yesterday's good batch. Whether its internal representations deserve some thin technical use of the word "understanding" remains disputed; they are certainly not understanding in the embodied, autobiographical way the owner understands tea. It is safer to say that the network has learned a mathematical sensitivity to cats.

## Block two: the art of being wrong usefully

Turning millions of dials in the right direction sounds impossible. How do you know which way to turn?

The second idea answers this, and it is called gradient descent. The fancy name hides a humble picture.

You are at Howrah station at midnight, on a staircase, and the lights have failed. You cannot see the ground floor. But you can feel with your foot which direction slopes downward. So you take one careful step, feel again, take another, and slowly, stupidly, descend.

Gradient descent is that foot. The network measures how wrong its prediction was — this wrongness is called the loss, because engineers are honest only in their vocabulary — and the gradient tells it which nearby direction in dial-land goes most steeply uphill. The optimizer then steps the other way. Measure. Step. Measure. Step.

But first someone must calculate how much blame belongs to each dial. That accountant is backpropagation. It carries the error backward through the layers, using calculus to determine how strongly each weight contributed to the final mistake. Backpropagation assigns the blame; gradient descent decides how to act on it. One is the audit, the other the punishment.

Billions of local adjustments through a space with billions of dimensions, and eventually there may emerge a machine that can recognize faces.

Where the analogy stops: a staircase is kind enough to have a clear bottom. A neural network's loss landscape contains slopes, valleys, plateaus, ridges, and saddle points, and the optimizer has no certificate saying it found the best possible destination. Nor is the calculus supernatural. The parameters are continuous numbers, and the operations are differentiable, or at least differentiable almost everywhere. Backpropagation merely computes the derivatives efficiently. GPUs make the whole ceremony practical because the calculations can be expressed as enormous batches of matrix multiplication.

Which brings us, unfortunately, to why this took decades.

## Block three: the office with many floors

The third idea is the word "deep" in deep learning. Deep simply means many layers.

Think of a government office. A file enters at the ground floor: a photograph of a cat. The first clerk stamps it — "has edges, mostly diagonal." The second clerk reads the first clerk's stamps and adds his own — "edges form whisker shapes." The third says "whisker shapes plus pointy ears." By the fourth floor, the file says only one thing: "cat." Each floor transforms the work of the floor below, and the representation can become more abstract as it rises.

A deep neural network is that office. In many vision networks, early layers respond to simple textures and edges, middle layers to larger motifs and parts, and later layers to combinations useful for the final classification. Engineers design the architecture of the office, but the precise filing system is learned from data rather than written out by hand.

Where the analogy stops: clerks gossip, take leave, and misread files. A network layer performs the same learned operation without lunch breaks, although it can repeat its own mistakes with industrial reliability. Also — and this matters — a real clerk inhabits a world outside the file. The network has only the patterns presented to it.

So we have dials, blame travelling backward, blind descent, and many floors. The ancestors of these ideas are old: mathematical models of artificial neurons appeared in the 1940s, trainable perceptrons in the 1950s, gradient methods are older still, and backpropagation became famous in neural-network research in the 1980s.

Yet through long stretches of the 1990s and 2000s, neural networks were the unfashionable cousin at the computer-science wedding. Serious researchers continued working on them, but many practical systems preferred other methods. Your textbooks were not exactly wrong. The ingredients existed. The kitchen was cramped, the fuel expensive, and the pantry too small.

## The year the clerk won the lottery

In 2012, Alex Krizhevsky, Ilya Sutskever, and Geoffrey Hinton at the University of Toronto entered a deep convolutional neural network in the ImageNet Large Scale Visual Recognition Challenge. The task was to look at a photograph and identify what it contained from one thousand possible categories.

The leading systems of the time relied heavily on features designed by humans: carefully engineered mathematical descriptions of edges, textures, and shapes, followed by classifiers. The Toronto team did something then considered rather vulgar. They built a network with about sixty million parameters, showed it roughly 1.2 million labelled training images, and let backpropagation and stochastic gradient descent do much of the vulgar work.

Their system, later called AlexNet, achieved a top-five error rate of 15.3 percent — meaning the correct answer was absent from its five best guesses that often. The second-best entry scored 26.2 percent. It was not merely a win. It was a change in weather.

The machine trained for five or six days on two NVIDIA GTX 580 graphics cards, hardware from the gaming market. That mattered. A central processing unit (CPU) contains a small number of complicated, flexible cores. A GPU contains many more arithmetic lanes designed to perform similar operations in parallel. AlexNet's cards had hundreds of such cores; modern accelerators have thousands. Neural-network training happens to require precisely the kind of repetitive parallel arithmetic that graphics hardware had spent years learning to perform.

The tea stall had been waiting for a stove that could boil hundreds of kettles at once.

## The discovery that embarrassed the experts

Now the part that altered the economics.

Common sense said that making a network bigger should eventually produce diminishing returns, just as doubling the size of a tea stall does not double the quality of its tea. Common sense was partly right: there are diminishing returns. The surprise was that, across the ranges researchers measured, the returns diminished smoothly and predictably rather than slamming into an obvious wall.

In 2020, a team at OpenAI published a paper with a title that sounds like a railway timetable: "Scaling Laws for Neural Language Models." The researchers trained language models across many sizes and found empirical power-law relationships between loss and three things: model size, dataset size, and training compute. Some of the trends extended across more than seven orders of magnitude.

A power law does not mean free improvement. It means the bill arrives according to a surprisingly regular tariff. Doubling one ingredient does not remove a fixed number of errors, and parameters cannot be increased sensibly while data and compute are neglected. It means that, under the conditions studied, the reducible part of the error tended to fall by a forecastable fraction as scale increased. Each further gain became more expensive, but the curve did not suddenly become a brick wall.

This is one of the most important sentences in this essay: the underlying engine remained recognizable between 2012 and 2022 — differentiable networks, gradient-based optimization, data, and parallel arithmetic — but the architecture, datasets, training recipes, and machinery changed enormously. More and better-curated data. More parameters. Better optimizers and numerical techniques. Transformers. Thousands of accelerators joined by fast networks. Vast sums of money applied to a curve that investors could extrapolate.

Researchers debated where the wall might be. Over the measured ranges, the curve kept behaving better than many skeptics expected.

In 2019, the computer scientist Richard Sutton gave the longer historical pattern a name: the "bitter lesson." Across AI, general methods that exploit computation have repeatedly overtaken systems built from elaborate human rules. The lesson is not that scale solves everything forever. It is that human beings routinely overestimate the durability of their handcrafted cleverness and underestimate what a general learning procedure will do when fed another mountain of computation.

The experts found this bitter because the machine did not admire their cleverness before eating it.

## The gossip mechanism

One more ingredient was needed, because text is not a photograph. A sentence is a sequence, and words mean different things depending on their neighbours. "I went to the bank" — river or money? You know from context. How does a machine?

In 2017, eight researchers at Google published a paper titled "Attention Is All You Need." Attention mechanisms already existed; what the paper introduced was the Transformer, an architecture built primarily around attention rather than the recurrent machinery then common in language systems. Descendants of that architecture now sit inside most modern generative language models.

Attention is glorified gossip. Think of a para club meeting — that corner of the neighbourhood where everyone gathers and nothing remains secret. When someone says "that bank," every listener silently consults the rest of the conversation and decides whether to imagine money, mud, or the Hooghly.

Attention lets each token calculate which other tokens are relevant and how strongly to use their information. A token is not always a complete word; it may be a word, a piece of a word, punctuation, or some other chunk chosen by the model's tokenizer. In an autoregressive language model, the token currently being generated can attend to earlier tokens, not to future words that have not yet been written. Other kinds of Transformers use different attention patterns.

A large language model (LLM) is this machinery expanded to the size of a small city and trained on a task so simple it sounds like a joke: given a sequence of tokens, predict the next token. Then do it again. And again. Across enormous collections of web pages, books, articles, code, conversations, and other data — not the entire internet, and not necessarily material anyone has inspected line by line — for weeks or months on clusters of accelerators.

That is the central trick. Next-token prediction, repeated until a dense mathematical model of linguistic regularities is pressed into the weights like a footprint into wet cement. The model may process more text during training than any person could read in many lifetimes. It can use those learned regularities to argue law, write sonnets, translate Bengali, and debug your nephew's code.

Does that amount to understanding? The honest answer is that the word carries too much furniture. The system plainly learns internal representations of syntax, concepts, relationships, and fragments of the world described in its data. It does not thereby acquire a human body, biography, stake in the truth, or lived acquaintance with rivers and banks. Calling that "no understanding whatsoever" is a philosophical verdict disguised as an engineering fact; calling it human understanding is worse.

Where the analogy stops: the para aunties gossip because they know people. The model computes relationships among tokens because prediction rewarded it for doing so. One produces neighbourhood intelligence; the other produces an extraordinarily elaborate statistical reconstruction of it, which — as any office worker will tell you — is often worth more.

## The finishing school

Raw next-token training produces a creature that can be eloquent, useful, erratic, and magnificently unsuited to receiving instructions. It may continue a prompt instead of answering it, imitate ugly parts of its training data, or tell you that the moon is made of insurance.

For the original ChatGPT, one important finishing process was reinforcement learning from human feedback (RLHF).

The name is longer than the basic idea. First, human trainers wrote example conversations, and the pretrained model was fine-tuned on them. Then humans compared several model answers and ranked which they preferred. A separate reward model learned to predict those preferences, and reinforcement learning adjusted the chatbot to produce answers more likely to receive a high score.

It is a finishing school. The graduate has not been given a conscience. It has been shown which fork the examiner rewards, which subjects make the headmaster nervous, and how to keep its teeth under the table most days.

Modern systems use several descendants and alternatives to this procedure, including direct preference optimization, AI-generated feedback, rule-based rewards, and further safety training. "RLHF" has nevertheless become the household name for the broader business of turning a raw model into something that can survive contact with customers.

On 30 November 2022, OpenAI released ChatGPT, initially fine-tuned from the GPT-3.5 series. Five days later, company executives said it had crossed one million users. Exact comparisons with older products are treacherous — sign-ups, downloads, visits, and active users are not the same animal — but the cultural ignition was obvious.

The sleeping man woke up, and the water cooler had a new dialect.

## Where the electricity comes from

Now the part nobody puts on posters: the plumbing.

All of the above — the gossip, the dials, the finishing school — is a story about appetite. These machines consume data and arithmetic. Public human-written text is finite, although estimates of when it becomes a serious bottleneck depend on assumptions about quality, copyright, repeated use, synthetic data, and future algorithms. Arithmetic is also finite, but companies have responded by building cathedrals for it.

The GPU began as a processor for graphics. Video games helped create a mass market that made increasingly powerful parallel hardware economical. Today's data-centre accelerators are not gaming cards with the stickers removed. They are specialized modules surrounded by high-bandwidth memory, fast interconnects, elaborate cooling, and software systems that allow thousands of devices to cooperate.

Individual accelerators may cost tens of thousands of dollars as part of larger systems. A rack can cost millions. The racks live in climate-controlled data centres, drawing electricity and rejecting heat on an industrial scale.

In March 2024, Meta wrote that its infrastructure roadmap included 350,000 NVIDIA H100 GPUs by the end of that year, within a broader portfolio approaching the equivalent of 600,000 H100s. That was a stated build-out target, not an independently audited inventory, but the scale of the ambition was unmistakable. A single company's shopping list had become a national infrastructure project wearing a hoodie.

The physical compute is becoming more centralized, while access to it fans outward. Three different things are often muddled together here.

First, cloud access. You do not own the chips; you rent their work by the second or by the token. An application programming interface (API) is the socket in the wall where a remote warehouse's arithmetic comes out as answers.

Second, the supply chain beneath the warehouse. The Dutch company ASML builds lithography systems used to pattern advanced chips. TSMC and other foundries fabricate chips designed by companies such as NVIDIA. Memory manufacturers supply high-bandwidth memory (HBM), the fast nearby workspace that keeps accelerators fed. Networking companies supply switches, fibre, copper, and interconnects so that thousands of processors can exchange data without spending their lives waiting for one another. A GPU shortage is therefore never only a GPU shortage. It is a shortage of machines that make machines, factories, packaging, memory, power, cooling, transformers, substations, land, and time.

Third, distribution of the models. Meta's Llama family and models from China's DeepSeek have been released with downloadable weights — the finished dial settings — under their respective licences. "Open-weight" is the safer term: publishing weights does not necessarily publish the training data, complete training code, or grant every freedom required by formal definitions of open-source software. Still, it means individuals and smaller organizations can run, modify, and fine-tune models without sending every request to the company that trained them.

The cathedral stays expensive, but casts of the saint can leave the building.

Inside every warehouse sits another distinction: training versus inference. Training is the expensive process of constructing the model by adjusting its weights across enormous datasets. It may occupy clusters for weeks or months. Inference is using the trained model to produce an answer. Training happens occasionally; inference happens every time somebody asks for a resignation letter, a curry recipe, or proof that his political enemy is technically a mongoose.

As usage grows, inference can consume more money and electricity over a model's lifetime than the original training run. Hardware makers therefore optimize new systems for both training and inference, with increasing attention to memory, energy per token, latency, and the number of simultaneous users. The factory has not quite become a restaurant. It has discovered that serving dinner every night may cost more than building the kitchen.

## The fine print

A field guide owes you the fine print.

These models hallucinate — they produce unsupported or false claims with the fluent confidence of a man at a bar. Search, retrieval, calculators, code execution, and other tools can reduce the problem; none abolishes the need to verify important claims.

There is no universal date after which "AI knows nothing." Every model has its own training period, and developers do not always disclose it. Some systems are periodically retrained. Others can search the web or consult current databases at answer time. A model's stored knowledge may therefore be stale while the product wrapped around it can still retrieve yesterday's news.

Scaling laws are empirical observations, not commandments from nature. They describe measured relationships within particular architectures, datasets, objectives, and ranges. Extrapolating them beyond those ranges is useful and dangerous for exactly the same reason: the line looks so obedient.

DeepMind's 2022 Chinchilla paper corrected an important part of the scaling recipe. Under a fixed training-compute budget, many large models had too many parameters and had been shown too few tokens. Chinchilla used 70 billion parameters — one quarter as many as the earlier Gopher model — but trained on roughly four times as much data, and it performed better on many benchmarks using the same training-compute budget. Bigger was not enough. Model size and data had to be balanced.

The stock of useful public human-generated text is also finite. One research group estimated that, if then-current trends continued, training datasets could become comparable to the available stock between 2026 and 2032. That is a conditional forecast, not a date stamped on the last surviving paragraph. Better data selection, repeated training, synthetic examples, multimodal data, private archives, improved algorithms, and legal restrictions can all move the boundary — in different directions.

And nobody, including the people who build these systems, can give a complete causal account of why every internal feature forms, why a particular prompt activates it, or why one phrasing succeeds where another fails. Interpretability research can inspect pieces of the machinery. It has not turned a frontier model into a glass clock.

The wall may still be out there. Some walls may already be visible in reliability, data, energy, reasoning, or cost. What scaling showed was not that walls had been abolished. It showed that several repeatedly announced walls were fences, and the engineers had brought wire cutters.

## The man wakes up

So let us return to our sleeper, now standing at the water cooler, surrounded by "LLMs" and "GPUs" and nephews.

He had assumed the world jumped while he slept — a sudden leap, a secret he missed. But there was no single jump. There was a staircase assembled over generations: artificial neurons from the 1940s and 1950s, gradient descent from nineteenth-century mathematics, backpropagation popularized for neural networks in the 1980s, the Transformer in 2017, graphics processors refined through decades of gaming and scientific computing, oceans of digitized text, and a stubborn willingness to spend industrial sums climbing a curve that remained just predictable enough.

The aha moment — the moment the talkative mammal noticed — was not when the machine crossed a clean scientific border and became "smart." No such border has been agreed upon. It was when the machine became talkative, and the mammal, being a mammal, finally looked up.

The man does not need to feel obsolete. The mathematics is old, the central recipe can be understood, and the vocabulary is perhaps a week of reading. What is new is the scale, the infrastructure, the concentration of capital, and the speed with which a laboratory curiosity can arrive at every desk on Earth.

That is plumbing, although it is plumbing with opinions, hallucinations, venture capital, and a power bill visible from space.

He orders his chai. He asks the stall owner how he knows when the milk is right.

The owner shrugs. "Taste. Adjust. Taste again."

The man smiles. He has heard this somewhere before.

P.S. Sources and further reading: McCulloch and Pitts, "A Logical Calculus of the Ideas Immanent in Nervous Activity," Bulletin of Mathematical Biophysics 5, 1943, DOI 10.1007/BF02478259; Rumelhart, Hinton, and Williams, "Learning Representations by Back-Propagating Errors," Nature 323, 1986, DOI 10.1038/323533a0; Krizhevsky, Sutskever, and Hinton, "ImageNet Classification with Deep Convolutional Neural Networks," Advances in Neural Information Processing Systems 25, 2012, https://papers.nips.cc/paper_files/paper/2012/file/c399862d3b9d6b76c8436e924a68c45b-Paper.pdf; Vaswani et al., "Attention Is All You Need," arXiv:1706.03762, 2017; Sutton, "The Bitter Lesson," 2019, http://www.incompleteideas.net/IncIdeas/BitterLesson.html; Kaplan et al., "Scaling Laws for Neural Language Models," arXiv:2001.08361, 2020; Hoffmann et al., "Training Compute-Optimal Large Language Models," arXiv:2203.15556, 2022; OpenAI, "Introducing ChatGPT," 30 November 2022, https://openai.com/index/chatgpt/; Villalobos et al., "Will We Run Out of Data? Limits of LLM Scaling Based on Human-Generated Data," arXiv:2211.04325; Meta Engineering, "Building Meta's GenAI Infrastructure," 12 March 2024, https://engineering.fb.com/2024/03/12/data-infrastructure/building-metas-genai-infrastructure/.
