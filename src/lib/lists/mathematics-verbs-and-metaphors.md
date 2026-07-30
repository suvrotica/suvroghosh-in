---
title: 'Mathematics Verbs and Metaphors'
description: 'Thirty-six precise mathematical verbs across proof, geometry, probability, optimization and dynamics, with warnings about misleading metaphors.'
date: '2026-07-30'
dateModified: '2026-07-30'
kind: 'list'
tags:
  - 'Mathematics'
  - 'Technical writing'
  - 'Visualization'
  - 'Explanation'
published: true
featured: false
order: 90
thumbnail: '/images/resources/mathematics-verbs-and-metaphors.webp'
thumbnailAlt: 'A mathematical field page linking transformations, geometric projections, probability curves and dynamical trajectories'
estimatedLength: '36 mathematical terms'
related:
  - 'prompts/scientific-visualization-prompts'
  - 'prompts/research-and-verification-prompts'
  - 'lists/architectural-verbs'
language: 'en'
---

Mathematical verbs compress definitions, assumptions and structures. Use them to reveal the operation being performed, but do not let a familiar physical metaphor smuggle in properties the mathematics has not earned.

<!-- resource-copy:start -->

## Transformation

1. **Transform** — Apply a specified operation or function to an object, producing another object in the stated domain or codomain. A Fourier transform changes representation while permitting recovery under suitable conditions. _Metaphor watch:_ “transform” can imply dramatic improvement; name the operation and property changed.
2. **Map** — Assign each element of a domain to an element of a codomain according to a function or relation: “The exponential map sends a tangent vector to a point on the manifold.” State whether the map is injective, surjective, continuous or structure-preserving when relevant. An arrow does not mean an object physically travels.
3. **Rotate** — Apply an orientation-preserving isometry around a point, axis or higher-dimensional invariant subspace. Give the angle, plane, centre and convention where ambiguous. The rigid-object picture becomes incomplete in higher dimensions, where rotation may act in several orthogonal planes.
4. **Preserve** — Leave a named property invariant under an operation: an isometry preserves distance, while a symplectic map preserves the symplectic form. One quantity may be preserved while shape or orientation is not. A transformation does not “protect” an invariant; the result follows from its definition or a theorem.

## Approximation

5. **Approximate** — Replace a quantity or object with another whose error is controlled under a stated measure, tolerance or limiting regime. Distinguish numerical approximation, asymptotic equivalence and statistical estimation. “Close” has no mathematical force until the norm, metric, probability or error bound is named.
6. **Linearize** — Replace a nonlinear function or system near a reference point with its first-order linear approximation, usually through a derivative, Jacobian or tangent map. State where the expansion is taken and how large the neglected terms may be. A tangent line is a local model, not evidence of global linearity.
7. **Perturb** — Change a parameter, input, operator or geometry by a small specified amount to study sensitivity, stability or nearby behaviour. “Small” must be relative to a norm, topology or scale. Describe the resulting change in trajectories, eigenvalues or error rather than saying the system becomes “confused”.
8. **Truncate** — Retain only a finite portion of a series, expansion, basis or data representation. State the cut-off rule and, where possible, the remainder or truncation error. Discarded terms are not automatically irrelevant; a small tail may dominate in another regime.

## Proof and reasoning

9. **Imply** — Assert that one proposition entails another: whenever the assumptions are true, the conclusion must also be true. It does not assert the converse or establish equivalence. Logical implication is not a causal push from one statement to another.
10. **Derive** — Obtain a result from definitions, assumptions and earlier results through valid deduction or algebraic transformation. Show the intermediate dependency when it is not immediate. “Derived from” describes logical dependence, not necessarily historical origin.
11. **Bound** — Supply an upper limit, lower limit or two-sided constraint for a quantity over a stated domain. Indicate whether the bound is uniform, asymptotic, probabilistic, sharp or merely convenient. A bound is a proved relation, not a fence a quantity tries to escape.
12. **Establish** — Prove a claim from declared axioms and hypotheses, or verify it under a stated computational standard. Point to the argument or evidence that carries the result. Establishing a theorem does not make it true outside its assumptions.
13. **Contradict** — Show that two propositions cannot both hold, often by deriving a false statement from the negation of the desired conclusion. Identify the exact incompatible statements. Propositions do not quarrel; contradiction denotes logical incompatibility.

## Geometry

14. **Intersect** — Take the elements common to two or more sets, curves, surfaces or subspaces. Record whether an intersection is empty, transverse, tangent, repeated or of a particular dimension. Curves that cross in a projection may not intersect in the underlying space.
15. **Embed** — Represent one mathematical object inside another by an injective map that preserves the relevant topology, smooth structure or algebraic structure. State which structure is preserved. Visual containment alone does not prove an embedding.
16. **Tile** — Cover a region with specified pieces without gaps and without overlap except along permitted boundaries. Say whether rotations, reflections, substitutions or infinitely many tile types are allowed. Visible local regularity does not prove that a tiling extends indefinitely.
17. **Collapse** — Identify points through a quotient, shrink a subspace or take a limiting operation that reduces dimension or structure. Specify what is identified and what information survives. The word sounds catastrophic, but the mathematical operation may be controlled and local.

