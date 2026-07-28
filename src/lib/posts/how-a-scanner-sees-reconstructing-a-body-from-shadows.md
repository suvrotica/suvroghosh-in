---
title: "How a Scanner Sees: Reconstructing a Body from Shadows"
description: "Paint a synthetic CT phantom, collect X-ray projections, and rebuild it with back-projection and filtered back-projection."
date: "2026-07-26"
dateModified: "2026-07-28"
thumbnail: "/images/visualizations/how-a-scanner-sees-ct-reconstruction.webp"
thumbnailAlt: "Synthetic CT laboratory showing an editable cross-sectional phantom, a sinogram, and grayscale back-projection and filtered back-projection images"
category: "Visualizations"
tags: ["CT","Medical Imaging","Image Reconstruction","Fourier Transform","Interactive Mathematics","Healthcare","Radon Transform","Sinogram","Filtered Back-Projection","Signal Processing"]
pinnedTags: ["CT", "Medical Imaging", "Image Reconstruction", "Fourier Transform", "Interactive Mathematics", "Healthcare", "Radon Transform", "Sinogram", "Filtered Back-Projection", "Signal Processing"]
published: true
interactiveFirst: true
color: "#164E63"
author: "Suvro Ghosh"
readingTime: "21 min"
inPlainEnglish: "A CT detector records how much each X-ray beam is weakened, not which organ the beam crossed. This laboratory collects those one-dimensional measurements from many angles, arranges them as a sinogram, and reconstructs a synthetic cross-section so that blur, noise, missing angles, and metal streaks can be examined rather than merely named."
keyTerms: ["Attenuation", "Projection", "Detector bin", "Radon transform", "Sinogram", "Back-projection", "Convolution", "Ramp filter", "Missing wedge", "Photon starvation"]
faq:
  - question: "Why does a CT scanner need many angles?"
    answer: "One projection reports total attenuation along each ray but cannot say where along that ray the attenuation occurred. Measurements from many directions intersect those possibilities and constrain the two-dimensional image; too few directions leave characteristic angular streaks."
  - question: "Why is ordinary back-projection blurry?"
    answer: "Ordinary back-projection spreads every measured detector value along the whole line that could have produced it. Adding many such smeared lines localises structure, but it also overemphasises low spatial frequencies and leaves a broad haze around edges."
  - question: "What is a sinogram?"
    answer: "A sinogram is the stack of one-dimensional projection profiles acquired at successive angles. In this laboratory, detector position runs across one axis and projection angle along the other; an off-centre point traces a sinusoidal path through the image."
  - question: "Why does low dose increase noise?"
    answer: "Lower incident photon counts make random counting fluctuations a larger fraction of the measurement. The negative logarithm used to recover attenuation magnifies that uncertainty when few photons survive, so the reconstruction becomes mottled and streak-prone."
  - question: "Why does metal create streaks?"
    answer: "Metal can leave some detector bins with very few photons and can change a polychromatic beam's spectrum in a strongly nonlinear way. Those corrupted projections are inconsistent with the simple monoenergetic line-integral model, and filtered back-projection spreads the inconsistency across the image as bright and dark streaks."
  - question: "Why are 180 degrees enough in this model?"
    answer: "For ideal two-dimensional parallel-beam geometry, a ray measured after a further 180-degree rotation repeats the same line in the opposite direction, with detector position reversed. The second half-turn is therefore redundant apart from sampling and noise."
  - question: "Is this the same reconstruction used by every clinical scanner?"
    answer: "No. The laboratory demonstrates two-dimensional parallel-beam back-projection and filtered back-projection. Clinical systems may use fan-beam, cone-beam or helical geometry, calibration and correction pipelines, proprietary filters, and iterative or learned reconstruction methods."
  - question: "Does this simulation use real patient data?"
    answer: "No. Every image begins as synthetic circles, ellipses, brush strokes, and illustrative material values created inside the browser. The laboratory neither accepts patient images nor produces a diagnostic result."
