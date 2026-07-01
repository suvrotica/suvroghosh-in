---
title: "The Four Fundamental Subspaces of Linear Algebra"
description: "A lucid explanation of the four fundamental subspaces in linear algebra: column space, nullspace, row space, and left nullspace. A matrix is treated not as a grid of numbers but as a machine for moving, losing, and exposing information."
thumbnail: "/images/IMG-20260425-WA0000.jpg"
date: "2026-04-25"
category: "Mathematics"
tags: ["Mathematics", "Linear Algebra", "Four Fundamental Subspaces", "Column Space", "Nullspace", "Row Space", "Left Nullspace", "Rank", "Least Squares", "SVD", "Applied Mathematics", "Data Science", "Systems Thinking", "Calcutta"]
published: true
color: "indigo"
---

<TTS />

<Pi src="IMG-20260425-WA0000.jpg" />

A matrix on a page looks like a small fenced field of numbers.

That is the misleading part. A matrix is not a spreadsheet with better posture. It is a machine. It accepts an input vector, transforms it, loses some information, preserves some information, and produces an output that belongs to a particular geometric world.

Write a matrix $A$ with $m$ rows and $n$ columns. It takes a vector $x$ in $\mathbb R^n$ and produces $Ax$ in $\mathbb R^m$. That sentence looks harmless until you ask four questions.

What outputs can this matrix produce?

Which inputs disappear?

Which part of the input does it actually listen to?

Which output demands are impossible?

The answers are the four fundamental subspaces: the column space $C(A)$, the nullspace $N(A)$, the row space $C(A^T)$, and the left nullspace $N(A^T)$.

Their names are not charming. The ideas are.

The column space is the world of possible outputs. Every product $Ax$ is a linear combination of the columns of $A$. The entries of $x$ are the weights. The columns are the available directions. If the target vector $b$ can be assembled from those columns, then $Ax=b$ has at least one solution. If $b$ cannot be assembled from them, the equation is not merely difficult. It is impossible.

This is the first clarity. Solving $Ax=b$ is not only a matter of algebraic manipulation. It is a membership question. Does $b$ live inside the column space?

In Calcutta terms, the column space is the set of places reachable by a given tram network. You may ask to go anywhere. The rails answer more strictly.

The nullspace is the set of inputs that vanish. It contains all $x$ such that $Ax=0$. These are not small inputs. They are invisible inputs. They enter the matrix and leave no trace.

That makes the nullspace the space of ambiguity.

If $z$ lies in the nullspace and $x_p$ is one solution to $Ax=b$, then $x_p+z$ is also a solution. The matrix cannot tell the difference because $Az=0$. Distinct inputs can produce the same output. The machine has a blind direction.

This is not a classroom oddity. It is the shape of many real problems. A scanner may fail to see certain structures. A data model may fail to capture an important distinction. A clinical database may preserve billing facts while losing the lived clinical meaning. The output can be precise and still incomplete because the missing information fell into the nullspace before anyone noticed.

The row space explains what the matrix listens to. Each row of $A$ takes a dot product with the input. Each row asks one linear question. The row space $C(A^T)$ is the span of those questions. It is the visible part of input space.

Here comes the first beautiful perpendicular fact:

$$
\text{row space} \perp \text{nullspace}
$$

Inside $\mathbb R^n$, the row space and nullspace are orthogonal complements. Every input can be split into a part the matrix hears and a part it ignores. The row-space component affects the output. The nullspace component does not.

This is a useful antidote to a lazy phrase: "bad data." Sometimes data is bad. Values are missing, stale, miscoded, duplicated, or wrong. But sometimes the deeper problem is not dirt. It is projection. The measurement system never captured the missing direction in the first place. You cannot clean your way into information that was erased by design.

The left nullspace lives on the output side. It consists of all vectors $y$ such that $A^Ty=0$. These vectors are perpendicular to every column of $A$. Since every possible output is made from the columns, the left nullspace marks directions the matrix can never produce.

This is the second perpendicular fact:

$$
\text{column space} \perp \text{left nullspace}
$$

Inside $\mathbb R^m$, the column space and left nullspace are orthogonal complements. Every target $b$ can be split into a reachable part and an unreachable part. The left nullspace is where impossible demands leave their signature.

So the four spaces divide input and output with severe honesty.

The row space is what the matrix can sense.

The nullspace is what it cannot sense.

The column space is what it can produce.

The left nullspace is what it must refuse.

The dimension of the column space is the rank $r$. The row space has the same dimension. This shared rank is the true amount of independent action passing through the matrix. The remaining dimensions are accounted for with accountant-like discipline:

$$
\dim C(A)=r
$$

$$
\dim C(A^T)=r
$$

$$
\dim N(A)=n-r
$$

$$
\dim N(A^T)=m-r
$$

If rank rises, the column space grows and the nullspace shrinks. The matrix can reach more output directions and loses fewer input directions. Capability increases; ambiguity decreases. But even this has a practical warning. A direction may be technically visible but very weakly carried. Under noise, it may become unreliable.

That is where the singular value decomposition, or SVD, becomes useful. SVD rewrites a matrix in terms of orthogonal input directions, scaling strengths, and orthogonal output directions. It shows not only what the matrix can see, but how strongly it sees it. Some directions are carried loudly. Some whisper. Some are crushed to zero.

Now consider the most common practical failure: $b$ is not in the column space. The target is unreachable. Measurements disagree. The model is too simple. The world is not polite enough to satisfy the equation.

Least squares is the disciplined compromise. Instead of demanding $Ax=b$, we seek an $\hat{x}$ such that $A\hat{x}$ is as close as possible to $b$. Geometrically, we project $b$ onto the column space. The best possible output is the shadow of the target on the space the matrix can actually reach.

The residual

$$
r=b-A\hat{x}
$$

is the leftover. At the least-squares solution, that leftover is perpendicular to the column space:

$$
A^T(b-A\hat{x})=0
$$

This is the normal equation, but it is better understood as geometry. It says the remaining error lies in a direction the matrix cannot adjust. The residual is not just a mess. It is the unreachable part of the demand.

That distinction matters in data science, modeling, operations research, imaging, economics, and healthcare analytics. A residual may be random noise. It may also be omitted structure, a wrong basis, a missing variable, a broken measurement design, or a target that the model has no vocabulary for. Calling all of that "error" is too thin. Sometimes the residual is a message from the left nullspace.

This is why the four fundamental subspaces are more than exam material. They teach a habit of suspicion.

When a system fails, ask what space it can reach.

When two hidden causes look identical, ask what fell into the nullspace.

When a model uses only certain features, ask what its row space is listening for.

When the target refuses to fit, ask whether the demand contains a component outside the column space.

A matrix is a small lesson in institutional honesty. It cannot do everything. It cannot see everything. It cannot produce every output. It has rank, blindness, reach, and refusal. Once you understand that, the little fenced field of numbers becomes less dull.

It becomes a machine with a map of its own limitations.

And many failures in life begin when someone builds such a machine, believes the output too quickly, and forgets to ask what the nullspace has quietly swallowed.
