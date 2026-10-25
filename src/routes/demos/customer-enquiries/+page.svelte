<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick, untrack } from 'svelte';

	type Staff = { id: string; name: string; city: string | null; available: boolean };
	type Enquiry = {
		ref: string;
		name: string;
		email: string;
		city: string;
		type: string;
		description: string;
		jobReference: string | null;
		ownerId: string;
		ownerName: string;
		fallback: boolean;
		fallbackReason: string | null;
		status: string;
		createdAt: string;
		deadlineAt: string;
		firstResponseAt: string | null;
		firstResponseBy: string | null;
		overdue: boolean;
		ackStatus: string;
		attempts: number;
		nextRetryAt: string | null;
		ack?: {
			id: number;
			to: string;
			subject: string;
			body: string;
			status: string;
			attempts: number;
			nextRetryAt: string | null;
			error: string | null;
		};
		history?: { id: number; at: string; actor: string; kind: string; message: string }[];
		reminders?: { id: number; at: string; message: string }[];
	};
	type Counts = { new: number; fallback: number; overdue: number; failed: number; total: number };
	type Settings = { mode: string; now: string; offsetMinutes: number };
	type RoutingRule = {
		city: string;
		type: string;
		intendedOwnerName: string | null;
		assignedOwnerName: string;
		reason: string | null;
	};
	type SandboxInfo = { scopeKey: string; expiresAt: string };
	let {
		data = { enabled: false, authenticated: false }
	}: {
		data?: {
			enabled: boolean;
			authenticated: boolean;
			publicMode?: boolean;
			sandbox?: SandboxInfo | null;
		};
	} = $props();
	let publicMode = $derived(Boolean(data.publicMode));
	let sandbox = $state<SandboxInfo | null>(untrack(() => data.sandbox ?? null));
	let expired = $state(false);
	let starting = $state(false);
	let autoStartAttempted = false;
	let loadedStorageScope = '';
	let storageScope = $derived(
		publicMode ? (sandbox ? `enquiry-demo:${sandbox.scopeKey}` : null) : 'enquiry-demo'
	);
	let authenticated = $state(untrack(() => data.authenticated));
	let view = $derived(page.url.searchParams.get('view') || 'intro');
	let reference = $derived(page.url.searchParams.get('ref') || '');
	let busy = $state(false);
	let loading = $state(false);
	let mounted = $state(false);
	let refresh = $state(0);
	let feedback = $state('');
	let problem = $state('');
	let errors = $state<Record<string, string>>({});
	let enquiries = $state<Enquiry[]>([]);
	let staff = $state<Staff[]>([]);
	let enquiry = $state<Enquiry | null>(null);
	let counts = $state<Counts>({ new: 0, fallback: 0, overdue: 0, failed: 0, total: 0 });
	let settings = $state<Settings>({ mode: 'succeed', now: '', offsetMinutes: 0 });
	let routingRules = $state<RoutingRule[]>([]);
	let now = $state('');
	let timezone = $state('Asia/Kolkata');
	let search = $state('');
	let cityFilter = $state('');
	let statusFilter = $state('');
	let attentionFilter = $state('');
	let ownerFilter = $state('');
	let password = $state('');
	let ownerId = $state('');
	let workStatus = $state('new');
	let note = $state('');
	let resetConfirmation = $state('');
	let submissionId = $state('');
	let fields = $state({
		name: '',
		email: '',
		city: 'Kolkata',
		type: 'quotation',
		description: '',
		jobReference: '',
		website: ''
	});
	let receipt = $state<{ reference: string; deadlineAt?: string; ackStatus?: string } | null>(null);
	const workLabels: Record<string, string> = {
		new: 'New',
		'in-progress': 'In progress',
		resolved: 'Resolved'
	};
	const ackLabels: Record<string, string> = {
		waiting: 'Waiting to send',
		processing: 'Processing',
		succeeded: 'Simulated send succeeded',
		failed: 'Failed — retry planned',
		'needs-attention': 'Needs attention'
	};
	const typeLabels: Record<string, string> = {
		quotation: 'Request for a quotation',
		'existing-job': 'Question about an existing job',
		general: 'General enquiry'
	};
	let visible = $derived(
		enquiries.filter(
			(item) =>
				(!search ||
					`${item.ref} ${item.name} ${item.description}`
						.toLowerCase()
						.includes(search.toLowerCase())) &&
				(!cityFilter || item.city === cityFilter) &&
				(!statusFilter || item.status === statusFilter) &&
				(!ownerFilter || item.ownerId === ownerFilter) &&
				(!attentionFilter ||
					(attentionFilter === 'overdue'
						? item.overdue
						: attentionFilter === 'fallback'
							? item.fallback
							: item.ackStatus === 'failed' || item.ackStatus === 'needs-attention'))
		)
	);

	onMount(() => {
		mounted = true;
	});
	$effect(() => {
		const serverSandbox = data.sandbox ?? null;
		const serverAuthenticated = data.authenticated;
		untrack(() => {
			if (!expired) {
				sandbox = serverSandbox;
				authenticated = serverAuthenticated;
			}
		});
	});
	$effect(() => {
		const scope = storageScope;
		if (!mounted || scope === loadedStorageScope) return;
		if (!scope) {
			if (loadedStorageScope) clearWorkspaceView();
			loadedStorageScope = '';
			return;
		}
		loadedStorageScope = scope;
		clearWorkspaceView();
		try {
			const savedId = sessionStorage.getItem(`${scope}:submission`);
			submissionId = savedId && /^[a-f\d-]{36}$/i.test(savedId) ? savedId : crypto.randomUUID();
			sessionStorage.setItem(`${scope}:submission`, submissionId);
		} catch {
			submissionId = crypto.randomUUID();
		}
	});
	$effect(() => {
		const scope = storageScope;
		if (
			!mounted ||
			!scope ||
			expired ||
			view !== 'receipt' ||
			!reference ||
			receipt?.reference === reference
		)
			return;
		try {
			const saved = sessionStorage.getItem(`${scope}:receipt:${reference}`);
			if (!saved) return;
			const restored = JSON.parse(saved);
			if (restored.reference === reference && typeof restored.deadlineAt === 'string')
				receipt = restored;
		} catch {
			// Storage is optional; a saved record remains available in the authenticated desk.
		}
	});
	$effect(() => {
		if (
			!mounted ||
			!data.enabled ||
			!publicMode ||
			view !== 'customer' ||
			sandbox ||
			expired ||
			starting ||
			autoStartAttempted
		)
			return;
		autoStartAttempted = true;
		void openPublicWorkspace(false, 'customer');
	});
	$effect(() => {
		if (!mounted || !publicMode || !sandbox || expired) return;
		const remaining = Date.parse(sandbox.expiresAt) - Date.now();
		if (remaining <= 0) {
			expireWorkspace();
			return;
		}
		const timer = setTimeout(() => expireWorkspace(), Math.min(remaining, 2_147_483_647));
		return () => clearTimeout(timer);
	});
	$effect(() => {
		const currentView = view;
		const currentRef = reference;
		void refresh;
		if (
			!mounted ||
			!data.enabled ||
			expired ||
			(publicMode && !sandbox) ||
			!authenticated ||
			!['desk', 'detail', 'sandbox'].includes(currentView)
		)
			return;
		const controller = new AbortController();
		if (currentView === 'detail') enquiry = null;
		loading = true;
		problem = '';
		void fetch(
			`/demos/customer-enquiries/api?view=${currentView === 'detail' ? 'detail' : 'desk'}${currentRef ? `&ref=${encodeURIComponent(currentRef)}` : ''}`,
			{ signal: controller.signal }
		)
			.then(async (response) => {
				const result = await response.json();
				if (!response.ok) {
					if (publicMode && [403, 410].includes(response.status)) expireWorkspace();
					throw new Error(
						result.message ||
							result.error ||
							'The staff desk could not be loaded. Please try again.'
					);
				}
				if (currentView === 'detail') {
					enquiry = result.enquiry;
					ownerId = result.enquiry.ownerId;
					workStatus = result.enquiry.status;
				} else {
					enquiries = result.enquiries;
					counts = result.counts;
					settings = result.settings;
					routingRules = result.routingRules || [];
				}
				staff = result.staff;
				now = result.now;
			})
			.catch((error) => {
				if (!controller.signal.aborted) problem = error.message;
			})
			.finally(() => {
				if (!controller.signal.aborted) loading = false;
			});
		return () => controller.abort();
	});

	function destination(next: string, ref?: string) {
		return `?view=${next}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`;
	}
	function clearWorkspaceView() {
		enquiry = null;
		enquiries = [];
		staff = [];
		routingRules = [];
		counts = { new: 0, fallback: 0, overdue: 0, failed: 0, total: 0 };
		receipt = null;
		submissionId = '';
		ownerId = '';
		note = '';
		fields = {
			name: '',
			email: '',
			city: 'Kolkata',
			type: 'quotation',
			description: '',
			jobReference: '',
			website: ''
		};
	}
	function clearStoredWorkspace() {
		if (!storageScope) return;
		try {
			for (let index = sessionStorage.length - 1; index >= 0; index--) {
				const key = sessionStorage.key(index);
				if (key?.startsWith(`${storageScope}:`)) sessionStorage.removeItem(key);
			}
		} catch {
			/* Browser storage is optional. */
		}
	}
	function expireWorkspace() {
		clearStoredWorkspace();
		expired = true;
		sandbox = null;
		authenticated = false;
		loadedStorageScope = '';
		clearWorkspaceView();
		feedback = '';
		problem =
			'This temporary demonstration is no longer available. Start a fresh demonstration to continue.';
	}
	async function openPublicWorkspace(staffAccess: boolean, next = 'desk') {
		if (starting || busy) return;
		starting = true;
		busy = true;
		problem = '';
		feedback = '';
		try {
			const result = await send({ action: staffAccess ? 'enter-staff' : 'start' });
			if (!result.sandbox?.scopeKey || !result.sandbox?.expiresAt)
				throw new Error('The private demonstration could not be opened. Please try again.');
			expired = false;
			sandbox = result.sandbox;
			authenticated = result.authenticated === true;
			await goto(destination(next), { invalidateAll: true });
		} catch (error) {
			problem =
				error instanceof Error
					? error.message
					: 'The private demonstration could not be opened. Please try again.';
		} finally {
			starting = false;
			busy = false;
		}
	}
	function formatTime(value: string | null | undefined) {
		if (!value) return 'Not recorded';
		return new Intl.DateTimeFormat('en-GB', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: timezone
		}).format(new Date(value));
	}
	async function send(payload: Record<string, unknown>) {
		const response = await fetch('/demos/customer-enquiries/api', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const result = await response.json();
		if (!response.ok) {
			if (publicMode && [403, 410].includes(response.status)) expireWorkspace();
			errors = result.errors || {};
			throw new Error(
				result.message || result.error || 'The change could not be saved. Please try again.'
			);
		}
		return result;
	}
	async function act(payload: Record<string, unknown>, success: string) {
		if (busy) return;
		busy = true;
		problem = '';
		feedback = '';
		errors = {};
		try {
			await send(payload);
			if (payload.action === 'reset') {
				clearStoredWorkspace();
				receipt = null;
				submissionId = crypto.randomUUID();
				try {
					if (storageScope) sessionStorage.setItem(`${storageScope}:submission`, submissionId);
				} catch {
					/* Optional browser storage. */
				}
			}
			feedback = success;
			refresh += 1;
		} catch (error) {
			problem = error instanceof Error ? error.message : 'Please try again.';
		} finally {
			busy = false;
		}
	}
	function sample() {
		fields = {
			name: 'Mira Sen',
			email: 'mira.sen@example.com',
			city: 'Kolkata',
			type: 'quotation',
			description:
				'Please quote for weekly maintenance at our fictional twelve-person office in Salt Lake.',
			jobReference: '',
			website: ''
		};
		errors = {};
	}
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (publicMode && (!sandbox || expired)) {
			expireWorkspace();
			return;
		}
		errors = {};
		if (fields.name.trim().length < 2 || fields.name.trim().length > 80)
			errors.name = 'Please enter a fictional name of 2–80 characters.';
		if (!/^[^\s@]+@example\.(com|org)$/i.test(fields.email.trim()) || fields.email.length > 160)
			errors.email = 'Please use a fictional address ending in example.com or example.org.';
		if (!['Kolkata', 'Dubai'].includes(fields.city))
			errors.city = 'Please choose Kolkata or Dubai.';
		if (!['quotation', 'existing-job', 'general'].includes(fields.type))
			errors.type = 'Please choose an enquiry type.';
		if (fields.description.trim().length < 10 || fields.description.length > 1200)
			errors.description = 'Please describe the problem in 10–1,200 characters.';
		if (fields.jobReference.length > 40)
			errors.jobReference = 'Please keep the job reference to 40 characters or fewer.';
		if (Object.keys(errors).length) {
			await tick();
			document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}
		busy = true;
		problem = '';
		feedback = '';
		try {
			receipt = await send({ action: 'submit', submissionId, ...fields });
			try {
				if (storageScope)
					sessionStorage.setItem(
						`${storageScope}:receipt:${receipt?.reference}`,
						JSON.stringify(receipt)
					);
			} catch {
				// The database transaction succeeded even when browser storage is unavailable.
			}
			await goto(destination('receipt', receipt?.reference));
			submissionId = crypto.randomUUID();
			try {
				if (storageScope) sessionStorage.setItem(`${storageScope}:submission`, submissionId);
			} catch {
				/* Optional browser storage. */
			}
		} catch (error) {
			problem =
				error instanceof Error
					? error.message
					: 'The enquiry could not be saved. Please try again.';
			await tick();
			document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
		} finally {
			busy = false;
		}
	}
	async function login(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		problem = '';
		feedback = '';
		try {
			await send({ action: 'login', password });
			password = '';
			authenticated = true;
			await goto(destination('desk'), { invalidateAll: true });
		} catch (error) {
			problem = error instanceof Error ? error.message : 'Sign-in failed. Please try again.';
		} finally {
			busy = false;
		}
	}
	async function logout() {
		await act({ action: 'logout' }, 'Signed out.');
		if (problem) return;
		authenticated = false;
		await goto(destination('intro'), { invalidateAll: true });
	}
	async function saveChanges(event: SubmitEvent) {
		event.preventDefault();
		await act(
			{
				action: 'update',
				reference,
				ownerId,
				status: workStatus,
				...(note.trim() ? { note } : {})
			},
			'Changes saved to the enquiry history.'
		);
		if (!problem) note = '';
	}