---

<script>
	import CTReconstructionLab from '$lib/components/visualizations/ct-reconstruction/CTReconstructionLab.svelte';
</script>

<style>
	:global(.article-prose .math-display) {
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		padding-block: 0.2rem;
		overscroll-behavior-inline: contain;
	}
</style>

An X-ray detector sees how much of each beam survived—not the rib, kidney, or lesion it crossed—so this laboratory lets many such synthetic shadows become a cross-section.

<CTReconstructionLab />

> **What to try first**
>
> Press **Start scan**, then try the **Few views** guide. Compare ordinary back-projection with the filtered result; use **Step** when you want to inspect how one more batch of angles changes both images.

<TTS />

CT repeats one modest measurement from many directions and then performs a mathematically disciplined form of gossip. Each number is ignorant on its own. Together, the measurements constrain a cross-section.

Paint a synthetic object, start the scan, and follow one ray from source to detector. Its value enters a projection profile; the profile becomes one row of a sinogram; the growing collection is smeared backwards into one reconstruction and filtered before being smeared into another. Changing the reconstruction filter reuses the collected sinogram; it does not pretend to expose the object to another scan. The reference phantom remains visible because this simulation knows the answer, although a real scanner does not.

# A body made from shadows

The editable circle is an **attenuation map**, often called a phantom in imaging research. Every pixel stores an illustrative coefficient describing how strongly that location weakens the beam. Air weakens it very little. Soft tissue, bone, synthetic lesions, and metal receive progressively or distinctively different values so that their consequences can be seen.

None of those labels tells the reconstruction algorithm what anatomy ought to look like. To the forward projector, they are numbers on a grid. A painted ellipse called “bone” is not recognised as a bone; it simply contributes more attenuation when a ray crosses it. A lesion is a contrast target, not a diagnosis. Metal is available both as a material and as a preset because its extreme attenuation reveals where the ideal model begins to break.

The editor separates the **editable phantom** from the **committed phantom** being scanned. This matters. If a brush stroke changed pixels halfway through acquisition, early and late projections would describe different objects. Real patient motion creates a related inconsistency, but accidental interface motion is not a useful way to teach it. Commit or restart the scan, and the complete set of angles again describes one frozen synthetic object.

The circular field of view also supplies a clean coordinate system. Points outside it are treated as air. Circles, ellipses, and brush strokes are rasterised onto a finite grid, so the apparently smooth object is already a numerical approximation before the first virtual photon is counted.

# What one detector row actually measures

At one angle, the parallel-beam scanner sends a family of straight, mutually parallel rays through the phantom. Each ray arrives at one **detector bin**. The bin reports the total attenuation accumulated along that line:

$$
p_\theta(s)=\int \mu(x,y)\,dt.
$$

Here:

- $p_\theta(s)$ is the line integral recorded at projection angle $\theta$ and detector position $s$.
- $\theta$ is the direction from which the object is viewed.
- $s$ locates one bin along the detector line.
- $\mu(x,y)$ is the attenuation coefficient at the two-dimensional point with coordinates $x$ and $y$.
- $t$ measures distance along the ray.
- The integral sign means “add the local attenuation all along this path.”

One detector number therefore contains no address for the material that produced it. A value of 0.8 could come from a short crossing through dense material, a longer crossing through softer material, or several separated structures. That loss of position along the ray is not a software defect. It is the reason another angle is needed.

The acquisition panel draws only a representative bundle of rays. Calculating a projection may involve many more detector bins and many sampling points along every ray, but a thicket of hundreds of animated lines would obscure the geometry it is meant to explain. The highlighted ray links one point on the projection curve to its path through the phantom and its destination in the current sinogram row.

