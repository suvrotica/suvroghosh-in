---
title: "Why Physics Keeps Sneaking Into Deep Learning"
description: "A readable, research-backed explanation of the state-of-the-art connection between physics and deep neural networks: scale, symmetry, diffusion, tensor networks, and scientific machine learning."
date: "2026-05-22"
thumbnail: "/images/Compress_20260522_014330_0107.jpg"
category: "Artificial Intelligence"
tags: ["Artificial Intelligence", "AI", "Machine Learning", "Deep Learning", "Neural Networks", "Deep Neural Networks", "Physics and AI", "Physics-Informed AI", "Scientific Machine Learning", "Renormalization", "Statistical Mechanics", "Tensor Networks", "Diffusion Models", "Score-Based Models", "Neural Operators", "Fourier Neural Operator", "Physics-Informed Neural Networks", "Geometric Deep Learning", "Equivariant Neural Networks", "Symmetry in AI", "Large Language Models", "Generative AI", "AI Research", "Modern Physics", "Complex Systems", "Scale and Complexity", "SuvroGhosh"]
published: true
color: "indigo"
---

<TTS />

<Pi src="Compress_20260522_014330_0107.jpg" />

Acronyms used:

AI — Artificial Intelligence: computer systems that perform tasks involving prediction, pattern recognition, reasoning, generation, or decision support.

ML — Machine Learning: a branch of AI where systems learn useful patterns from data rather than being explicitly programmed for every case.

DNN — Deep Neural Network: a neural network with many layers, usually able to learn progressively richer representations.

SOTA — State of the Art: the strongest current methods, ideas, or research directions in a field.

RG — Renormalization Group: a physics framework for studying how descriptions of a system change when we zoom in or zoom out.

CNN — Convolutional Neural Network: a DNN architecture especially suited to images because it uses local patterns and shared filters.

LLM — Large Language Model: a large neural network trained mostly on language and related data to predict, generate, and transform text or other sequences.

PINN — Physics-Informed Neural Network: a neural network trained not only on data but also on physical laws, usually expressed through equations.

PDE — Partial Differential Equation: an equation describing how quantities change across space, time, or both.

FNO — Fourier Neural Operator: a neural-network method that learns mappings between functions, often useful for PDE-like scientific problems.

SDE — Stochastic Differential Equation: an equation describing systems that evolve with both regular rules and randomness.

GNN — Graph Neural Network: a neural network designed for data arranged as nodes and links, such as molecules, social networks, roads, or meshes.

MERA — Multiscale Entanglement Renormalization Ansatz: a tensor-network method from quantum physics for representing information across scales.

SGD — Stochastic Gradient Descent: a noisy, iterative training method used to adjust neural-network parameters.

---

Physics keeps turning up in deep learning for the same reason fish keeps turning up in a Bengali market: not because anyone planned a grand philosophy, but because the stuff is everywhere once you know how to smell it.

The common problem is simple. Reality has too many details.

A photograph has millions of pixels. A sentence has dozens of words tugging at each other like passengers in a crowded bus. A fluid has countless little parcels of motion. A magnet has atoms doing their tiny voting. A city has drains, lanes, hawkers, wires, stray dogs, traffic lights, and one village uncle who will park his scooter exactly where the loo is.

You cannot understand such things by treating every detail as equally important.

That is the first connection between physics and DNNs. Both survive by asking a rude but useful question: what can I ignore without becoming stupid?

Physics learned this early. You do not predict the temperature of tea by tracking every water molecule in the cup. You do not understand a storm by writing the autobiography of every air molecule. You do not describe a magnet by interviewing each atom like a local news channel during election season.

You zoom out.

You keep pressure, temperature, energy, flow, magnetization. You discard the microscopic chatter. Not because the chatter is false. Because the chatter is the wrong scale.

Deep learning, at its best, does something similar.

An image-recognition DNN does not usually jump from raw pixels straight to “cat” like a magician pulling poultry from a handkerchief. Early layers catch edges and contrasts. Later layers catch textures and shapes. Still later layers catch ears, eyes, wheels, windows, paws, faces, chairs, streets, rooms, scenes. The model climbs from dust to furniture.

This is why the word “deep” is more interesting than it first sounds. It does not merely mean “large,” “expensive,” or “likely to heat your graphics card until it behaves like a tandoor.” It means layered. It means a sequence of descriptions. It means reality being passed through several sieves, each one keeping a different kind of grain.

Here is the catch. This is not just a poetic comparison.

The SOTA connection between physics and DNNs now has several serious doors: RG, statistical mechanics, tensor networks, diffusion, symmetry, PINNs, FNOs, and neural operators. Some doors open into theory. Some open into engineering. Some open into rooms full of equations where even the furniture looks tenured.

