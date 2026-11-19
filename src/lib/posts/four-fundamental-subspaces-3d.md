---
title: "The Four Fundamental Subspaces in 3D: An Interactive Geometry Laboratory"
seoTitle: "Four Fundamental Subspaces in 3D — Interactive Linear Algebra Lab"
description: "Rotate, slice, and morph the column space, nullspace, row space, and left nullspace in 3D across twelve canonical matrices with live SVD and RREF."
date: "2026-11-19"
category: "Visualizations"
published: true
interactiveFirst: true
immersiveLead: true
thumbnail: "/images/visualizations/four-fundamental-subspaces-3d/social.png"
thumbnailAlt: "Linked 3D Domain and Codomain viewports showing a teal tilted Row Space plane perpendicular to an amber Nullspace line, bridged to a differently tilted cobalt Column Space plane and rose Left Nullspace line with least-squares projection."
color: "#2DD4BF"
author: "Suvro Ghosh"
readingTime: "18 min"
pinnedTags:
  - "Linear Algebra"
  - "Four Fundamental Subspaces"
  - "Singular Value Decomposition"
  - "Least Squares"
  - "3D Visualization"
  - "Mathematics"
  - "Scientific Computing"
  - "Data Visualization"
  - "Three.js"
tags: ["Linear Algebra","Four Fundamental Subspaces","Singular Value Decomposition","Least Squares","3D Visualization","Mathematics","Scientific Computing","Data Visualization","Three.js","Graph Incidence"]
inPlainEnglish: "Every m-by-n matrix splits its input space into a visible row space and an invisible nullspace at exact right angles, and splits its output space into a reachable column space and an unreachable left nullspace at exact right angles. Grounding the picture in 1D, 2D, and 3D lets you orbit around planes, look straight down a nullspace line, and watch least-squares projection and singular value decomposition unfold without guesswork."
keyTerms:
  - "Column space"
  - "Nullspace"
  - "Row space"
  - "Left nullspace"
  - "Rank-nullity theorem"
  - "Singular Value Decomposition"
  - "Reduced Row Echelon Form"
  - "Orthogonal complement"
  - "Affine fiber"
  - "Moore–Penrose pseudoinverse"
  - "Least squares"
  - "Condition number"
faq:
  - question: "Why are the row space and column space not the same plane for a square 3×3 matrix?"
    answer: "They share the same dimension—the rank r—and A acts as an invertible bijection between them, but they live in different geometric roles and need not coincide unless the matrix has special symmetry. In the default Asymmetric Rank-2 Collapse example, C(Aᵀ) and C(A) are two differently tilted planes in ℝ³ meeting at roughly eighty degrees."
  - question: "What does it mean to look straight down the nullspace?"
    answer: "When dim N(A) = 1, aligning your 3D camera along the nullspace axis causes every affine fiber xᵣ + N(A) to visually collapse into a single point. Because A sends every vector along that line to the exact same output Ax, that camera angle shows literally what the matrix can distinguish and what it is blind to."
  - question: "Why is the least-squares residual always inside the left nullspace N(Aᵀ)?"
    answer: "The closest reachable output to b is its orthogonal projection p onto the column space C(A). Because the shortest path from a point to a subspace meets that subspace at ninety degrees, the residual e = b − p is perpendicular to every column of A, which is the exact algebraic condition Aᵀe = 0 defining N(Aᵀ)."
  - question: "What changes when you switch from the SVD basis to the RREF basis?"
    answer: "Only the coordinate vectors drawn inside each subspace change. The geometric subspaces themselves—the planes, lines, origins, projections, and orthogonality angles—remain completely invariant. SVD gives orthonormal unit bases aligned with principal stretching; RREF gives sparse algebraic bases built from pivot columns and free variables."
  - question: "Why does numerical rank depend on a tolerance τ?"
    answer: "In floating-point arithmetic, a nearly flat pancake ellipsoid with a tiny third singular value such as σ₃ = 0.04 is algebraically full rank yet numerically fragile: noise along u₃ amplifies by 1/σ₃ = 25 in A⁺b. Setting an explicit rank tolerance τ exposes the exact threshold at which small singular directions are treated as collapsed."
  - question: "How does 3D geometry carry over to matrices with hundreds or millions of dimensions?"
    answer: "Although human eyes cannot orbit inside a 1,000-dimensional space, the four algebraic identities—dim C(Aᵀ) + dim N(A) = n, dim C(A) + dim N(Aᵀ) = m, pairwise orthogonality of each complement pair, and the SVD bijection C(Aᵀ) → C(A)—hold identically in every finite dimension."
