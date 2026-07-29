<script lang="ts">
	export type PortalLink = Readonly<{
		label: string;
		href: string;
		external?: boolean;
	}>;

	let {
		kind,
		title,
		description,
		links
	}: {
		kind: 'professional' | 'writing';
		title: string;
		description: string;
		links: readonly PortalLink[];
	} = $props();
</script>

<article
	class="world-portal world-portal--{kind}"
	aria-labelledby={`world-portal-${kind}-heading`}
	data-living-card
	data-living-card-variant="portal"
	data-world-portal={kind}
>
	<div class="world-portal__underlay" aria-hidden="true">
		<span></span>
		<span></span>
		<span></span>
	</div>
	<div class="world-portal__content">
		<p class="world-portal__eyebrow">{kind === 'professional' ? 'Systems' : 'Stories'}</p>
		<h2 id={`world-portal-${kind}-heading`}>{title}</h2>
		<p class="world-portal__description">{description}</p>
		<nav aria-label={`${title} links`}>
			<ul class="world-portal__links">
				{#each links as link (link.href)}
					<li>
						<!-- Internal hrefs are resolved by the route; this component also accepts external links. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={link.href}
							target={link.external ? '_blank' : undefined}
							rel={link.external ? 'noopener noreferrer' : undefined}
						>
							{link.label}<span aria-hidden="true"> ↗</span>
							{#if link.external}<span class="sr-only">, opens in a new tab</span>{/if}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</article>
