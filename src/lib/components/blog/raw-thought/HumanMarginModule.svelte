<script lang="ts">
	let { type }: { type: 'timeline' | 'alignment' | 'corruption' | 'threats' | 'method' } = $props();
</script>

{#if type === 'timeline'}
	<section
		class="hm-live-module hm-timeline"
		aria-label="Healthcare AI inflection timeline"
		data-tts-exclude
		data-pagefind-ignore
	>
		<p class="hm-module-title">A long arrival</p>
		<ol>
			<li><strong>1960s</strong><span>Computational diagnosis enters medical research.</span></li>
			<li>
				<strong>MYCIN</strong><span>Rule-based expertise shows both promise and limits.</span>
			</li>
			<li>
				<strong>Winters</strong><span>Hype, disappointment, and funding retreat repeat.</span>
			</li>
			<li>
				<strong>Now</strong><span>Usable systems reach practice faster than evaluation.</span>
			</li>
		</ol>
	</section>
{:else if type === 'alignment'}
	<section
		class="hm-live-module hm-alignment"
		aria-label="Healthcare AI incentive alignment ledger"
		data-tts-exclude
		data-pagefind-ignore
	>
		<p class="hm-module-title">Alignment ledger</p>
		<table aria-label="Different positions in a healthcare AI decision">
			<thead>
				<tr class="hm-ledger-head">
					<th scope="col">Position</th>
					<th scope="col">Primary pressure</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<th scope="row">Vendors / investors</th>
					<td>Products and returns</td>
				</tr>
				<tr>
					<th scope="row">Administrators</th>
					<td>Cost and operation</td>
				</tr>
				<tr>
					<th scope="row">Clinicians</th>
					<td>Tools that help</td>
				</tr>
				<tr class="hm-ledger-consequence">
					<th scope="row">Patients</th>
					<td>To live</td>
				</tr>
			</tbody>
		</table>
	</section>
{:else if type === 'corruption'}
	<section
		class="hm-live-module hm-corruption-evidence"
		aria-hidden="true"
		data-tts-exclude
		data-pagefind-ignore
	>
		<p class="hm-module-title">Evidence field</p>
		<blockquote>The AI does not understand human corruption.</blockquote>
		<ol>
			<li><span>01</span><strong>Wrong metrics</strong></li>
			<li><span>02</span><strong>Existing biases</strong></li>
			<li><span>03</span><strong>Opaque systems</strong></li>
			<li><span>04</span><strong>Algorithmic objectivity</strong></li>
		</ol>
	</section>
{:else if type === 'threats'}
	<section
		class="hm-live-module hm-threats"
		aria-label="Healthcare AI attack-surface sequence"
		data-tts-exclude
		data-pagefind-ignore
	>
		<p class="hm-module-title">Four ways the record bends</p>
		<ol>
			<li>
				<span>01</span><strong>Adversarial input</strong><small>Manipulate what enters.</small>
			</li>
			<li>
				<span>02</span><strong>Dataset corruption</strong><small>Alter what the model learns.</small
				>
			</li>
			<li>
				<span>03</span><strong>PHI misuse</strong><small>Exploit what the system knows.</small>
			</li>
			<li class="hm-threat-consequence">
				<span>04</span><strong>Healthcare crime</strong><small>Turn opacity into human harm.</small>
			</li>
		</ol>
	</section>
{:else}
	<section
		class="hm-live-module hm-method-rings"
		aria-label="Concentric writing method"
		data-tts-exclude
		data-pagefind-ignore
	>
		<p class="hm-module-title">Concentric method</p>
		<ol>
			<li><span>01</span><strong>Human stakes</strong></li>
			<li><span>02</span><strong>System context</strong></li>
			<li><span>03</span><strong>Domain detail</strong></li>
			<li><span>04</span><strong>Validation and limits</strong></li>
		</ol>
	</section>
{/if}