---

<script>
	import FourFundamentalSubspacesLab from '$lib/components/visualizations/four-fundamental-subspaces/FourFundamentalSubspacesLab.svelte';
</script>

<FourFundamentalSubspacesLab />

<noscript>
	<figure class="my-6">
		<img
			src="/images/visualizations/four-fundamental-subspaces-3d/poster.png"
			alt="Linked 3D Domain and Codomain diagram of an asymmetric rank-2 matrix showing tilted teal row-space and cobalt column-space planes pierced at ninety degrees by amber nullspace and rose left-nullspace lines."
			width="1200"
			height="630"
			loading="eager"
			decoding="async"
		/>
		<figcaption>
			Interactive WebGL or JavaScript is required to orbit the 3D subspaces and edit matrix entries
			live. The static diagram above illustrates the default Asymmetric Rank-2 Collapse, while the
			full mathematical walkthrough and references below remain readable without JavaScript.
		</figcaption>
	</figure>
</noscript>

<TTS />

In my earlier conceptual essay on [the four fundamental subspaces of linear algebra](/blog/mathematics/four-fundamental-subspaces), a matrix appeared as a little machine with habits, blind spots, and a strict accounting ledger. Words can introduce those four spaces—Column Space $C(A)$, Nullspace $N(A)$, Row Space $C(A^T)$, and Left Nullspace $N(A^T)$—yet textbook diagrams almost always flatten them into four labelled trapezoids sketched on a two-dimensional page.

Those flat boxes preserve the algebra while hiding the geometry that makes linear algebra feel physical. A trapezoid does not let you walk around a tilted plane until it turns into a razor-thin edge, watch a nullspace line pierce that plane at an unmistakable ninety-degree corner, or sight down an invisible direction until an entire line of distinct inputs collapses onto a single point.

This interactive laboratory builds the entire machine inside three-dimensional Euclidean space ($m, n \in \{1, 2, 3\}$), computes full Singular Value Decomposition and Reduced Row Echelon Form live in the browser without black boxes, and invites you to test every theorem with your own hands.

## 1. Why Stop at Three Dimensions?

Human spatial perception hits a hard ceiling at $\mathbb{R}^3$. We can picture a point ($0\text{D}$), a line ($1\text{D}$), a plane ($2\text{D}$), and a volume ($3\text{D}$), and we can verify right angles between them directly by orbiting a camera. Beyond three dimensions, intuition has to lean on algebraic analogy.

Fortunately, $m, n \in \{1, 2, 3\}$ is rich enough to exhibit **every qualitative phenomenon** of finite-dimensional linear algebra:

- **Trivial, line, plane, and whole-space subspaces** ($0\text{D}$, $1\text{D}$, $2\text{D}$, and $3\text{D}$) all occur cleanly inside one visible room.
- **Rectangular maps** ($3 \times 2$ overdetermined systems and $2 \times 3$ underdetermined systems) show why domain and codomain do not even need to share the same ambient dimension. Notice how the viewport explicitly frames $\mathbb{R}^2$ as a bounded two-dimensional coordinate slate rather than pretending it is a tilted slice inside $\mathbb{R}^3$.
- **All four solvability regimes** of $Ax = b$—unique exact, infinitely many exact, unique least squares, and infinitely many least squares—appear as concrete geometric intersections or perpendicular shadows.

