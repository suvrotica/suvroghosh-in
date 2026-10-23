<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import { openPrivacySettings } from '$lib/privacy/consent';
</script>

<SEO
	title="Privacy & cookies | Suvro Ghosh"
	description="A plain-language field note on default cookieless page counts, external videos and your privacy choices on SuvroGhosh.IN."
	canonicalUrl={`${siteUrl}/privacy`}
/>

<article class="privacy-page">
	<header>
		<p class="eyebrow">THE FIELDBOOK / READER CARE</p>
		<h1>A small note<br />about <em>privacy.</em></h1>
		<p class="standfirst">
			You are here to read, explore or make something. Here is what the site remembers along the
			way, and what you can choose.
		</p>
		<button type="button" onclick={openPrivacySettings}
			>Change privacy preferences <span aria-hidden="true">↗</span></button
		>
		<p class="updated">Updated 23 October 2026</p>
	</header>
	<section>
		<span class="section-no">01</span>
		<div>
			<h2>Your choices come first</h2>
			<p>
				Vercel’s cookieless page counts run by default on public pages. The privacy controls only
				choose whether YouTube players may connect. Keeping videos paused, dismissing the notice or
				leaving the settings unchanged does not stop those page counts. Reading the site does not
				require loading external videos.
			</p>
			<p>
				The site remembers your selection in your browser’s local storage under <code
					>suvroghosh:consent</code
				>, for 180 days. The record contains your media choice, a version and save/expiry times. It
				is not a visitor identifier. Allowing and declining YouTube are remembered for the same
				period. Older saved choices retain their video permission and original expiry; their former
				analytics setting is no longer used.
			</p>
			<p>
				Use “Privacy &amp; cookies” in the footer, or the small settings button on full-screen
				public experiences, to change your mind. If storage is blocked, the choice applies in memory
				during the visit and may be requested again on reload. Vercel’s cookieless page counts do
				not require browser storage or a saved privacy choice.
			</p>
		</div>
	</section>
	<section>
		<span class="section-no">02</span>
		<div>
			<h2>The things that make the site work</h2>
			<p>
				The private Notes studio uses Supabase authentication cookies to maintain an owner’s
				sign-in. Theme, motion, reader settings, game saves and work you save locally use browser
				storage when those features need it. Public Notes can also be saved for offline reading at
				your request.
			</p>
			<p>
				These functions are separate from page counts and external video permission. Keeping videos
				paused does not erase your saved work or sign you out. Clear individual feature data through
				that feature, or remove site data in your browser.
			</p>
		</div>
	</section>
	<section>
		<span class="section-no">03</span>
		<div>
			<h2>Counting reads, approximately</h2>
			<p>
				Vercel Web Analytics records public page loads and navigations by default, without analytics
				cookies. Its own reports include approximate country, device and referrer information.
				Private Notes studio, authentication and API paths are excluded, and query strings and URL
				fragments are removed from measurement. These page counts do not depend on the video choice,
				an older analytics preference or browser storage. Blockers and Vercel’s automated-traffic
				filters can still prevent recording.
			</p>
			<p>
				The current site no longer starts the additional site-run audience collector, Speed Insights
				or custom visualization events. There is no analytics switch in the privacy controls.
			</p>
			<p>
				Earlier versions could record consented public page views in separate first-party aggregate
				reports, including approximate country, region and city. Those reports do not retain raw IP
				addresses, precise coordinates, raw user-agent strings, persistent visitor identifiers or
				individual browsing histories. The site never asks for your device’s location.
			</p>
			<p>
				Location can be wrong: VPNs, mobile networks and shared connections can point to another
				city. Page views are not a count of unique people, and failed requests can reduce totals.
			</p>
			<p>
				Retained first-party reports use a 180-day retention window, with cleanup of older buckets
				when the database retention job is configured. Only the configured owner can read or export
				them. These historical reports and Vercel’s own reports are separate; their totals are not
				added together.
			</p>
			<p>
				Vercel also processes requests to host the site and provide its services. Application-level
				aggregate choices do not imply that infrastructure logs contain no IP addresses. Vercel’s
				own processing and retention are described in its <a
					href="https://vercel.com/legal/privacy-policy"
					target="_blank"
					rel="noopener noreferrer">privacy policy</a
				>.
			</p>
		</div>
	</section>
	<section>
		<span class="section-no">04</span>
		<div>
			<h2>A pause before YouTube</h2>
			<p>
				Embedded YouTube videos show a local placeholder before media permission, without a YouTube
				player or remote thumbnail. “Load this video once” makes a one-time connection. Choosing
				remembered external-media permission lets other embedded players connect too; some videos
				still require a play action.
			</p>
			<p>
				Loading a player lets YouTube/Google receive information such as your IP address and may
				allow their cookies or storage. Their processing is described in <a
					href="https://policies.google.com/privacy"
					target="_blank"
					rel="noopener noreferrer">Google’s privacy policy</a
				>. Direct “Watch on YouTube” links leave this site and use YouTube’s own settings.
				Same-origin notebook frames are part of this site, not third-party video players.
			</p>
		</div>
	</section>
	<section>
		<span class="section-no">05</span>
		<div>
			<h2>When you join the conversation</h2>
			<p>
				Article comments ask for a display name and your words, without an email address or reader
				account. Submissions and reader replies are stored durably in the site's shared Supabase
				database for owner review. Your display name and text become public only after approval.
				Author replies can appear immediately with an Author badge.
			</p>
			<p>
				A new submission also queues an email alert to the site owner through Resend, the site's
				existing email provider. The alert contains the article title, submission time and a link to
				the private moderation board. Your display name and comment text are not included in that
				email. Delivery and retry records are stored privately in Supabase.
			</p>
			<p>
				Hiding or rejecting a comment removes it from public view but retains the submission and
				moderation history privately. Comment records contain no email address or raw IP address;
				separate short-lived salted counters help limit repeated submissions. Comments do not use a
				browser-local comment database. Text kept in an open form after a connection failure can be
				lost when you leave or reload the page.
			</p>
			<p>
				To request removal of a stored comment, use the <a href={resolve('/contact')}
					>contact form</a
				> with the article link, display name and approximate posting date. Hiding cannot recall text
				already viewed or copied.
			</p>
		</div>
	</section>
	<section>
		<span class="section-no">06</span>
		<div>
			<h2>Changing your mind</h2>
			<p>
				Turning off external media unloads active YouTube players. Vercel’s default cookieless page
				counts continue. Changing the video choice cannot reverse a request already received by a
				provider. Historical first-party totals deliberately have no visitor identifier, so the
				application cannot find and remove an individual’s contribution to them.
			</p>
			<p>
				The contact form uses the details you submit to deliver your message through the site’s
				email provider, Resend. That requested communication is separate from page counts.
			</p>
			<p>
				For a privacy question, write to <a href="mailto:contact@suvroghosh.in"
					>contact@suvroghosh.in</a
				>.
			</p>
		</div>
	</section>
	<footer>
		<p>Your place in the fieldbook is yours to choose.</p>
		<button type="button" onclick={openPrivacySettings}
			>Open privacy settings <span aria-hidden="true">↗</span></button
		>
	</footer>
