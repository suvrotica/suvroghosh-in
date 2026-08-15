<script lang="ts">
	import { onMount } from 'svelte';

	const stations = [
		{ id: 'receive', number: '01', label: 'Receive', action: 'queue' },
		{ id: 'verify', number: '02', label: 'Verify', action: 'delay' },
		{ id: 'review', number: '03', label: 'Review', action: 'redirect' },
		{ id: 'request', number: '04', label: 'More information', action: 'request' },
		{ id: 'release', number: '05', label: 'Release', action: 'release' }
	] as const;

	let machine: HTMLDivElement;
	let active = $state(false);

	onMount(() => {
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				active = entries[0]?.isIntersecting ?? false;
			},
			{ rootMargin: '12% 0px', threshold: 0.08 }
		);
		observer.observe(machine);
		return () => observer.disconnect();
	});
</script>

<div
	bind:this={machine}
	class="patient-machine"
	data-patient-machine-trace
	data-machine-active={active}
	aria-hidden="true"
>
	<span class="patient-machine__route patient-machine__route--forward"></span>
	<span class="patient-machine__route patient-machine__route--return"></span>
	<span class="patient-machine__signal"></span>

	<ol class="patient-machine__stations">
		{#each stations as station (station.id)}
			<li
				class="patient-machine__station patient-machine__station--{station.action}"
				data-machine-station={station.id}
				data-machine-action={station.action}
			>
				<span class="patient-machine__station-number">{station.number}</span>
				<span class="patient-machine__station-node"></span>
				<span class="patient-machine__station-label">{station.label}</span>
			</li>
		{/each}
	</ol>
</div>