Everything that happens in a ten-thousand-column regression model or an attention head is a higher-dimensional cousin of the exact right-angle architecture you can spin above.

## 2. Two Rooms, Two Perpendicular Pairs

A real matrix $A \in \mathbb{R}^{m \times n}$ does not act inside a single room; it connects two distinct Euclidean spaces:

$$
A : \mathbb{R}^n \longrightarrow \mathbb{R}^m.
$$

On the left stage sits the **Domain** $\mathbb{R}^n$, partitioned into two orthogonal complements that meet only at the origin:

$$
C(A^T) \perp N(A), \qquad \dim C(A^T) = r, \qquad \dim N(A) = n - r, \qquad r + (n - r) = n.
$$

On the right stage sits the **Codomain** $\mathbb{R}^m$, partitioned into a second orthogonal pair:

$$
C(A) \perp N(A^T), \qquad \dim C(A) = r, \qquad \dim N(A^T) = m - r, \qquad r + (m - r) = m.
$$

**Experiment 1 — Break the symmetry habit.** The laboratory opens on **Asymmetric Rank-2 Collapse ($3 \times 3$, Rank 2)**:

$$
A = \begin{pmatrix} 1 & -1 & 1 \\ 1 & 1 & 3 \\ 0 & 1 & 1 \end{pmatrix}.
$$

Keep **Linked Orbit** enabled and drag the left viewport. Both cameras turn together, yet the teal Row Space plane $C(A^T)$ and the cobalt Column Space plane $C(A)$ tilt at noticeably different angles (just over $80^\circ$ apart). Their normals—$N(A) = \operatorname{span}\{(2, 1, -1)^T\}$ and $N(A^T) = \operatorname{span}\{(1, -1, 2)^T\}$—point in distinct directions.

Now click **Edge-On to Plane** in the camera bar. Each camera aligns strictly inside its stage's two-dimensional plane: the teal and cobalt planes snap into razor-thin horizontal bars while the amber and rose nullspace lines shoot straight through the origin at an exact $90^\circ$ right-angle glyph. Then switch the dropdown to **Tilted Orthogonal Projection ($3 \times 3$, Rank 2)**—or click **Symmetrize** in the Matrix tab—and watch both rooms snap into identical orientation because symmetric matrices force $C(A^T) = C(A)$ and $N(A) = N(A^T)$.

Next, click **Transpose $A \leftrightarrow A^T$** on any rectangular example (such as the $3 \times 2$ Line Fit). Watch the two rooms literally trade identities: Row Space becomes Column Space, and Nullspace swaps with Left Nullspace.

## 3. Invisibility Has a Shape: Nullspace Fibers

Because $C(A^T)$ and $N(A)$ are orthogonal complements in $\mathbb{R}^n$, every input vector $x \in \mathbb{R}^n$ splits uniquely into a visible component and an invisible component:

$$
x = x_r + x_n, \qquad x_r \in C(A^T), \qquad x_n \in N(A), \qquad x_r \cdot x_n = 0.
$$

Multiply by $A$, and the nullspace part evaporates:

$$
Ax = A(x_r + x_n) = Ax_r + \underbrace{Ax_n}_{0} = Ax_r.
$$

Every vector sitting on the **affine solution fiber** $x_r + N(A)$—a shifted line when $\dim N(A) = 1$, or a shifted plane when $\dim N(A) = 2$—produces the exact same output vector $Ax$ in the Codomain.

**Experiment 2 — See what the matrix sees.** Open the **Vectors** tab and click **Slide $x$ along $N(A)$**. On the left stage, the white arrow $x$ glides back and forth along the dashed amber fiber $x_r + N(A)$, changing length and angle continually. Keep your eyes on the bright gold arrow $Ax$ on the right stage: **it does not move by a single pixel.**