Numerically, the projector samples $\mu$ at short intervals along each line and adds the samples with the appropriate distance factor. Interpolation estimates values between grid centres. Smaller steps and a finer phantom grid reduce discretisation error, but never abolish it; the simulation remains a finite calculation of a continuous integral.

# The negative logarithm

The ideal line integral is not what a photon counter receives directly. In a simple monoenergetic model, the intensity leaving the object obeys the Beer–Lambert relation:

$$
I=I_0e^{-p}.
$$

In this expression:

- $I_0$ is the incident intensity, or the photon count expected before the ray enters the object.
- $I$ is the intensity or count that survives to the detector.
- $p$ is the total line integral of attenuation for that ray.
- $e$ is the base of the natural exponential.
- The minus sign says that increasing attenuation decreases the surviving intensity.

The scanner wants the additive quantity $p$, because contributions from successive pieces of material then add along a ray. Rearranging the same relation gives:

$$
p=-\ln\left(\frac{I}{I_0}\right).
$$

Now $\ln$ is the natural logarithm, $I/I_0$ is the measured surviving fraction, and the leading minus sign turns a fraction below one into a positive attenuation value. If every photon survives, the ratio is one, its logarithm is zero, and the estimated line integral is zero. If only a small fraction survives, $p$ is large.

The laboratory can begin with ideal line integrals or pass them through an illustrative counting model. Photon counts are sampled with seeded randomness so that the same seed and settings reproduce the same experiment. Additional electronic noise is added separately. Counts are clamped away from zero before the logarithm because $\ln(0)$ is not finite; that numerical safeguard also points towards a physical problem. A detector bin receiving almost no photons does not contain precise information about an arbitrarily large attenuation. It contains severe uncertainty.

The **dose** control changes an incident-count proxy, not milligray and not a scanner protocol. Lowering it reduces expected counts. A fluctuation of ten photons is trivial around one million and substantial around twenty. After division and the negative logarithm, those relative fluctuations enter the sinogram as projection noise.

# The sinogram

A single projection is a one-dimensional curve: detector position on the horizontal axis, accumulated attenuation on the vertical. Rotate the beam and collect another curve. Stack those profiles in angular order and the result is a **sinogram**.

In this laboratory, detector position runs across the sinogram and projection angle runs down it. The current row is highlighted as acquisition advances. Unmeasured future rows are distinct from measured zero attenuation, and deliberately missing angles are marked as absent rather than silently painted black.

The name comes from geometry. Consider one tiny object away from the centre. As the beam rotates, the detector coordinate onto which that point projects moves smoothly from one side to the other and back again. Across angle, its trace is sinusoidal. An extended ellipse contributes a band of related curves; several structures overlap into the woven pattern that looks mysterious until one follows a selected point or ray.

A sinogram is not a decorative intermediate image. It is the measured data arranged according to acquisition geometry. Reconstruction quality cannot exceed the information and consistency present there. Sparse angles leave wide vertical gaps in angular knowledge. Low counts roughen the rows. Metal bends or breaks the simple relationship between material and line integral. Missing sectors remove a contiguous family of directions.

This is also why detector resolution and projection count are different controls. More detector bins sample each one-dimensional profile more finely. More projection angles sample the rotation more finely. One cannot generally compensate for the other.

# Smearing the shadows backward

Suppose a detector bin reports a line integral of 0.8. The measurement does not say where along the corresponding ray that attenuation occurred. **Back-projection** acknowledges the ambiguity literally: it spreads the value backwards along every pixel on that line. Repeating this for every detector bin and every angle makes consistent intersections accumulate.

The continuous idea is:

$$
f_{\mathrm{BP}}(x,y)=\int p_\theta(x\cos\theta+y\sin\theta)\,d\theta.
$$

The symbols mean:

- $f_{\mathrm{BP}}(x,y)$ is the ordinary back-projection estimate at image position $(x,y)$.
- $x$ and $y$ locate one reconstruction pixel.
- $\theta$ is a projection angle.
- $p_\theta$ is the measured detector profile at that angle.
- $x\cos\theta+y\sin\theta$ converts the image point into the detector coordinate $s$ for that viewing direction.
- $d\theta$ means that contributions are accumulated over the measured angles.

