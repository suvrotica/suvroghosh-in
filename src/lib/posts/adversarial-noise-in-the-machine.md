---
title: "Adversarial Noise in the Machine"
description: "A bitter look at adversarial attacks in medical imaging, and the bodies left to absorb the difference between a confident prediction and the truth."
date: "2026-10-26"
thumbnail: "/images/art-adversarial-noise-in-the-machine.webp"
thumbnailAlt: "Illustration of a grayscale chest CT scan crossed by red digital static, with a pale nodule in one lung."
category: "Technology"
tags: ["Adversarial Machine Learning", "Medical Imaging", "Cybersecurity", "Artificial Intelligence", "Deep Learning", "Healthcare Technology", "Calcutta", "Kolkata", "SuvroGhosh", "Digital Ethics"]
pinnedTags: ["Adversarial Machine Learning", "Medical Imaging", "Cybersecurity", "Artificial Intelligence", "Deep Learning", "Healthcare Technology", "Calcutta", "Kolkata", "SuvroGhosh", "Digital Ethics"]
published: true
color: "#8B0000"
---

<TTS />

<Pi src="/images/art-adversarial-noise-in-the-machine.webp" alt="Illustration of a grayscale chest CT scan crossed by red digital static, with a pale nodule in one lung." />

Imagine a radiologist squinting at the screen, her coffee going cold in that specific way hospital coffee has of giving up on itself. There is a small nodule, and beside it the algorithm's warning, confident enough to make her look again. Somebody has deliberately altered the pixels fed to the classifier. She cannot see the alteration. She can see the warning. It helps tip an uncertain case toward a biopsy, and a needle goes into somebody who has already spent several nights trying not to imagine dying. Later, the pathology comes back benign. The software was wrong. The blood was real enough.

Welcome to the wonderful world of adversarial examples, you miserable optimists, where mathematics wears a clown nose and medicine dances to a tune nobody whistled.

My work with UT Health San Antonio and the U.S. Department of Veterans Affairs involved databases, data pipelines and research support. I know the unglamorous end of medical computing, the work of getting records from one place to another without losing what they mean. Before anybody gets to announce that artificial intelligence has understood the human body, somebody has to prepare the data. Somebody has to check it. For that part of the picture, imagine Bapi in an annotation office in Salt Lake Sector V, working through images under instructions and a review process he does not control. He is part of the invisible infrastructure of your artificial intelligence, the human ghost in the machine learning. He might reasonably wonder what happens when the labels are wrong.

What bothers me is that they can all be right and the finished model can still be fooled.

Here is the joke, and it is a cruel one, the kind that makes you laugh because you have already tried being frightened and it did not improve anything: deep neural networks can perform impressively on ordinary images and then possess the robustness of a soufflé in an earthquake when confronted with specifically crafted changes. We are talking about noise, my friends, but not the honest static of a bad television on a monsoon-drenched Calcutta afternoon. This is calculated, optimized noise. Sometimes the change is so small that you still see the original image while the network, that electronic idiot savant, confidently identifies something else. In the famous demonstration, a panda becomes a gibbon. In medical-image experiments, the wrong answer can concern disease.

The simplest version of the mathematics is almost insultingly straightforward. You take an image $x$ and a trained model with parameters $\theta$. You leave its weights alone and change its input. Goodfellow and colleagues' Fast Gradient Sign Method computes:

$$
\eta = \epsilon \cdot \operatorname{sign}\left(\nabla_x J(\theta, x, y)\right)
$$

Here, $J$ is the loss for the correct label $y$. The gradient tells you how changes to the input affect that loss; the sign selects a direction, and $\epsilon$ limits each pixel's change. Add $\eta$ to $x$, keeping the resulting values within the allowed image range, and you have an attempt to make the model get the answer wrong. Forcing a particular wrong answer requires a targeted objective.

This is an $L_\infty$ constraint. Other attacks use an $L_2$ budget. Neither notation is a certificate of invisibility. Whether the alteration goes unnoticed, survives preprocessing and actually fools the model has to be tested.

When it works, the network can be wrong with the confidence of a street-corner astrologer predicting your doom. The confidence is part of what makes it unpleasant. There is no hesitation for the person looking at the result to recognize, no embarrassed pause, no human face beginning to suspect that it has made a terrible mistake.