Now click **Look Down Nullspace** in the camera bar. Because the camera positions itself straight along the nullspace axis, the entire dashed fiber $x_r + N(A)$ visually collapses onto the point $x_r$. You are now looking at $\mathbb{R}^3$ from the matrix's own perspective—the direction along your line of sight has lost all depth.

Switch the dropdown to **Rank-1 Outer Product $uv^T$ ($3 \times 3$, Rank 1)** to see the dual geometry: the active row space shrinks to a $1\text{D}$ line while the nullspace expands into an entire $2\text{D}$ plane of invisible directions, and the affine fiber becomes a shifted plane parallel to $N(A)$.

## 4. Impossibility Has a Shape: Least Squares & the Left Nullspace

Now flip the question around. Given a target output $b \in \mathbb{R}^m$, can we solve $Ax = b$?

Because $C(A)$ and $N(A^T)$ are orthogonal complements in $\mathbb{R}^m$, every target $b$ splits uniquely into a reachable shadow and an unreachable residual:

$$
b = p + e, \qquad p = \operatorname{proj}_{C(A)}(b) \in C(A), \qquad e = b - p \in N(A^T), \qquad A^T e = 0.
$$

The normal equation $A^T(b - A\hat{x}) = 0$ is simply the statement that the residual $e$ meets the column space at ninety degrees. Minimizing $\|b - Ax\|_2$ always selects the unique reachable vector $p$, while the **Moore–Penrose pseudoinverse** picks the unique shortest input inside the row space that maps to $p$:

$$
x^+ = A^+ b = V \Sigma^+ U^T b \in C(A^T), \qquad Ax^+ = p.
$$

Adding any nullspace vector preserves the minimum error $\|e\|_2$, giving the complete solution family $x^+ + N(A)$ and dividing every linear system into four exact geometric regimes:

1. **Unique exact solution** ($\|e\| \le \tau,\; \dim N(A) = 0$) — try **Full-Rank Anisotropic Stretch & Rotation**.
2. **Infinitely many exact solutions** ($\|e\| \le \tau,\; \dim N(A) > 0$) — try **Underdetermined System ($2 \times 3$, Rank 2)** and watch the cyan solution line $x^+ + N(A)$ inside $\mathbb{R}^3$.
3. **Unique least-squares approximation** ($\|e\| > \tau,\; \dim N(A) = 0$) — try **Overdetermined Least Squares — Line Fit to 3 Points ($3 \times 2$, Rank 2)**. Here $A = \begin{pmatrix} 1 & -1 \\ 1 & 0 \\ 1 & 1 \end{pmatrix}$ maps intercept and slope $(c, d) \in \mathbb{R}^2$ into a $2\text{D}$ plane inside $\mathbb{R}^3$. The three noisy observations $b = (0.8, 2.2, 1.8)^T$ hover off that plane; the rose residual arrow $e$ drops perpendicularly along $N(A^T) = \operatorname{span}\{(1, -2, 1)^T\}$ onto $p \in C(A)$.
4. **Infinitely many least-squares approximations** ($\|e\| > \tau,\; \dim N(A) > 0$) — try **Rank-Deficient Rectangular ($3 \times 2$, Rank 1)**, where ambiguity and impossibility strike together.

**Experiment 3 — Toggle exactness live.** In the **Vectors** tab on **Overdetermined Least Squares**, click **Snap $b$ into $C(A)$**. The residual arrow vanishes ($\|e\| = 0$) and the regime badge flips immediately to *Unique exact solution*. Click **Perturb $b$ into $N(A^T)$** and watch $b$ lift straight off the plane along the rose perpendicular line while $x^+$ stays completely unchanged—because $A^+ e = 0$.

## 5. Strang's Graph Incidence Matrix

