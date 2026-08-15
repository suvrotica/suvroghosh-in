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
		capabilities = [],
		links
	}: {
		kind: 'professional' | 'creative';
		title: string;
		description: string;
		capabilities?: readonly string[];
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
		<p class="world-portal__eyebrow">
			{kind === 'professional' ? 'Systems' : 'Stories & experiments'}
		</p>
		<h3 id={`world-portal-${kind}-heading`}>{title}</h3>
		<p class="world-portal__description">{description}</p>
		{#if capabilities.length > 0}
			<ul class="world-portal__capabilities" aria-label={`${title} areas`}>
				{#each capabilities as capability (capability)}
					<li>{capability}</li>
				{/each}
			</ul>
		{/if}
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
							{link.label}<span aria-hidden="true"> {link.external ? '↗' : '→'}</span>
							{#if link.external}<span class="sr-only">, opens in a new tab</span>{/if}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</article>