And here is where my particular brand of Bengali pessimism, that special Calcutta blend of Marxist residue and monsoon mold, starts rubbing its hands with greasy anticipation. Because an attacker may want the opposite result. A malignancy can be pushed toward a benign classification. The tumor, that knotted fist of rebellion against the body's order, need not disappear from the scan. Its edges need not be smoothed away. The attack may change the model's verdict while leaving the visible evidence substantially intact, which is precisely why an independent clinical reading matters.

But suppose the reassuring result helps delay that reading, or helps someone dismiss a concern that deserved another look. The cancer keeps growing. It has not been reassured. It is not participating in the misunderstanding. Somewhere, a patient goes home grateful, and I find that gratitude more horrible to think about than the warning in the first scene, because the warning at least gave somebody a chance to object.

There is also a more literal kind of tampering. In the 2019 CT-GAN study, Mirsky and colleagues used generative models to insert or remove visible evidence of lung cancer in CT images, fooling radiologists as well as an AI system in their evaluation. That is a different mechanism from a nearly invisible perturbation that changes a classifier's answer. Here the image itself has been convincingly falsified. These were research demonstrations, not a report of patients being secretly murdered. They are disturbing enough without my adding corpses to the paper.

I can hear the objections now: firewalls, encryption, restricted access, and surely the attacker needs to know everything about the model. The first three matter. An attacker needs some route to the data or the system; a gradient does not crawl through a hospital wall because somebody has written an evil equation. But full access to the target model is not always necessary. Medical-image studies have demonstrated attacks with and without that access. Some attacks transfer from another model; others use information obtained by querying the target. Their success depends on the circumstances. Secrecy about the architecture is not, by itself, a cure.

And before we get to the pharmaceutical executive rubbing his hands over the quarterly figures, an AI cancer score is not a fucking prescription. Clinical assessment, further imaging and pathology can interrupt the journey from a wrong prediction to an unnecessary treatment. A benign biopsy can be one of those interruptions. The machine does not ordinarily whisper “malignant” and have a healthy testicle delivered to a specimen jar before lunch.

But the interruption matters to the person being interrupted. The days of fear have already happened. The procedure has already happened. The money may already have been borrowed. “It turned out to be nothing” can be a wonderful sentence to hear, and still leave you wondering why getting back to nothing cost so much.

The financial incentives are worth examining without inventing a worldwide conspiracy. Researchers have pointed out how medical machine learning could be manipulated for fraud. Imagine an attacker altering a shared processing pipeline to push more cases toward a profitable referral, or fewer cases toward an expensive investigation. Whether that would work, and how widely, would depend on the system and the checks around it. A tweak to a normalization constant does not magically make every benign growth malignant.

Still, there is the possibility: biopsies blooming like toxic flowers, more frightened people coming through the door, more bills, and a company congratulating itself on growth. Or the opposite, somebody saving money by making it easier to tell people they do not need care. I do not need to pretend either scheme has been established by these experiments to find the incentives sickening. The body is already vulnerable. The possibility of earning more by making its digital representation lie is an additional obscenity.

What cannot be seen cannot be blamed, can it?

Of course it can, if somebody preserves the evidence and does the work. But that work does not perform itself. You need the original image, the processing history, the model version, some way of reconstructing what happened. Without them, the injured patient may be left trying to argue with a result that everybody else has already moved past.

You cannot jail a Jacobian matrix. You cannot sue a softmax function. But people built, bought and deployed the system, and calling it a black box does not make their decisions disappear. The responsibility is capable of remaining quite solid. It is just inconveniently attached to people who may have more money, more lawyers and considerably more time than the person trying to find out what happened to his body.

Then you read about the defenses, because you would quite like some of this to be preventable.

Adversarial training exposes a model to deliberately difficult examples during training and can improve its resistance to the attacks it is trained and evaluated against. Defensive distillation, proposed by Papernot and colleagues, trains using softened output probabilities. It sounded promising. Carlini and Wagner subsequently showed that it could be defeated. Making an attack's gradient unhelpful is not the same as making the model safe, a distinction that has spoiled a considerable amount of comforting research.

Random resizing, padding and other input transformations can disrupt some attacks. An attacker who accounts for those transformations may get around them. You cannot test a defense only against an attacker who politely ignores how it works and then announce that the gates have held.

