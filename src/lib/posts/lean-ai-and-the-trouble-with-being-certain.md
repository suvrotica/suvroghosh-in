---
title: "Lean, AI, and the Trouble With Being Certain"
description: "A short, skeptical introduction to Lean, the centuries behind it, and why AI needs something more reliable than its own convincing voice."
date: "2026-10-18"
thumbnail: "/images/lean-ai-and-the-trouble-with-being-certain.jpg"
thumbnailAlt: "Against a cosmic backdrop of glowing blue-and-gold mathematical formulas, a Fibonacci spiral, and a wireframe cube, the title 'Lean: Mathematics in an AI-Driven World' stands beside a dark Lean 4 code editor showing formal proofs on natural numbers, above a monumental stone bridge carved with logical and mathematical symbols."
category: "Mathematics"
tags: ["Lean 4","Formal Verification","Artificial Intelligence","Mathematical Logic","Proof Assistants","Type Theory","Future of Mathematics","SuvroGhosh","Lean AI","Lean"]
pinnedTags: ["Lean 4", "Formal Verification", "Artificial Intelligence", "Mathematical Logic", "Proof Assistants", "Type Theory", "Future of Mathematics", "SuvroGhosh"]
published: true
color: "#4A90E2"
---

<TTS />

<Pi src="/images/lean-ai-and-the-trouble-with-being-certain.jpg" alt="Against a cosmic backdrop of glowing blue-and-gold mathematical formulas, a Fibonacci spiral, and a wireframe cube, the title 'Lean: Mathematics in an AI-Driven World' stands beside a dark Lean 4 code editor showing formal proofs on natural numbers, above a monumental stone bridge carved with logical and mathematical symbols." />

# Lean, AI, and the Trouble With Being Certain

I want to understand Lean. Somehow this small request keeps turning into the future of civilization, with a mathematician in 2040 sitting beside an AI that proves something astonishing while she supplies the uniquely human wonder. I would first like to know what the machine has actually checked. We can arrange the wonder afterward.

Because I am tired of fluent explanations that leave me with the unpleasant suspicion that I have understood the tone more thoroughly than the subject. AI is particularly good at producing these. It can explain a correct argument beautifully. It can also explain a wrong one beautifully, and the beauty does not become noticeably uglier at the point where the reasoning fails.

Lean offers something useful here.

It is a programming language and a proof assistant. You express a mathematical statement precisely, supply a proof, often with substantial automated help, and its checking machinery examines whether the conclusion follows from the assumptions. It does not give a damn how distinguished you are. There is something restful about that.

But it checks what you wrote. This qualification is going to keep coming back, because without it we are selling another oracle.

A textbook proof leaves things out. It has to. Readers bring knowledge, recognize familiar arguments, and fill in steps. Sometimes “obviously” means that the step really is obvious to the intended reader. Sometimes it means that I have been staring at the page for twenty minutes and would prefer not to admit that I cannot follow it. Occasionally there is an actual gap.

A formal proof makes the reasoning explicit enough for mechanical checking. The author need not type every microscopic step; automation and existing theorems supply much of the detail. What matters is that the resulting evidence can be checked under precise rules.

Underneath Lean is dependent type theory. Types can carry information about values, such as a vector's length. Mathematical propositions can be represented as types, with proofs as terms inhabiting them. This connection between logic and computation is called the Curry–Howard correspondence.

Think of a proof of “if P, then Q” as something that takes evidence for P and produces evidence for Q. That is a useful way into the idea. Announcing that all mathematics is therefore executable software goes too far. Lean supports classical reasoning, including noncomputable constructions. A proof does not always amount to a program we can run to manufacture the object under discussion.

The tactics help build the proof; the kernel checks the resulting terms. Keeping this final checker comparatively small reduces how much software must be trusted. It does not turn software into something incapable of having bugs.

There is even a placeholder called `sorry`, which lets you leave a proof unfinished while working on the rest. Lean warns you, but the file can still be accepted. Additional axioms can also be declared. So “it compiled” is not sufficient evidence that the intended theorem has been proved under the intended assumptions. Lean's own [validation guide](https://lean-lang.org/doc/reference/latest/ValidatingProofs/) explains the checks that matter.

And suppose the AI formalizes the wrong claim? “Every person has a mother” and “one person is everybody's mother” differ in the order of their quantifiers. The machine is not responsible for working out which arrangement you had in mind.

---

The desire to make reasoning checkable is considerably older than the companies currently putting it in their promotional material.

Around 300 BCE, Euclid organized geometry into definitions, assumptions, and deductions. He inherited earlier mathematics; he did not invent reasoning. His diagrams also supplied information that later standards required people to state explicitly. Rigor has a history. It did not arrive complete.

Algebra and notation gradually made complicated reasoning easier to handle. From al-Khwarizmi's largely verbal algebra to later symbolic methods, people found ways to manipulate relationships without carrying everything in their heads. In the seventeenth century, Leibniz imagined a symbolic language and a calculus of reasoning that could help settle disputes by calculation.

An appealing ambition. The calculation still depends on representing the dispute properly, which is often where the trouble was to begin with.