The implementation uses a finite sum rather than an infinite integral. For each acquired angle, every reconstruction pixel is mapped to a detector coordinate, the projection value there is interpolated, and that value is added to the image. Partial acquisition therefore has a meaningful partial result: after one angle there are broad stripes; as angles accumulate, their intersections begin to resemble the hidden phantom.

This operation is geometrically honest but incomplete. It uses the right rays, yet it does not correct the way repeated smearing distributes spatial frequencies.

# Why ordinary back-projection is blurred

Back-project one narrow bright feature. At the correct location, contributions from many angles meet. But each contribution also continues along its entire ray, laying a faint veil elsewhere. Summed over all directions, that veil resembles a broad radial blur. Large, slowly varying structures are overrepresented; sharp boundaries are not restored with their proper strength.

The blur is not merely the result of too few angles. With many noiseless projections, ordinary back-projection still produces a characteristic soft halo. Adding angles makes the halo smoother and the structure more recognisable, but does not supply the missing frequency correction.

The side-by-side panels are useful here. Keep the phantom, angles, detector bins, and dose fixed. Ordinary back-projection and filtered back-projection then use exactly the same sinogram. Their difference comes from the reconstruction operation, not from one image receiving better measurements.

Error metrics can summarise that comparison against the known synthetic phantom. Scale-invariant RMSE and mean absolute error report average numerical disagreement, while correlation reports how closely the overall intensity pattern varies with the reference. None is diagnostic accuracy. All are possible only because the simulation possesses a ground-truth phantom that a real scan of a living body does not.

# What the ramp filter repairs

Filtered back-projection changes each projection profile **before** spreading it back through the image. A convolution filter suppresses the excessive low-frequency blur and restores the relative contribution of edges:

$$
f_{\mathrm{FBP}}(x,y)=\int \left(h\ast p_\theta\right)(x\cos\theta+y\sin\theta)\,d\theta.
$$

Here:

- $f_{\mathrm{FBP}}(x,y)$ is the filtered back-projection estimate at image point $(x,y)$.
- $h$ is the chosen one-dimensional reconstruction filter.
- The symbol $\ast$ means convolution: each detector value is replaced by a weighted combination of neighbouring values.
- $p_\theta$ is the measured projection at angle $\theta$.
- The bracketed filtered profile is sampled at detector coordinate $x\cos\theta+y\sin\theta$.
- The angular integral adds the filtered contributions from all measured directions.

In frequency language, the ideal ramp gives larger weight to higher spatial frequencies in proportion to their frequency magnitude. That corrects the frequency response of back-projection, but real and simulated noisy data make an unlimited high-frequency boost unwise. Ram–Lak is the uncompromising ramp. Shepp–Logan, Cosine, Hann, and Hamming apply progressively different windows near the high-frequency end. The cutoff control decides how much of that end remains.

A window is therefore not a free improvement. Stronger high-frequency retention can produce crisper boundaries from clean, well-sampled data and more conspicuous grain from low-count data. A softer window can calm noise while broadening small features. The right comparison holds the sinogram fixed and changes only the filter.

> **What most explanations miss**
>
> CT reconstruction is not first recognising organs and then drawing them. In classical filtered back-projection, it is transforming measured line integrals according to geometry. Anatomy appears because the measurements constrain the image, not because the algorithm knows what a rib ought to look like.

The laboratory uses an FFT to move each detector profile into frequency space efficiently, multiply by the selected filter response, and transform it back. A forward FFT followed by its inverse should recover the original profile within floating-point tolerance. That computational shortcut changes how convolution is calculated, not what convolution means.

# Why fewer projections create spokes

