<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ProfessionalProject } from '$lib/content/professional-projects';

	type WorkSample = Pick<
		ProfessionalProject,
		'id' | 'name' | 'context' | 'detail' | 'status' | 'link' | 'image'
	>;
	let { projects }: { projects: readonly WorkSample[] } = $props();

	const summaries: Partial<Record<ProfessionalProject['id'], string>> = {
		visualizations:
			'Science, mathematics and computing, made explorable. Change a variable. Follow an unexpected result.',
		'living-pigment-studio':
			'A browser canvas for pigments that spread, mix and dry. A creative approximation of paint, with room for happy accidents.',
		'editorial-publishing-system':
			'The quiet machinery behind this site: a home for long essays, curious experiments and the paths that connect them.'
	};
	const captions: Partial<Record<ProfessionalProject['id'], string>> = {
		visualizations: 'From the library / The Strange Attractor Orchestra',
		'living-pigment-studio': 'A study in colour, texture and possibility',
		'editorial-publishing-system': 'From a first draft to a reader’s next discovery'
	};
</script>

<section class="fieldbook-work" aria-labelledby="fieldbook-work-heading" data-work-worlds>
	<header class="fieldbook-work__header">
		<div>
			<p class="fieldbook-work__eyebrow">01 / Made &amp; explored</p>
			<h2 id="fieldbook-work-heading">Curiosity, put to work.</h2>
		</div>
		<p class="fieldbook-work__intro">
			Some ideas need more than a page. Here are three ways I’ve given them a life of their own.
		</p>
	</header>
	<ol class="fieldbook-work__list" aria-label="Selected independent work">
		{#each projects as project, index (project.id)}
			<li>
				<article
					class="fieldbook-project"
					aria-labelledby={`work-sample-${project.id}`}
					data-work-sample={project.id}
					data-work-project={project.id}
				>
					<figure class="fieldbook-project__figure">
						<div
							class="fieldbook-project__media"
							class:fieldbook-project__media--orchestra={project.id === 'visualizations'}
						>
							{#if project.image}
								<img
									src={project.image.src}
									alt={project.image.alt}
									width={project.image.width}
									height={project.image.height}
									loading="lazy"
									decoding="async"
								/>
							{:else if project.id === 'editorial-publishing-system'}
								<svg
									class="publishing-preview"
									viewBox="0 0 720 480"
									role="img"
									aria-labelledby="publishing-preview-title publishing-preview-description"
								>
									<title id="publishing-preview-title">The SuvroGhosh.IN publishing system</title>
									<desc id="publishing-preview-description"
										>An editorial illustration of a written idea becoming a discoverable page, from
										draft to the writing archive and a reader.</desc
									>
									<rect width="720" height="480" fill="#e9e3d5" />
									<path d="M0 418H720M46 0V480M674 0V480" stroke="#d1c8b7" />
									<g transform="rotate(-5 360 230)">
										<rect x="123" y="59" width="474" height="327" fill="#c9bfad" opacity=".32" />
										<rect x="111" y="45" width="474" height="327" fill="#f8f4e9" stroke="#c8beaa" />
										<text x="145" y="82" class="publishing-preview__masthead" fill="#263d38"
											>SuvroGhosh.IN</text
										>
										<text
											x="550"
											y="80"
											text-anchor="end"
											class="publishing-preview__issue"
											fill="#746b5e">A PLACE FOR IDEAS</text
										>
										<path d="M145 99H550" stroke="#c8beaa" />
										<text x="145" y="159" class="publishing-preview__headline" fill="#243b35"
											>An idea,</text
										>
										<text x="145" y="211" class="publishing-preview__headline" fill="#243b35"
											>made readable.</text
										>
										<path
											d="M145 237H433M145 249H409M145 261H428"
											stroke="#b1a692"
											stroke-width="3"
										/>
										<path d="M145 291H550" stroke="#c8beaa" />
										<text x="145" y="319" class="publishing-preview__footer" fill="#746b5e"
											>ESSAYS / EXPERIMENTS / EVERYDAY LIFE</text
										>
										<circle cx="533" cy="239" r="26" fill="#b34d30" />
										<path d="M520 239H546M533 226V252" stroke="#f8f4e9" stroke-width="1.5" />
									</g>
									<g fill="#263d38" class="publishing-preview__step">
										<text x="134" y="451">01 DRAFT</text>
										<text x="315" y="451">02 DISCOVER</text>
										<text x="535" y="451">03 READ</text>
									</g>
									<path d="M230 446H290M459 446H511" fill="none" stroke="#b34d30" />
									<path d="m284 442 6 4-6 4m221-8 6 4-6 4" fill="none" stroke="#b34d30" />
								</svg>
							{/if}
						</div>
						<figcaption>
							<span>{String(index + 1).padStart(2, '0')}</span><span
								>{captions[project.id] ?? project.context}</span
							>
						</figcaption>
					</figure>
					<p class="fieldbook-project__status">{project.status ?? project.context}</p>
					<h3 id={`work-sample-${project.id}`}>{project.name}</h3>
					<p class="fieldbook-project__description">{summaries[project.id] ?? project.detail}</p>
					{#if project.link?.kind === 'internal'}
						<a class="fieldbook-project__link" href={resolve(project.link.href)}
							>{project.link.label} <span aria-hidden="true">↗</span></a
						>
					{:else if project.link?.kind === 'external'}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							class="fieldbook-project__link"
							href={project.link.href}
							target="_blank"
							rel="noopener noreferrer"
							>{project.link.label} <span aria-hidden="true">↗</span><span class="sr-only"
								>, opens in a new tab</span
							></a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}
				</article>
			</li>
		{/each}
	</ol>
	<div class="fieldbook-work__footer">
		<p>Built with care. Open to exploration.</p>
		<a href={resolve('/projects')}>More work &amp; experiments <span aria-hidden="true">↗</span></a>
	</div>
</section>

<style>
	.fieldbook-work {
		min-width: 0;
		color: var(--fb-ink, var(--ink));
	}
	.fieldbook-work__header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.55fr);
		gap: 2rem;
		align-items: end;
		margin-bottom: clamp(1.8rem, 3.5vw, 3rem);
	}
	.fieldbook-work__eyebrow {
		margin: 0 0 1rem;
		color: var(--fb-accent, var(--accent));
		font-family: var(--fb-mono, var(--font-mono));
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.fieldbook-work h2 {
		margin: 0;
		font-family: var(--fb-serif, var(--font-serif));
		font-size: clamp(2.4rem, 4.5vw, 4.7rem);
		font-weight: 450;
		letter-spacing: -0.055em;
		line-height: 0.98;
		text-wrap: balance;
	}
	.fieldbook-work__intro {
		max-width: 25rem;
		margin: 0 0 0.15rem;
		color: var(--fb-muted, var(--ink-muted));
		font-family: var(--fb-sans, var(--font-sans));
		font-size: 0.93rem;
		line-height: 1.65;
		text-align: left;
	}
	.fieldbook-work__list {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: clamp(1.25rem, 2.5vw, 2.5rem);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.fieldbook-work__list > li,
	.fieldbook-project {
		min-width: 0;
	}
	.fieldbook-project__figure {
		margin: 0 0 1.8rem;
	}
	.fieldbook-project__media {
		aspect-ratio: 3 / 2;
		overflow: hidden;
		border: 1px solid var(--fb-rule, var(--rule));
		background: var(--fb-surface, var(--paper-raised));
	}
	.fieldbook-project__media img,
	.publishing-preview {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.fieldbook-project__media--orchestra {
		background: #0b1112;
	}
	.fieldbook-project__media--orchestra img {
		object-fit: contain;
	}
	.fieldbook-project figcaption {
		display: flex;
		gap: 0.65rem;
		align-items: baseline;
		margin-top: 0.65rem;
		color: var(--fb-muted, var(--ink-muted));
		font-family: var(--fb-mono, var(--font-mono));
		font-size: 0.57rem;
		line-height: 1.6;
	}
	.fieldbook-project figcaption > span:first-child {
		color: var(--fb-accent, var(--accent));
	}
	.fieldbook-project__status {
		margin: 0 0 0.7rem;
		color: var(--fb-teal, var(--accent));
		font-family: var(--fb-mono, var(--font-mono));
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.fieldbook-project h3 {
		max-width: 20ch;
		margin: 0;
		font-family: var(--fb-serif, var(--font-serif));
		font-size: clamp(1.55rem, 2.5vw, 2.5rem);
		font-weight: 500;
		letter-spacing: -0.035em;
		line-height: 1.08;
		text-wrap: balance;
	}
	.fieldbook-project__description {
		margin: 1rem 0 0.7rem;
		color: var(--fb-muted, var(--ink-muted));
		font-family: var(--fb-sans, var(--font-sans));
		font-size: 0.86rem;
		line-height: 1.7;
		text-align: left;
	}
	.fieldbook-project__link,
	.fieldbook-work__footer a {
		display: inline-flex;
		min-height: 2.75rem;
		gap: 0.6rem;
		align-items: center;
		color: var(--fb-ink, var(--ink));
		font-family: var(--fb-sans, var(--font-sans));
		font-size: 0.76rem;
		font-weight: 600;
		text-decoration-color: var(--fb-rule, var(--rule));
		text-underline-offset: 0.35rem;
		transition: color 160ms ease;
	}
	.fieldbook-project__link > span,
	.fieldbook-work__footer a > span {
		color: var(--fb-accent, var(--accent));
		font-size: 1rem;
	}
	.fieldbook-project__link:hover,
	.fieldbook-work__footer a:hover {
		color: var(--fb-accent, var(--accent));
	}
	.fieldbook-work a:focus-visible {
		outline: 2px solid var(--fb-accent, var(--focus));
		outline-offset: 0.3rem;
	}
	.fieldbook-work__footer {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		margin-top: 2rem;
		border-top: 1px solid var(--fb-rule, var(--rule));
		padding-top: 0.75rem;
	}
	.fieldbook-work__footer p {
		margin: 0;
		color: var(--fb-muted, var(--ink-muted));
		font-family: var(--fb-serif, var(--font-serif));
		font-size: 1rem;
		font-style: italic;
	}
	.publishing-preview__masthead {
		font-family: var(--fb-serif, Georgia, serif);
		font-size: 24px;
		font-weight: 600;
	}
	.publishing-preview__issue,
	.publishing-preview__footer,
	.publishing-preview__step {
		font-family: var(--fb-mono, monospace);
		font-size: 10px;
		letter-spacing: 1.5px;
	}
	.publishing-preview__headline {
		font-family: var(--fb-serif, Georgia, serif);
		font-size: 56px;
		letter-spacing: -2px;
	}
	.publishing-preview__step {
		font-size: 12px;
		font-weight: 500;
	}
	@media (max-width: 56rem) {
		.fieldbook-work__header {
			grid-template-columns: minmax(0, 1fr);
			gap: 1rem;
		}
		.fieldbook-work__intro {
			max-width: 35rem;
		}
		.fieldbook-work__list {
			grid-template-columns: minmax(0, 1fr);
			gap: 2rem;
		}
		.fieldbook-project {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			column-gap: 1.5rem;
			align-content: start;
		}
		.fieldbook-project__figure {
			grid-row: 1 / 5;
			margin: 0;
		}
		.fieldbook-project__status {
			margin-top: 0.25rem;
		}
		.fieldbook-project__link {
			justify-self: start;
		}
	}
	@media (max-width: 38rem) {
		.fieldbook-work__list {
			gap: 2.8rem;
		}
		.fieldbook-project {
			display: block;
		}
		.fieldbook-project__figure {
			margin-bottom: 1.2rem;
		}
		.fieldbook-project h3 {
			max-width: 23ch;
			font-size: 2rem;
		}
		.fieldbook-project__description {
			max-width: 42ch;
			margin-top: 0.8rem;
			font-size: 0.88rem;
		}
		.fieldbook-work__footer {
			align-items: start;
			flex-direction: column;
			gap: 0.15rem;
			padding-top: 1rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fieldbook-work a {
			transition: none;
		}
	}
</style>