By the nineteenth and early twentieth centuries, the work on logic and foundations had become much more precise. Frege developed a powerful formal logic. Russell's paradox exposed contradictions in unrestricted ways of forming sets. Hilbert sought a secure consistency justification for formalized mathematics. Brouwer challenged what classical mathematicians were willing to accept without a constructive justification.

Then Gödel established limits. A consistent, effectively axiomatized system sufficiently strong for arithmetic cannot decide every statement expressible within it. Under the standard conditions, it cannot establish its own consistency either.

This did not make proof checking pointless. It did not prove that human intuition has supernatural privileges. It meant that the ambition to capture everything in one mechanically manageable foundation had limits. We can still check a particular argument without first settling every possible argument.

Church and Turing clarified computation in the 1930s. Automated proof search and interactive proof systems followed over subsequent decades. Automath, Mizar, HOL, Isabelle, and Coq, now called Rocq, all belong to this history. Lean did not invent the field.

Leonardo de Moura started Lean at Microsoft Research in 2013. Its first official release came in 2014; Lean 4.0 arrived in September 2023 after a substantial redesign involving Sebastian Ullrich and others.

Alongside it grew Mathlib, a separate community library of reusable mathematical definitions and proved results. Formalization would be impractical if every researcher had to begin by rebuilding arithmetic.

This has already reached serious mathematics. The Liquid Tensor Experiment, led by Johan Commelin with continuing input from Peter Scholze and others, completed its formalization of a difficult result of Clausen and Scholze in July 2022. The polynomial Freiman–Ruzsa result over the field with two elements was formalized in 2023.

---

AI changes how much of that work might be automated.

A model can propose a formal statement, retrieve relevant lemmas, suggest proof steps, and revise its attempt after Lean reports a failure. Some systems combine this with search and reinforcement learning. The attraction is that a convincing explanation is no longer the only thing we have to inspect. There can be a checkable proof behind it.

The achievements are real, but so are their conditions. In 2024, DeepMind's AlphaProof and AlphaGeometry 2 together solved four of six International Mathematical Olympiad problems, reaching silver-medal-equivalent performance. AlphaProof used Lean. The problems were manually translated, and some solutions took up to three days. That is impressive without pretending the system sat the examination exactly as the children did.

In 2025, an advanced Gemini Deep Think system reached gold-medal standard using natural-language proofs. That was a different approach, not evidence that all successful mathematical AI must pass through Lean.

Formal checking remains valuable because stronger reasoning does not make an argument automatically correct. It also supplies feedback for search and training. But a proof of a mistranslated statement remains a proof of a mistranslated statement, however many GPUs participated.

In healthcare data, the arithmetic can be correct while the units are wrong. If you wanted kilograms and received pounds, checking the multiplication does not rescue you. Formal specifications can help prevent such errors when the distinctions are represented properly. Somebody still has to make sure they are.

I find that much more interesting than the announcement that hallucination has been solved.

There are costs, too. Formalization needs expertise and time. A short argument may depend on a large theory nobody has formalized yet. Existing proofs need maintenance as libraries and tools change. A diagram that makes an idea immediately visible may take considerable work to express formally.

A formal proof can still explain something. A carefully written one may be illuminating; a huge generated one may be miserable to read. Ordinary mathematics has both varieties too.

Nor is Lean guaranteed to become the only system that matters. Other proof assistants have different strengths and substantial bodies of work. Open libraries help people participate, but access to a repository does not distribute research time, mentorship, or computing resources equally. “Democratization” becomes a very accommodating word when nobody asks who can afford the work.

---

For a first encounter, though, the machinery is available without an institutional affiliation. The [Lean learning page](https://lean-lang.org/learn/) points to free resources, including the Natural Number Game and introductory books.

Here is a complete small proof in Lean 4:

```lean
theorem add_zero_custom (n : Nat) : n + 0 = n := by
  rfl
```

`Nat` means natural numbers. The claim applies to every natural number. `rfl` works because, with Lean's definition of this addition, `n + 0` reduces to `n`.

Yes, we have established that adding nothing adds nothing. I was hoping to begin somewhere I could survive.

Put the zero on the other side, `0 + n = n`, and the same immediate reduction does not work. You need induction or an existing theorem. What looks symmetrical to us need not be symmetrical in the underlying definition. Learning Lean means noticing such distinctions.

I would start with a few small proofs and enough understanding to explain each step. *The Mechanics of Proof* offers a mathematical route; *Functional Programming in Lean* approaches it from programming. There is no need to promise mastery in thirty days and turn another interest into an opportunity to feel behind.

Will this change mathematics? It already changes parts of its practice. How far it spreads depends on the tools, their cost, the libraries, and whether people find the results useful. I cannot honestly attach a percentage to what journals will require in 2040.

I am equally unwilling to guarantee that humans will always own the interesting questions while machines perform the dull labor. That sounds reassuring. It is not an established boundary. Machines may become better at proposing concepts and explaining results too. Our desire to remain necessary does not settle what they can do.

But understanding something need not become worthless because another intelligence can understand it faster. I would like to believe that without turning it into a consolation speech. Some days curiosity is enough to get started; other days it isn't. I still want to know what is happening here.

For the moment there is a statement on the screen, some assumptions, and a question about whether the argument holds. I can begin with that. When the machine accepts it, I want to know exactly what I have earned the right to believe.