But the main hallway is scale.

RG is one of the great zooming machines of physics. It asks what happens when you replace many small pieces of a system with fewer larger summaries. Imagine looking at Kolkata on a phone map. From far away you see the river, the airport, the big roads, the general sprawl. Zoom in and suddenly lanes appear. Zoom further and you find the sweet shop, the broken pavement, the tea stall, and the place where the drain cover has been missing since the Paleolithic period.

No one map is the true map.

The useful map depends on what you are trying to do.

If you are flying a plane, you do not need the price of muri near Dum Dum. If you are walking home in the rain, you absolutely need to know which lane floods first. Scale changes meaning.

RG says something like that, but with more mathematics and less mosquito coil. It repeatedly compresses local detail while keeping whatever still affects the large-scale behavior. The astonishing result is universality: very different microscopic systems can behave similarly when seen at the right scale. Different ingredients, same large pattern.

DNNs have an echo of this. Two pictures of a dog may share almost no identical pixels. One dog is brown, one white; one is on a sofa, one is in a field; one is dignified, one looks like it has just discovered municipal corruption. Yet a trained model may still say “dog.” It has learned which differences matter and which are decoration.

That is compression with judgment.

But let us not overcook the metaphor. A modern DNN is not literally an RG machine in every layer. A transformer is not a magnet in a blazer. An LLM is not a gas with opinions. The useful claim is smaller and stronger: both physics and deep learning often work because structure exists across scales, and good models exploit that structure instead of pretending all details live in one flat soup.

The second connection is energy.

Physics has long used the idea of an energy landscape. Systems tend to settle into low-energy states. A ball rolls into a valley. A magnet finds an ordered arrangement. A physical system relaxes.

Early neural-network models borrowed this idea directly. Hopfield networks treated memories as stable valleys. Give the network a damaged pattern and it tries to settle into the nearest stored memory. It is a little like seeing only half a face in a blurry old photograph and still knowing who it is. Your mind fills the missing part, though sometimes, like a bad WhatsApp forward, it fills too confidently.

Training a DNN also resembles a strange journey across a landscape. The model starts ignorant. SGD nudges its parameters again and again. The terrain is not a neat hill. It is a country of slopes, saddles, ravines, flat plains, potholes, and deceptive little pits. Some solutions generalize well. Some merely memorize. Some look good until the data changes, at which point they collapse like a cheap umbrella in a May storm.

Physics gives us a language for this: noise, entropy, phases, transitions, ensembles, dynamics. It does not solve everything. But it helps us stop talking as if training were just a clerical act of “minimizing error.” It is a noisy physical-ish process moving through an enormous space.

The third connection is symmetry.

This may be the cleanest practical lesson from physics: do not force the model to relearn what the world already tells you.

If a cat moves from the left side of a photo to the right side, it remains a cat. A CNN partly encodes this. If a molecule rotates in space, its physical identity should not change merely because the coordinate system changed. Equivariant neural networks try to build this truth into the architecture. If a graph rearranges the order of its node labels, the graph is still the graph. GNNs respect that better than a flat table would.

This is not philosophical embroidery. It saves data. It saves training. It reduces foolishness.

A model without the right symmetry is like a man who has to reintroduce himself to his own chair every time someone moves it two inches.

Physics does not tolerate such nonsense. Good AI should not either.

The fourth connection is tensor networks, which sound like something sold in an electrical shop but are actually among the most elegant tools in quantum physics. Quantum systems are terrifyingly large to describe. The number of possible states can grow so fast that ordinary representation gives up, takes a tram to Esplanade, and refuses to return.

Tensor networks say: maybe not all parts of the system are equally connected to all other parts. Maybe the correlations have shape. Maybe we can fold the giant description into smaller linked pieces.

This matters for ML because high-dimensional data has the same problem. Everything cannot depend on everything else directly. If it did, learning would become impossible. So tensor-network ideas ask how to represent useful correlations compactly.

Are tensor networks replacing giant transformers? No. Not today.

That is the honest answer.

But they remain important because they sharpen the question. The question is not only “How big is the model?” The better question is “What kinds of dependency can this model represent efficiently?” A bicycle and a fishing net may weigh the same; only one is useful for catching fish. Architecture matters.

Then comes diffusion, the glamorous cousin who arrived late and now everyone wants to photograph.

Diffusion models begin with a beautifully odd idea. Take real data, such as images, and gradually add noise until the image becomes static. Then train a model to reverse the process. Generation becomes denoising. The model begins with noise and walks backward toward structure.

This has a strong connection to physics through SDEs and nonequilibrium processes. It is not “imagination” in the mystical sense. It is controlled statistical repair. The model learns how corrupted data tends to become less corrupted.

