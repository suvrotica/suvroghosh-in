import type { ConceptNode, ConceptEdge } from './types';

// ============================================================
// MEANING & CONNECTION MAP — Complete concept graph
// 50+ nodes with rich plain-English explanations
// 120+ edges with relationship explanations
// ============================================================

export const NODES: ConceptNode[] = [
	// ===== FOUNDATIONS =====
	{
		id: 'information',
		label: 'Information',
		category: 'foundation',
		level: 3,
		explanation:
			'Information is the resolution of uncertainty. When you learn which face of a coin landed up, you gained one bit of information — you eliminated one possibility among two equally likely ones. Information is not knowledge or meaning; it is the measurable reduction in what you did not know.',
		example:
			'A traffic light removes three-out-of-four possibilities about whether you should stop or go, so it carries about two bits of information.',
		significance:
			'Every system that learns, communicates, or decides runs on information. Without measuring what you do not know, you cannot measure how much you learned.',
		constituents: ['probability', 'uncertainty', 'abstraction']
	},
	{
		id: 'probability',
		label: 'Probability',
		category: 'foundation',
		level: 0,
		explanation:
			'Probability is a number between zero and one assigned to an event within a model of uncertainty. It can describe long-run frequencies or degrees of belief, depending on the interpretation. People with different information can rationally assign different probabilities to the same event.',
		example:
			'If someone shuffles a deck and asks you to guess the top card, your probability of guessing correctly is 1/52. But if they accidentally flash the card to you, your probability jumps to nearly 1.',
		significance:
			'Almost every intelligent system — medical diagnosis, recommendation engines, language models — treats uncertainty as probability. It is the mathematical language of belief.',
		constituents: []
	},
	{
		id: 'uncertainty',
		label: 'Uncertainty',
		category: 'foundation',
		level: 0,
		explanation:
			'Uncertainty is what remains unresolved about an outcome or explanation. A probability distribution can quantify uncertainty within a stated model, but the model and its assumptions can themselves be uncertain.',
		example:
			'A weather forecast saying "70% chance of rain" is not hedging — it is quantifying uncertainty precisely. It means that on days with these same atmospheric conditions, rain occurred 7 times out of 10.',
		significance:
			'Most mistakes come not from being wrong but from being more confident than the evidence warrants. Quantifying uncertainty is the first defence against overconfidence.',
		constituents: []
	},
	{
		id: 'causality',
		label: 'Causality',
		category: 'foundation',
		level: 2,
		explanation:
			'A causal relationship means that intervening on one thing can change another, sometimes by changing its probability rather than guaranteeing an outcome. Correlation alone does not establish such an effect.',
		example:
			'Ice cream sales and drowning both rise in summer, but banning ice cream would not reduce drownings. The shared cause is hot weather.',
		significance:
			'Every decision you make assumes a causal model of the world. If your causal model is wrong, your decisions will be wrong, no matter how much data you have.',
		constituents: ['correlation', 'probability', 'evidence']
	},
	{
		id: 'correlation',
		label: 'Correlation',
		category: 'foundation',
		level: 0,
		explanation:
			'Correlation measures how consistently two things move together. If A goes up when B goes up, they are positively correlated. It is a purely observational pattern — it tells you nothing about whether A causes B, B causes A, or a hidden C causes both.',
		example:
			'The number of people carrying umbrellas correlates with wet sidewalks. Neither causes the other — rain causes both.',
		significance:
			'Most statistical tools start from correlation. The danger is stopping there — finding correlation without investigating causation is like noticing a fever without checking for infection.',
		constituents: []
	},
	{
		id: 'emergence',
		label: 'Emergence',
		category: 'foundation',
		level: 1,
		explanation:
			'Emergence is when many simple parts, each following straightforward rules, produce collective behaviour that none of the parts individually possesses. The whole becomes something that cannot be predicted just by studying the parts in isolation.',
		example:
			'A single ant follows a few simple scent-following rules. But thousands of ants together build complex tunnel networks, find shortest paths to food, and regulate nest temperature — behaviours no individual ant "understands".',
		significance:
			'Emergence explains why you cannot understand an economy by studying one person, a brain by studying one neuron, or a language model by reading one parameter. Complex systems produce outcomes their parts do not encode.',
		constituents: ['systems', 'complexity', 'feedback-loops']
	},
	{
		id: 'complexity',
		label: 'Complexity',
		category: 'foundation',
		level: 1,
		explanation:
			'Complexity is what happens when a system has enough interacting parts that its behaviour becomes difficult to predict even if you understand every part perfectly. The interactions matter more than the parts themselves.',
		example:
			"A car engine has many parts but is complicated — you can take it apart and understand it piece by piece. A traffic jam is complex — even knowing every driver's destination does not let you predict when a jam will form, because the interactions cascade unpredictably.",
		significance:
			'Most important problems — climate, economies, healthcare, software projects — are complex, not just complicated. They resist piece-by-piece solutions.',
		constituents: ['systems', 'emergence', 'feedback-loops']
	},
	{
		id: 'systems',
		label: 'Systems',
		category: 'foundation',
		level: 2,
		explanation:
			'A system is a set of connected parts where changing one part affects others, often in ways that circle back. A system is defined not by what it contains but by how its parts interact.',
		example:
			'A hospital is a system. Adding more beds does not simply reduce wait times — it can increase admissions, strain nursing staff, lengthen surgeries, and paradoxically increase wait times if you do not also address bottlenecks upstream.',
		significance:
			'Thinking in systems prevents the most common error in problem-solving: fixing one part while accidentally breaking the whole.',
		constituents: ['feedback-loops', 'emergence', 'constraints']
	},
	{
		id: 'feedback-loops',
		label: 'Feedback Loops',
		category: 'foundation',
		level: 1,
		explanation:
			'A feedback loop happens when the output of a process circles back and becomes part of the input. Negative feedback stabilizes (thermostat keeping temperature steady). Positive feedback amplifies (microphone screeching when it picks up its own output).',
		example:
			"Compound interest is positive feedback: the interest you earn becomes part of the principal, so next period's interest is calculated on a larger amount. Bank runs are also positive feedback: fear causes withdrawals, withdrawals cause more fear.",
		significance:
			'Feedback loops determine whether systems stay stable, spiral out of control, or settle into patterns. Most real-world surprises come from unanticipated feedback.',
		constituents: ['systems', 'causality']
	},
	{
		id: 'optimization',
		label: 'Optimization',
		category: 'foundation',
		level: 1,
		explanation:
			'Optimization is the search for the best possible outcome given a set of constraints. It requires two things: a thing to maximize or minimize (the objective) and the limits within which you must operate (the constraints).',
		example:
			'A delivery driver optimizes a route to minimize total driving time while visiting all stops. UPS optimizes for minimizing left turns because left turns cause more accidents and delays.',
		significance:
			'Every ML model, every business decision, and every engineering design is an optimization problem. The art is choosing the right objective — optimizing the wrong thing is often worse than not optimizing at all.',
		constituents: ['constraints', 'trade-offs']
	},
	{
		id: 'constraints',
		label: 'Constraints',
		category: 'foundation',
		level: 0,
		explanation:
			'A constraint is a condition that limits which solutions are allowed. Constraints can give a practical problem its shape. Optimization can also be unconstrained: minimizing x squared over all real numbers has its minimum at zero.',
		example:
			'When you budget a meal, money is a constraint, cooking time is a constraint, and what is in the fridge is a constraint. The recipe you choose is the best option within those boundaries.',
		significance:
			'In engineering, constraints define the problem. In ML, they prevent overfitting. In life, they force choices. Recognizing your constraints is the first step to making good decisions.',
		constituents: []
	},
	{
		id: 'trade-offs',
		label: 'Trade-offs',
		category: 'foundation',
		level: 0,
		explanation:
			'A trade-off is the reality that you cannot maximize everything at once — improving one thing often requires sacrificing another. Trade-offs are fundamental properties of a world with finite resources and conflicting goals.',
		example:
			'A faster car uses more fuel. A more accurate medical test produces more false positives. A simpler explanation loses some nuance. There is no free lunch.',
		significance:
			'The most dangerous belief in any field is that a solution exists with no downside. Every technology, policy, and algorithm involves trade-offs.',
		constituents: ['optimization', 'constraints']
	},
	{
		id: 'abstraction',
		label: 'Abstraction',
		category: 'foundation',
		level: 1,
		explanation:
			'Abstraction is the act of ignoring details that do not matter for the current purpose so you can focus on what does. A map is an abstraction of terrain: it omits trees but preserves roads because those matter for navigation.',
		example:
			'A REST API is an abstraction of a database. You do not need to know which tables exist — you only need to know what data you can request and what shape it will have.',
		significance:
			'Without abstraction, you drown in detail. Every layer of technology you use — programming languages, operating systems, network protocols — is an abstraction that hides complexity beneath a simpler interface.',
		constituents: ['models', 'information']
	},
	{
		id: 'models',
		label: 'Models',
		category: 'foundation',
		level: 1,
		explanation:
			'A model is a simplified representation of something real, built to answer a specific question. All models are wrong in the sense that they are incomplete — but good models are useful because they capture the parts that matter.',
		example:
			'A weather model does not simulate every air molecule. It divides the atmosphere into grid cells and tracks average temperature, pressure, and humidity in each. The model is "wrong" about individual molecules but useful for predicting rain.',
		significance:
			'Every prediction, every scientific theory, and every ML system is a model. The skill is not finding a "true" model — none exists — but finding one useful enough for your purpose.',
		constituents: ['abstraction', 'assumptions', 'evidence']
	},
	{
		id: 'assumptions',
		label: 'Assumptions',
		category: 'foundation',
		level: 0,
		explanation:
			'An assumption is something you treat as true, temporarily, so you can make progress. Every model, every analysis, and every plan rests on assumptions. The danger is forgetting you made them.',
		example:
			'When you estimate how long a drive will take, you assume no flat tires, no road closures, and average traffic. If you forget you made those assumptions, you will be genuinely confused when the trip takes twice as long.',
		significance:
			'Most analytical failures trace back to an assumption that was not examined. Good practice means naming your assumptions explicitly so others can challenge them.',
		constituents: []
	},
	{
		id: 'evidence',
		label: 'Evidence',
		category: 'foundation',
		level: 0,
		explanation:
			'Evidence is observation that makes one explanation more or less probable than alternatives. Evidence is never absolute proof — it shifts your confidence, sometimes a little, sometimes decisively.',
		example:
			'A positive COVID test is strong evidence you have the virus, but not certainty — false positives exist. A negative test is evidence you do not, but also not certainty. Evidence moves the probability needle; it does not pin it.',
		significance:
			'The entire scientific method, all of statistics, and every data-driven decision reduce to this: how much should this observation change what I believe?',
		constituents: ['probability', 'uncertainty']
	},
	{
		id: 'bayesian-inference',
		label: 'Bayesian Inference',
		category: 'foundation',
		level: 1,
		explanation:
			'Bayesian inference is a method for updating your beliefs when you encounter new evidence. You start with a prior belief, multiply by how likely the evidence is under different hypotheses, and end with a posterior belief.',
		example:
			'You think your friend is 90% likely to be at work. You call and nobody answers. How much should this lower your belief? It depends on how likely they are to miss calls. Bayesian inference gives the exact updated probability.',
		significance:
			'Bayesian inference is the logically correct way to update beliefs with evidence. It underpins spam filters, medical diagnosis, A/B testing, and increasingly, AI reasoning frameworks.',
		constituents: ['probability', 'evidence', 'uncertainty']
	},

	// ===== THINKING TOOLS =====
	{
		id: 'decision-making',
		label: 'Decision-making',
		category: 'thinking-tool',
		level: 3,
		explanation:
			'Decision-making is choosing among alternatives when the outcome is uncertain. Every decision has three components: the options available, what you believe about how each option might turn out, and which outcomes you prefer.',
		example:
			"A doctor deciding whether to order an MRI is weighing: the probability of something serious, the cost and delay, the risk of missing something, and the patient's own anxiety and preferences.",
		significance:
			"Decisions are where analysis meets action. A perfect model that never changes anyone's choice is worthless.",
		constituents: ['trade-offs', 'uncertainty', 'probability', 'evidence']
	},
	{
		id: 'risk',
		label: 'Risk',
		category: 'thinking-tool',
		level: 1,
		explanation:
			'Risk is uncertainty about outcomes that you care about. It has two dimensions: how bad could it be (severity) and how likely is it (probability). Risk is not the same as danger — driving is dangerous but low-risk for most trips.',
		example:
			'A startup has high investment risk not because it will probably fail but because the consequences of failure — losing your savings — are severe. A lottery ticket has low risk because the cost of losing is small.',
		significance:
			'Evey decision under uncertainty is a risk decision. The quality of a decision is not measured by whether the outcome was good — that confuses luck with skill.',
		constituents: ['probability', 'uncertainty', 'trade-offs']
	},
	{
		id: 'opportunity-cost',
		label: 'Opportunity Cost',
		category: 'thinking-tool',
		level: 0,
		explanation:
			'The opportunity cost of a choice is the value of the best alternative you gave up. Every yes to one thing is a no to everything else you could have done with those same resources.',
		example:
			'Spending an hour scrolling social media costs you not just the hour but whatever else you would have done — reading, sleeping, working. The cost is the best alternative, not all alternatives combined.',
		significance:
			'Opprtunity cost is the most frequently ignored cost because it is invisible. You can see what you spent; you cannot see what you did not do.',
		constituents: ['trade-offs', 'decision-making']
	},
	{
		id: 'compounding',
		label: 'Compounding',
		category: 'thinking-tool',
		level: 1,
		explanation:
			'Compounding is repeated application where each result becomes the base for the next step. Growth builds on previous growth — small differences that persist over time produce enormous gaps.',
		example:
			'A 7% annual return doubles your money in about ten years, quadruples it in twenty, and multplies it by sixteen in forty. The first decade feels slow. The fourth decade is where almost all the money is made.',
		significance:
			'Compounding explains why small consistent advantages matter more than occasional big wins — and why early decisions have outsized impact.',
		constituents: ['feedback-loops', 'optimization']
	},

	// ===== SOCIL DYNAMICS =====
	{
		id: 'trust',
		label: 'Trust',
		category: 'social-dynamic',
		level: 3,
		explanation:
			"Trust is the willingness to make yourself vulnerable to another person's actions, based on your expectation of how they will behave. Trust is not a feeling — it is a bet.",
		example:
			'When you pay a stranger online before they ship you an item, you trust them. When you tell a doctor embarrassing symptoms, you trust them. When you merge onto a highway assuming others will let you in, you trust them.',
		significance:
			'Trust is the invisible lubricant of every human system. Markets, democracies, science, and software teams all collapse without it.',
		constituents: ['reputation', 'cooperation', 'evidence', 'probability']
	},
	{
		id: 'reputation',
		label: 'Reputation',
		category: 'social-dynamic',
		level: 1,
		explanation:
			'Reputation is a summary of past behaviour that others use to predict your future behaviour. It is earned slowly and lost quickly because negative information is rarer and therefore more informative.',
		example:
			'A restaurant with hundreds of four-star reviews has a good reputation. A single credible report of food poisoning can destroy it overnight — because most meals do not cause food poisoning.',
		significance:
			'Reputation solves the problem of how strangers cooperate without personal history. It is the basis of credit scores, online reviews, academic citations, and professional references.',
		constituents: ['trust', 'evidence', 'cooperation']
	},
	{
		id: 'cooperation',
		label: 'Cooperation',
		category: 'social-dynamic',
		level: 1,
		explanation:
			'Cooperation is when individuals act in ways that benefit others, often at some cost to themselves, because the long-term payoff of mutual cooperation exceeds the short-term payoff of selfishness.',
		example:
			'Two neighbouring farmers who help each other during harvest are cooperating. Either could free-ride, but over many seasons, the farmer who never helps finds that nobody helps them either.',
		significance:
			'Cooperation is the foundation of every human achievement larger than one person. Markets, science, open-source software, and democracies are cooperative systems.',
		constituents: ['trust', 'reputation', 'competition']
	},
	{
		id: 'competition',
		label: 'Competition',
		category: 'social-dynamic',
		level: 0,
		explanation:
			'Competition is the pressure to improve because others can offer alternatives. It reveals information about quality and drives improvement while creating winners and losers.',
		example:
			'Two coffee shops on the same block compete on price, quality, and atmosphere. The competition forces both to be better than they would be alone, to the benefit of customers.',
		significance:
			'Competition is one of the few mechanisms that reliably surfaces better solutions without requiring anyone to be wise or benevolent.',
		constituents: []
	},

	// ===== AI / MACHINE LEANING =====
	{
		id: 'artificial-intelligence',
		label: 'AI (Artificial Intelligence)',
		category: 'ai-ml',
		level: 3,
		explanation:
			'Artificial intelligence studies machines that perform tasks such as reasoning, planning, perception, and learning. Some systems learn patterns from data; others use explicit rules, search, or symbolic reasoning. Learning is one approach within AI.',
		example:
			'A spam filter is AI. Nobody wrote rules for every possible spam email. Instead, the system learned from millions of examples what spam "looks like" and generalizes that to new emails.',
		significance:
			'AI brings together several ways of solving tasks that require intelligent behaviour; machine learning supplies one influential family of those methods.',
		constituents: ['machine-learning', 'deep-learning', 'algorithms', 'data']
	},
	{
		id: 'machine-learning',
		label: 'Machine Learning',
		category: 'ai-ml',
		level: 2,
		explanation:
			'Machine learning uses data or experience to fit models for a task. Supervised learning uses labelled examples; unsupervised learning finds structure without those labels; reinforcement learning uses feedback from actions.',
		example:
			'A bank\'s fraud detection system learns from labelled transactions — "this one was fraud, this one was not" — and gradually learns the subtle signatures of fraud that no human could write as rules.',
		significance:
			'ML is the engine behind nearly every AI application. It transformed fields that resisted rule-based approaches — vision, language, recommendation — into solvable engineering problems.',
		constituents: [
			'supervised-learning',
			'unsupervised-learning',
			'gradient-descent',
			'optimization',
			'data'
		]
	},
	{
		id: 'deep-learning',
		label: 'Deep Learning',
		category: 'ai-ml',
		level: 2,
		explanation:
			'Deep learning is machine learning using many-layered networks of simple mathematical units. Each layer transforms its input slightly; stacking many layers lets the network learn hierarchies of features — edges before shapes before objects.',
		example:
			'A deep network recognizing a cat photo: the first layers detect edges and colours, middle layers detect textures and shapes like eyes and ears, and final layers combine these into "cat." No one programmed these features.',
		significance:
			'Deep learning broke through where traditional ML hit a ceiling: raw perception. The network learns features from raw data, often outperforming hand-designed ones.',
		constituents: ['neural-networks', 'backpropagation', 'gradient-descent', 'machine-learning']
	},
	{
		id: 'neural-networks',
		label: 'Neural Networks',
		category: 'ai-ml',
		level: 1,
		explanation:
			'A neural network is a computational structure loosely inspired by brains: layers of simple units connected by weighted links. Each neuron takes inputs, multiplies them by weights, adds them, and passes the result through a nonlinear function.',
		example:
			'A network predicting house prices: inputs are square footage, bedrooms, and location; the network learns weights so that the weighted combination produces a reasonable price estimate.',
		significance:
			'Neural networks are universal function approximators — in theory, with enough neurons, they can approximate any continuous relationship between inputs and outputs.',
		constituents: ['gradient-descent', 'backpropagation']
	},
	{
		id: 'gradient-descent',
		label: 'Gradient Descent',
		category: 'ai-ml',
		level: 1,
		explanation:
			'Gradient descent is the algorithm that trains almost every neural network. Imagine standing on a foggy mountain wanting to reach the lowest valley. You feel which direction slopes downward most steeply, take a small step that way, and repeat.',
		example:
			'A network makes a prediction, compares it to the correct answer, and calculates the error. Gradient descent asks: for each weight, if I increased it slightly, would error go up or down? It adjusts every weight a tiny amount in the direction that reduces error.',
		significance:
			'Gradient descent is the workhorse of modern AI. Every major advance — GPT, Stable Difusion, AlphaFold — ultimately runs on gradient descent.',
		constituents: ['optimization']
	},
	{
		id: 'backpropagation',
		label: 'Backpropagation',
		category: 'ai-ml',
		level: 1,
		explanation:
			'Backpropagation is the efficient way to compute how much each weight in a neural network contributed to the final error. It works backward from the output, distributing error to earlier layers.',
		example:
			'If a network misclassifies a dog as a cat, backpropagation traces the mistake backward through every layer, assigning responsibility to each weight proportional to its influence.',
		significance:
			'Backpropagation is what made deep learning practical. It is the algorithm that turns "the network made a mistake" into "here is exactly which weights to adjust."',
		constituents: ['gradient-descent', 'neural-networks']
	},
	{
		id: 'loss-functions',
		label: 'Loss Functions',
		category: 'ai-ml',
		level: 1,
		explanation:
			"A loss function measures how wrong a model's predictions are. Training a model means finding parameters that minimize this number. The choice of loss function encodes what kind of mistakes you care about.",
		example:
			'For house price prediction, mean squared error penalizes large mistakes much more than small ones. For classification, cross-entropy loss penalizes confident wrong answers more than uncertain ones.',
		significance:
			'The loss function is where your values enter the model. Change the loss, and the model optimizes for a different definition of "good."',
		constituents: ['optimization', 'gradient-descent']
	},
	{
		id: 'overfitting',
		label: 'Overfitting',
		category: 'ai-ml',
		level: 1,
		explanation:
			'Overfitting is when a model memorizes the training data instead of learning the underlying pattern. It performs brilliantly on examples it has seen and terribly on examples it has not.',
		example:
			'A stock prediction model that fits every tiny fluctuation in historical prices but fails catastrophically on future data. It learned noise as if it were signal.',
		significance:
			'Overfitting is the central tension in ML. Every technique — regularization, cross-validation, early stopping — exists to prevent it.',
		constituents: ['regularization', 'cross-validation']
	},
	{
		id: 'regularization',
		label: 'Regularization',
		category: 'ai-ml',
		level: 1,
		explanation:
			'Regularization changes a learning procedure to reduce overfitting. Weight penalties are one approach; early stopping and dropout are others. These methods can improve generalization, but do not guarantee it.',
		example:
			'L2 regularization adds the squared sum of all weights to the loss. If a weight does not improve predictions enough to offset the penalty, the model shrinks it toward zero.',
		significance:
			'Regularization makes the difference between a model that works on training data and one that works in production.',
		constituents: ['overfitting', 'optimization', 'trade-offs']
	},
	{
		id: 'large-language-models',
		label: 'Large Language Models (LLMs)',
		category: 'ai-ml',
		level: 2,
		explanation:
			'A large language model learns statistical structure in language from large datasets. Autoregressive models predict the next token, which may be a word, word fragment, or symbol. Fluent output does not guarantee factual accuracy or sound reasoning.',
		example:
			'An autoregressive language model assigns probabilities to possible next tokens given the preceding context. A decoding procedure may sample a token or choose a high-probability continuation; it need not always choose the single most likely token.',
		significance:
			'One language model can support translation, summarization, coding, and question answering. Pretraining, later training, prompting, and tools can all influence its behaviour.',
		constituents: ['transformer-architecture', 'deep-learning', 'attention-mechanism']
	},
	{
		id: 'transformer-architecture',
		label: 'Transformer Architecture',
		category: 'ai-ml',
		level: 2,
		explanation:
			'A transformer combines attention with other neural-network layers to process token sequences. Attention mixes information from allowed positions. In a causal decoder, a position cannot attend to future tokens; training can still process many positions in parallel.',
		example:
			'In "The cat sat on the mat because it was tired," a transformer uses attention to figure out that "it" refers to "cat" (not "mat") by computing how strongly each word relates to every other word.',
		significance:
			'The transformer, introduced in the 2017 paper "Attention Is All You Need," is arguably the most consequential algorithm design of the decade.',
		constituents: ['attention-mechanism', 'deep-learning', 'neural-networks']
	},
	{
		id: 'attention-mechanism',
		label: 'Attention Mechanism',
		category: 'ai-ml',
		level: 1,
		explanation:
			'Attention lets a neural network dynamically focus on the most relevant parts of its input. For each position, it computes how much every other position matters for understanding the current one.',
		example:
			'To translate "the bank" into French, attention helps the model decide whether "bank" means financial institution or river bank by looking at surrounding words.',
		significance:
			'Attention solved the bottleneck: previous models had to compress everything about a long input into a single fixed-size vector. Attention lets the model keep the full input and selectively access relevant parts.',
		constituents: ['neural-networks', 'information']
	},
	{
		id: 'rag',
		label: 'RAG (Retrieval-Augmented Generation)',
		category: 'ai-ml',
		level: 2,
		explanation:
			'Retrieval-augmented generation supplies a language model with material retrieved from an external collection. The answer depends on both the model and the retrieved context; retrieval does not guarantee that either source is correct.',
		example:
			'A support chatbot retrieves a company policy and includes it in the prompt. The model can then cite that policy, but may still misread it or introduce unsupported claims.',
		significance:
			'RAG can supply current, inspectable source material without retraining the model. Retrieval quality, source quality, and answer verification still matter.',
		constituents: ['large-language-models', 'vector-embeddings']
	},
	{
		id: 'vector-embeddings',
		label: 'Vector Embeddings',
		category: 'ai-ml',
		level: 1,
		explanation:
			'A vector embedding is a list of numbers representing a piece of content in a way that captures its meaning. Items with similar meanings have similar vectors — close together in high-dimensional space.',
		example:
			'The embedding for "king" minus "man" plus "woman" produces a vector very close to "queen." The model learned this relationship without anyone explicitly teaching it.',
		significance:
			'Embeddings bridge raw content and computation. They let you search, cluster, and compare by meaning rather than by exact keyword match.',
		constituents: ['deep-learning', 'abstraction']
	},
	{
		id: 'fine-tuning',
		label: 'Fine-tuning',
		category: 'ai-ml',
		level: 1,
		explanation:
			'Fine-tuning is taking a model trained on a broad task and giving it additional training on a narrower dataset. Like a doctor specializing after medical school.',
		example:
			'Fine-tuning a general language model on medical textbooks creates a model that understands medical terminology without needing to teach it basic English grammar from scratch.',
		significance:
			'Fine-tuning can adapt a pretrained model without repeating all of its original training. Cost and benefit depend on model size, data, training method, and evaluation.',
		constituents: ['transfer-learning', 'large-language-models']
	},
	{
		id: 'transfer-learning',
		label: 'Transfer Learning',
		category: 'ai-ml',
		level: 1,
		explanation:
			'Transfer learning is using knowledge from solving one problem to help solve a different but related problem. Instead of starting from zero, you start from what was learned on a previous task.',
		example:
			'A model trained to recognize objects in photos can be adapted to recognize tumors in medical scans with far fewer labelled images than training from scratch.',
		significance:
			'Transfer learning dramatically reduces data and compute requirements. It made deep learning practical for domains with limited labelled data.',
		constituents: ['fine-tuning', 'deep-learning', 'machine-learning']
	},
	{
		id: 'reinforcement-learning',
		label: 'Reinforcement Learning (RL)',
		category: 'ai-ml',
		level: 2,
		explanation:
			'Reinforcement learning trains an agent to make sequences of decisions by rewarding good outcomes and penalizing bad ones. The agent must figure out which earlier actions led to the eventual outcome.',
		example:
			'An RL agent learning chess receives a reward only at the end: +1 for winning, -1 for losing. It must figure out that a move made twenty steps ago was the crucial one.',
		significance:
			'RL is the paradigm behind systems that must plan, strategize, or optimize over time — game-playing AIs, robot control, and RLHF (Reinforcement Learning from Human Feedback).',
		constituents: ['optimization', 'decision-making', 'feedback-loops']
	},

	// ===== DATA ENGINEEING =====
	{
		id: 'data',
		label: 'Data',
		category: 'data-engineering',
		level: 3,
		explanation:
			'Data is recorded observations about the world, structured so they can be processed. Data is not truth — it is a measurement, and every measurement has error.',
		example:
			"A hospital's electronic health records contain data: lab results, medication orders, diagnosis codes. Each field was entered by a person under time pressure, often for billing purposes.",
		significance:
			'Data is the raw material of every AI system and analytical decision. Unlike physical raw materials, bad data looks exactly like good data.',
		constituents: ['information', 'measurement', 'evidence']
	},
	{
		id: 'etl',
		label: 'ETL (Extract, Transform, Load)',
		category: 'data-engineering',
		level: 1,
		explanation:
			'ETL is the pipeline that moves data from where it is created to where it is analyzed. Extract raw data, transform it (cleaning, standardizing, joining), then load it into a destination.',
		example:
			'An e-commerce company extracts raw orders, transforms by converting currencies and removing test orders, then loads clean data into an analytics warehouse.',
		significance:
			'ETL makes records from different systems usable together. Its design affects the freshness, traceability, and quality of later analysis.',
		constituents: ['data', 'data-quality', 'data-pipelines']
	},
	{
		id: 'data-quality',
		label: 'Data Quality',
		category: 'data-engineering',
		level: 1,
		explanation:
			'Data quality is the degree to which data is fit for its purpose. Dimensions: accuracy, completeness, consistency, timeliness, uniqueness. Perfect quality is impossible — the goal is good enough for the decision at hand.',
		example:
			'If discharge dates are missing, calculating a readmission window may require additional records or a justified missing-data strategy. Whether a record remains usable depends on the task and the missingness mechanism.',
		significance:
			'Data quality can limit what an analysis or model supports. Finding an error early is often more useful than fitting a more complicated model to it.',
		constituents: ['data', 'measurement', 'evidence']
	},
	{
		id: 'data-pipelines',
		label: 'Data Pipelines',
		category: 'data-engineering',
		level: 1,
		explanation:
			'A data pipeline is an automated sequence of steps that moves data from source to destination on a schedule or trigger. It handles extraction, validation, transformation, loading — and failures.',
		example:
			"A daily pipeline pulls yesterday's sales from regional databases, validates that all files arrived, joins and cleans them, loads into the warehouse, and sends a Slack message.",
		significance:
			'Pipelines turn data work from a manual, error-prone process into a reliable, repeatable one.',
		constituents: ['etl', 'data-quality']
	},
	{
		id: 'feature-engineering',
		label: 'Feature Engineering',
		category: 'data-engineering',
		level: 1,
		explanation:
			'Feature engineering transforms raw data into representations a model can learn from. A "feature" is a single measurable property — age, word count, pixel brightness — fed into the model.',
		example:
			'For predicting house prices, raw data includes a date. Feature engineering might transform it into: month of sale, season, days since last neighbourhood sale, and whether it was a school holiday.',
		significance:
			'Before deep learning automated feature discovery, feature engineering was the primary skill distinguishing good ML practitioners.',
		constituents: ['data', 'machine-learning', 'models']
	},

	// ===== SFTWARE ENGINEERING =====
	{
		id: 'software-engineering',
		label: 'Software Engineering',
		category: 'software-engineering',
		level: 3,
		explanation:
			'Software engineering is the discipline of building, maintaining, and evolving computer programs that are correct, reliable, and understandable by other humans.',
		example:
			'A banking application processing millions of transactions must be correct (no money disappears), reliable (works when components fail), and maintainable (new engineers can understand and modify it).',
		significance:
			'Software engineering turns clever code into durable systems. Without it, every change risks breaking everything.',
		constituents: ['algorithms', 'abstraction', 'systems']
	},
	{
		id: 'algorithms',
		label: 'Algorithms',
		category: 'software-engineering',
		level: 0,
		explanation:
			'An algorithm is a precise, step-by-step procedure for solving a problem. It is a recipe where every step is unambiguous and the procedure is guaranteed to finish.',
		example:
			'The algorithm for finding a name in a phone book: open to the middle, check if the name is before or after, discard the irrelevant half, and repeat. This finds any name in a million entries in at most 20 steps.',
		significance:
			'Algorithms are the atoms of computation. The difference between a slow system and a fast one is usually algorithmic, not hardware.',
		constituents: []
	},
	{
		id: 'api',
		label: 'APIs (Application Programming Interfaces)',
		category: 'software-engineering',
		level: 1,
		explanation:
			'An API is a contract between two pieces of software: "if you send me a request in this format, I will respond in that format." It hides internal complexity behind a stable interface.',
		example:
			"When a weather app shows today's forecast, it called a weather service API: it sent a request with your location, and the API returned temperature and precipitation probability.",
		significance:
			'APIs are the connective tissue of modern software. Every cloud service, every mobile app communicates through APIs.',
		constituents: ['abstraction', 'software-engineering', 'systems']
	},
	{
		id: 'containers',
		label: 'Containers (Docker)',
		category: 'software-engineering',
		level: 1,
		explanation:
			'A container runs an application in an isolated process environment using a packaged filesystem and dependencies. Containers share a host kernel and need compatible runtimes and hardware; they do not guarantee identical behaviour on every computer.',
		example:
			'Packaging a Python application with a specific interpreter and libraries removes many dependency mismatches. Differences in CPU architecture, GPUs, kernel features, external services, or configuration can still matter.',
		significance:
			'Containers improve reproducibility and deployment consistency while retaining dependencies on the host platform and runtime configuration.',
		constituents: ['abstraction', 'systems']
	},

	// ===== RESEACH METHODS =====
	{
		id: 'hypothesis-testing',
		label: 'Hypothesis Testing',
		category: 'research-methods',
		level: 2,
		explanation:
			'Hypothesis testing is a formal procedure for deciding whether data provides enough evidence to reject a default assumption. You start with a null hypothesis — "nothing interesting is happening" — and ask: if that were true, how surprising would this data be?',
		example:
			'In a trial with a prespecified test at the 5% level, a p-value below 0.05 is called statistically significant. The p-value is the probability, under the null model, of a test statistic at least as extreme as observed; it is not the probability that the null is true.',
		significance:
			'Hypothesis testing is the dominant framework for drawing conclusions from data in science, medicine, and business. It is also widely misunderstood.',
		constituents: ['probability', 'evidence', 'uncertainty']
	},
	{
		id: 'bias-variance-tradeoff',
		label: 'Bias-Variance Tradeoff',
		category: 'research-methods',
		level: 1,
		explanation:
			'The bias-variance tradeoff is the central tension in model building. Bias is error from oversimplifying. Variance is error from oversensitivity to noise. Reducing one tends to increase the other.',
		example:
			'Fitting a straight line to data that curves: high bias (too simple), low variance. Fitting a wiggly curve through every point: low bias (fits perfectly), high variance (change one point and the curve changes dramatically).',
		significance:
			'Understanding bias and variance explains why complex models are not always better, why more data helps, and why ensemble methods work.',
		constituents: ['overfitting', 'regularization', 'models', 'trade-offs']
	},
	{
		id: 'cross-validation',
		label: 'Cross-Validation',
		category: 'research-methods',
		level: 1,
		explanation:
			'Cross-validation estimates how well a model will perform on new data. You split data into parts, train on most, test on the held-out part, and repeat so every data point tests exactly once.',
		example:
			'In 5-fold cross-validation: divide data into five chunks. Train on chunks 1-4, test on 5. Train on 1-3 and 5, test on 4. Repeat. Average the five test scores.',
		significance:
			'Cross-validation estimates performance under its sampling assumptions. Time series and grouped records need suitable splits; tuning and preprocessing must avoid leakage. It cannot establish performance in every future population.',
		constituents: ['overfitting', 'evidence', 'hypothesis-testing']
	},
	{
		id: 'measurement',
		label: 'Measurement',
		category: 'research-methods',
		level: 0,
		explanation:
			'Measurement is assigning numbers to observations according to a rule. The rule determines what the numbers mean. Not all numbers are equal: twice-as-hot (Kelvin) is different from 10-degrees-warmer (Celsius).',
		example:
			'A customer satisfaction survey rating service from 1 to 5 produces ordinal data: a 4 is better than a 3, but the gap between 3 and 4 is not necessarily the same as between 4 and 5.',
		significance:
			"Every analysis's validity depends on whether the measurement actually captures what you think it captures.",
		constituents: ['evidence', 'information']
	}
];