Angular sampling determines how many directions constrain the image. With 180 well-distributed views, a boundary is encountered under many orientations. With 18, the reconstruction is asked to fill the large angular intervals between measured directions. Each measured view back-projects along a privileged family of lines, and those families remain visible as star-like streaks.

Increasing detector bins does not cure the problem. It can describe each acquired profile with more lateral detail, much as a finely ruled measuring stick can describe one line precisely. It cannot tell us how the object looks from an angle at which no measurement was taken.

Sparse-view artefacts are structured rather than uniform. High-contrast boundaries, especially bone or metal, launch the most visible spokes because small projection errors around a strong transition receive a large ramp-filter response. A smoother filter may soften their appearance, but it does not manufacture the missing angular information.

The projection-count control is therefore an experiment in sampling, not a quality slider with a mysterious preference for large numbers. Compute and acquisition cost rise with the number of views; angular aliasing falls. The laboratory makes that trade-off visible without claiming a clinical minimum.

# Why low dose creates noise

Photon detection is a counting process. Even with a perfectly steady source, the number arriving in a finite interval fluctuates. For an ideal Poisson count, the standard deviation grows roughly as the square root of the expected count, while the **fractional** fluctuation falls as the inverse square root. High counts are relatively stable; low counts are relatively unruly.

The negative logarithm makes the weakest transmitted rays particularly delicate. If a ray passes mostly through air, many photons survive and its ratio $I/I_0$ is measured comfortably. If it crosses dense material, few survive. A difference of several counts can then become a large difference after the logarithm. This is why noise can depend on position and why streaks may connect highly attenuating regions.

The laboratory separates three ideas:

- The relative-dose proxy changes the expected incident photon count.
- Seeded photon noise makes counting variation repeatable for comparison.
- Additional electronic noise represents detector uncertainty that is not itself Poisson counting.

Turn the dose down, keep the seed fixed, and compare filters on the same sinogram. Ramp preserves more of the noisy high-frequency content. Hann reduces it more aggressively and also softens legitimate fine edges. Neither result proves a patient protocol is safe or sufficient; the control has no calibrated relationship to patient dose.

# Why missing angles produce directional damage

Sparse views distribute omissions around the whole half-turn. A **missing wedge** removes a contiguous sector. That difference gives the artefact a direction.

Edges are represented most strongly by measurements whose rays cross them under useful orientations. When an angular sector is absent, some edge orientations lose much more evidence than others. The reconstruction may stretch structures, weaken boundaries aligned with the missing information, or create long streaks perpendicular to the best-constrained direction.

The sinogram makes the omission explicit. Missing rows are not replaced with plausible-looking measurements, because that would hide the experiment. Back-projection and filtering operate only on acquired angles, with angular weighting that reflects the coverage. At extreme settings, zero acquired angles cannot produce a meaningful reconstruction; the interface reports the condition instead of displaying numerical debris.

In ideal parallel-beam geometry, 180 degrees cover every unoriented line through the object. Rotating another 180 degrees measures the same lines in reverse, with detector coordinates swapped. That symmetry is why the laboratory scans a half-turn. Fan-beam and cone-beam systems have different completeness and weighting considerations; this model does not quietly borrow their rules.

# Why metal causes streaks

The basic forward model assumes that one attenuation map and one effective X-ray energy produce consistent line integrals. Metal challenges that assumption in two connected ways.

First, it is highly attenuating. Some rays leave so few photons that the detector measurement becomes dominated by counting uncertainty or reaches an effective floor. The logarithm cannot recover precise attenuation from almost no surviving evidence. This is **photon starvation**.

Second, real X-ray beams contain a spectrum of energies. Lower-energy photons are generally removed more readily, so the transmitted beam becomes “harder” as it crosses material. A single coefficient no longer describes the whole path. Metal makes this spectral change severe, and the measured projection can cease to behave like a simple sum of one monoenergetic attenuation map.