Think of a wall in Kolkata after election posters, rain, dust, paan stains, and three competing tuition-center advertisements have attacked it. If you had seen thousands of clean walls and thousands of dirty walls, you might learn something about how to restore one from the other. Not perfectly. Not morally. But statistically.

That is diffusion in street clothes.

The wonderful reversal is this: RG often zooms out from detail to summary, while diffusion generation often moves from rough noise toward detail. One asks what survives compression. The other asks how structure can be rebuilt without inventing a bicycle with seven handles and a goat’s expression.

Now we reach scientific ML, where physics is no longer merely helping explain AI. Physics is putting AI to work.

PINNs train models while penalizing violations of physical laws. If the answer must obey a PDE, the model should feel that constraint. It should not merely fit scattered data like a tuition student guessing from last year’s question paper. It must respect the equation, the boundary, the initial condition, the conservation law.

This is powerful where data is expensive. Many scientific systems cannot be measured everywhere. You cannot put sensors inside every corner of a storm, a blood vessel, a plasma chamber, or a geological formation. So you combine data with law.

But PINNs are not magic.

They can struggle with stiff systems, turbulence, sharp boundaries, high frequencies, and awkward geometries. Training can become delicate. Loss terms fight each other like relatives dividing property. A model may satisfy one part of the physics and quietly insult another.

FNOs and neural operators take a different step. Instead of learning one solution, they try to learn the operator that maps one function to another. Give the model a boundary condition or initial field, and it predicts the resulting field. This is why neural operators are exciting for fluid flow, materials, climate, engineering, and other PDE-heavy worlds.

The dream is fast simulation. Not replacing physics, but accelerating it. A good neural operator can act like a trained assistant who has seen many versions of the problem and can jump to a useful answer without grinding through the full numerical ritual every time.

The danger is also obvious. A fast wrong answer is still wrong. It is merely wrong with excellent posture.

This brings us to the large human lesson.

People often talk about AI as if bigger models alone are the story. More parameters. More data. More compute. More electricity. More money. More corporate press releases written in that special prose style where every sentence seems to have been disinfected.

Bigger matters.

But scale organization matters too.

A model becomes powerful not only by being large, but by arranging ignorance into layers, respecting symmetry, compressing correlation, using physical constraints, and learning which details can be forgotten. Intelligence, even machine intelligence, is partly disciplined forgetting.

This is where the topic stops being abstract for me.

A middle-aged man in the shanty edge of Calcutta learns scale whether he wants to or not. In the morning there is the price of vegetables. At noon there is a client call with American seriousness and Indian bandwidth. In the evening there is power fluctuation, tea, noise, heat, some latest public drama unfolding on the phone, and the old private arithmetic of rent, medicine, deadlines, and dignity. Life itself becomes a multiscale model. You cannot track every insult, bill, hope, mosquito, news item, and memory at once. You compress or you collapse.

The brain does it. Physics does it. DNNs do it.

The difference is that humans know, sometimes painfully, that compression loses things. A model may compress an image and keep the cat. A society may compress a person and keep only income, caste, address, diagnosis, job title, accent, passport, or failure. A dataset may compress a life into a label. That is why representation matters.

This is also where many AI failures are misunderstood.

People say “bad data” as if the data arrived late and drunk. Sometimes it did. But often the deeper issue is not data quality. It is representation quality.

The data may be clean and still be a poor representation of reality. A label may be recorded correctly and still mean the wrong thing. A dataset may be complete and still encode the wrong history. A model may learn faithfully and still learn nonsense, because the map was crooked before the learning began.

Physics can help here too, by teaching modesty. A good physical theory knows its scale. It knows what it ignores. It knows where it breaks. It does not pretend that temperature contains the biography of every molecule.

AI needs the same manners.

So the SOTA connection between physics and DNNs is not one cute analogy. It is a toolbox. RG teaches scale. Statistical mechanics teaches landscapes and collective behavior. Symmetry teaches what should not change. Tensor networks teach compact correlation. Diffusion teaches stochastic generation. PINNs and FNOs teach how equations and learning can share a bench without immediately quarrelling.

The future will not be clean. It never is. Clean solutions are for diagrams, grant proposals, and people who have never debugged anything after midnight.

The real future will be hybrid. Some models will learn from data. Some will obey equations. Some will encode symmetry. Some will simulate. Some will generate. Some will compress. The best ones will know what scale they are speaking at.

That may be the deepest lesson physics offers deep learning.

Do not worship detail.

Do not worship size.

Find the right level.

Keep what matters.

Throw away carefully.

Then, if fortune is kind and the ceiling fan is still working, understanding may enter the room quietly, wipe its feet, and sit down.

P.S. References: John Hopfield and Geoffrey Hinton’s Nobel Prize in Physics 2024 background material; 
