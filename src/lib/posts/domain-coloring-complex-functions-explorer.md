---
title: "Every Complex Number Has a Colour: An Interactive Domain-Colouring Explorer"
description: "Explore zeros, poles, winding, periodicity, and branch cuts by turning the magnitude and phase of complex functions into a navigable field of colour and contours."
date: "2026-07-25"
thumbnail: "/images/domain-coloring-explorer.svg"
thumbnailAlt: "A cyclic field of phase colours around a dark zero, crossed by real and imaginary axes and logarithmic magnitude contours"
category: "Visualizations"
tags: ["Safe Custom Expressions","Real Axis","Branch Cuts","Zeros Poles","Hue","Magnitude","Zeros","Contours","Exponential","Colours"]
published: true
color: "#155E75"
author: "Suvro Ghosh"
readingTime: "10 min"
inPlainEnglish: "A complex function produces both a size and a direction at every point. Domain colouring turns the direction into hue and the size into repeated contour bands, making zeros, poles, winding, periodicity, and chosen branch cuts visible."
keyTerms: ["Domain colouring", "Complex function", "Magnitude", "Argument", "Zero", "Pole", "Branch cut", "Conformal map"]
faq:
  - question: "What does each colour mean in domain colouring?"
    answer: "Hue represents the argument, or angle, of the complex output f(z). Repeated light and dark bands represent changes in its magnitude on a logarithmic scale."
  - question: "Why do zeros look dark and poles look bright?"
    answer: "Near a zero, the magnitude of f(z) tends to zero; near a pole, it grows without bound. The explorer gives those two extremes distinct dark and bright treatments while contour rings converge around both."
  - question: "Is the line beside log(z) or sqrt(z) a flaw in the function?"
    answer: "It is the branch cut of the chosen principal value. Logarithms and square roots are naturally multivalued over the complex plane, so a single-valued display must choose where one branch ends and another would begin."
---

<script>
	import DomainColoringExplorer from '$lib/components/visualizations/domain-coloring/DomainColoringExplorer.svelte';
</script>

<TTS />

<Pi
	src="/images/domain-coloring-explorer.svg"
	alt="The identity function rendered as a phase-colour wheel with circular logarithmic magnitude contours around its zero"
	caption="The identity map is the reference image: angle becomes hue, distance from the origin becomes magnitude, and the complete colour cycle records one turn around the zero."
/>

# A map with two answers at every point

An ordinary graph can give a real input an **x** coordinate and a real output a **y** coordinate. A complex function has already used both visible directions for its input:

$$
z=x+iy.
$$

Its output $f(z)$ is complex as well. We therefore need another visual language for two more quantities. Domain colouring uses the output's **argument**, or angle, as hue. It uses the output's **magnitude**, written $|f(z)|$, as repeated brightness bands and contour lines.

The resulting image is not a decorative heatmap. It is a map of how a function transforms the entire displayed region. Colour records direction, contours record scale, and the way both wind around special points exposes mathematical structure that a list of values would conceal.

<DomainColoringExplorer />

# Reading the colours

Pick **Identity** first. On the positive real axis, $f(z)=z$ has angle zero. Walk anticlockwise around the origin and the hue travels once around the colour wheel before returning to its starting colour. Move outward and the magnitude grows. The dark contour rings are spaced at powers of two, so their physical spacing changes even though their mathematical ratio stays constant.

This repeated logarithmic scale is important. A plain linear brightness scale would let either tiny or enormous values consume most of the useful contrast. Repeating the scale lets the same image show behaviour across many orders of magnitude.

The fine radial bands are phase contours. They supplement hue with visible structure, which helps when colours are difficult to distinguish and makes local angle changes easier to count.

# Zeros, poles, and winding

A **zero** is a point where $f(z)=0$. Its magnitude collapses, so the explorer darkens it and the logarithmic contours gather around it. The surrounding hues tell us more than its location.

For $f(z)=z$, one circuit around the origin produces one circuit around the hue wheel. For $f(z)=z^2$, it produces two. The second function has a zero of order two: locally, it doubles angles and squares distances. Select **Squaring** and count the hue cycles.

A **pole** is the opposite kind of singular behaviour: $|f(z)|$ grows without bound. In **Reciprocal**, the origin becomes a bright pole. The direction of the hue sequence reverses because $1/z$ reverses angle. In the rational example

$$
f(z)=\frac{z^2-1}{z^2+1},
$$

the two dark zeros at $z=\pm1$ and the two bright poles at $z=\pm i$ can be compared in one field. Contour convergence locates them; hue winding distinguishes their behaviour.

# Periodicity becomes geometry

The complex sine retains the familiar real zeros at integer multiples of $\pi$, but the image also shows what happens away from the real axis. Pan horizontally and the pattern repeats. Move vertically and its magnitude grows rapidly.

The exponential gives a complementary picture:

$$
e^{x+iy}=e^x(\cos y+i\sin y).
$$

Horizontal movement changes $e^x$, so it crosses magnitude contours. Vertical movement changes $y$, so it cycles through phase colours every $2\pi$. The absence of dark convergence points is equally informative: the complex exponential has no zeros.

# Branch cuts are choices

Complex logarithms and square roots are naturally multivalued. If $w^2=z$, then both $w$ and $-w$ square to $z$. If $e^w=z$, adding any integer multiple of $2\pi i$ to $w$ produces the same exponential.

The explorer must display one value per input pixel, so it uses the **principal branch** for `log`, `sqrt`, and non-integer powers. Its angle lies in the conventional interval from $-\pi$ to $\pi$. The seam along the negative real axis is therefore a chosen branch cut. It is not an intrinsic crack that every possible interpretation of the function must share.

Select **Logarithm** and **Square root**, then pan across that seam. The abrupt change is genuine for the selected single-valued branch, while the multivalued mathematical object is larger than any one branch.

# Safe custom expressions

The input accepts numbers, `z`, the imaginary unit `i`, the constants `e` and `pi`, parentheses, the operators `+ - * / ^`, and the functions `exp`, `log`, `sin`, `cos`, `tan`, `sqrt`, and `abs`.

It is a deliberately small mathematical language. The browser tokenises and parses the expression into a restricted syntax tree; it never sends the text to JavaScript's `eval` or allows property access and arbitrary code. The same tree can be evaluated by the deterministic arithmetic tests and translated into complex-number operations inside a fragment shader.

General powers use the principal definition

$$
z^w=\exp(w\log z),
$$

while small integer powers use direct multiplication so that familiar polynomial zeros behave cleanly. Floating-point arithmetic still has limits. Extremely large values are clamped for stable display, division very near zero receives a deliberate pole treatment, and truly undefined shader results fall back to neutral grey rather than corrupting neighbouring pixels.

# What the picture does not prove

Domain colouring is an instrument for inspection, intuition, and conjecture. A striking pattern is not a proof that every suspected zero has been found or that a function is conformal everywhere it looks smooth. Screen resolution can hide features, floating-point arithmetic can merge extreme scales, and a chosen colour scheme emphasises some properties more than others.

Used carefully, however, the image makes several rigorous ideas perceptible at once: argument winds around zeros and poles; multiplicity changes the winding count; periodic functions repeat; exponential growth aligns with one coordinate; and principal branches require cuts. The colours are not the mathematics, but they are a remarkably compact way of seeing where the mathematics asks us to look.

