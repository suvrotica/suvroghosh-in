---
title: "XOR from Scratch in Mojo with Multiple Perceptrons"
description: "A step-by-step Mojo notebook showing why one perceptron cannot learn XOR and how three trained perceptrons solve it as a tiny two-layer network."
date: "2026-07-18"
category: "mojoLLM"
tags: ["Single Perceptron","Smallest Useful Network","Straight Boundary","Output Perceptron","Final Table","Inputs","Perceptrons","NAND","Output","XOR"]
published: true
readingTime: "10 min"
notebook: "xor-with-multiple-perceptrons-in-mojo"
inPlainEnglish: "XOR cannot be separated by one straight line. This notebook combines an OR perceptron, a NAND perceptron, and an output perceptron so several boundaries cooperate to produce the correct answer."
keyTerms: ["XOR", "Multiple perceptrons", "Hidden layer", "OR", "NAND", "Linear separability"]
---

# Where the Single Perceptron Stops

The previous `mojoLLM` notebook trained one perceptron to reproduce the AND gate. That worked because a straight boundary can put the lone positive point on one side and the three negative points on the other.

XOR is the small, famous refusal. It returns one when the two inputs differ and zero when they agree. Its positive points sit on opposite corners of a square. Any straight boundary that captures both also captures a point that should remain outside. Training longer does not repair a representation that cannot express the answer.

The notebook first makes that failure visible. A single perceptron keeps updating, but its mistakes never fall to zero.

# The Smallest Useful Network

We solve XOR by composing three perceptrons:

1. A hidden OR perceptron asks whether at least one input is active.
2. A hidden NAND perceptron asks whether the inputs are not both active.
3. An output perceptron acts like AND and fires only when both hidden answers are one.

The resulting identity is `XOR = AND(OR(x1, x2), NAND(x1, x2))`.

This is already a neural network: two inputs, two hidden units, and one output unit. Each unit still draws only one straight boundary, but the network combines those boundaries into a region that one perceptron could not create.

# What Is Trained

The final program does not paste in magical gate weights. It trains the OR and NAND perceptrons from their truth tables, converts their predictions into a new hidden dataset, and then trains the output perceptron on that representation. All three models use the same small learning rule from the first notebook.

For clarity, the learning rate is `1.0`, so the learned parameters remain whole-number-valued `Float64`s. We also state the tie convention explicitly: an activation must be strictly greater than zero to produce one. Choosing what happens at exactly zero is part of defining the step function, not a law of nature.

# What This Does Not Yet Do

The three units are trained separately, and the useful OR–NAND architecture is chosen by hand. A modern multilayer neural network instead learns interacting layers through a shared loss and backpropagation. That is the next conceptual leap.

But this intermediate step matters. Before gradients and matrices hide the machinery, XOR shows exactly why hidden units exist: they transform the original inputs into a space where the final decision becomes linearly separable.

# Reading the Final Table

The last output prints the original inputs, the two hidden activations, the network prediction, and the target. The rows where the inputs differ become `(OR=1, NAND=1)`, which the output perceptron recognises. The equal-input rows become `(0, 1)` or `(1, 0)`, and the output remains zero.

One perceptron failed. Three ordinary perceptrons, arranged with purpose, succeed.
