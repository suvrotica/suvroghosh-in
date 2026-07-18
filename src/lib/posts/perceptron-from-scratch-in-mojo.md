---
title: "A Perceptron from Scratch in Mojo"
description: "A Python-style Mojo notebook that builds, trains, and tests a single perceptron step by step without a machine-learning library."
date: "2026-07-18"
category: "mojoLLM"
tags: ["Notebook Builds","Source Notebook","Mojo's","Perceptron","Cell","Cells","Training","Source"]
published: true
readingTime: "8 min"
notebook: "perceptron-from-scratch-in-mojo"
inPlainEnglish: "A perceptron multiplies inputs by weights, adds a bias, makes a binary decision, and corrects its mistakes. This notebook implements that entire loop directly in Mojo."
keyTerms: ["Perceptron", "Weights", "Bias", "Activation", "Learning rate"]
---

# What This Notebook Builds

This is the first `mojoLLM` computational notebook. It begins with the customary hello world, then replaces the greeting with a more useful small machine: a single perceptron trained to reproduce the logical AND gate.

Nothing is hidden behind NumPy, a tensor package, or a machine-learning framework. The notebook defines the activation, step function, error, and update rule directly. The complete training set contains four rows, so every change remains small enough to inspect.

# How to Read It

Follow the rendered cells from top to bottom. Each `%%mojo` cell is a complete Mojo program, as required by Mojo's Python-backed notebook integration. The early cells isolate one idea at a time; the final cell assembles those ideas into the full training loop and verifies all four predictions.

The important transition is not from “hello world” to a large model. It is from printing a fixed string to changing a model because evidence says the current parameters are wrong.

# The Rule in One Line

For each training example, the perceptron computes `x1*w1 + x2*w2 + bias`. It predicts one when that activation is zero or greater, otherwise zero. When the prediction is wrong, each weight moves by `learning_rate * error * input`, and the bias moves by `learning_rate * error`.

That modest loop contains the basic rhythm of supervised learning: predict, compare, correct, repeat.

# Running the Source Notebook

The embedded version is static HTML so it remains fast, safe, and readable in an ordinary blog post. The source file is a standard `.ipynb` notebook using a Python kernel and Mojo's official `%%mojo` cell magic. On Linux, macOS, or Windows through WSL, install Mojo and the Jupyter tools described in the project README, open the source notebook, and run the cells normally.

# What Comes Next

A single perceptron can learn AND or OR because each is linearly separable. It cannot learn XOR. That failure is the useful next step: it creates the need for hidden units, multiple decision boundaries, and eventually a small multilayer network built from the same primitive operations.
