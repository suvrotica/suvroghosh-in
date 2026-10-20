---
title: "Mrinmoyee: The Durga Atelier"
seoTitle: "Mrinmoyee: Create a Custom Durga Sculpture in 3D"
description: "Compose a Durga sculpture in a browser atelier: shape the face, choose clay and cloth, arrange ornament, light the lamps, and keep your creation."
date: "2026-10-20"
dateModified: "2026-10-20"
thumbnail: "/images/visualizations/mrinmoyee/mrinmoyee-social.jpg"
thumbnailAlt: "A ten-armed Durga sculpture in a vermilion sari, with an ivory-white crown, a lion and warm oil-lamp light"
category: "Visualizations"
tags: ["Durga Puja", "Bengali Art", "Generative Art", "Interactive Art", "Sculpture", "Procedural Modelling", "Three.js", "Kumartuli", "Digital Craft", "Creative Coding"]
pinnedTags: ["Durga Puja", "Bengali Art", "Generative Art", "Interactive Art", "Sculpture", "Procedural Modelling", "Three.js", "Kumartuli", "Digital Craft", "Creative Coding"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#B72338"
author: "Suvro Ghosh"
readingTime: "6 min"
inPlainEnglish: "A browser atelier for composing a stylised Durga sculpture. Geometry gives the artwork its shape; materials, ornament, colour and light give each saved composition its own character. This is an artistic interpretation, not a historical reconstruction or a ritual guide."
keyTerms: ["Procedural sculpture", "Material", "Surface roughness", "Shola-inspired ornament", "Deterministic variation", "Scene composition"]
faq:
  - question: "Does the atelier reproduce a particular historical Durga image?"
    answer: "No. It is an original, stylised ten-arm composition inspired by Bengali image-making. The arrangement of attributes is an artistic choice; it is not presented as the universal or only correct iconography."
  - question: "Are the white ornaments made from real shola?"
    answer: "The crown is digital geometry inspired by the lightness and layered ornament associated with shola craft. The exhibit does not reproduce the plant material, hand tools or workshop process."
  - question: "Where are saved designs kept?"
    answer: "The device gallery uses this browser's local storage. Export a design file or copy its share link to keep a portable version; clearing browser data can remove the local gallery."
  - question: "Will a shared design look pixel-identical on every device?"
    answer: "The link preserves the versioned design, seed, material choices, lighting and camera. Graphics hardware, browser rendering and viewport size can still change the exact pixels."
  - question: "Can I use the exhibit without sound or animation?"
    answer: "Yes. Sound starts off, the sculpture is still, and reduced-motion preferences are respected. A static poster and the article remain available when interactive rendering cannot run."
---

<script>
	import MrinmoyeeAtelier from '$lib/components/visualizations/mrinmoyee/MrinmoyeeAtelier.svelte';
</script>

<MrinmoyeeAtelier />

<p><small>Published <time datetime="2026-10-20">20 October 2026</time> · Updated <time datetime="2026-10-20">20 October 2026</time></small></p>

<noscript>
	<figure>
		<img
			src="/images/visualizations/mrinmoyee/mrinmoyee-poster.jpg"
			alt="The default Durga composition: a vermilion sari, ivory-white crown, layered ornament, lion and warm lamp light"
			width="1200"
			height="1050"
			loading="eager"
			decoding="async"
		/>
		<figcaption>
			Shola and Vermilion, the atelier's opening composition. Enable JavaScript to customise the sculpture; the explanation and cultural references remain readable below.
		</figcaption>
	</figure>
</noscript>

<TTS />

# A face before a spectacle

There is a moment in front of a Durga image when the surrounding decoration recedes. The crown may be enormous; the lamps may turn every piece of ornament into a small sun. Yet the eyes hold the room together. Without that centre, more ornament gives us only more ornament.

Mrinmoyee begins there. The opening composition places a still figure in warm darkness, with a vermilion sari, pale layered crown and a lion beside the pedestal. You can stay with that first view, or open the tools and begin changing it. The ambition is a sculpture that remains recognisable through each decision: clay or bronze, daylight or lamps, a quiet setting or a more elaborate pavilion.

The name invokes an image made of earth. The digital object has no earth in it, of course. That distance between the material being evoked and the machinery doing the evoking is part of the work.

# A living art, with many makers

Durga Puja joins image-making, music, temporary architecture and public gathering. UNESCO's account of [Durga Puja in Kolkata](https://ich.unesco.org/en/RL/durga-puja-in-kolkata-00703) situates the festival within a living collaborative practice, inscribed on its Representative List in 2021. Its [documentary record](https://www.unesco.org/archives/multimedia/document-5613) describes unfired-clay images alongside drumming and large installations. The image belongs to a wider world of people, labour and seasonal return.

This atelier borrows an invitation from that world: pay attention to how an image is made and how a setting changes the encounter with it. Its six compositions are studio interpretations. **Kumartuli Atelier** draws attention to earth and workshop light. **Shola and Vermilion** sets red cloth against ivory-white ornament. **Golden Evening** gathers warmth around marigolds and lamps. **Terracotta Reverie** gives grazing light to the folds. **Moonlit Silver** pairs cool indigo with small warm accents. **Contemporary Pandal** gives the figure a more architectural frame.

These are designed starting points. Choosing one does not reconstruct a named workshop, a particular year's pandal or a historical object.

# Ten arms and a chosen composition

The sculpture uses ten arms, arranged to keep the face readable and the held attributes distinct: trident, sword, discus, conch, bow, arrow, mace, lotus, axe and shield. This is the atelier's artistic arrangement, not a claim that every Durga image should follow it.

Historical works show why that distinction matters. The Metropolitan Museum's [twelfth-century Bengal sculpture of Durga slaying Mahisha](https://www.metmuseum.org/art/collection/search/38583) has sixteen arms. Its compact stone form is a specific work, with its own scale, material and composition. It offers a useful reference for how multiple arms can organise a sculpture's energy; it does not certify the arrangement used here.

The digital figure is an original studio homage. Its simplified presentation leaves out the larger family tableau and narrative complexity encountered in many devotional settings. It should be approached as an artwork to compose, rather than an authoritative account of worship or iconography.

# Shape, surface and surroundings

Three kinds of decision meet in the finished image.

**Shape** establishes volume and attachment. The head, torso, arms, hands, cloth folds and crown occupy space. Moving the camera reveals their relationship. A colour change cannot repair a weak silhouette, and a light cannot supply a missing connection.

**Surface** determines how that shape receives light. Clay disperses a highlight differently from brass. A rough surface spreads reflected light; a smoother metallic one gathers brighter reflections. The material choices are graphics interpretations of those qualities. They do not calculate the chemistry of earth, stone or an alloy.

**Surroundings** decide where attention settles. The halo, pedestal, flowers, lamps, backdrop and camera all contribute to the composition. Lowering ornament density may make the face feel stronger. Cooling the main light can make a small lamp seem warmer without changing its colour.

Try making one change at a time. Keep the camera fixed while comparing materials; keep the material fixed while moving the light. The result is easier to understand when a single decision has room to announce itself.

# From clay to celebration

The making-stage control reveals a simplified progression: framework, clay, paint, cloth, ornament and the complete illuminated composition. It exposes layers of the digital artwork and gives each one a little space.

That sequence is an artistic presentation. Real making includes skills, materials, waiting, repairs and relationships that a slider cannot contain. Nor does selecting the painted stage reproduce a ritual act. The value of the sequence is more modest: it helps us notice how much structure remains beneath the final decoration.

The white crown is similarly described as **shola-inspired**. Its digital curves evoke delicacy and layered filigree. They do not reproduce the plant material or the hand that cuts it.

# Keep a decision, explore the rest

Lock a face when it feels right. Lock the pose if the silhouette is working. Keep the sari while exploring other crowns, or keep the setting while changing the figure's materials. A variation is repeatable, and the locks preserve their selected groups.

The device gallery holds named designs in this browser. A design file or share link carries the versioned settings, including the camera, beyond that gallery. Clearing browser data can remove local saves, so use one of those portable forms for a composition you want to retain.

An exported image records the current view. Its framing is another artistic choice: the whole sculpture tells one story; a face and crown tell another. The stored settings reproduce the intended composition, although different screens and graphics hardware may produce slightly different pixels.

Sound is optional. A bell can mark a moment; silence can give it room. The sculpture itself has nowhere to hurry.