The optional metal model represents those mechanisms in simplified form. It evaluates a small illustrative spectrum, applies material-dependent attenuation, combines the transmitted counts, adds the chosen noise, and then performs the same negative-log conversion that assumes one effective beam. The resulting sinogram differs from the monoenergetic one **before** reconstruction. The streaks are consequences of inconsistent projection physics, not bright lines drawn over the final image.

Filtered back-projection spreads each projection discrepancy along its ray. When adjacent angles disagree strongly around metal, those errors cross the field as alternating bright and dark bands. This captures the direction and cause of a familiar artefact without claiming vendor equivalence, exact material spectra, exact Hounsfield units, or real lesion detectability.

# Educational and scientific boundary: what this laboratory deliberately leaves out

This instrument isolates the chain from a two-dimensional attenuation map to parallel projections and analytic reconstruction. That narrowness is useful. A modern clinical CT system must solve many problems that would bury the central geometry here.

The model deliberately leaves out:

- Fan-beam, cone-beam, and helical acquisition geometry.
- Three-dimensional volumes and slice interpolation.
- Real X-ray tube spectra, bow-tie filters, automatic exposure control, and calibrated dose units.
- Patient motion, cardiac and respiratory gating, scatter, detector cross-talk, dead channels, calibration drift, and geometric misalignment.
- Exact tissue composition, energy-dependent attenuation tables, Hounsfield-unit calibration, and scanner-specific kernels.
- Iterative, model-based, statistical, compressed-sensing, and learned reconstruction.
- DICOM import, patient-image upload, segmentation, lesion detection, diagnostic interpretation, and scanner-protocol advice.

The phantom grid, detector, rays, angular integral, FFT, and reconstruction grid are all finite. Interpolation and floating-point arithmetic introduce small errors. Material coefficients are illustrative rather than clinical. The dose control is relative. The polychromatic option is a teaching model designed to make nonlinearity and photon starvation visible, not a validated spectral simulator.

Those omissions do not make the experiment arbitrary. The line-integral geometry, Beer–Lambert conversion, seeded counting noise, sinogram organisation, ordinary back-projection, one-dimensional filtering, and filtered back-projection form a coherent parallel-beam model. Its claims stop at that boundary.

## Glossary

**Attenuation**  
The reduction of X-ray intensity as a beam passes through material. In the phantom, a local attenuation coefficient says how strongly a small region contributes to that reduction.

**Projection**  
The one-dimensional set of line integrals measured across the detector at one viewing angle.

**Detector bin**  
One sampled position on the detector line. It receives the beam associated with one parallel ray and records a transmitted count or intensity.

**Radon transform**  
The mathematical operation that maps a two-dimensional function to its line integrals over many positions and angles. The ideal sinogram is a sampled Radon transform of the phantom.

**Sinogram**  
The image made by stacking projection profiles by angle. Its axes are detector position and projection angle, not the $x$ and $y$ coordinates of anatomy.

**Back-projection**  
The operation of spreading each detector value backwards along the line that produced it and adding the contributions from all angles.

**Convolution**  
A weighted sliding combination of neighbouring values. CT filtered back-projection convolves each one-dimensional projection with a reconstruction filter before back-projecting it.

**Ramp filter**  
The frequency weighting that corrects the characteristic blur of ordinary back-projection by increasing the relative contribution of higher spatial frequencies.

**Missing wedge**  
A contiguous sector of projection angles that was not acquired. Its absence causes orientation-dependent loss and streaking.

**Photon starvation**  
A condition in which very few photons reach a detector bin, making the recovered line integral extremely noisy or unreliable. Dense metal is a common route to it in this teaching model.

The apparent impossibility has now been reduced to a chain of modest operations: add attenuation along lines, count what survives, take a logarithm, arrange the results by angle, filter the profiles, and return them along the paths from which they came. The final image is not a remembered body. It is the negotiated agreement of many shadows.