Randomized smoothing offers something more specific. A smoothed classifier selects the class most likely to be predicted when Gaussian noise is added to the input:

$$
g(x) = \arg\max_c \mathbb{P}\left(f(x+\xi)=c\right),
\qquad
\xi \sim \mathcal{N}(0,\sigma^2 I)
$$

Under the method's assumptions, it can certify that this prediction will remain unchanged within a calculated $L_2$ radius. In practice, the probabilities are estimated, with statistical confidence accounted for. That guarantee means something. A stronger attack does not simply get to overturn a valid certificate while obeying its conditions.

But the guarantee concerns stability inside that radius. It does not establish that the original diagnosis was correct. Nor does it cover every possible alteration to an image, every corrupted component in a hospital network, or a generative attack that redraws the anatomy outside the certified bounds. A model can be reliably, provably consistent about an answer that is wrong.

I would rather know exactly what a defense protects than be handed another reassuring adjective. I am tired of reassurance that becomes technical only after somebody gets hurt.

The asymmetry is still there. A defender has to think about many ways the system might fail; an attacker can concentrate on the weakness that suits him. But a hospital also has opportunities to catch an error beyond the classifier itself. Those opportunities need people, time and preserved evidence. They need someone who can say that the result does not make sense and have that objection taken seriously. I keep getting stuck on that part, the person who notices something is wrong and is too junior, too hurried, too easily ignored.

Our imagined Bapi might ask whether the machines will replace him. I have no honest reason to promise they will not. I also have no reason to tell him that every box he draws is helping create a vulnerability that will kill somebody. He can do his work properly and still have no control over how the finished system is secured, tested or sold.

That is what makes his position so familiar. He supplies the labor. Other people make the promises. If someone in his family later needs a scan, all that proximity to the machinery may buy him nothing. He can sit with the report in his hand like everybody else, trying to understand how worried he is supposed to be and whether he can afford to find out.

Power, that old whore, wearing new silicon lipstick. The language changes, the diagrams become more impressive, and I am still looking at the person who has the least say and the most to lose. The old extraction did not require neural networks. It managed quite well with ledgers. Now there is another layer between a decision and the person who must live with it, and that layer can produce an answer nobody present knows how to challenge.

The radiologist reads the pathology report. Her coffee is cold, of course. She flags the disagreement for review. Somewhere, the deployed model continues running. It does not automatically adjust its weights because she has written a note, and it does not learn anything merely because somebody has suffered. Someone has to investigate, correct what needs correcting, test it and put the correction into use.

Until then, the same vulnerability may still be there.

And outside, rain falls over Calcutta, washing the streets as if any of this could be washed away.

---
P.S. References:

- Goodfellow, I. J., Shlens, J., & Szegedy, C. (2015). [Explaining and Harnessing Adversarial Examples](https://arxiv.org/abs/1412.6572).
- Finlayson, S. G., Chung, H. W., Kohane, I. S., & Beam, A. L. (2018; revised 2019). [Adversarial Attacks Against Medical Deep Learning Systems](https://arxiv.org/abs/1804.05296).
- Mirsky, Y., Mahler, T., Shelef, I., & Elovici, Y. (2019). [CT-GAN: Malicious Tampering of 3D Medical Imagery using Deep Learning](https://www.usenix.org/conference/usenixsecurity19/presentation/mirsky).
- Papernot, N., McDaniel, P., Wu, X., Jha, S., & Swami, A. (2016). [Distillation as a Defense to Adversarial Perturbations against Deep Neural Networks](https://arxiv.org/abs/1511.04508).
- Carlini, N., & Wagner, D. (2016). [Defensive Distillation Is Not Robust to Adversarial Examples](https://arxiv.org/abs/1607.04311).
- Athalye, A., Carlini, N., & Wagner, D. (2018). [Obfuscated Gradients Give a False Sense of Security: Circumventing Defenses to Adversarial Examples](https://proceedings.mlr.press/v80/athalye18a.html).
- Cohen, J., Rosenfeld, E., & Kolter, Z. (2019). [Certified Adversarial Robustness via Randomized Smoothing](https://proceedings.mlr.press/v97/cohen19c.html).