</script>

<svelte:head>
	<title>Stop losing customer enquiries · Working prototype</title>
	<meta
		name="description"
		content="A working ClinConsult portfolio prototype showing saved enquiries, clear responsibility and recovery from simulated email failure."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="enquiry-demo">
	<div class="demo-banner">
		<span class="demo-dot" aria-hidden="true"></span> Demonstration only. Please use fictional details.
		No real emails are sent.
	</div>
	{#if publicMode}
		<div class="workspace-notice" data-testid="private-workspace-notice">
			<p>
				Your private, temporary demonstration. Reset affects only your example data. No real emails
				are sent.
			</p>
			{#if sandbox && !expired}<p class="workspace-expiry" data-testid="workspace-expiry">
					Expires {formatTime(sandbox.expiresAt)} ({timezone}). Advancing demo time does not extend
					this expiry.
				</p>{:else}<p class="workspace-expiry">
					Your example workspace is created when you start. It lasts 24 hours.
				</p>{/if}
		</div>
	{/if}
	<div class="demo-wrap">
		<noscript
			><p class="notice">
				Enable JavaScript to use the enquiry form and staff desk in this demonstration.
			</p></noscript
		>
		<header class="demo-header">
			<a class="brand" href={destination('intro')}
				><span class="brand-mark" aria-hidden="true">e<span>.</span></span><span
					>Example Office Services<small>A ClinConsult portfolio demonstration</small></span
				></a
			>
			<nav aria-label="Demonstration navigation">
				<a class:active={view === 'customer'} href={destination('customer')}>Customer form</a>
				<a
					class:active={view === 'desk' || view === 'detail'}
					href={destination(authenticated ? 'desk' : 'login')}>Staff desk</a
				>
				{#if authenticated}<a class:active={view === 'sandbox'} href={destination('sandbox')}
						>Demo controls</a
					><button class="text-button" onclick={logout} disabled={busy}>Sign out</button>{/if}
			</nav>
		</header>
		{#if problem}<div class="notice error-notice" role="alert">{problem}</div>{/if}
		{#if feedback}<div class="notice success-notice" role="status">{feedback}</div>{/if}
		{#if !data.enabled}
			<section class="panel restricted">
				<span class="eyebrow">LOCAL DEMONSTRATION</span>
				<h1>This prototype runs on your own computer.</h1>
				<p>
					Start the local enquiry demo to try its saved enquiries and simulated messaging. The
					interactive staff desk is disabled on public hosting.
				</p>
				<p>Setup instructions are in <code>docs/enquiry-demo.md</code>.</p>
			</section>
		{:else if publicMode && expired}
			<section class="panel login-panel">
				<span class="eyebrow">TEMPORARY DEMONSTRATION</span>
				<h1>Start a fresh demonstration.</h1>
				<p>
					Your previous example workspace is no longer available. A new demonstration starts with
					its own fictional sample records and a new 24-hour expiry.
				</p>
				<button
					class="primary button"
					disabled={busy}
					onclick={() => openPublicWorkspace(false, 'customer')}
					>Start a fresh demonstration <span aria-hidden="true">→</span></button
				>
			</section>
		{:else if view === 'intro'}
			<section class="hero">
				<div class="hero-copy">
					<span class="eyebrow"><span class="line"></span> A WORKING PROTOTYPE FOR CLINCONSULT</span
					>
					<h1>Stop losing<br />customer <em>enquiries.</em></h1>
					<p class="hero-lead">An email can fail.<br />A customer’s request shouldn’t disappear.</p>
					<p class="hero-description">
						Try a small, working enquiry desk for a fictional office-maintenance company in Kolkata
						and Dubai. Every request gets a saved record, a responsible person and a time to
						respond.
					</p>
					<div class="hero-actions">
						<a class="primary button" href={destination('customer')}
							>Try as a customer <span aria-hidden="true">↗</span></a
						><a class="secondary button" href={destination(authenticated ? 'desk' : 'login')}
							>View the staff desk <span aria-hidden="true">→</span></a
						>
					</div>
					<p class="fine-print">
						Working prototype with simulated messaging · Entirely fictional data
					</p>
				</div>
				<div class="proof-card" aria-label="What happens to an enquiry">
					<div class="proof-top">
						<span class="proof-kicker">A REQUEST’S JOURNEY</span><span class="chip"
							>Saved first</span
						>
					</div>
					<div class="journey-step">
						<span class="step-number">01</span>
						<div>
							<h2>The customer asks</h2>
							<p>“Can you quote for our office maintenance?”</p>
						</div>
					</div>
					<div class="journey-step">
						<span class="step-number">02</span>
						<div>
							<h2>The enquiry is saved</h2>
							<p>A stable reference and a named owner.<br />Even when the acknowledgement fails.</p>
						</div>
					</div>
					<div class="journey-step">
						<span class="step-number">03</span>
						<div>
							<h2>Someone follows through</h2>
							<p>
								A four-hour response deadline, a visible reminder and a recorded first response.
							</p>
						</div>
					</div>
					<div class="proof-bottom">
						<span aria-hidden="true">✓</span>
						<p>
							<strong>The record stays safe in the demo database.</strong><br />Message attempts are
							tracked separately.
						</p>
					</div>
				</div>
			</section>
			<section class="principles" aria-label="What this demonstration proves">
				<div>
					<span class="mini-icon" aria-hidden="true">↳</span>
					<h2>Clear responsibility</h2>
					<p>Simple routing rules assign each request. A coordinator catches missing cover.</p>
				</div>
				<div>
					<span class="mini-icon" aria-hidden="true">↻</span>
					<h2>Recoverable failures</h2>
					<p>A failed acknowledgement can be retried without creating another enquiry.</p>
				</div>
				<div>
					<span class="mini-icon" aria-hidden="true">◷</span>
					<h2>A visible next step</h2>
					<p>First response and resolution are separate, with a timestamped history.</p>
				</div>
			</section>
		{:else if view === 'customer'}
			{#if publicMode && !sandbox}
				<section class="panel login-panel">
					<span class="eyebrow">YOUR OWN EXAMPLE DATA</span>
					<h1>Open your private demonstration.</h1>
					<p role="status">
						{starting
							? 'Preparing your fictional sample records…'
							: 'Start a temporary workspace to try the customer form. Other visitors cannot see or change your enquiries.'}
					</p>
					<button
						class="primary button"
						disabled={busy}
						onclick={() => openPublicWorkspace(false, 'customer')}
						>{starting ? 'Opening demonstration…' : 'Start my demonstration'}<span
							aria-hidden="true">→</span
						></button
					>
				</section>
			{:else}
				<div class="page-heading">
					<span class="eyebrow">TRY AS A CUSTOMER</span>
					<h1>Tell us what needs doing.</h1>
					<p>We’ll save your request before trying the simulated acknowledgement.</p>
				</div>
				<div class="form-layout">
					<section class="panel">
						<div class="panel-heading">
							<h2>Send an enquiry</h2>
							<button class="secondary small button" onclick={sample} type="button"
								>Fill with sample details</button
							>
						</div>
						<form method="post" action="/demos/customer-enquiries/api" onsubmit={submit} novalidate>
							<div class="field-row">
								<div class="field">
									<label for="customer-name">Name</label><input
										id="customer-name"
										name="name"
										bind:value={fields.name}
										maxlength="80"
										autocomplete="off"
										required
										aria-invalid={Boolean(errors.name)}
										aria-describedby={errors.name ? 'error-name' : undefined}
									/>{#if errors.name}<span class="field-error" id="error-name">{errors.name}</span
										>{/if}
								</div>
								<div class="field">
									<label for="customer-email">Email address</label><input
										id="customer-email"
										name="email"
										type="email"
										bind:value={fields.email}
										maxlength="160"
										autocomplete="off"
										required
										aria-invalid={Boolean(errors.email)}
										aria-describedby={errors.email ? 'error-email' : 'email-hint'}
									/><span class="field-hint" id="email-hint"
										>Use a fictional address such as mira@example.com.</span
									>{#if errors.email}<span class="field-error" id="error-email">{errors.email}</span
										>{/if}
								</div>
							</div>
							<div class="field-row">
								<div class="field">
									<label for="customer-city">City</label><select
										id="customer-city"
										name="city"
										bind:value={fields.city}
										aria-invalid={Boolean(errors.city)}
										aria-describedby={errors.city ? 'error-city' : undefined}
										><option>Kolkata</option><option>Dubai</option></select
									>{#if errors.city}<span class="field-error" id="error-city">{errors.city}</span
										>{/if}
								</div>
								<div class="field">
									<label for="customer-type">Enquiry type</label><select
										id="customer-type"
										name="type"
										bind:value={fields.type}
										aria-invalid={Boolean(errors.type)}
										aria-describedby={errors.type ? 'error-type' : undefined}
										><option value="quotation">Request for a quotation</option><option
											value="existing-job">Question about an existing job</option
										><option value="general">General enquiry</option></select
									>{#if errors.type}<span class="field-error" id="error-type">{errors.type}</span
										>{/if}
								</div>
							</div>
							<div class="field">
								<label for="customer-description">Short description of the problem</label><textarea
									id="customer-description"
									name="description"
									bind:value={fields.description}
									rows="5"
									minlength="10"
									maxlength="1200"
									required
									aria-invalid={Boolean(errors.description)}
									aria-describedby={errors.description ? 'error-description' : 'description-hint'}
								></textarea><span class="field-hint" id="description-hint"
									>10–1,200 characters. Please leave out sensitive or personal information.</span
								>{#if errors.description}<span class="field-error" id="error-description"
										>{errors.description}</span
									>{/if}
							</div>
							{#if fields.type === 'existing-job'}<div class="field">
									<label for="job-reference"
										>Job reference <span class="optional">(optional)</span></label
									><input
										id="job-reference"
										name="jobReference"
										bind:value={fields.jobReference}
										maxlength="40"
										aria-invalid={Boolean(errors.jobReference)}
										aria-describedby={errors.jobReference ? 'error-job-reference' : undefined}
									/>{#if errors.jobReference}<span class="field-error" id="error-job-reference"
											>{errors.jobReference}</span
										>{/if}
								</div>{/if}
							<div class="honey" aria-hidden="true">
								<label for="customer-website">Leave this field empty</label><input
									id="customer-website"
									name="website"
									bind:value={fields.website}
									tabindex="-1"
									autocomplete="off"
								/>
							</div>
							<button
								class="primary button submit-button"
								type="submit"
								disabled={busy || !submissionId}
								>{busy ? 'Saving enquiry…' : 'Save enquiry'}<span aria-hidden="true">→</span
								></button
							>
							<p class="fine-print">Saving a request does not mean an email was sent.</p>
						</form>
					</section>
					<aside class="side-note">
						<span class="eyebrow">WHAT HAPPENS NEXT</span>
						<ol>
							<li>
								<strong>A record you can refer to.</strong>
								<p>Your enquiry receives its own reference.</p>
							</li>
							<li>
								<strong>A person takes responsibility.</strong>
								<p>
									Requests are assigned by city and enquiry type. The office coordinator covers any
									gaps.
								</p>
							</li>
							<li>
								<strong>A time to respond.</strong>
								<p>The deadline is four elapsed hours after submission, not business hours.</p>
							</li>
						</ol>
						<div class="quiet-box">
							This fictional company does not receive your message. A fake service stores an
							acknowledgement preview.
						</div>
					</aside>
				</div>
			{/if}
		{:else if view === 'receipt'}
			{#if receipt?.reference === reference && (!publicMode || sandbox)}
				<section class="panel receipt">
					<div class="receipt-check" aria-hidden="true">✓</div>
					<span class="eyebrow">SAVED IN THE DEMONSTRATION DATABASE</span>
					<h1>Your enquiry has been saved.</h1>
					<p class="receipt-reference" data-testid="receipt-reference">
						Reference <strong>{reference || receipt?.reference}</strong>
					</p>
					<p>
						It now has a responsible person and a response deadline. You can refresh the staff desk
						and find the same saved record.
					</p>
					<div class="quiet-box">
						<strong>Enquiry saved. Email not confirmed.</strong>
						<p>
							An acknowledgement job is saved separately. It may be waiting, processing, or fail in
							the simulation. No real emails are sent.
						</p>
					</div>
					{#if receipt?.deadlineAt}<p class="deadline-line">
							Response due {formatTime(receipt.deadlineAt)} <small>({timezone})</small>
						</p>{/if}
					<div class="hero-actions">
						<a
							class="primary button"
							href={destination(authenticated ? 'detail' : 'login', reference)}
							>Find it at the staff desk <span aria-hidden="true">→</span></a
						><a class="secondary button" href={destination('customer')}>Make another enquiry</a>
					</div>
				</section>
			{:else}
				<section class="panel receipt">
					<span class="eyebrow">ENQUIRY REFERENCE</span>
					<h1>Check this reference at the staff desk.</h1>
					<p class="receipt-reference" data-testid="receipt-reference">
						Reference <strong>{reference || 'Not supplied'}</strong>
					</p>
					<p>
						This browser tab has no submission receipt for this reference. Authorized staff can
						check whether the enquiry exists in the demonstration database.
					</p>
					<div class="hero-actions">
						<a
							class="primary button"
							href={destination(authenticated ? 'detail' : 'login', reference)}
							>Open the staff desk <span aria-hidden="true">→</span></a
						><a class="secondary button" href={destination('customer')}>Make an enquiry</a>
					</div>
				</section>
			{/if}
		{:else if view === 'login' || (!authenticated && ['desk', 'detail', 'sandbox'].includes(view))}
			<section class="panel login-panel">
				{#if publicMode}
					<span class="eyebrow">YOUR DEMONSTRATION STAFF DESK</span>
					<h1>Try the staff’s next step.</h1>
					<p>
						Open the staff desk for your own fictional workspace. You can only view and change your
						example data. Other visitors have separate demonstrations.
					</p>
					<button
						class="primary button"
						disabled={busy}
						onclick={() => openPublicWorkspace(true, 'desk')}
						>{starting ? 'Opening your staff desk…' : 'Open my demonstration staff desk'}<span
							aria-hidden="true">→</span
						></button
					>
					<p class="fine-print">
						This grants staff access only inside your temporary demonstration. No real customer
						records or email accounts are connected.
					</p>
				{:else}
					<span class="eyebrow">AUTHORIZED STAFF ONLY</span>
					<h1>Open the staff desk.</h1>
					<p>
						Use the local demonstration password created during setup. Staff changes are checked on
						the server.
					</p>
					<form method="post" action="/demos/customer-enquiries/api" onsubmit={login}>
						<div class="field">
							<label for="staff-password">Staff password</label><input
								id="staff-password"
								type="password"
								bind:value={password}
								required
								maxlength="200"
								autocomplete="current-password"
							/>
						</div>
						<button class="primary button" type="submit" disabled={busy}
							>{busy ? 'Signing in…' : 'Sign in to staff desk'}<span aria-hidden="true">→</span
							></button
						>
					</form>
					<p class="fine-print">
						Find your local password with <code>npm run enquiry-demo:password</code>. This prototype
						must stay on the local machine.
					</p>
				{/if}
			</section>
		{:else if view === 'desk'}
			<div class="page-heading heading-with-actions">
				<div>
					<span class="eyebrow">THE STAFF DESK</span>
					<h1>Every request. A next step.</h1>
					<p>Saved records from the demonstration database.</p>
				</div>
				<button class="secondary button" onclick={() => (refresh += 1)} disabled={loading}
					>Refresh desk <span aria-hidden="true">↻</span></button
				>
			</div>
			<div class="stats" aria-label="Enquiry counts">
				<button
					onclick={() => {
						statusFilter = 'new';
						attentionFilter = '';
					}}
					><span>New enquiries</span><strong>{counts.new}</strong><small
						>Waiting for staff action <span aria-hidden="true">↗</span></small
					></button
				><button
					onclick={() => {
						statusFilter = '';
						attentionFilter = 'fallback';
					}}
					><span>Coordinator queue</span><strong>{counts.fallback}</strong><small
						>Fallback responsibility <span aria-hidden="true">↗</span></small
					></button
				><button
					class="warning-stat"
					onclick={() => {
						statusFilter = '';
						attentionFilter = 'overdue';
					}}
					><span>Overdue first responses</span><strong>{counts.overdue}</strong><small
						>No contact recorded <span aria-hidden="true">↗</span></small
					></button
				><button
					onclick={() => {
						statusFilter = '';
						attentionFilter = 'failed';
					}}
					><span>Failed acknowledgements</span><strong>{counts.failed}</strong><small
						>Saved enquiries stay here <span aria-hidden="true">↗</span></small
					></button
				>
			</div>
			<section class="panel list-panel">
				<div class="panel-heading">
					<div>
						<h2>
							Enquiries <span class="count-tag" data-testid="total-count">{counts.total}</span>
						</h2>
						<p class="fine-print">
							Four elapsed hours to first response. Opening a record does not count.
						</p>
					</div>
					<div class="timezone-control">
						<label for="desk-timezone">Display times in</label><select
							id="desk-timezone"
							bind:value={timezone}
							><option value="Asia/Kolkata">Asia/Kolkata</option><option value="Asia/Dubai"
								>Asia/Dubai</option
							></select
						>
					</div>
				</div>
				<div class="filters">
					<div class="field search-field">
						<label for="desk-search">Find an enquiry</label><input
							id="desk-search"
							type="search"
							bind:value={search}
							placeholder="Reference, name or message"
						/>
					</div>
					<div class="field">
						<label for="city-filter">City</label><select id="city-filter" bind:value={cityFilter}
							><option value="">All cities</option><option>Kolkata</option><option>Dubai</option
							></select
						>
					</div>
					<div class="field">
						<label for="status-filter">Work status</label><select
							id="status-filter"
							bind:value={statusFilter}
							><option value="">All statuses</option><option value="new">New</option><option
								value="in-progress">In progress</option
							><option value="resolved">Resolved</option></select
						>
					</div>
					<div class="field">
						<label for="owner-filter">Assigned person</label><select
							id="owner-filter"
							bind:value={ownerFilter}
							><option value="">Everyone</option>{#each staff as person}<option value={person.id}
									>{person.name}</option
								>{/each}</select
						>
					</div>
					<div class="field">
						<label for="attention-filter">Needs a look</label><select
							id="attention-filter"
							bind:value={attentionFilter}
							><option value="">All enquiries</option><option value="overdue"
								>Overdue response</option
							><option value="fallback">Coordinator queue</option><option value="failed"
								>Failed acknowledgement</option
							></select
						>
					</div>
				</div>
				{#if loading}<p class="loading-text" role="status">Loading saved enquiries…</p>{/if}
				<div class="table-scroll">
					<table>
						<caption class="sr-only">Saved enquiries; all times displayed in {timezone}</caption
						><thead
							><tr
								><th>Reference / customer</th><th>City / assigned person</th><th>Work status</th><th
									>First response due</th
								><th>Acknowledgement</th></tr
							></thead
						><tbody
							>{#each visible as item}<tr
									><td
										><a class="reference-link" href={destination('detail', item.ref)}
											>{item.ref}<span aria-hidden="true"> ↗</span></a
										><small>{item.name}</small></td
									><td
										>{item.city}<small
											>{item.ownerName}{#if item.fallback}<span class="fallback-label"
													>Coordinator fallback</span
												>{/if}</small
										></td
									><td
										><span class="status-pill" class:resolved={item.status === 'resolved'}
											>{workLabels[item.status] || item.status}</span
										></td
									><td
										><span class:overdue-text={item.overdue}>{formatTime(item.deadlineAt)}</span
										><small
											>{item.firstResponseAt
												? 'First response recorded'
												: item.overdue
													? 'Overdue — no response recorded'
													: 'No response recorded'}</small
										></td
									><td
										><span
											class="ack-text"
											class:overdue-text={item.ackStatus === 'failed' ||
												item.ackStatus === 'needs-attention'}
											>{ackLabels[item.ackStatus] || item.ackStatus}</span
										><small>{item.attempts} attempt{item.attempts === 1 ? '' : 's'}</small></td
									></tr
								>{/each}{#if !visible.length && !loading}<tr
									><td colspan="5" class="empty-state">No enquiries match these filters.</td></tr
								>{/if}</tbody
						>
					</table>
				</div>
				<div class="list-footer">
					{visible.length} of {counts.total} enquiries<span
						>Demo time: {formatTime(now)} · {timezone}</span
					>
				</div>
			</section>
		{:else if view === 'detail'}
			<a class="back-link" href={destination('desk')}>← Back to the staff desk</a>
			{#if loading}<p class="loading-text" role="status">Loading the saved enquiry…</p>{/if}
			{#if enquiry}<div class="page-heading heading-with-actions">
					<div>
						<span class="eyebrow">ENQUIRY {enquiry.ref}</span>
						<h1>{typeLabels[enquiry.type] || enquiry.type}</h1>
						<p>{enquiry.name} · {enquiry.city} · Saved {formatTime(enquiry.createdAt)}</p>
					</div>
					<div class="timezone-control">
						<label for="detail-timezone">Display times in</label><select
							id="detail-timezone"
							bind:value={timezone}
							><option value="Asia/Kolkata">Asia/Kolkata</option><option value="Asia/Dubai"
								>Asia/Dubai</option
							></select
						>
					</div>
				</div>
				{#if enquiry.overdue}<div class="notice overdue-notice" data-testid="overdue-warning">
						<strong>Overdue first response.</strong> No staff member has recorded contacting this
						customer. Deadline: {formatTime(enquiry.deadlineAt)} ({timezone}).
					</div>{/if}
				<div class="detail-layout">
					<div class="detail-main">
						<section class="panel">
							<div class="panel-heading">
								<h2>The customer’s request</h2>
								<span class="status-pill" class:resolved={enquiry.status === 'resolved'}
									>{workLabels[enquiry.status]}</span
								>
							</div>
							<p class="customer-message">{enquiry.description}</p>
							<dl class="record-facts">
								<div>
									<dt>Email address</dt>
									<dd>{enquiry.email}</dd>
								</div>
								<div>
									<dt>Assigned person</dt>
									<dd>{enquiry.ownerName}</dd>
								</div>
								{#if enquiry.jobReference}<div>
										<dt>Job reference</dt>
										<dd>{enquiry.jobReference}</dd>
									</div>{/if}
								<div>
									<dt>First response due</dt>
									<dd>{formatTime(enquiry.deadlineAt)} <small>({timezone})</small></dd>
								</div>
							</dl>
							{#if enquiry.fallback}<div class="quiet-box">
									<strong>Office coordinator fallback</strong>
									<p>
										{enquiry.fallbackReason ||
											'The usual routing rule could not assign an available person.'}
									</p>
								</div>{/if}
							<div class="response-record">
								<strong
									>{enquiry.firstResponseAt
										? 'First response recorded'
										: 'No first response recorded'}</strong
								>{#if enquiry.firstResponseAt}<p>
										{enquiry.firstResponseBy} recorded contact on {formatTime(
											enquiry.firstResponseAt
										)} ({timezone}). This is a manual record, not proof of external email delivery.
									</p>{:else}<p>
										Record this only after a staff member has contacted the customer. Opening this
										page or changing the work status does not count.
									</p>
									<button
										class="secondary button small"
										onclick={() =>
											act(
												{ action: 'update', reference, recordResponse: true },
												'First response recorded. The work status has not been changed.'
											)}
										disabled={busy}>Record that I contacted the customer</button
									>{/if}
							</div>
						</section>
						<section class="panel">
							<div class="panel-heading">
								<h2>Activity history</h2>
								<span class="fine-print">{timezone}</span>
							</div>
							<ol class="history">
								{#each enquiry.history || [] as item}<li>
										<span class="history-dot" aria-hidden="true"></span>
										<div>
											<p>{item.message}</p>
											<small>{item.actor} · {formatTime(item.at)}</small>
										</div>
									</li>{/each}
							</ol>
							{#if enquiry.reminders?.length}<div class="quiet-box">
									<strong data-testid="reminder-count"
										>Staff reminder{enquiry.reminders.length === 1 ? '' : 's'}: {enquiry.reminders
											.length}</strong
									>{#each enquiry.reminders as reminder}<p>
											{reminder.message}<br /><small>{formatTime(reminder.at)} ({timezone})</small>
										</p>{/each}
								</div>{/if}
						</section>
					</div>
					<aside class="detail-aside">
						<section class="panel">
							<h2>Staff actions</h2>
							<form method="post" action="/demos/customer-enquiries/api" onsubmit={saveChanges}>
								<div class="field">
									<label for="assigned-person">Assigned person</label><select
										id="assigned-person"
										bind:value={ownerId}
										>{#each staff as person}<option value={person.id} disabled={!person.available}
												>{person.name}{!person.available ? ' (unavailable)' : ''}</option
											>{/each}</select
									>
								</div>
								<div class="field">
									<label for="work-status">Work status</label><select
										id="work-status"
										bind:value={workStatus}
										><option value="new">New</option><option value="in-progress">In progress</option
										><option value="resolved">Resolved</option></select
									>
								</div>
								<div class="field">
									<label for="internal-note"
										>Internal note <span class="optional">(optional)</span></label
									><textarea
										id="internal-note"
										bind:value={note}
										rows="3"
										maxlength="1000"
										placeholder="Record a useful next step."
									></textarea>
								</div>
								<button class="primary button" type="submit" disabled={busy}
									>{busy ? 'Saving…' : 'Save staff changes'}</button
								>
							</form>
						</section>
						<section class="panel ack-panel">
							<span class="eyebrow">SIMULATED MESSAGING</span>
							<h2>Acknowledgement</h2>
							<p class="ack-state" data-testid="ack-status">
								{ackLabels[enquiry.ackStatus] || enquiry.ackStatus}
							</p>
							<p class="fine-print">
								{enquiry.attempts} attempt{enquiry.attempts === 1 ? '' : 's'} · No real email is sent.
							</p>
							{#if enquiry.nextRetryAt}<p class="fine-print">
									Next retry: {formatTime(enquiry.nextRetryAt)} ({timezone})
								</p>{/if}{#if enquiry.ack?.error}<div class="quiet-box failure-box">
									{enquiry.ack.error}
								</div>{/if}{#if enquiry.ack}<details open>
									<summary>View message preview</summary>
									<div class="message-preview">
										<small>To: {enquiry.ack.to}</small><strong>{enquiry.ack.subject}</strong>
										<p>{enquiry.ack.body}</p>
									</div>
								</details>{/if}{#if enquiry.ackStatus === 'failed' || enquiry.ackStatus === 'needs-attention'}<button
									class="secondary button"
									onclick={() =>
										act(
											{ action: 'retry', reference },
											'The existing acknowledgement is waiting for another attempt. No new enquiry was created.'
										)}
									disabled={busy}>Retry acknowledgement</button
								>{/if}
							<p class="fine-print">
								Automatic retries are limited. Retries reuse this enquiry and its existing message
								job.
							</p>
						</section>
					</aside>
				</div>{/if}
		{:else if view === 'sandbox'}
			<div class="page-heading">
				<span class="eyebrow">SANDBOX · DEMONSTRATION CONTROLS</span>
				<h1>Make something go wrong.</h1>
				<p>
					Show what happens when a message fails or a customer waits too long. These are separate
					from ordinary staff actions.
				</p>
			</div>
			<div class="sandbox-grid">
				<section class="panel">
					<span class="control-number">01</span>
					<h2>Choose the next message outcome</h2>
					<p>The fake service only saves message previews. It cannot send real email.</p>
					<p class="current-setting">
						Current setting: <strong
							>{settings.mode === 'always-fail'
								? 'Keep failing'
								: settings.mode === 'fail-next'
									? 'Fail the next attempt'
									: 'Succeed in the simulation'}</strong
						>
					</p>
					<div class="control-stack">
						<button
							class="secondary button"
							disabled={busy}
							onclick={() =>
								act(
									{ action: 'sandbox', mode: 'fail-next' },
									'The next acknowledgement attempt will fail in the simulation.'
								)}>Fail the next attempt</button
						><button
							class="secondary button"
							disabled={busy}
							onclick={() =>
								act(
									{ action: 'sandbox', mode: 'always-fail' },
									'Acknowledgement attempts will keep failing until you change this setting.'
								)}>Keep failing</button
						><button
							class="secondary button"
							disabled={busy}
							onclick={() =>
								act(
									{ action: 'sandbox', mode: 'succeed' },
									'Acknowledgement attempts will succeed in the simulation.'
								)}>Succeed in the simulation</button
						>
					</div>
				</section>
				<section class="panel">
					<span class="control-number">02</span>
					<h2>Move the demo clock forward</h2>
					<p>
						Response deadlines use four elapsed hours, not business hours. This changes the demo’s
						clock, never your computer’s clock.
					</p>
					<div class="clock-readout">
						<strong>{formatTime(now)}</strong><span
							>{timezone} · advanced {settings.offsetMinutes} minutes</span
						>
					</div>
					<div class="control-stack">
						<button
							class="secondary button"
							disabled={busy}
							onclick={() =>
								act(
									{ action: 'sandbox', advanceMinutes: 5 },
									'The demo clock advanced five minutes.'
								)}>Advance demo time by 5 minutes</button
						><button
							class="secondary button"
							disabled={busy}
							onclick={() =>
								act(
									{ action: 'sandbox', advanceMinutes: 241 },
									'The demo clock advanced four hours and one minute.'
								)}>Advance demo time by 4 hours 1 minute</button
						>
					</div>
					<p class="fine-print">Run the worker after advancing time to create any due reminders.</p>
				</section>
				<section class="panel">
					<span class="control-number">03</span>
					<h2>Process waiting work</h2>
					<p>
						{publicMode
							? 'This worker pass processes message jobs in your own temporary workspace and creates overdue-response reminders.'
							: 'The independent worker processes saved message jobs and creates overdue-response reminders.'}
						A page refresh does not send a message.
					</p>
					<button
						class="primary button"
						disabled={busy}
						onclick={() =>
							act(
								{ action: 'tick' },
								'One worker pass completed. Check the staff desk for updated attempts and reminders.'
							)}>Run one worker pass <span aria-hidden="true">↻</span></button
					>
					<div class="quiet-box">
						<strong>The saved record remains available.</strong>
						<p>
							Retrying a message does not create a second customer enquiry. One overdue event
							creates one reminder.
						</p>
					</div>
				</section>
				<section class="panel routing-panel">
					<span class="control-number">04</span>
					<h2>Who receives each request?</h2>
					<p>
						These are the current city and enquiry rules in the demonstration database. A missing
						rule or unavailable person sends the request to the Office coordinator queue.
					</p>
					<div class="table-scroll">
						<table>
							<caption class="sr-only"
								>Current enquiry routing rules and fallback responsibility</caption
							>
							<thead
								><tr
									><th scope="col">City / enquiry</th><th scope="col">Usual owner</th><th
										scope="col">Assigned now</th
									></tr
								></thead
							>
							<tbody
								>{#each routingRules as rule}<tr
										><td>{rule.city}<small>{typeLabels[rule.type] || rule.type}</small></td><td
											>{rule.intendedOwnerName || 'No routing rule'}</td
										><td
											>{rule.assignedOwnerName}{#if rule.reason}<small>{rule.reason}</small
												>{/if}</td
										></tr
									>{/each}</tbody
							>
						</table>
					</div>
				</section>
				<section class="panel reset-panel">
					<span class="control-number">05</span>
					<h2>Start again with sample data</h2>
					<p>
						{publicMode
							? 'Replace only your own demonstration’s enquiries, notes, message attempts and reminders with the same 30 fictional sample records. Other visitors’ examples are unaffected.'
							: 'Replace this local demo’s enquiries, notes, message attempts and reminders with the same 30 fictional sample records.'}
					</p>
					<div class="field">
						<label for="reset-confirmation">Type RESET DEMO to confirm</label><input
							id="reset-confirmation"
							bind:value={resetConfirmation}
							autocomplete="off"
						/>
					</div>
					<button
						class="danger button"
						disabled={busy || resetConfirmation !== 'RESET DEMO'}
						onclick={async () => {
							await act(
								{ action: 'reset', confirmation: resetConfirmation },
								'The original fictional sample data has been restored.'
							);
							if (!problem) resetConfirmation = '';
						}}>Reset sample data</button
					>
				</section>
			</div>
			<p class="sandbox-footnote">
				Worker leases recover abandoned “Processing” jobs after a timeout. This prototype does not
				promise exactly-once delivery and is not ready for real customer information.{#if publicMode}
					Your workspace expires after 24 real hours. Advancing the demo clock does not extend it.{/if}
			</p>
		{:else}<section class="panel">
				<h1>That demonstration screen does not exist.</h1>
				<a class="primary button" href={destination('intro')}>Return to the introduction</a>
			</section>{/if}
		<footer class="demo-footer">
			<span>Example Office Services <span aria-hidden="true">/</span> Kolkata &amp; Dubai</span
			><span
				>Working prototype with simulated messaging <span aria-hidden="true">·</span> Built for the ClinConsult
				portfolio</span
			>
		</footer>
	</div>
</div>

<style>
	.enquiry-demo {
		--ink: #1d343b;
		--muted: #5c6e72;
		--line: #dce3df;
		--paper: #f5f7f3;
		--teal: #155d55;
		--soft: #e9f0e8;
		color: var(--ink);
		background: var(--paper);
		font-family: Arial, Helvetica, sans-serif;
		min-height: 100vh;
		font-size: 15px;
		line-height: 1.6;
		letter-spacing: 0;
	}
	.enquiry-demo :global(*) {
		box-sizing: border-box;
	}
	.enquiry-demo :global(a),
	.enquiry-demo :global(button),
	.enquiry-demo :global(input),
	.enquiry-demo :global(select),
	.enquiry-demo :global(textarea) {
		-webkit-tap-highlight-color: transparent;
	}
	.enquiry-demo :global(:focus-visible) {
		outline: 3px solid #227d72;
		outline-offset: 4px;
	}
	.enquiry-demo :global(button),
	.enquiry-demo :global(input),
	.enquiry-demo :global(select),
	.enquiry-demo :global(textarea) {
		font: inherit;
	}
	.enquiry-demo :global(button) {
		cursor: pointer;
	}
	.enquiry-demo :global(button:disabled) {
		cursor: wait;
		opacity: 0.55;
	}
	.enquiry-demo :global(a) {
		color: inherit;
		text-decoration: none;
	}
	.enquiry-demo :global(h1),
	.enquiry-demo :global(h2),
	.enquiry-demo :global(p) {
		margin: 0;
	}
	.enquiry-demo :global(h1) {
		font-family: Georgia, 'Times New Roman', serif;
		letter-spacing: -1.6px;
		line-height: 1.12;
		font-weight: 400;
		font-size: clamp(34px, 4vw, 48px);
	}
	.enquiry-demo :global(h2) {
		font-size: 18px;
		line-height: 1.35;
		letter-spacing: -0.3px;
		font-weight: 600;
	}
	.enquiry-demo :global(p) {
		color: var(--muted);
	}
	.enquiry-demo :global(small) {
		font-size: 12px;
	}
	.demo-banner {
		background: #e9efe6;
		border-bottom: 1px solid #d7e1d2;
		color: #3c5745;
		text-align: center;
		padding: 11px 16px;
		font-size: 12px;
		letter-spacing: 0.1px;
	}
	.workspace-notice {
		padding: 11px 20px;
		text-align: center;
		background: #f0f5ed;
		border-bottom: 1px solid #dce6d7;
	}
	.workspace-notice p {
		font-size: 11px;
		color: #375946;
	}
	.workspace-notice .workspace-expiry {
		font-size: 10px;
		color: #5c6e62;
		margin-top: 3px;
	}
	.login-panel > .button {
		margin-top: 24px;
	}
	.demo-dot {
		display: inline-block;
		height: 6px;
		width: 6px;
		border-radius: 50%;
		background: #438265;
		margin-right: 7px;
		vertical-align: middle;
	}
	.demo-wrap {
		max-width: 1280px;
		margin: auto;
		padding: 0 40px;
	}
	.demo-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 30px 0;
		border-bottom: 1px solid var(--line);
		margin-bottom: 48px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		font-weight: 600;
		line-height: 1.4;
		font-size: 16px;
	}
	.brand small {
		display: block;
		font-weight: 400;
		color: var(--muted);
		font-size: 11px;
		margin-top: 4px;
	}
	.brand-mark {
		height: 42px;
		width: 42px;
		background: var(--ink);
		color: white;
		font-family: Georgia, serif;
		font-weight: 400;
		font-size: 36px;
		line-height: 34px;
		text-align: center;
		border-radius: 4px;
	}
	.brand-mark span {
		color: #c5db9f;
	}
	.demo-header nav {
		display: flex;
		align-items: center;
		gap: 25px;
		font-size: 13px;
	}
	.demo-header nav a {
		padding: 7px 0;
		position: relative;
	}
	.demo-header nav a:hover,
	.demo-header nav a.active {
		color: var(--teal);
	}
	.demo-header nav a.active:after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--teal);
	}
	.text-button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		font-size: 12px !important;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 10px;
		letter-spacing: 1.7px;
		font-weight: 700;
		color: var(--teal);
		line-height: 1.7;
	}
	.line {
		height: 1px;
		width: 28px;
		background: var(--teal);
	}
	.hero {
		display: grid;
		grid-template-columns: 1.13fr 0.87fr;
		gap: 70px;
		align-items: center;
		padding: 30px 0 68px;
	}
	.hero h1 {
		font-size: clamp(48px, 5.4vw, 72px);
		margin: 23px 0;
		letter-spacing: -3px;
		line-height: 1.05;
	}
	.hero h1 em {
		font-weight: 400;
		color: var(--teal);
	}
	.hero-lead {
		font-size: 20px;
		line-height: 1.55;
		color: var(--ink) !important;
	}
	.hero-description {
		max-width: 485px;
		margin-top: 18px !important;
		font-size: 14px;
		line-height: 1.85;
	}
	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 28px;
	}
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 20px;
		min-height: 46px;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 11px 18px;
		font-size: 13px !important;
		font-weight: 600;
		line-height: 1.5;
		transition: background 0.15s;
	}
	.primary {
		background: var(--teal);
		color: #fff !important;
	}
	.primary:hover {
		background: #104a44;
	}
	.secondary {
		border-color: #cfd9d3;
		background: transparent;
		color: var(--ink);
	}
	.secondary:hover {
		background: #e8eee7;
	}
	.button.small {
		padding: 8px 12px;
		min-height: 36px;
		font-size: 12px !important;
	}
	.fine-print {
		font-size: 11px;
		line-height: 1.7;
		margin-top: 13px !important;
		color: var(--muted);
	}
	.proof-card {
		background: #fff;
		border: 1px solid #d5dfd7;
		border-radius: 8px;
		box-shadow: 0 18px 40px -25px #28463544;
		padding: 28px 28px 0;
		position: relative;
	}
	.proof-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid var(--line);
		padding-bottom: 20px;
		margin-bottom: 10px;
	}
	.proof-kicker {
		font-size: 10px;
		letter-spacing: 1.4px;
		color: var(--muted);
		font-weight: 600;
	}
	.chip {
		padding: 3px 8px;
		border: 1px solid #d5e6d1;
		border-radius: 4px;
		background: #f1f6ed;
		font-size: 10px;
		color: #44623b;
	}
	.journey-step {
		display: flex;
		gap: 17px;
		padding: 22px 0;
		position: relative;
	}
	.journey-step:not(:last-of-type):after {
		content: '';
		position: absolute;
		left: 15px;
		top: 56px;
		bottom: -12px;
		width: 1px;
		background: var(--line);
	}
	.step-number {
		flex-shrink: 0;
		height: 32px;
		width: 32px;
		border: 1px solid #d4e1d4;
		background: #f3f7ef;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		color: #577549;
	}
	.journey-step h2 {
		font-size: 15px;
		margin: 3px 0 7px;
	}
	.journey-step p {
		font-size: 12px;
		line-height: 1.8;
	}
	.proof-bottom {
		display: flex;
		gap: 12px;
		padding: 18px 28px;
		margin: 6px -28px 0;
		background: #eef3ed;
		border-radius: 0 0 8px 8px;
	}
	.proof-bottom > span {
		color: var(--teal);
		font-size: 17px;
	}
	.proof-bottom p {
		font-size: 10px;
		line-height: 1.8;
	}
	.proof-bottom strong {
		font-weight: 600;
		color: var(--ink);
	}
	.principles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 36px;
		padding: 34px 0 40px;
		border-top: 1px solid var(--line);
	}
	.principles > div {
		display: grid;
		grid-template-columns: 28px 1fr;
		gap: 5px 10px;
	}
	.mini-icon {
		grid-row: span 2;
		font-size: 23px;
		line-height: 1.3;
		color: var(--teal);
	}
	.principles h2 {
		font-size: 14px;
	}
	.principles p {
		font-size: 12px;
		line-height: 1.8;
		max-width: 270px;
	}
	.page-heading {
		margin-bottom: 32px;
	}
	.page-heading h1 {
		margin: 12px 0;
	}
	.page-heading > p,
	.page-heading > div > p {
		font-size: 14px;
		max-width: 670px;
	}
	.heading-with-actions {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 20px;
	}
	.panel {
		background: white;
		border: 1px solid var(--line);
		border-radius: 7px;
		padding: 27px;
	}
	.panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 22px;
	}
	.form-layout {
		display: grid;
		grid-template-columns: 1.8fr 1fr;
		gap: 45px;
		align-items: start;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 18px 0;
	}
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 22px;
	}
	.field-row .field {
		margin-top: 0;
	}
	.field label {
		font-size: 12px;
		font-weight: 600;
	}
	.field input,
	.field select,
	.field textarea,
	.timezone-control select {
		width: 100%;
		min-height: 43px;
		border: 1px solid #cbd6cf;
		background: #fff;
		border-radius: 4px;
		padding: 10px 11px;
		font-size: 13px !important;
		color: var(--ink);
	}
	.field textarea {
		resize: vertical;
		min-height: 95px;
		line-height: 1.6;
	}
	.field input[aria-invalid='true'],
	.field select[aria-invalid='true'],
	.field textarea[aria-invalid='true'] {
		border-color: #a84631;
	}
	.field-error {
		color: #a13222;
		font-size: 12px;
	}
	.field-hint {
		font-size: 10px;
		color: var(--muted);
	}
	.optional {
		font-weight: 400;
		color: var(--muted);
	}
	.submit-button {
		margin-top: 8px;
	}
	.honey {
		position: absolute;
		left: -10000px;
		top: auto;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	.side-note {
		padding: 15px 0;
	}
	.side-note ol {
		list-style: none;
		counter-reset: next;
		padding: 0;
		margin: 25px 0;
	}
	.side-note li {
		counter-increment: next;
		position: relative;
		padding-left: 30px;
		margin-bottom: 25px;
	}
	.side-note li:before {
		content: counter(next, decimal-leading-zero);
		position: absolute;
		left: 0;
		top: 1px;
		color: #719178;
		font-size: 11px;
	}
	.side-note strong {
		font-size: 13px;
	}
	.side-note p {
		font-size: 12px;
		margin-top: 5px !important;
	}
	.quiet-box {
		padding: 16px;
		background: #f1f5ef;
		border: 1px solid #e2e8df;
		border-radius: 4px;
		font-size: 12px;
		line-height: 1.8;
		margin: 18px 0;
	}
	.quiet-box p {
		font-size: 12px;
		margin-top: 5px !important;
	}
	.receipt {
		max-width: 730px;
		margin: 20px auto 75px;
		text-align: center;
		padding: 42px;
	}
	.receipt .eyebrow {
		justify-content: center;
	}
	.receipt-check {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 54px;
		width: 54px;
		border-radius: 50%;
		background: #e8f1e3;
		color: var(--teal);
		font-size: 25px;
		margin: 0 auto 22px;
	}
	.receipt h1 {
		font-size: 43px;
		margin: 15px 0 22px;
	}
	.receipt-reference {
		color: var(--ink) !important;
		margin-bottom: 18px !important;
	}
	.receipt-reference strong {
		font-size: 20px;
		margin-left: 10px;
	}
	.receipt > .quiet-box {
		text-align: left;
		margin: 24px 0;
	}
	.receipt > p {
		font-size: 14px;
	}
	.receipt .hero-actions {
		justify-content: center;
	}
	.deadline-line {
		font-size: 12px !important;
	}
	.login-panel {
		max-width: 510px;
		margin: 20px auto 90px;
		padding: 37px;
	}
	.login-panel h1 {
		margin: 14px 0 18px;
		font-size: 39px;
	}
	.login-panel > p {
		font-size: 13px;
	}
	.login-panel form {
		margin-top: 25px;
	}
	.login-panel code,
	.restricted code {
		font-size: 11px;
		background: #eef2eb;
		padding: 2px 3px;
		overflow-wrap: anywhere;
	}
	.notice {
		padding: 15px 18px;
		border-radius: 4px;
		border: 1px solid;
		margin-bottom: 24px;
		font-size: 13px;
	}
	.error-notice {
		background: #fff0e9;
		border-color: #e8b7a6;
		color: #8c3828;
	}
	.success-notice {
		background: #edf5e9;
		border-color: #c5d9ba;
		color: #375b2b;
	}
	.overdue-notice {
		background: #fcf1df;
		border-color: #e9cfa2;
		color: #7a5220;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
		margin-bottom: 27px;
	}
	.stats button {
		text-align: left;
		background: white;
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 19px 21px;
		color: var(--ink);
	}
	.stats button:hover {
		border-color: #91afa0;
	}
	.stats button > span {
		display: block;
		font-size: 11px;
		color: var(--muted);
	}
	.stats strong {
		display: block;
		font-size: 38px;
		font-weight: 400;
		line-height: 1.6;
		letter-spacing: -1px;
	}
	.stats small {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: var(--muted);
	}
	.stats .warning-stat {
		background: #fbf4e9;
		border-color: #e7d7b8;
	}
	.warning-stat strong {
		color: #8e5c1e;
	}
	.list-panel {
		padding: 24px 0 0;
		overflow: hidden;
	}
	.list-panel > .panel-heading {
		padding: 0 25px;
	}
	.count-tag {
		font-family: Arial, sans-serif;
		font-size: 11px;
		font-weight: 400;
		color: #5c7466;
		padding: 3px 7px;
		vertical-align: middle;
		margin-left: 6px;
		background: #edf2e9;
		border-radius: 3px;
	}
	.list-panel .fine-print {
		margin-top: 5px !important;
	}
	.timezone-control {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 10px;
		min-width: 138px;
	}
	.timezone-control select {
		font-size: 11px !important;
		padding: 6px 9px;
		min-height: 34px;
	}
	.filters {
		display: grid;
		grid-template-columns: 1.6fr 0.85fr 1fr 1.25fr 1.3fr;
		gap: 12px;
		background: #f8faf6;
		padding: 17px 25px;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	.filters .field {
		margin: 0;
	}
	.filters .field label {
		font-size: 10px;
		font-weight: 400;
	}
	.filters .field input,
	.filters .field select {
		padding: 8px;
		min-height: 36px;
		font-size: 11px !important;
	}
	.table-scroll {
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		white-space: nowrap;
		text-align: left;
		font-size: 12px;
	}
	th {
		font-weight: 500;
		font-size: 10px;
		color: var(--muted);
		padding: 13px 20px;
		background: #fcfdfb;
		border-bottom: 1px solid var(--line);
	}
	td {
		padding: 17px 20px;
		border-bottom: 1px solid #e7ece5;
		vertical-align: top;
	}
	td:first-child,
	th:first-child {
		padding-left: 25px;
	}
	td small {
		display: block;
		font-size: 10px;
		color: var(--muted);
		margin-top: 5px;
	}
	.reference-link {
		font-weight: 600;
		color: var(--teal) !important;
	}
	.reference-link:hover {
		text-decoration: underline !important;
	}
	.reference-link > span {
		font-size: 11px;
		font-weight: 400;
	}
	.status-pill {
		display: inline-block;
		font-size: 10px;
		line-height: 1.5;
		padding: 4px 8px;
		background: #eef1ee;
		border: 1px solid #e0e6df;
		border-radius: 3px;
		white-space: nowrap;
	}
	.status-pill.resolved {
		color: #426832;
		background: #edf5e5;
		border-color: #d6e5cb;
	}
	.overdue-text {
		color: #9c5426;
	}
	.fallback-label {
		display: block;
		color: #8a672d;
		font-size: 9px;
		margin-top: 4px;
	}
	.ack-text {
		font-size: 10px;
	}
	.list-footer {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		font-size: 10px;
		padding: 15px 25px;
		background: #fafcf8;
		color: var(--muted);
	}
	.empty-state {
		text-align: center;
		color: var(--muted);
		padding: 35px;
	}
	.loading-text {
		padding: 25px;
		color: var(--muted);
		font-size: 13px;
	}
	.back-link {
		display: inline-block;
		font-size: 12px;
		color: var(--teal) !important;
		margin-bottom: 20px;
	}
	.detail-layout {
		display: grid;
		grid-template-columns: 1.65fr 1fr;
		gap: 24px;
		align-items: start;
	}
	.detail-main,
	.detail-aside {
		display: grid;
		gap: 24px;
	}
	.customer-message {
		font-size: 16px;
		line-height: 1.85;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--ink) !important;
		padding: 8px 0 25px;
	}
	.record-facts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
		margin: 0;
		padding: 22px 0;
		border-top: 1px solid var(--line);
	}
	.record-facts dt {
		font-size: 10px;
		color: var(--muted);
		margin-bottom: 5px;
	}
	.record-facts dd {
		margin: 0;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.response-record {
		border-top: 1px solid var(--line);
		padding-top: 20px;
		font-size: 13px;
	}
	.response-record p {
		font-size: 12px;
		line-height: 1.8;
		margin: 8px 0 15px !important;
	}
	.history {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.history li {
		display: flex;
		gap: 16px;
		position: relative;
		padding-bottom: 24px;
	}
	.history li:last-child {
		padding-bottom: 0;
	}
	.history li:not(:last-child):after {
		content: '';
		position: absolute;
		left: 4px;
		width: 1px;
		background: var(--line);
		top: 13px;
		bottom: 4px;
	}
	.history-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #a8c1a5;
		margin-top: 6px;
		flex-shrink: 0;
	}
	.history p {
		font-size: 12px;
		color: var(--ink);
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.history small {
		color: var(--muted);
		font-size: 10px;
	}
	.detail-aside form {
		margin-top: 22px;
	}
	.detail-aside form .field:first-child {
		margin-top: 0;
	}
	.ack-panel h2 {
		margin: 9px 0 17px;
	}
	.ack-state {
		font-size: 14px;
		font-weight: 600;
		color: var(--ink) !important;
	}
	.ack-panel details {
		margin: 20px 0;
		font-size: 12px;
	}
	.ack-panel summary {
		cursor: pointer;
		padding: 8px 0;
		color: var(--teal);
	}
	.message-preview {
		padding: 16px;
		background: #f6f8f4;
		border: 1px solid var(--line);
		border-radius: 3px;
	}
	.message-preview small,
	.message-preview strong {
		display: block;
		overflow-wrap: anywhere;
		margin-bottom: 12px;
		font-size: 11px;
	}
	.message-preview p {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 11px;
		line-height: 1.8;
	}
	.failure-box {
		background: #fdf0e9;
		border-color: #efd4c8;
		color: #914a30;
	}
	.sandbox-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
	}
	.sandbox-grid .panel {
		padding: 28px 30px;
	}
	.routing-panel {
		min-width: 0;
	}
	.routing-panel .table-scroll {
		margin-top: 20px;
	}
	.routing-panel table {
		white-space: normal;
		min-width: 470px;
	}
	.routing-panel th,
	.routing-panel td {
		padding: 12px 10px;
	}
	.routing-panel th:first-child,
	.routing-panel td:first-child {
		padding-left: 0;
	}
	.sandbox-grid .reset-panel {
		grid-column: 1 / -1;
	}
	.control-number {
		display: block;
		font-size: 11px;
		color: #6d8a72;
		letter-spacing: 1px;
		margin-bottom: 14px;
	}
	.sandbox-grid h2 {
		font-size: 20px;
		margin-bottom: 13px;
	}
	.sandbox-grid p {
		font-size: 13px;
		line-height: 1.85;
	}
	.control-stack {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 9px;
		margin-top: 23px;
	}
	.control-stack .button {
		justify-content: flex-start;
		font-weight: 400;
	}
	.current-setting {
		font-size: 12px !important;
		margin-top: 20px !important;
	}
	.current-setting strong {
		color: var(--ink);
		font-weight: 500;
	}
	.clock-readout {
		padding: 18px 0;
		margin: 6px 0;
	}
	.clock-readout strong,
	.clock-readout span {
		display: block;
	}
	.clock-readout strong {
		font-size: 21px;
		font-weight: 400;
	}
	.clock-readout span {
		font-size: 11px;
		color: var(--muted);
		margin-top: 5px;
	}
	.reset-panel {
		background: #fdfbf7;
		border-color: #e6ddd0;
	}
	.danger {
		background: #8c4938;
		color: white !important;
	}
	.danger:hover {
		background: #733a2d;
	}
	.sandbox-footnote {
		font-size: 11px;
		max-width: 810px;
		margin-top: 24px !important;
	}
	.sandbox-grid .primary {
		margin-top: 24px;
	}
	.demo-footer {
		border-top: 1px solid var(--line);
		margin-top: 55px;
		padding: 25px 0 30px;
		display: flex;
		justify-content: space-between;
		gap: 15px;
		font-size: 10px;
		color: #738079;
	}
	.demo-footer span span {
		margin: 0 7px;
		color: #b0baae;
	}
	.restricted {
		max-width: 700px;
		margin: 50px auto 100px;
	}
	.restricted h1 {
		margin: 18px 0;
	}
	.restricted p {
		margin: 15px 0 !important;
		font-size: 14px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (min-width: 1500px) {
		.hero {
			padding-top: 45px;
			padding-bottom: 90px;
		}
		.hero h1 {
			font-size: 76px;
		}
	}
	@media (max-width: 1050px) {
		.demo-wrap {
			padding: 0 25px;
		}
		.hero {
			gap: 35px;
		}
		.hero h1 {
			font-size: 58px;
		}
		.hero-actions .button {
			gap: 10px;
		}
		.demo-header nav {
			gap: 15px;
		}
		.brand {
			font-size: 14px;
		}
		.filters {
			grid-template-columns: repeat(3, 1fr);
		}
		.search-field {
			grid-column: span 2;
		}
		.stats button {
			padding: 17px 15px;
		}
		.detail-layout {
			grid-template-columns: 1.4fr 1fr;
		}
		.panel {
			padding: 23px;
		}
		.form-layout {
			gap: 28px;
		}
		.panel-heading {
			align-items: start;
		}
		.panel-heading .small {
			font-size: 10px !important;
			max-width: 170px;
		}
		.demo-footer {
			font-size: 9px;
		}
	}
	@media (max-width: 760px) {
		.demo-wrap {
			padding: 0 20px;
		}
		.demo-banner {
			font-size: 10px;
			padding: 10px 18px;
		}
		.demo-header {
			padding: 20px 0;
			flex-wrap: wrap;
			gap: 20px;
			margin-bottom: 32px;
		}
		.demo-header nav {
			width: 100%;
			gap: 22px;
			font-size: 12px;
		}
		.hero {
			grid-template-columns: 1fr;
			gap: 36px;
			padding: 12px 0 40px;
		}
		.hero h1 {
			font-size: clamp(48px, 9.6vw, 68px);
			letter-spacing: -2px;
			margin: 22px 0;
		}
		.hero-lead {
			font-size: 18px;
		}
		.hero-description {
			max-width: 100%;
		}
		.hero .fine-print {
			font-size: 10px;
		}
		.proof-card {
			max-width: 530px;
			width: 100%;
			padding: 24px 24px 0;
		}
		.proof-bottom {
			padding: 18px 24px;
			margin-left: -24px;
			margin-right: -24px;
		}
		.principles {
			grid-template-columns: 1fr;
			gap: 24px;
			padding: 28px 0;
		}
		.principles p {
			max-width: 100%;
		}
		.principles > div {
			grid-template-columns: 28px 1fr;
		}
		.form-layout,
		.detail-layout {
			grid-template-columns: 1fr;
			gap: 25px;
		}
		.side-note {
			padding-top: 6px;
		}
		.page-heading h1 {
			font-size: 36px;
			letter-spacing: -1px;
		}
		.field-row {
			gap: 15px;
		}
		.panel-heading {
			flex-wrap: wrap;
		}
		.stats {
			grid-template-columns: 1fr 1fr;
			gap: 10px;
		}
		.stats strong {
			font-size: 32px;
		}
		.stats button > span {
			font-size: 10px;
		}
		.stats small {
			font-size: 9px;
		}
		.heading-with-actions {
			align-items: start;
			flex-wrap: wrap;
		}
		.heading-with-actions > .button {
			min-height: 36px;
			padding: 8px 12px;
			font-size: 11px !important;
		}
		.filters {
			grid-template-columns: 1fr 1fr;
			padding: 17px;
		}
		.search-field {
			grid-column: span 2;
		}
		.filters .field:last-child {
			grid-column: span 2;
		}
		.list-panel > .panel-heading {
			padding: 0 17px;
		}
		.list-panel .panel-heading {
			gap: 12px;
		}
		.list-panel .panel-heading > div:first-child {
			flex: 1;
		}
		.list-panel .panel-heading p {
			font-size: 10px;
			max-width: 240px;
		}
		.list-footer {
			padding: 15px 17px;
		}
		.receipt {
			padding: 30px 23px;
			margin: 10px auto 45px;
		}
		.receipt h1 {
			font-size: 36px;
		}
		.receipt .eyebrow {
			font-size: 9px;
			letter-spacing: 1px;
		}
		.receipt .hero-actions .button {
			width: 100%;
		}
		.receipt-reference strong {
			display: block;
			margin-left: 0;
			margin-top: 7px;
		}
		.login-panel {
			padding: 28px;
			margin-bottom: 60px;
		}
		.login-panel h1 {
			font-size: 34px;
		}
		.sandbox-grid {
			grid-template-columns: 1fr;
			gap: 17px;
		}
		.sandbox-grid .panel {
			padding: 25px;
		}
		.demo-footer {
			margin-top: 38px;
			flex-direction: column;
			gap: 7px;
			font-size: 10px;
		}
		.record-facts {
			gap: 15px;
		}
		.detail-main .panel,
		.detail-aside .panel {
			padding: 23px;
		}
		.customer-message {
			font-size: 15px;
		}
		.eyebrow {
			font-size: 9px;
		}
		.restricted {
			padding: 25px;
		}
		.restricted h1 {
			font-size: 34px;
		}
	}
	@media (max-width: 400px) {
		.demo-wrap {
			padding: 0 14px;
		}
		.demo-header nav {
			gap: 15px;
			font-size: 11px;
		}
		.brand {
			font-size: 13px;
		}
		.field-row {
			grid-template-columns: 1fr;
			gap: 0;
		}
		.field-row .field {
			margin-bottom: 18px;
		}
		.hero-actions .button {
			width: 100%;
		}
		.hero h1 {
			font-size: 46px;
		}
		.stats button {
			padding: 15px 12px;
		}
		.stats button > span {
			min-height: 30px;
		}
		.record-facts {
			grid-template-columns: 1fr;
		}
		.proof-card {
			padding-left: 19px;
			padding-right: 19px;
		}
		.proof-bottom {
			padding-left: 19px;
			padding-right: 19px;
			margin-left: -19px;
			margin-right: -19px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.button {
			transition: none;
		}
	}
</style>