export const EDGES: ConceptEdge[] = [
	{
		source: 'information',
		target: 'probability',
		relationship: 'is-measured-by',
		explanation:
			'Information is measured in terms of probability. A surprising event (low probability) carries more information than an expected one.'
	},
	{
		source: 'information',
		target: 'uncertainty',
		relationship: 'depends-on',
		explanation:
			'You cannot talk about information without acknowledging uncertainty. Information is what reduces uncertainty.'
	},
	{
		source: 'uncertainty',
		target: 'probability',
		relationship: 'is-measured-by',
		explanation: 'Probability distributions quantify uncertainty within a stated model.'
	},
	{
		source: 'causality',
		target: 'correlation',
		relationship: 'is-confused-with',
		explanation:
			'The most common analytical mistake: seeing that two things happen together and assuming one caused the other.'
	},
	{
		source: 'causality',
		target: 'probability',
		relationship: 'depends-on',
		explanation:
			'Causal reasoning is probabilistic. "Smoking causes cancer" means it raises the probability, not that every smoker gets cancer.'
	},
	{
		source: 'causality',
		target: 'evidence',
		relationship: 'depends-on',
		explanation:
			'Causal claims require evidence and identifying assumptions; randomized interventions, natural experiments, and observational designs offer different kinds of support.'
	},
	{
		source: 'emergence',
		target: 'systems',
		relationship: 'emerges-from',
		explanation:
			'Emergence is a property of systems: the whole exhibits behaviour no individual part contains.'
	},
	{
		source: 'emergence',
		target: 'complexity',
		relationship: 'causes',
		explanation:
			'Emergent behaviour is why systems become complex — you cannot predict it by studying parts in isolation.'
	},
	{
		source: 'complexity',
		target: 'systems',
		relationship: 'is-consequence-of',
		explanation: 'Complexity arises in systems with many interacting parts.'
	},
	{
		source: 'feedback-loops',
		target: 'complexity',
		relationship: 'enables',
		explanation:
			'Feedback can create complex dynamics, especially with nonlinearities or delays; a feedback loop can also be simple and linear.'
	},
	{
		source: 'systems',
		target: 'feedback-loops',
		relationship: 'contains',
		explanation:
			'Many systems contain feedback loops, whose effects depend on their sign, strength, timing, and surrounding dynamics.'
	},
	{
		source: 'constraints',
		target: 'systems',
		relationship: 'constrains',
		explanation: 'Constraints limit and shape the behaviour of systems.'
	},
	{
		source: 'constraints',
		target: 'optimization',
		relationship: 'constrains',
		explanation:
			'In constrained optimization, conditions limit the feasible solutions. Unconstrained problems are also valid optimization problems.'
	},
	{
		source: 'optimization',
		target: 'trade-offs',
		relationship: 'explains',
		explanation:
			'When objectives conflict, optimization makes trade-offs explicit. Compatible objectives can sometimes improve together.'
	},
	{
		source: 'trade-offs',
		target: 'constraints',
		relationship: 'is-consequence-of',
		explanation: 'Trade-offs exist because constraints are real — you cannot have everything.'
	},
	{
		source: 'abstraction',
		target: 'models',
		relationship: 'enables',
		explanation:
			'You cannot build a useful model without abstraction — deciding what to include and what to ignore.'
	},
	{
		source: 'models',
		target: 'assumptions',
		relationship: 'depends-on',
		explanation: 'Every model rests on assumptions. The model is only as good as its assumptions.'
	},
	{
		source: 'models',
		target: 'evidence',
		relationship: 'is-measured-by',
		explanation: 'Models are judged by how well their predictions match evidence.'
	},
	{
		source: 'evidence',
		target: 'probability',
		relationship: 'depends-on',
		explanation:
			'Evidence is evaluated probabilistically: how much should this observation shift belief?'
	},
	{
		source: 'decision-making',
		target: 'trade-offs',
		relationship: 'contains',
		explanation:
			'Every decision involves trade-offs. Good decision-making means being explicit about sacrifices.'
	},
	{
		source: 'decision-making',
		target: 'uncertainty',
		relationship: 'depends-on',
		explanation: 'Decisions exist because the future is uncertain.'
	},
	{
		source: 'decision-making',
		target: 'evidence',
		relationship: 'depends-on',
		explanation: 'Better evidence leads to better decisions — if you update beliefs proportionally.'
	},
	{
		source: 'risk',
		target: 'probability',
		relationship: 'is-measured-by',
		explanation:
			'Risk is quantified using probability: likelihood of bad outcome multiplied by severity.'
	},
	{
		source: 'risk',
		target: 'decision-making',
		relationship: 'constrains',
		explanation:
			'Risk assessment shapes decision-making: you choose options based partly on their risk profiles.'
	},
	{
		source: 'opportunity-cost',
		target: 'trade-offs',
		relationship: 'is-special-case-of',
		explanation:
			'Opportunity cost is the most common form of trade-off: the value of the best forgone alternative.'
	},
	{
		source: 'compounding',
		target: 'feedback-loops',
		relationship: 'is-example-of',
		explanation:
			"Compounding is positive feedback applied to growth — each period's gain becomes the base for the next."
	},
	{
		source: 'trust',
		target: 'reputation',
		relationship: 'depends-on',
		explanation: 'Without direct experience, you rely on reputation to decide whether to trust.'
	},
	{
		source: 'trust',
		target: 'cooperation',
		relationship: 'enables',
		explanation:
			'Cooperation at scale is impossible without trust. You cannot monitor every interaction.'
	},
	{
		source: 'reputation',
		target: 'cooperation',
		relationship: 'reinforces',
		explanation:
			'Good reputations attract cooperation, creating more opportunities to demonstrate cooperative behaviour.'
	},
	{
		source: 'cooperation',
		target: 'competition',
		relationship: 'contrasts-with',
		explanation: 'Cooperation and competition are opposing but complementary forces.'
	},
	{
		source: 'artificial-intelligence',
		target: 'machine-learning',
		relationship: 'contains',
		explanation:
			'ML is the dominant approach within AI. Most AI systems are ML systems trained on data.'
	},
	{
		source: 'artificial-intelligence',
		target: 'algorithms',
		relationship: 'depends-on',
		explanation:
			'AI systems use algorithms for tasks including learning, search, planning, and symbolic reasoning.'
	},
	{
		source: 'gradient-descent',
		target: 'machine-learning',
		relationship: 'enables',
		explanation:
			'Gradient-based optimization trains many ML models. Other methods, such as decision-tree fitting, use different procedures.'
	},
	{
		source: 'machine-learning',
		target: 'data',
		relationship: 'depends-on',
		explanation:
			'ML is fundamentally dependent on data. Without examples, ML is just an empty architecture.'
	},
	{
		source: 'deep-learning',
		target: 'neural-networks',
		relationship: 'contains',
		explanation: 'Deep learning uses neural networks with many layers.'
	},
	{
		source: 'deep-learning',
		target: 'machine-learning',
		relationship: 'is-special-case-of',
		explanation: 'Deep learning is ML using multi-layered neural networks.'
	},
	{
		source: 'neural-networks',
		target: 'gradient-descent',
		relationship: 'depends-on',
		explanation: 'Neural networks learn by gradient descent — adjusting weights to reduce error.'
	},
	{
		source: 'neural-networks',
		target: 'backpropagation',
		relationship: 'depends-on',
		explanation: 'Backpropagation efficiently computes gradients for neural networks.'
	},
	{
		source: 'gradient-descent',
		target: 'optimization',
		relationship: 'is-example-of',
		explanation:
			'Gradient descent is an optimization algorithm searching for parameters that minimize loss.'
	},
	{
		source: 'backpropagation',
		target: 'gradient-descent',
		relationship: 'enables',
		explanation:
			'Backpropagation provides the gradients that gradient descent uses to update weights.'
	},
	{
		source: 'loss-functions',
		target: 'optimization',
		relationship: 'enables',
		explanation:
			'The loss function defines what "optimal" means. Change it and the model optimizes differently.'
	},
	{
		source: 'overfitting',
		target: 'bias-variance-tradeoff',
		relationship: 'is-example-of',
		explanation: 'Overfitting is the high-variance extreme of the bias-variance tradeoff.'
	},
	{
		source: 'regularization',
		target: 'overfitting',
		relationship: 'constrains',
		explanation:
			'Regularization can reduce overfitting by restricting or modifying the learning procedure.'
	},
	{
		source: 'regularization',
		target: 'trade-offs',
		relationship: 'is-example-of',
		explanation:
			'Regularization embodies a trade-off: fit well vs. keep the model simple enough to generalize.'
	},
	{
		source: 'transformer-architecture',
		target: 'large-language-models',
		relationship: 'enables',
		explanation:
			'Transformers support many large language models, but language modelling is not restricted to that architecture.'
	},
	{
		source: 'large-language-models',
		target: 'deep-learning',
		relationship: 'is-example-of',
		explanation: 'LLMs are deep learning applied to text.'
	},
	{
		source: 'transformer-architecture',
		target: 'attention-mechanism',
		relationship: 'contains',
		explanation: 'Attention is the core innovation of the transformer.'
	},
	{
		source: 'attention-mechanism',
		target: 'information',
		relationship: 'depends-on',
		explanation:
			'Atention selectively weights information — deciding what parts of input are relevant.'
	},
	{
		source: 'rag',
		target: 'large-language-models',
		relationship: 'depends-on',
		explanation:
			'RAG uses an LLM as its reasoning engine but grounds responses in retrieved documents.'
	},
	{
		source: 'vector-embeddings',
		target: 'rag',
		relationship: 'enables',
		explanation:
			'Dense retrieval can use embeddings to find relevant passages. RAG can also use lexical or hybrid retrieval.'
	},
	{
		source: 'vector-embeddings',
		target: 'deep-learning',
		relationship: 'is-consequence-of',
		explanation:
			'Embeddings are produced by deep learning models trained to map similar content nearby.'
	},
	{
		source: 'fine-tuning',
		target: 'transfer-learning',
		relationship: 'is-example-of',
		explanation: 'Fine-tuning is the most common form of transfer learning in modern AI.'
	},
	{
		source: 'fine-tuning',
		target: 'large-language-models',
		relationship: 'enables',
		explanation: 'Fine-tuning makes general LLMs useful for specific domains.'
	},
	{
		source: 'transfer-learning',
		target: 'machine-learning',
		relationship: 'is-special-case-of',
		explanation: 'Transfer learning is a strategy within ML that reuses knowledge across tasks.'
	},
	{
		source: 'reinforcement-learning',
		target: 'optimization',
		relationship: 'is-example-of',
		explanation: 'RL is optimization over sequences of decisions to maximize cumulative reward.'
	},
	{
		source: 'reinforcement-learning',
		target: 'feedback-loops',
		relationship: 'contains',
		explanation:
			'RL creates feedback loops: actions change the environment, changing future rewards and actions.'
	},
	{
		source: 'measurement',
		target: 'data',
		relationship: 'produces',
		explanation:
			'Measurement produces observations that can become data; data can also include simulations, annotations, and administrative records.'
	},
	{
		source: 'data',
		target: 'evidence',
		relationship: 'enables',
		explanation: 'Data becomes evidence when used to support or challenge a claim.'
	},
	{
		source: 'etl',
		target: 'data-pipelines',
		relationship: 'is-example-of',
		explanation:
			'An ETL workflow is one kind of data pipeline; not every pipeline follows extract-transform-load order.'
	},
	{
		source: 'etl',
		target: 'data-quality',
		relationship: 'enables',
		explanation:
			'ETL can validate and correct records, improving some quality dimensions. It cannot reconstruct missing truth without additional evidence or assumptions.'
	},
	{
		source: 'data-quality',
		target: 'measurement',
		relationship: 'depends-on',
		explanation: 'Data quality is ultimately about measurement quality.'
	},
	{
		source: 'data-pipelines',
		target: 'etl',
		relationship: 'implements',
		explanation: 'Data pipelines implement the ETL pattern on a schedule.'
	},
	{
		source: 'feature-engineering',
		target: 'data',
		relationship: 'depends-on',
		explanation:
			'Feature engineering transforms raw data into representations models can learn from.'
	},
	{
		source: 'feature-engineering',
		target: 'models',
		relationship: 'enables',
		explanation: 'Good features make the difference between a working model and one that fails.'
	},
	{
		source: 'software-engineering',
		target: 'algorithms',
		relationship: 'contains',
		explanation: 'Algorithms are the building blocks of all software.'
	},
	{
		source: 'software-engineering',
		target: 'abstraction',
		relationship: 'depends-on',
		explanation: 'Without abstraction, software of any size is impossible.'
	},
	{
		source: 'api',
		target: 'abstraction',
		relationship: 'is-example-of',
		explanation:
			'An API is a textbook example of abstraction: simple interface hiding complex internals.'
	},
	{
		source: 'api',
		target: 'systems',
		relationship: 'enables',
		explanation: 'APIs are how system components communicate. They define boundaries between parts.'
	},
	{
		source: 'containers',
		target: 'abstraction',
		relationship: 'is-example-of',
		explanation: 'Containers abstract away the operating system environment.'
	},
	{
		source: 'containers',
		target: 'systems',
		relationship: 'enables',
		explanation:
			'Containers enable reliable systems by ensuring predictable, isolated environments.'
	},
	{
		source: 'hypothesis-testing',
		target: 'probability',
		relationship: 'depends-on',
		explanation: 'Hypothesis testing is built on probability. The p-value is a probability.'
	},
	{
		source: 'hypothesis-testing',
		target: 'evidence',
		relationship: 'formalizes',
		explanation:
			'Hypothesis testing formalizes evidence evaluation — is this data strong enough to change belief?'
	},
	{
		source: 'bias-variance-tradeoff',
		target: 'overfitting',
		relationship: 'explains',
		explanation:
			'Overfitting is the high-variance extreme. Understanding bias-variance tells you why.'
	},
	{
		source: 'bias-variance-tradeoff',
		target: 'regularization',
		relationship: 'motivates',
		explanation: 'The tradeoff motivates regularization: add bias to dramatically reduce variance.'
	},
	{
		source: 'cross-validation',
		target: 'overfitting',
		relationship: 'detects',
		explanation:
			'Cross-validation detects overfitting by comparing training vs. validation performance.'
	},
	{
		source: 'cross-validation',
		target: 'evidence',
		relationship: 'provides',
		explanation: 'Cross-validation provides evidence about expected real-world performance.'
	},
	{
		source: 'measurement',
		target: 'evidence',
		relationship: 'enables',
		explanation: 'You cannot have evidence without measurement.'
	},
	{
		source: 'machine-learning',
		target: 'models',
		relationship: 'produces',
		explanation: 'Every trained ML model is a model — a simplified representation for prediction.'
	},
	{
		source: 'deep-learning',
		target: 'emergence',
		relationship: 'exhibits',
		explanation:
			'Some benchmarks report apparently abrupt capability gains with model scale. The appearance of emergence can depend on the metric and evaluation design.'
	},
	{
		source: 'software-engineering',
		target: 'systems',
		relationship: 'builds',
		explanation: 'Software engineering is building and maintaining software systems.'
	},
	{
		source: 'data-pipelines',
		target: 'systems',
		relationship: 'is-example-of',
		explanation: 'A data pipeline is a software system for automated, reliable data movement.'
	},
	{
		source: 'artificial-intelligence',
		target: 'decision-making',
		relationship: 'augments',
		explanation: 'AI systems increasingly augment decision-making. The question is when, not if.'
	},
	{
		source: 'large-language-models',
		target: 'trust',
		relationship: 'depends-on',
		explanation: 'LLM adoption depends on trust that the model will not fabricate information.'
	},
	{
		source: 'reinforcement-learning',
		target: 'decision-making',
		relationship: 'formalizes',
		explanation: 'RL mathematically formalizes decision-making under uncertainty over time.'
	},
	{
		source: 'probability',
		target: 'bayesian-inference',
		relationship: 'enables',
		explanation:
			'Probability theory is the foundation for Bayesian inference — formally updating beliefs.'
	}
];