## Probability

18. **Sample** — Draw an observation or collection of observations from a specified probability distribution or sampling design. Distinguish an ideal independent sample from data gathered through a biased or dependent process. A dataset is not representative merely because it is called a sample.
19. **Condition** — Form a probability distribution given an event, value or information set, subject to the relevant definition and existence conditions. Conditioning changes the available information, not necessarily the mechanism generating the outcome. Filtering rows may look similar but establishes no causal claim.
20. **Marginalize** — Sum or integrate over one or more variables to obtain the distribution of the remaining variables. The removed variable may still influence the result through the joint distribution. Marginalizing does not declare it unimportant.
21. **Concentrate** — Show that probability mass lies increasingly near a value or set, often through a concentration inequality or limiting argument. Name the centre, deviation scale and probability guarantee. Probability mass does not deliberately gather or prefer a location.

## Optimization

22. **Minimize** — Find an admissible point at which a stated objective takes its smallest value, locally or globally. Name the objective, variables and constraints, and distinguish the minimizer from the minimum value. The smallest observed value need not be the global optimum.
23. **Descend** — Update an iterate in a direction intended to reduce an objective, as in gradient descent. State the direction rule, step size and conditions for decrease or convergence. The downhill-landscape metaphor is useful but incomplete around saddles, flat directions and stochastic steps.
24. **Converge** — Approach a limit under a specified notion, such as pointwise, uniform, almost sure, in probability or in norm. An algorithm may converge to a local optimum, stationary point or undesirable solution. Iterates do not “agree” or discover truth; convergence states a limiting relation.
25. **Regularize** — Modify a problem or estimator to improve stability, identifiability or generalization, often by adding a penalty or restricting solutions. Name the regularizer and coefficient or constraint. It introduces assumptions and usually trades fit against complexity or bias against variance.
26. **Penalize** — Add a cost for selected parameter values, constraint violations or model properties within an objective. State what incurs the penalty and its weight. The method is not morally punishing bad behaviour; the term encodes a mathematical preference that needs justification.

## Linear algebra

27. **Project** — Map a vector or object onto a subspace through an idempotent operator. Distinguish orthogonal from oblique projection and state the inner product where orthogonality matters. The shadow metaphor helps, but projections need not involve light, Euclidean space or three dimensions.
28. **Span** — Form the set of all finite linear combinations of a collection of vectors. State the field and ambient vector space, and distinguish a spanning set from a basis. Redundant vectors may span the same subspace without adding a direction.
29. **Factor** — Express a number, polynomial, matrix or operator as a product of simpler objects, such as an LU, QR or singular-value factorization. State existence conditions and whether the factorization is unique. Factors are components of a chosen representation, not necessarily hidden causes.
30. **Decompose** — Express an object as a sum, product or direct combination of components with specified properties. The decomposition may depend on a basis, inner product or modelling choice. Its components are not automatically the object's uniquely “real” parts.
31. **Amplify** — Increase the magnitude of a vector component, mode, signal or perturbation under an operator. Specify the norm, gain, singular direction or frequency band used to measure the increase. A matrix does not favour a direction; amplification follows from its action and the chosen measure.
32. **Cancel** — Combine terms whose sum is exactly zero or whose leading effects offset to a stated order. Distinguish exact symbolic cancellation from approximate numerical cancellation, which may destroy significant digits. Terms do not fight or erase one another intentionally.

## Dynamical behaviour

33. **Oscillate** — Vary repeatedly between states or around a reference value. Distinguish periodic, quasiperiodic, damped and irregular oscillation rather than using the verb for every fluctuation. A wavy plot may reflect sampling noise or scale instead of dynamics.
34. **Stabilize** — Cause or show that trajectories remain near, or return towards, an equilibrium or invariant set under defined disturbances. State whether stability is Lyapunov, asymptotic, exponential, input-to-state or another kind. Feedback changes equations; a system does not seek calm.
35. **Bifurcate** — Undergo a qualitative change in equilibria, periodic orbits or other invariant behaviour as a parameter crosses a critical value. Identify the parameter, threshold and type where known. Every branching diagram or pair of outcomes is not a dynamical bifurcation.
36. **Attract** — Describe trajectories approaching an invariant set from a specified basin under a dynamical system's evolution. State the mode of approach and avoid calling every persistent visual pattern an attractor. An attractor exerts no desire and need not exert a physical force.

<!-- resource-copy:end -->

Before borrowing a mathematical verb for general prose, ask what its definition contributes. “The argument converges” may be a useful structural metaphor; it does not inherit a topology, a rate or a proof merely by sounding mathematical.