Few examples prove that the four fundamental subspaces belong to the physical world as vividly as Gilbert Strang's favorite three-node oriented triangle graph. Select **Strang's 3-Node Graph Incidence Matrix ($3 \times 3$, Rank 2)** from the dropdown:

$$
A = \begin{pmatrix} -1 & 1 & 0 \\ 0 & -1 & 1 \\ -1 & 0 & 1 \end{pmatrix}.
$$

Think of the input vector $x = (x_1, x_2, x_3)^T$ as electrical potentials (voltages) at three nodes of a circuit. Each row of $A$ measures the potential difference across one directed edge: $x_2 - x_1$, $x_3 - x_2$, and $x_3 - x_1$.

- **Nullspace $N(A) = \operatorname{span}\{(1, 1, 1)^T\}$:** Adding a constant voltage to all three nodes leaves every potential difference unchanged. Grounding one node removes that $1\text{D}$ nullspace.
- **Left Nullspace $N(A^T) = \operatorname{span}\{(1, 1, -1)^T\}$:** Around the closed triangle loop, edge drops must satisfy $b_1 + b_2 - b_3 = 0$. That orthogonality condition $y^T b = 0$ is literally **Kirchhoff's Voltage Law**. In the default target $b = (1.0, 0.8, 0.4)^T$, the loop sum is $1.0 + 0.8 - 0.4 = 1.4 \neq 0$, so the rose residual vector measures the exact physically impossible voltage discrepancy around the loop.
- **Switch basis display to RREF / Pivot** in the ledger below the viewports: the algebraic special solutions immediately print $n_1 = (1, 1, 1)^T$ and $y_1 = (1, 1, -1)^T$ with integer coordinates while the planes and lines in 3D do not budge at all.

## 6. The Singular Value Decomposition: The Complete Map

The four fundamental subspaces tell you *which* directions survive and *which* collapse. The **Singular Value Decomposition** ($A = U \Sigma V^T$) completes the story by choosing special orthonormal bases $V = [v_1, \dots, v_n]$ for $\mathbb{R}^n$ and $U = [u_1, \dots, u_m]$ for $\mathbb{R}^m$ so that every active row-space axis maps cleanly onto one column-space axis:

$$
A v_i = \sigma_i u_i \quad (1 \le i \le r), \qquad A v_i = 0 \quad (r < i \le n), \qquad A^T u_j = 0 \quad (r < j \le m).
$$

Look at the **Center Action Bridge** between the two viewports: it displays this exact bijection $C(A^T) \xrightarrow{\sim} C(A)$ with its stretch factors $\sigma_1 \ge \dots \ge \sigma_r > 0$. The unit sphere $S^{n-1}$ in the Domain maps onto an ellipsoid $A(S^{n-1})$ inside $C(A)$ whose semi-axes are $\sigma_1 u_1, \dots, \sigma_r u_r$.

**Experiment 4 — Watch the three stages of SVD live.** Select **Householder Mirror Reflection** or **3D Shear — Volume-Preserving Non-Normal** (or stay on **Asymmetric Rank-2 Collapse**), click **Superimposed Morph**, select **3-Stage SVD ($V^T \to \Sigma V^T \to U\Sigma V^T$)**, and press **Play Morph**:

1. **$t \in [0, \tfrac{1}{3}]$:** Rigid rotation $V^T$ aligns the right singular axes with the coordinate frame.
2. **$t \in [\tfrac{1}{3}, \tfrac{2}{3}]$:** Pure axis-aligned scaling $\Sigma$ stretches active axes by $\sigma_1, \sigma_2$ and squashes any nullspace axis flat to zero (or flips sign cleanly across a mirror plane when $\det A < 0$).
3. **$t \in [\tfrac{2}{3}, 1]$:** Rigid rotation $U$ swings the stretched shape into the column space $C(A)$.

Notice also how **3D Shear** exposes the blind spot of eigenvalues: all three eigenvalues equal $1$ and $\det(A) = 1$, yet the singular values spread sharply ($\sigma_1 > 1 > \sigma_3$), tilting the unit sphere into a visibly elongated ellipsoid of unchanged volume.

