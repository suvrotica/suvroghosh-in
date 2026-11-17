---
title: "Exploded Human Skull Museum"
seoTitle: "Exploded Human Skull: Interactive 3D Osteology Exhibit"
description: "Interactive 3D Beauchene osteology exhibit of the 22 cranial and facial bones, associated hyoid, and permanent teeth with anatomical explosion controls."
date: "2026-11-17"
published: true
category: "Visualizations"
interactiveFirst: true
immersiveLead: true
thumbnail: "/images/visualizations/exploded-human-skull/social.png"
thumbnailAlt: "Interactive 3D exploded human skull osteology exhibit showing separate ivory cranial and facial bones suspended against a dark museum background."
tags: ["Osteology","Human Anatomy","Cranial Bones","Facial Skeleton","Beauchene Skull","Three.js","3D Visualization","BodyParts3D","Scientific Visualization","Computational Design"]
pinnedTags:
  - "Osteology"
  - "Human Anatomy"
  - "Cranial Bones"
  - "Facial Skeleton"
  - "Beauchene Skull"
  - "Three.js"
  - "3D Visualization"
  - "BodyParts3D"
  - "Scientific Visualization"
inPlainEnglish: "Instead of a single fused white shell, the human skull is an interlocking vault and facial scaffold built from twenty-two distinct bones joined by serrated sutures plus a freely swinging lower jaw. Dragging the explosion slider translates every bone outward from its true sutural seat along anatomical axes so hidden deep bones—the sphenoid, ethmoid, palatines, conchae, and vomer—step into plain view."
keyTerms: ["Neurocranium", "Viscerocranium", "Beauchene preparation", "Cranial sutures", "Sphenoid bone", "Ethmoid bone", "Mandible", "Hyoid bone", "Foramen magnum", "Zygomatic arch"]
faq:
  - question: "How many bones are modeled in the Exploded Human Skull exhibit?"
    answer: "All twenty-two bones of the human skull proper—eight neurocranial bones and fourteen facial bones including the movable mandible—plus the anatomically associated hyoid bone (toggleable separately) and twenty-eight permanent teeth anchored to the maxillae and mandible."
  - question: "What is the scientific source of the 3D bone geometry?"
    answer: "Each bone mesh is segmented directly from the BodyParts3D version 4.0 anatomical dataset published by the Database Center for Life Science (DBCLS) under CC BY 4.0."
  - question: "Does the 3D viewer distinguish patient anatomical left and right?"
    answer: "Yes. Following BodyParts3D anatomical convention, positive X is the patient's anatomical left (which sits on your right in an anterior view), positive Y is superior, and positive Z is anterior. Both bone names and the interactive orientation compass enforce this convention."
---

<script>
	import ExplodedSkullMuseum from '$lib/components/visualizations/exploded-skull/ExplodedSkullMuseum.svelte';
</script>

<ExplodedSkullMuseum />

<noscript>
	<figure class="my-6">
		<img
			src="/images/visualizations/exploded-human-skull/poster.png"
			alt="Exploded Human Skull interactive 3D museum specimen showing separated neurocranial and facial bones"
		/>
		<figcaption>
			Interactive WebGL and JavaScript are required for 3D bone manipulation and exploded assembly.
		</figcaption>
	</figure>
</noscript>

<TTS />

In the teaching cabinets of nineteenth-century medical schools, anatomists faced a paradox whenever they held up a human skull. From the outside, an intact adult cranium reads like a single sculpted shell protecting the brain, orbits, and upper airway. Yet the skull is in fact a spherical arch built out of twenty-two tightly dovetailed plates, buttresses, scrolls, and fragile laminae—several of which hide almost completely behind the face and cranial vault once the sutures fuse in childhood.

Claude Edme Beauchêne solved that optical puzzle in Paris in the early 1800s by boiling an unossified young adult cranium along its sutural lines until every plate parted cleanly, then suspending each detached bone on hinged brass arms around a common center. Turn a thumbscrew on a physical Beauchêne preparation and the orbital roofs rise, the malar cheek arches swing laterally, and the butterfly-shaped sphenoid emerges from behind the face like the keystone of a Gothic vault.

## Reading the Vault and the Face Separately

Traditional osteology divides the skull proper into two functional envelopes before adding a single movable joint below them:

1. **Neurocranium (8 bones):** The unpaired frontal, occipital, sphenoid, and ethmoid, paired with the left and right parietal and temporal bones. Together they enclose the cranial cavity across three terraced fossae and form the scalloped coronal, sagittal, lambdoid, and squamous sutures visible as subtle darkened seams on the bone surface.
2. **Viscerocranium (14 bones including the mandible):** Paired maxillae, zygomatics, nasals, lacrimals, palatines, and inferior nasal conchae flanking the midline vomer, with the movable mandible articulating below at the paired temporomandibular joints (TMJ). In the **Facial Skeleton** preset, these fourteen bones project outward along tiered anterior-lateral vectors so internal nasal structures—such as the L-shaped palatine plates and scrolled inferior conchae—can be inspected without occluding meshes.
3. **Associated hyoid and permanent dentition:** Although routinely displayed beneath the jaw in anatomical teaching collections, the **hyoid bone** does not form an osseous suture with the skull proper; it floats in the anterior neck suspended by ligaments from the temporal styloid processes. For strict anatomical accuracy it appears here as an optional associated structure you can toggle into or out of the mount, while twenty-eight permanent teeth move rigidly inside their respective maxillary and mandibular alveolar sockets. *(Consistent with the underlying BodyParts3D reference dataset, unerupted or third molar wisdom teeth are absent.)*

## Provenance &amp; Computational Design

Rather than splitting a hollow sculptural head into arbitrary geometric slices or building primitives from approximations, every bone in this exhibit uses authentic segmented surface geometry extracted from [BodyParts3D](https://lifesciencedb.jp/bp3d/) (© The Database Center for Life Science, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). During offline packing, each closed watertight bone shell (`0%` open boundary edges) receives an analytical `_suture` surface-proximity vertex attribute measured against its adjacent skull bones, allowing sutural seams to be darkened cleanly in GLSL without duplicating geometry or baking away lighting detail.

Every explosion preset and direction mode (**Anatomical**, **Radial**, **Superior–Inferior**, **Anterior–Posterior**, and **Left–Right**) evaluates a stateless reference-anchored displacement relative to the assembled sutural seat (`1 scene unit = 100 mm`), ensuring bones re-seat cleanly at `0%` without numerical drift and obey **Compare Assembled** instantly from any isolated state or custom study layout.

If you would like to explore other three-dimensional and mathematical exhibits across biology, optics, and generative form, visit the full [Visualizations gallery](/blog/visualizations).