</article>

<style>
	.privacy-page {
		max-width: 49rem;
		margin: 1rem auto 4rem;
		color: var(--ink);
	}
	.eyebrow,
	.updated,
	.section-no {
		font: 0.65rem/1.5 var(--font-mono);
		color: var(--ink-faint);
		letter-spacing: 0.12em;
	}
	header {
		border-bottom: 1px solid var(--ink);
		padding-bottom: 2rem;
	}
	header h1 {
		font: 450 clamp(3.5rem, 10vw, 6.2rem)/0.9 var(--font-serif);
		letter-spacing: -0.06em;
		margin: 1.3rem 0;
	}
	h1 em {
		color: var(--accent);
	}
	.standfirst {
		max-width: 35rem;
		font: 1.15rem/1.7 var(--font-serif);
		text-align: left;
		color: var(--ink-muted);
	}
	button {
		display: inline-flex;
		gap: 1.5rem;
		justify-content: space-between;
		align-items: center;
		min-height: 44px;
		margin-top: 0.7rem;
		padding: 0.8rem 1.1rem;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--paper-raised);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.updated {
		margin: 1.3rem 0 0;
		letter-spacing: 0;
	}
	section {
		display: grid;
		grid-template-columns: 2.3rem 1fr;
		gap: 1rem;
		padding: 2rem 0;
		border-bottom: 1px solid var(--rule);
	}
	.section-no {
		margin-top: 0.3rem;
	}
	h2 {
		margin: 0 0 1rem;
		font: 500 1.9rem/1.15 var(--font-serif);
		letter-spacing: -0.035em;
	}
	section p {
		margin: 0.8rem 0 0;
		text-align: left;
		color: var(--ink-muted);
		font-size: 0.92rem;
		line-height: 1.85;
	}
	code {
		overflow-wrap: anywhere;
		font-size: 0.76rem;
	}
	a {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	:where(button, a):focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 4px;
	}
	footer {
		padding-top: 2rem;
	}
	footer p {
		text-align: left;
		font: italic 1.4rem var(--font-serif);
	}
	@media (max-width: 480px) {
		section {
			grid-template-columns: 1.3rem 1fr;
			gap: 0.6rem;
		}
		section p {
			font-size: 0.86rem;
		}
		h2 {
			font-size: 1.65rem;
		}
	}
</style>