**Experiment 5 — Witness numerical rank fragility.** Choose **Nearly Singular / Fragile Rank ($3 \times 3$, $\sigma_3 = 0.04 \to 0$)**. The transformed unit sphere is a paper-thin pancake ellipsoid ($\kappa(A) = 50$). Technically $N(A) = \{0\}$, yet dragging the **Smallest singular value $\sigma_3$** slider from $0.04$ down to $0$—or raising the **Rank tolerance $\tau$** slider past $0.04$—causes the pancake to flatten into a $2\text{D}$ plane and makes a $1\text{D}$ nullspace and $1\text{D}$ left nullspace abruptly appear. In real scientific computing, exact algebraic rank is fragile; effective numerical rank always lives beside an explicit tolerance $\tau$.

## 7. From 3D Intuition to $\mathbb{R}^n$

Once you have orbited a $2\text{D}$ plane edge-on, watched a nullspace fiber collapse along your line of sight, and dragged a third singular value across a numerical cliff, you carry the right mental model into arbitrary dimensions.

When a machine-learning layer projects a $768$-dimensional embedding down to $64$ dimensions, its nullspace is a $704$-dimensional blind spot of input variations that produce zero change at the output. When a clinical regression model fits ten predictors to ten thousand patient records, the residuals live in a $9{,}990$-dimensional left nullspace perpendicular to every combination the model can represent. And when an ill-conditioned inverse problem blows up in noise, one of its singular values has wandered down toward the pancake regime you just inspected at $\sigma_3 = 0.04$.

We cannot build a headset to orbit inside $\mathbb{R}^{768}$. We do not need to. The grammar of right angles, active bijections, affine fibers, and perpendicular residuals is already completely visible in three dimensions.

---

### Sources & Further Reading

- Gilbert Strang, [*The Fundamental Theorem of Linear Algebra*](https://doi.org/10.2307/2324660), *The American Mathematical Monthly*, Vol. 100, No. 9 (Nov. 1993), pp. 848–855.
- Gilbert Strang, *Introduction to Linear Algebra* (Wellesley-Cambridge Press) — Chapters 3, 4, and 7 on the four fundamental subspaces, orthogonality, projections, graph incidence matrices, and SVD.
- Lloyd N. Trefethen and David Bau III, *Numerical Linear Algebra* (SIAM, 1997) — Lectures 4–5 on the geometric meaning of the SVD and numerical rank.
- Gene H. Golub and Charles F. Van Loan, *Matrix Computations* (Johns Hopkins University Press) — One-sided Jacobi SVD, pseudoinverses, and conditioning of least-squares problems.

### Related Writing & Interactive Laboratories

- [The Four Fundamental Subspaces of Linear Algebra](/blog/mathematics/four-fundamental-subspaces) — the companion conceptual essay treating a matrix as an information machine.
- [The Matrix Is Random. Why Does It Have a Shape?](/blog/visualizations/the-matrix-is-random-why-does-it-have-a-shape) — interactive spectral laboratory exploring eigenvalues, singular values, and non-normal traps.
- [The Landscape of Error: An Interactive Atlas of Gradient Descent](/blog/visualizations/gradient-descent-landscapes) — interactive 3D optimization laboratory where conditioning and least squares become terrain.
- [The Axiom of Linearity](/blog/mathematics/the-axiom-of-linearity) — how $Ax = b$ and matrix decompositions power science and engineering.
- [Linear Algebra: The Hidden Architecture of Machine Learning](/blog/mathematics/linear-algebra-the-hidden-architecture-of-machine-learning) — from vector spaces to modern neural networks.

<style>
	:global(.article-prose .math-display) {
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		overscroll-behavior-inline: contain;
		-webkit-overflow-scrolling: touch;
	}
</style>
