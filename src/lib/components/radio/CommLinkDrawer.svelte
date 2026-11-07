<script lang="ts">
	import type {
		InvitationPreview,
		RadioAccessPolicy,
		RadioDeviceOption,
		RadioMediaErrorInfo,
		RadioMode,
		RadioProviderStatus,
		RadioRoomDetail,
		RadioRoomSummary,
		RadioUser
	} from '$lib/radio/types';

	export type ActivePanel =
		| 'none'
		| 'join-flow'
		| 'scan'
		| 'people'
		| 'speaker'
		| 'settings'
		| 'lock'
		| 'legal';

	interface Props {
		activePanel: ActivePanel;
		highContrast: boolean;
		user: RadioUser | null;
		provider: RadioProviderStatus;
		allowLocalTestAuth: boolean;
		rooms: RadioRoomSummary[];
		selectedRoom: RadioRoomSummary | null;
		activeRoomDetail: RadioRoomDetail | null;
		isConnected: boolean;
		isConnecting: boolean;
		isMuted: boolean;
		isTransmitting: boolean;
		joinAsListener: boolean;
		micPermissionPrePromptConfirmed: boolean;
		browserMicCapturedWhenMuted: boolean;
		pendingInvitation: InvitationPreview | null;
		pendingInviteToken: string | null;
		activeInviteLink: string | null;
		copyFeedback: string | null;
		statusBanner: string | null;
		errorBanner: string | null;
		mediaError: RadioMediaErrorInfo | null;
		audioPlaybackBlocked: boolean;
		pttLatchMode: boolean;
		radioSoundsEnabled: boolean;
		volume: number;
		inputDevices: RadioDeviceOption[];
		outputDevices: RadioDeviceOption[];
		selectedInputDeviceId: string;
		selectedOutputDeviceId: string;
		sinkIdSupported: boolean;
		localMicTestActive: boolean;
		localMicTestLevel: number;
		latencyMs: number | null;
		onClosePanel: () => void;
		onSelectPanel: (panel: ActivePanel) => void;
		onToggleHighContrast: () => void;
		onSelectRoomSlot: (roomId: string) => void;
		onStartCreateRoom: (payload: {
			name: string;
			mode: RadioMode;
			accessPolicy: RadioAccessPolicy;
			maxParticipants: number;
			explicitMemberEmails: string[];
			invitationExpiryHours: number;
		}) => Promise<void>;
		onPreviewInviteInput: (tokenOrUrl: string) => Promise<void>;
		onRequestJoinRoom: (roomId: string, inviteToken: string | null, asListener: boolean) => Promise<void>;
		onConfirmMicPrePromptAndJoin: (roomId: string) => Promise<void>;
		onJoinListeningOnly: (roomId: string) => Promise<void>;
		onDisconnectRoom: () => Promise<void>;
		onTogglePower: () => Promise<void>;
		onPttToggleConversation: () => Promise<void>;
		onPttPressStart: () => Promise<void>;
		onPttPressEnd: () => Promise<void>;
		onHostAction: (payload: Record<string, unknown>) => Promise<void>;
		onCopyInviteLink: () => Promise<void>;
		onNativeShareInviteLink: () => Promise<void>;
		onVolumeChange: (val: number) => void;
		onSelectInputDevice: (id: string) => void;
		onSelectOutputDevice: (id: string) => Promise<void>;
		onToggleLocalMicTest: () => Promise<void>;
		onResumeBlockedAudio: () => Promise<void>;
		onTogglePttLatch: (enabled: boolean) => void;
		onToggleRadioSounds: (enabled: boolean) => void;
		onSignOut: () => Promise<void>;
		onDeleteAccount: () => Promise<void>;
		onSubmitAbuseReport: (payload: {
			reason: 'harassment' | 'impersonation' | 'spam' | 'unauthorised_access' | 'privacy' | 'other';
			details: string;
			targetUserId: string | null;
		}) => Promise<void>;
		onLocalTestSignIn: (profile: { sub: string; email: string; displayName: string }) => Promise<void>;
	}

	let {
		activePanel,
		highContrast,
		user,
		provider,
		allowLocalTestAuth,
		rooms,
		selectedRoom,
		activeRoomDetail,
		isConnected,
		isConnecting,
		isMuted,
		isTransmitting,
		joinAsListener,
		micPermissionPrePromptConfirmed,
		browserMicCapturedWhenMuted,
		pendingInvitation,
		pendingInviteToken,
		activeInviteLink,
		copyFeedback,
		statusBanner,
		errorBanner,
		mediaError,
		audioPlaybackBlocked,
		pttLatchMode,
		radioSoundsEnabled,
		volume,
		inputDevices,
		outputDevices,
		selectedInputDeviceId,
		selectedOutputDeviceId,
		sinkIdSupported,
		localMicTestActive,
		localMicTestLevel,
		latencyMs,
		onClosePanel,
		onSelectPanel,
		onToggleHighContrast,
		onSelectRoomSlot,
		onStartCreateRoom,
		onPreviewInviteInput,
		onRequestJoinRoom,
		onConfirmMicPrePromptAndJoin,
		onJoinListeningOnly,
		onDisconnectRoom,
		onTogglePower,
		onPttToggleConversation,
		onPttPressStart,
		onPttPressEnd,
		onHostAction,
		onCopyInviteLink,
		onNativeShareInviteLink,
		onVolumeChange,
		onSelectInputDevice,
		onSelectOutputDevice,
		onToggleLocalMicTest,
		onResumeBlockedAudio,
		onTogglePttLatch,
		onToggleRadioSounds,
		onSignOut,
		onDeleteAccount,
		onSubmitAbuseReport,
		onLocalTestSignIn
	}: Props = $props();

	let newRoomName = $state('EVENING CHAT');
	let newRoomMode = $state<RadioMode>('conversation');
	let newRoomAccessPolicy = $state<RadioAccessPolicy>('approval_required');
	let newRoomMaxParticipants = $state(12);
	let newRoomExplicitEmails = $state('');
	let newRoomExpiryHours = $state(24);

	let inviteInputText = $state('');
	let explicitMemberEmailToAdd = $state('');

	let reportReason = $state<
		'harassment' | 'impersonation' | 'spam' | 'unauthorised_access' | 'privacy' | 'other'
	>('harassment');
	let reportDetails = $state('');
	let reportTargetUserId = $state<string | null>(null);
	let reportSubmitted = $state(false);
	let confirmDeleteAccount = $state(false);

	let testSub = $state('operator_alpha');
	let testEmail = $state('alpha@example.com');
	let testDisplayName = $state('Maya Sen');

	const isHostOfActiveOrSelected = $derived(
		Boolean(
			user &&
				((activeRoomDetail && activeRoomDetail.hostUserId === user.id) ||
					(!activeRoomDetail && selectedRoom && selectedRoom.hostUserId === user.id))
		)
	);

	const effectiveRoom = $derived(activeRoomDetail ?? selectedRoom);

	async function handleCreateRoomSubmit(event: SubmitEvent) {
		event.preventDefault();
		const emails = newRoomExplicitEmails
			.split(',')
			.map((e) => e.trim().toLowerCase())
			.filter(Boolean);
		await onStartCreateRoom({
			name: newRoomName,
			mode: newRoomMode,
			accessPolicy: newRoomAccessPolicy,
			maxParticipants: newRoomMaxParticipants,
			explicitMemberEmails: emails,
			invitationExpiryHours: newRoomExpiryHours
		});
	}

	async function handleAddExplicitMember(event: SubmitEvent) {
		event.preventDefault();
		if (!explicitMemberEmailToAdd.trim()) return;
		await onHostAction({
			action: 'add_explicit_member',
			targetEmail: explicitMemberEmailToAdd.trim().toLowerCase()
		});
		explicitMemberEmailToAdd = '';
	}

	async function handleAbuseSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (reportDetails.trim().length < 5) return;
		await onSubmitAbuseReport({
			reason: reportReason,
			details: reportDetails.trim(),
			targetUserId: reportTargetUserId
		});
		reportDetails = '';
		reportSubmitted = true;
	}
</script>

<div class="tactical-deck" class:hc={highContrast} data-testid="radio-tactical-deck">
	{#if audioPlaybackBlocked}
		<div class="alert-banner warning" role="alert" data-testid="blocked-audio-banner">
			<span>Browser paused room audio playback.</span>
			<button
				type="button"
				class="deck-btn primary"
				onclick={() => onResumeBlockedAudio()}
				data-testid="tap-to-hear-audio-btn"
			>
				Tap to hear audio
			</button>
		</div>
	{/if}

	{#if errorBanner}
		<div class="alert-banner error" role="alert" data-testid="radio-error-banner">
			<span>{errorBanner}</span>
		</div>
	{/if}

	{#if mediaError}
		<div class="alert-banner error" role="alert" data-testid="radio-media-error">
			<div>
				<strong>{mediaError.title}:</strong>
				{mediaError.instruction}
			</div>
		</div>
	{/if}

	{#if statusBanner}
		<div class="alert-banner info" role="status" data-testid="radio-status-banner">
			<span>{statusBanner}</span>
		</div>
	{/if}

	{#if activeRoomDetail?.myParticipant?.unmuteRequestedByHost && isMuted}
		<div class="alert-banner warning" role="alert" data-testid="host-unmute-request-banner">
			<span>The room host asked if you would like to unmute your microphone.</span>
			<div class="inline-actions">
				<button
					type="button"
					class="deck-btn primary"
					onclick={() => onPttToggleConversation()}
					data-testid="accept-unmute-request-btn"
				>
					Unmute Myself
				</button>
				<button
					type="button"
					class="deck-btn"
					onclick={() =>
						activeRoomDetail &&
						fetch(`/api/radio/rooms/${activeRoomDetail.id}/join`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ action: 'acknowledge_unmute_request' })
						})}
				>
					Stay Muted
				</button>
			</div>
		</div>
	{/if}

	<!-- High-Contrast Accessible Control Bar (always visible when High-Contrast mode is active) -->
	{#if highContrast}
		<section
			class="deck-card hc-accessible-bar"
			aria-label="High-contrast accessible radio controls"
			data-testid="high-contrast-controls"
		>
			<div class="card-header">
				<h2>HIGH-CONTRAST OPERATOR CONSOLE</h2>
				<span class="badge">{isConnected ? 'CONNECTED' : 'STANDBY'}</span>
			</div>
			<div class="hc-grid">
				<button
					type="button"
					class="deck-btn primary"
					onclick={() => onTogglePower()}
					data-testid="hc-power-btn"
				>
					{isConnected ? 'Power Off / Leave Room' : 'Power On / Connect Selected Room'}
				</button>

				{#if isConnected && activeRoomDetail}
					{#if activeRoomDetail.mode === 'conversation'}
						<button
							type="button"
							class="deck-btn {isMuted ? '' : 'active-tx'}"
							onclick={() => onPttToggleConversation()}
							disabled={joinAsListener}
							data-testid="hc-mute-toggle-btn"
						>
							{joinAsListener ? 'Listening Only' : isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
						</button>
					{:else}
						<button
							type="button"
							class="deck-btn {isTransmitting ? 'active-tx' : ''}"
							onpointerdown={() => !pttLatchMode && onPttPressStart()}
							onpointerup={() => !pttLatchMode && onPttPressEnd()}
							onclick={() => pttLatchMode && (isTransmitting ? onPttPressEnd() : onPttPressStart())}
							disabled={joinAsListener}
							data-testid="hc-ptt-btn"
						>
							{isTransmitting
								? pttLatchMode
									? 'Stop Transmitting (Tap)'
									: 'Transmitting (Release to Stop)'
								: pttLatchMode
									? 'Start Transmitting (Tap)'
									: 'Hold to Speak (PTT)'}
						</button>
					{/if}
				{/if}

				<button type="button" class="deck-btn" onclick={() => onSelectPanel('scan')}>
					Rooms / Scan ({rooms.length})
				</button>
				<button type="button" class="deck-btn" onclick={() => onSelectPanel('people')}>
					Participants ({activeRoomDetail?.activeParticipantCount ?? selectedRoom?.activeParticipantCount ?? 0})
				</button>
				<button type="button" class="deck-btn" onclick={() => onSelectPanel('lock')}>
					Invite & Access Lock
				</button>
				<button type="button" class="deck-btn" onclick={() => onSelectPanel('settings')}>
					Mic, Audio & Account
				</button>
			</div>
		</section>
	{/if}

	<!-- Step-by-Step Joining & Microphone Permission Card -->
	{#if activePanel === 'join-flow' || (!user && pendingInvitation) || (user && pendingInvitation && !isConnected)}
		<section
			class="deck-card"
			aria-labelledby="join-flow-heading"
			data-testid="radio-join-flow-card"
		>
			<div class="card-header">
				<h2 id="join-flow-heading">
					{pendingInvitation ? 'INVITATION & ROOM ENTRY' : 'STEP-BY-STEP ROOM ENTRY'}
				</h2>
				{#if activePanel === 'join-flow'}
					<button type="button" class="close-btn" onclick={onClosePanel} aria-label="Close panel">
						✕
					</button>
				{/if}
			</div>

			<ol class="join-steps-indicator" aria-label="Joining steps">
				<li class:done={Boolean(pendingInvitation || selectedRoom)}>1. Open Invitation</li>
				<li class:done={Boolean(user)} class:current={!user}>2. Sign In</li>
				<li class:done={Boolean(user && (pendingInvitation?.valid || selectedRoom))} class:current={Boolean(user && !isConnected)}>
					3. Review Room
				</li>
				<li class:done={isConnected}>4. Join Listening or Enable Mic</li>
			</ol>

			{#if pendingInvitation}
				<div class="invite-preview-box" data-testid="invitation-preview-box">
					{#if pendingInvitation.valid}
						<p class="invite-title">
							Room: <strong>{pendingInvitation.roomName}</strong>
						</p>
						<p class="invite-meta">
							Host: {pendingInvitation.hostDisplayName} · Mode:
							{pendingInvitation.mode === 'radio' ? 'Radio (Push-to-Talk)' : 'Conversation'} ·
							Participants: {pendingInvitation.activeParticipantCount}/{pendingInvitation.maxParticipants}
						</p>
						<p class="invite-meta">
							Access Policy:
							{pendingInvitation.accessPolicy === 'members_only'
								? 'Restricted Member List'
								: 'Host Approval / Valid Invite Link'}
							{#if pendingInvitation.isLocked}
								· <strong>ROOM LOCKED</strong>
							{/if}
						</p>
					{:else}
						<p class="invite-invalid" data-testid="invitation-invalid-reason">
							Invitation status: <strong>{pendingInvitation.reason.toUpperCase()}</strong>
							{#if pendingInvitation.roomName}
								({pendingInvitation.roomName})
							{/if}
						</p>
					{/if}
				</div>
			{/if}

			{#if !user}
				<div class="auth-section" data-testid="google-signin-section">
					<p class="deck-copy">
						Sign in with your Google account to verify your identity. COMM-LINK requests only
						<code>openid</code>, <code>email</code>, and <code>profile</code>. It never accesses your
						inbox, contacts, or calendar.
					</p>
					<div class="action-row">
						<a
							href="/api/radio/auth/google?returnTo={encodeURIComponent(
								pendingInviteToken ? `/tools/radio?invite=${pendingInviteToken}` : '/tools/radio'
							)}"
							class="deck-btn google-btn"
							data-testid="google-signin-link"
						>
							Sign in with Google
						</a>
					</div>

					{#if allowLocalTestAuth}
						<details class="local-test-auth" data-testid="local-test-auth-details">
							<summary>Local Loopback Verification Sign-In (Dev/Test Only)</summary>
							<div class="form-row">
								<label>
									<span>Subject ID</span>
									<input type="text" bind:value={testSub} data-testid="test-auth-sub" />
								</label>
								<label>
									<span>Email</span>
									<input type="email" bind:value={testEmail} data-testid="test-auth-email" />
								</label>
								<label>
									<span>Display Name</span>
									<input type="text" bind:value={testDisplayName} data-testid="test-auth-name" />
								</label>
								<button
									type="button"
									class="deck-btn primary"
									onclick={() =>
										onLocalTestSignIn({
											sub: testSub,
											email: testEmail,
											displayName: testDisplayName
										})}
									data-testid="test-auth-submit"
								>
									Sign In (Loopback Test)
								</button>
							</div>
						</details>
					{/if}
				</div>
			{:else}
				{@const targetRoomId = pendingInvitation?.roomId ?? selectedRoom?.id ?? null}
				{@const targetRoomName = pendingInvitation?.roomName ?? selectedRoom?.name ?? 'Selected Room'}
				{@const admissionStatus =
					activeRoomDetail?.myAdmissionStatus ?? selectedRoom?.myAdmissionStatus ?? 'none'}

				{#if targetRoomId}
					<div class="join-options-box" data-testid="room-join-options">
						<p class="deck-copy">
							Ready for <strong>{targetRoomName}</strong> as <strong>{user.displayName}</strong>
							({user.email}).
						</p>

						{#if admissionStatus === 'pending_approval'}
							<div class="alert-banner warning" data-testid="waiting-host-approval">
								Waiting for the room host to approve your admission request...
							</div>
						{:else if admissionStatus === 'denied' || admissionStatus === 'removed'}
							<div class="alert-banner error" data-testid="admission-denied-banner">
								Your access to this room was {admissionStatus} by the host.
							</div>
						{:else}
							<div class="mic-disclosure-box" data-testid="mic-permission-explanation">
								<p>
									<strong>Microphone Permission Notice:</strong> “Allow microphone access so people
									in this room can hear you when you unmute.”
								</p>
								<p class="sub-note">
									Audio-only (<code>video: false</code>). Camera permission is never requested. When
									you enable your microphone, you join <strong>muted by default</strong>.
								</p>
							</div>

							<div class="action-row">
								{#if admissionStatus !== 'admitted'}
									<button
										type="button"
										class="deck-btn primary"
										onclick={() =>
											onRequestJoinRoom(targetRoomId, pendingInviteToken, false)}
										disabled={isConnecting}
										data-testid="request-join-with-mic-btn"
									>
										Request / Enable Microphone & Join (Muted)
									</button>
									<button
										type="button"
										class="deck-btn"
										onclick={() =>
											onRequestJoinRoom(targetRoomId, pendingInviteToken, true)}
										disabled={isConnecting}
										data-testid="request-join-listener-btn"
									>
										Join Listening Only (No Mic)
									</button>
								{:else}
									<button
										type="button"
										class="deck-btn primary"
										onclick={() => onConfirmMicPrePromptAndJoin(targetRoomId)}
										disabled={isConnecting}
										data-testid="enable-mic-and-join-btn"
									>
										Enable Microphone & Enter (Joins Muted)
									</button>
									<button
										type="button"
										class="deck-btn"
										onclick={() => onJoinListeningOnly(targetRoomId)}
										disabled={isConnecting}
										data-testid="join-listening-only-btn"
									>
										Join Listening Only (No Mic Permission)
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<p class="deck-copy">
						Select an authorised channel with the dial or create a new room below.
					</p>
				{/if}
			{/if}
		</section>
	{/if}

	<!-- SCAN Panel: Authorised Rooms, Create Room, or Paste Invitation -->
	{#if activePanel === 'scan'}
		<section class="deck-card" aria-labelledby="scan-heading" data-testid="panel-scan">
			<div class="card-header">
				<h2 id="scan-heading">SCAN — AUTHORISED CHANNELS & ROOM CREATION</h2>
				<button type="button" class="close-btn" onclick={onClosePanel} aria-label="Close panel">
					✕
				</button>
			</div>

			<p class="deck-copy">
				SCAN lists only rooms your signed-in account is authorised to access. Turning the channel
				dial selects a room without silently joining or transmitting audio.
			</p>

			{#if !user}
				<div class="action-row">
					<a href="/api/radio/auth/google?returnTo=%2Ftools%2Fradio" class="deck-btn google-btn">
						Sign in with Google to view or create rooms
					</a>
					{#if allowLocalTestAuth}
						<button
							type="button"
							class="deck-btn"
							onclick={() => onSelectPanel('join-flow')}
							data-testid="open-local-test-auth-btn"
						>
							Local Loopback Sign-In
						</button>
					{/if}
				</div>
			{:else}
				<div class="room-list" data-testid="authorised-rooms-list">
					{#if rooms.length === 0}
						<p class="empty-note">No authorised rooms yet. Create one below or open an invite link.</p>
					{:else}
						{#each rooms as room, idx (room.id)}
							<div
								class="room-row"
								class:selected={selectedRoom?.id === room.id}
								data-testid="room-row-{room.slug}"
							>
								<div class="room-row-info">
									<span class="ch-tag">CH {String(idx + 1).padStart(2, '0')}</span>
									<strong>{room.name}</strong>
									<span class="meta-pill">{room.mode.toUpperCase()}</span>
									<span class="meta-pill">
										{room.activeParticipantCount}/{room.maxParticipants} PEOPLE
									</span>
									{#if room.isLocked}
										<span class="meta-pill locked">LOCKED</span>
									{/if}
								</div>
								<div class="room-row-actions">
									<button
										type="button"
										class="deck-btn"
										onclick={() => onSelectRoomSlot(room.id)}
										data-testid="select-room-btn-{idx + 1}"
									>
										{selectedRoom?.id === room.id ? 'Selected' : 'Select Channel'}
									</button>
									<button
										type="button"
										class="deck-btn primary"
										onclick={() => {
											onSelectRoomSlot(room.id);
											onSelectPanel('join-flow');
										}}
										data-testid="review-join-room-btn-{idx + 1}"
									>
										{isConnected && activeRoomDetail?.id === room.id ? 'In Room' : 'Review / Join'}
									</button>
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<hr class="deck-divider" />

				<form class="deck-form" onsubmit={handleCreateRoomSubmit} data-testid="create-room-form">
					<h3>CREATE NEW ROOM</h3>
					<div class="form-grid">
						<label>
							<span>Room Name (Channel Label)</span>
							<input
								type="text"
								bind:value={newRoomName}
								maxlength="36"
								required
								data-testid="create-room-name-input"
							/>
						</label>
						<label>
							<span>Initial Mode</span>
							<select bind:value={newRoomMode} data-testid="create-room-mode-select">
								<option value="conversation">Conversation (Multi-Speaker)</option>
								<option value="radio">Radio (Push-to-Talk Lease)</option>
							</select>
						</label>
						<label>
							<span>Access Policy</span>
							<select bind:value={newRoomAccessPolicy} data-testid="create-room-policy-select">
								<option value="approval_required">Invite Link or Host Approval</option>
								<option value="members_only">Restricted Explicit Member List</option>
							</select>
						</label>
						<label>
							<span>Capacity Limit (2–12)</span>
							<input
								type="number"
								min="2"
								max="12"
								bind:value={newRoomMaxParticipants}
								data-testid="create-room-capacity-input"
							/>
						</label>
					</div>

					{#if newRoomAccessPolicy === 'members_only'}
						<label class="full-width">
							<span>Permitted Member Emails (comma-separated)</span>
							<input
								type="text"
								placeholder="friend1@gmail.com, friend2@gmail.com"
								bind:value={newRoomExplicitEmails}
								data-testid="create-room-members-input"
							/>
						</label>
					{/if}

					<div class="action-row">
						<button type="submit" class="deck-btn primary" data-testid="create-room-submit-btn">
							Create Room & Generate Invite Link
						</button>
					</div>
				</form>

				<hr class="deck-divider" />

				<div class="deck-form">
					<h3>OPEN INVITATION TOKEN OR LINK</h3>
					<div class="inline-form">
						<input
							type="text"
							placeholder="Paste invitation URL or token..."
							bind:value={inviteInputText}
							aria-label="Invitation URL or token"
							data-testid="paste-invite-input"
						/>
						<button
							type="button"
							class="deck-btn"
							onclick={() => onPreviewInviteInput(inviteInputText)}
							data-testid="preview-invite-btn"
						>
							Review Invite
						</button>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<!-- PEOPLE Panel: Participants & Host Controls -->
	{#if activePanel === 'people'}
		<section class="deck-card" aria-labelledby="people-heading" data-testid="panel-people">
			<div class="card-header">
				<h2 id="people-heading">PEOPLE — PARTICIPANTS & HOST CONTROLS</h2>
				<button type="button" class="close-btn" onclick={onClosePanel} aria-label="Close panel">
					✕
				</button>
			</div>

			{#if !activeRoomDetail}
				<p class="deck-copy">
					Select and join a room to view live participants and host moderation controls.
				</p>
			{:else}
				<div class="room-summary-strip">
					<span>Room: <strong>{activeRoomDetail.name}</strong></span>
					<span>
						Active: <strong>{activeRoomDetail.activeParticipantCount}/{activeRoomDetail.maxParticipants}</strong>
					</span>
					<span>Mode: <strong>{activeRoomDetail.mode.toUpperCase()}</strong></span>
				</div>

				{#if activeRoomDetail.hostDisconnectedAt}
					<div class="alert-banner warning" data-testid="host-disconnected-notice">
						Host temporarily disconnected. Room stays active during the 3-minute recovery grace
						window before host transfer.
					</div>
				{/if}

				<h3>CONNECTED PARTICIPANTS</h3>
				<div class="participant-list" data-testid="connected-participants-list">
					{#each activeRoomDetail.participants as p (p.userId)}
						<div class="participant-row" data-testid="participant-row-{p.userId}">
							<div class="participant-info">
								<strong>{p.displayName}</strong>
								{#if p.role === 'host'}
									<span class="meta-pill host">HOST</span>
								{/if}
								{#if p.isListenerOnly}
									<span class="meta-pill">LISTENING ONLY</span>
								{:else if p.isSpeaking}
									<span class="meta-pill speaking">SPEAKING</span>
								{:else if p.isMuted}
									<span class="meta-pill">MUTED</span>
								{:else}
									<span class="meta-pill live">UNMUTED</span>
								{/if}
							</div>

							{#if isHostOfActiveOrSelected && user && p.userId !== user.id}
								<div class="participant-actions">
									{#if !p.isMuted && !p.isListenerOnly}
										<button
											type="button"
											class="deck-btn small"
											onclick={() =>
												onHostAction({ action: 'mute_participant', targetUserId: p.userId })}
											data-testid="host-mute-btn-{p.userId}"
										>
											Mute
										</button>
									{:else if p.isMuted && !p.isListenerOnly}
										<button
											type="button"
											class="deck-btn small"
											onclick={() =>
												onHostAction({ action: 'request_unmute', targetUserId: p.userId })}
											data-testid="host-request-unmute-btn-{p.userId}"
										>
											Ask to Unmute
										</button>
									{/if}
									<button
										type="button"
										class="deck-btn small"
										onclick={() =>
											onHostAction({ action: 'transfer_host', targetUserId: p.userId })}
										data-testid="host-transfer-btn-{p.userId}"
									>
										Make Host
									</button>
									<button
										type="button"
										class="deck-btn small danger"
										onclick={() =>
											onHostAction({ action: 'remove_participant', targetUserId: p.userId })}
										data-testid="host-remove-btn-{p.userId}"
									>
										Remove
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				{#if isHostOfActiveOrSelected && activeRoomDetail.pendingApprovalParticipants.length > 0}
					<hr class="deck-divider" />
					<h3>PENDING ADMISSION REQUESTS</h3>
					<div class="participant-list" data-testid="pending-participants-list">
						{#each activeRoomDetail.pendingApprovalParticipants as pending (pending.userId)}
							<div class="participant-row" data-testid="pending-row-{pending.userId}">
								<div class="participant-info">
									<strong>{pending.displayName}</strong>
									<span class="meta-pill">WAITING APPROVAL</span>
								</div>
								<div class="participant-actions">
									<button
										type="button"
										class="deck-btn small primary"
										onclick={() =>
											onHostAction({ action: 'admit_participant', targetUserId: pending.userId })}
										data-testid="host-admit-btn-{pending.userId}"
									>
										Admit
									</button>
									<button
										type="button"
										class="deck-btn small danger"
										onclick={() =>
											onHostAction({ action: 'deny_participant', targetUserId: pending.userId })}
										data-testid="host-deny-btn-{pending.userId}"
									>
										Deny
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if isHostOfActiveOrSelected}
					<hr class="deck-divider" />
					<div class="action-row">
						<button
							type="button"
							class="deck-btn"
							onclick={() =>
								onHostAction({
									action: 'set_mode',
									mode: activeRoomDetail.mode === 'conversation' ? 'radio' : 'conversation'
								})}
							data-testid="host-toggle-mode-btn"
						>
							Switch Room to {activeRoomDetail.mode === 'conversation' ? 'Radio (PTT)' : 'Conversation'} Mode
						</button>
						<button
							type="button"
							class="deck-btn danger"
							onclick={() => onHostAction({ action: 'end_room' })}
							data-testid="host-end-room-btn"
						>
							End Room for Everyone
						</button>
					</div>
				{/if}
			{/if}
		</section>
	{/if}

	<!-- LOCK Panel: Room Access Settings & Invitation Link -->
	{#if activePanel === 'lock'}
		<section class="deck-card" aria-labelledby="lock-heading" data-testid="panel-lock">
			<div class="card-header">
				<h2 id="lock-heading">LOCK — ROOM ACCESS & INVITATION LINKS</h2>
				<button type="button" class="close-btn" onclick={onClosePanel} aria-label="Close panel">
					✕
				</button>
			</div>

			{#if !effectiveRoom}
				<p class="deck-copy">Select or create a room first to inspect or manage access controls.</p>
			{:else}
				<div class="room-summary-strip">
					<span>Room: <strong>{effectiveRoom.name}</strong></span>
					<span>
						Access:
						<strong>
							{effectiveRoom.accessPolicy === 'members_only'
								? 'Explicit Member List Only'
								: 'Approval / Valid Invitation'}
						</strong>
					</span>
					<span>
						Admission: <strong>{effectiveRoom.isLocked ? 'LOCKED' : 'OPEN TO AUTHORISED'}</strong>
					</span>
				</div>

				{#if activeInviteLink}
					<div class="invite-share-box" data-testid="active-invite-link-box">
						<label>
							<span>Unguessable Room Invitation Link (send to friends)</span>
							<input
								type="text"
								readonly
								value={activeInviteLink}
								data-testid="active-invite-link-input"
							/>
						</label>
						<div class="action-row">
							<button
								type="button"
								class="deck-btn primary"
								onclick={() => onCopyInviteLink()}
								data-testid="copy-invite-link-btn"
							>
								{copyFeedback || 'Copy Invitation Link'}
							</button>
							<button
								type="button"
								class="deck-btn"
								onclick={() => onNativeShareInviteLink()}
								data-testid="share-invite-link-btn"
							>
								Share...
							</button>
						</div>
					</div>
				{/if}

				{#if isHostOfActiveOrSelected && activeRoomDetail}
					<hr class="deck-divider" />
					<h3>HOST ACCESS CONTROLS</h3>
					<div class="action-row">
						<button
							type="button"
							class="deck-btn"
							onclick={() =>
								onHostAction({ action: 'set_locked', isLocked: !activeRoomDetail.isLocked })}
							data-testid="host-toggle-lock-btn"
						>
							{activeRoomDetail.isLocked ? 'Unlock Room Admission' : 'Lock Room Admission'}
						</button>

						<button
							type="button"
							class="deck-btn"
							onclick={() =>
								onHostAction({
									action: 'set_access_policy',
									accessPolicy:
										activeRoomDetail.accessPolicy === 'approval_required'
											? 'members_only'
											: 'approval_required'
								})}
							data-testid="host-toggle-policy-btn"
						>
							Switch to
							{activeRoomDetail.accessPolicy === 'approval_required'
								? 'Members-Only List'
								: 'Invite / Host Approval'}
						</button>

						<button
							type="button"
							class="deck-btn"
							onclick={() =>
								onHostAction({ action: 'rotate_invitation', invitationExpiryHours: 24 })}
							data-testid="host-rotate-invite-btn"
						>
							Generate New Invite Link (Revoke Old)
						</button>

						<button
							type="button"
							class="deck-btn danger"
							onclick={() => onHostAction({ action: 'revoke_invitations' })}
							data-testid="host-revoke-invites-btn"
						>
							Revoke All Invite Links
						</button>
					</div>

					<form class="inline-form" onsubmit={handleAddExplicitMember}>
						<input
							type="email"
							placeholder="Add permitted Google email (e.g. friend@gmail.com)"
							bind:value={explicitMemberEmailToAdd}
							aria-label="Add permitted Google email"
							data-testid="host-add-member-email-input"
						/>
						<button type="submit" class="deck-btn" data-testid="host-add-member-email-btn">
							Add Member Email
						</button>
					</form>

					{#if activeRoomDetail.explicitMemberEmails.length > 0}
						<div class="explicit-email-list" data-testid="explicit-member-email-list">
							{#each activeRoomDetail.explicitMemberEmails as email (email)}
								<span class="email-chip">
									{email}
									<button
										type="button"
										onclick={() =>
											onHostAction({ action: 'remove_explicit_member', targetEmail: email })}
										aria-label="Remove {email}"
									>
										×
									</button>
								</span>
							{/each}
						</div>
					{/if}
				{/if}
			{/if}
		</section>
	{/if}

	<!-- SPEAKER Panel: Volume & Audio Output Device -->
	{#if activePanel === 'speaker'}
		<section class="deck-card" aria-labelledby="speaker-heading" data-testid="panel-speaker">
			<div class="card-header">
				<h2 id="speaker-heading">SPEAKER — LISTENING VOLUME & OUTPUT DEVICE</h2>
				<button type="button" class="close-btn" onclick={onClosePanel} aria-label="Close panel">
					✕
				</button>
			</div>

			<div class="form-grid">
				<label>
					<span>Listening Volume ({volume}%)</span>
					<input
						type="range"
						min="0"
						max="100"
						step="1"
						value={volume}
						oninput={(e) => onVolumeChange(Number((e.currentTarget as HTMLInputElement).value))}
						data-testid="speaker-volume-slider"
					/>
				</label>

				<label>
					<span>Audio Output Device {sinkIdSupported ? '' : '(Managed by OS/Browser)'}</span>
					<select
						value={selectedOutputDeviceId}
						onchange={(e) => onSelectOutputDevice((e.currentTarget as HTMLSelectElement).value)}
						disabled={!sinkIdSupported || outputDevices.length === 0}
						data-testid="speaker-output-select"
					>
						<option value="">System Default Speaker / Headset</option>
						{#each outputDevices as dev (dev.deviceId)}
							<option value={dev.deviceId}>{dev.label}</option>
						{/each}
					</select>
				</label>
			</div>

			{#if latencyMs !== null}
				<p class="sub-note" data-testid="measured-rtt-readout">
					Measured WebRTC round-trip audio transport latency: <strong>{latencyMs} ms</strong>
				</p>
			{/if}
		</section>
	{/if}

	<!-- SETTINGS Panel: Microphone Selection, Local Mic Test, Accessibility, Account & Legal -->
	{#if activePanel === 'settings'}
		<section class="deck-card" aria-labelledby="settings-heading" data-testid="panel-settings">
			<div class="card-header">
				<h2 id="settings-heading">SETTINGS — MICROPHONE, ACCESSIBILITY & ACCOUNT</h2>
				<button type="button" class="close-btn" onclick={onClosePanel} aria-label="Close panel">
					✕
				</button>
			</div>

			<div class="settings-section">
				<h3>MICROPHONE SELECTION & LOCAL-ONLY TEST</h3>
				<p class="sub-note">
					“Allow microphone access so people in this room can hear you when you unmute.” Testing
					your microphone here stays strictly on your device and <strong>never transmits</strong> to
					any room.
				</p>

				{#if browserMicCapturedWhenMuted}
					<p class="sub-note" data-testid="browser-mic-muted-distinction">
						<strong>Hardware Mic Indicator Note:</strong> Your room microphone is muted and no audio
						is transmitted. If your browser tab still shows a microphone icon, it holds an idle
						capture handle for instant unmuting; power off or leave the room to stop all hardware
						microphone tracks immediately.
					</p>
				{/if}

				<div class="form-grid">
					<label>
						<span>Microphone Input Device</span>
						<select
							value={selectedInputDeviceId}
							onchange={(e) => onSelectInputDevice((e.currentTarget as HTMLSelectElement).value)}
							data-testid="mic-input-select"
						>
							<option value="">System Default Microphone</option>
							{#each inputDevices as dev (dev.deviceId)}
								<option value={dev.deviceId}>{dev.label}</option>
							{/each}
						</select>
					</label>

					<div class="mic-test-box">
						<button
							type="button"
							class="deck-btn"
							onclick={() => onToggleLocalMicTest()}
							data-testid="local-mic-test-btn"
						>
							{localMicTestActive ? 'Stop Local Mic Test' : 'Start Local Microphone Test'}
						</button>
						<div class="mic-meter" aria-label="Local microphone level">
							<div
								class="mic-meter-fill"
								style="width: {Math.round(localMicTestLevel * 100)}%"
								data-testid="local-mic-meter-fill"
							></div>
						</div>
					</div>
				</div>
			</div>

			<hr class="deck-divider" />

			<div class="settings-section">
				<h3>ACCESSIBILITY & RADIO CONTROLS</h3>
				<div class="checkbox-stack">
					<label class="checkbox-row">
						<input
							type="checkbox"
							checked={highContrast}
							onchange={() => onToggleHighContrast()}
							data-testid="toggle-high-contrast-checkbox"
						/>
						<span>
							<strong>High-Contrast View:</strong> Display high-contrast accessible control bar alongside
							the handheld radio.
						</span>
					</label>

					<label class="checkbox-row">
						<input
							type="checkbox"
							checked={pttLatchMode}
							onchange={(e) => onTogglePttLatch((e.currentTarget as HTMLInputElement).checked)}
							data-testid="toggle-ptt-latch-checkbox"
						/>
						<span>
							<strong>Accessible Tap-to-Start / Tap-to-Stop PTT:</strong> Tap PTT once to start speaking
							in Radio mode and tap again to stop (instead of holding the button).
						</span>
					</label>

					<label class="checkbox-row">
						<input
							type="checkbox"
							checked={radioSoundsEnabled}
							onchange={(e) => onToggleRadioSounds((e.currentTarget as HTMLInputElement).checked)}
							data-testid="toggle-radio-sounds-checkbox"
						/>
						<span>
							<strong>Optional Radio Cue Tones:</strong> Play subtle squelch/beep cues on PTT transitions
							(off by default to preserve natural speech).
						</span>
					</label>
				</div>
			</div>

			<hr class="deck-divider" />

			<div class="settings-section">
				<h3>ACCOUNT, PRIVACY & DATA DELETION</h3>
				{#if user}
					<p class="sub-note">
						Signed in via Google as <strong>{user.displayName}</strong> ({user.email}). Conference
						identity is completely separate from blog administration.
					</p>
					<div class="action-row">
						<button
							type="button"
							class="deck-btn"
							onclick={() => onSignOut()}
							data-testid="signout-btn"
						>
							Sign Out & Disconnect Media
						</button>

						{#if !confirmDeleteAccount}
							<button
								type="button"
								class="deck-btn danger"
								onclick={() => (confirmDeleteAccount = true)}
								data-testid="delete-account-prompt-btn"
							>
								Delete COMM-LINK Account & Data
							</button>
						{:else}
							<button
								type="button"
								class="deck-btn danger"
								onclick={() => {
									confirmDeleteAccount = false;
									onDeleteAccount();
								}}
								data-testid="confirm-delete-account-btn"
							>
								Confirm Permanent Deletion
							</button>
							<button
								type="button"
								class="deck-btn"
								onclick={() => (confirmDeleteAccount = false)}
							>
								Cancel
							</button>
						{/if}
					</div>

					<hr class="deck-divider" />

					<form class="deck-form" onsubmit={handleAbuseSubmit} data-testid="abuse-report-form">
						<h4>REPORT ABUSE OR PRIVACY CONCERN</h4>
						<div class="form-grid">
							<label>
								<span>Category</span>
								<select bind:value={reportReason} data-testid="abuse-reason-select">
									<option value="harassment">Harassment or Unwanted Conduct</option>
									<option value="unauthorised_access">Unauthorised Room Access</option>
									<option value="impersonation">Impersonation</option>
									<option value="privacy">Privacy / Personal Data Grievance</option>
									<option value="spam">Spam or Disruption</option>
									<option value="other">Other</option>
								</select>
							</label>
							<label>
								<span>Details</span>
								<input
									type="text"
									placeholder="Describe what happened..."
									bind:value={reportDetails}
									required
									minlength="5"
									data-testid="abuse-details-input"
								/>
							</label>
						</div>
						<div class="action-row">
							<button type="submit" class="deck-btn" data-testid="abuse-submit-btn">
								Submit Report
							</button>
							{#if reportSubmitted}
								<span class="sub-note" data-testid="abuse-submitted-confirm">
									Report recorded for review.
								</span>
							{/if}
						</div>
					</form>
				{:else}
					<p class="sub-note">Not currently signed in.</p>
				{/if}

				<hr class="deck-divider" />

				<div class="legal-summary" data-testid="privacy-legal-summary">
					<h4>PRIVACY, DPDP ACT & LAWFUL OPERATION NOTICE</h4>
					<ul>
						<li>
							<strong>Internet Audio Only:</strong> COMM-LINK is an internet WebRTC audio web
							application. Any frequency markings (<code>144-440MHz</code>) and “Channel” labels are
							decorative interface elements; this app never transmits on radio frequencies.
						</li>
						<li>
							<strong>No Server Recording:</strong> Live room audio is routed transiently via
							encrypted WebRTC/DTLS-SRTP and is <strong>never recorded or stored</strong> by the
							application server.
						</li>
						<li>
							<strong>Minimal Data & DPDP Rights:</strong> Only your Google subject identifier,
							email, display name, room memberships, and short-lived operational diagnostic timestamps
							are processed to operate conferencing rooms, in accordance with India’s Digital
							Personal Data Protection Act, 2023 and DPDP Rules, 2025. You may delete your account
							and room records at any time above or contact the Grievance Officer via the
							<a href="/privacy">Privacy Policy</a>.
						</li>
					</ul>
				</div>
			</div>
		</section>
	{/if}
</div>

<style>
	.tactical-deck {
		width: 100%;
		max-width: 680px;
		margin: 0.9rem auto 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		font-family: 'IBM Plex Mono', monospace;
		color: #241f19;
	}

	.tactical-deck.hc {
		color: #fff6dc;
	}

	.alert-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.7rem 0.9rem;
		border-radius: 8px;
		border: 2px solid #3c352d;
		font-size: 0.82rem;
		line-height: 1.4;
		background: #f5e6c8;
		color: #2a1805;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
	}

	.alert-banner.warning {
		background: #f9d17b;
		border-color: #6b3506;
		color: #2b1402;
	}

	.alert-banner.error {
		background: #f6c8c1;
		border-color: #7c1f13;
		color: #3d0b05;
	}

	.deck-card {
		background: #2b2f2c;
		color: #ebe3d2;
		border: 2px solid #595f5b;
		border-radius: 12px;
		padding: 1rem 1.1rem;
		box-shadow:
			0 12px 28px rgba(24, 20, 15, 0.32),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}

	.tactical-deck.hc .deck-card {
		background: #0d0f0e;
		color: #fff8e6;
		border: 2px solid #fab442;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px solid #484e4b;
		padding-bottom: 0.55rem;
		margin-bottom: 0.75rem;
	}

	.card-header h2 {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.15rem;
		letter-spacing: 0.06em;
		color: #fac458;
	}

	.close-btn {
		background: #3f4643;
		color: #ebe3d2;
		border: 1px solid #6b726f;
		border-radius: 6px;
		width: 2rem;
		height: 2rem;
		cursor: pointer;
		font-weight: 700;
	}

	.join-steps-indicator {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: 0.4rem;
		list-style: none;
		padding: 0;
		margin: 0 0 0.85rem;
		font-size: 0.74rem;
	}

	.join-steps-indicator li {
		padding: 0.35rem 0.5rem;
		border-radius: 6px;
		background: #1f2321;
		border: 1px solid #464c49;
		color: #a9a295;
	}

	.join-steps-indicator li.current {
		border-color: #fac458;
		color: #fac458;
		font-weight: 600;
	}

	.join-steps-indicator li.done {
		border-color: #77a865;
		color: #cfe8c4;
	}

	.invite-preview-box,
	.mic-disclosure-box,
	.invite-share-box {
		background: #1e2220;
		border: 1px solid #59605d;
		border-radius: 8px;
		padding: 0.7rem 0.85rem;
		margin-bottom: 0.75rem;
		font-size: 0.8rem;
	}

	.invite-title {
		margin: 0 0 0.25rem;
		color: #fac458;
		font-size: 0.92rem;
	}

	.invite-meta,
	.sub-note,
	.deck-copy {
		margin: 0.25rem 0;
		font-size: 0.79rem;
		line-height: 1.45;
		color: #d8d0c0;
	}

	.invite-invalid {
		margin: 0;
		color: #ff9c8f;
	}

	.action-row,
	.inline-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.55rem;
	}

	.deck-btn {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.5rem 0.8rem;
		border-radius: 6px;
		border: 1px solid #757c79;
		background: #3d4340;
		color: #f2ead9;
		cursor: pointer;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: background 120ms ease;
	}

	.deck-btn:hover:not(:disabled) {
		background: #4f5753;
	}

	.deck-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.deck-btn.primary {
		background: #b5653b;
		border-color: #e3955c;
		color: #fff9ef;
	}

	.deck-btn.primary:hover:not(:disabled) {
		background: #c87245;
	}

	.deck-btn.active-tx {
		background: #a8382b;
		border-color: #f38878;
		color: #ffffff;
	}

	.deck-btn.danger {
		background: #7c2920;
		border-color: #bd5b4f;
		color: #ffece8;
	}

	.deck-btn.google-btn {
		background: #fac458;
		border-color: #be8322;
		color: #2c1603;
		font-weight: 700;
	}

	.deck-btn.small {
		padding: 0.3rem 0.55rem;
		font-size: 0.72rem;
	}

	.hc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.5rem;
	}

	.room-list,
	.participant-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin: 0.5rem 0;
	}

	.room-row,
	.participant-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.55rem 0.7rem;
		background: #1f2321;
		border: 1px solid #49504d;
		border-radius: 8px;
		font-size: 0.78rem;
	}

	.room-row.selected {
		border-color: #fac458;
		background: #282c26;
	}

	.room-row-info,
	.participant-info,
	.room-row-actions,
	.participant-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.ch-tag {
		background: #c77b28;
		color: #231102;
		font-weight: 700;
		padding: 0.12rem 0.4rem;
		border-radius: 4px;
		font-size: 0.72rem;
	}

	.meta-pill {
		font-size: 0.68rem;
		padding: 0.12rem 0.4rem;
		border-radius: 4px;
		background: #363c39;
		color: #dfd7c6;
	}

	.meta-pill.speaking {
		background: #fac458;
		color: #2b1503;
		font-weight: 700;
	}

	.meta-pill.host {
		background: #ae6249;
		color: #fff6ec;
	}

	.meta-pill.locked {
		background: #8a2f24;
		color: #ffe3de;
	}

	.deck-divider {
		border: 0;
		border-top: 1px solid #454b48;
		margin: 0.85rem 0;
	}

	.deck-form h3,
	.deck-form h4,
	.settings-section h3,
	.settings-section h4,
	.legal-summary h4 {
		margin: 0 0 0.5rem;
		font-family: 'Barlow Condensed', sans-serif;
		letter-spacing: 0.05em;
		color: #fac458;
		font-size: 1rem;
	}

	.form-grid,
	.form-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 0.6rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
	}

	label.full-width {
		margin-top: 0.5rem;
	}

	input[type='text'],
	input[type='email'],
	input[type='number'],
	select {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.78rem;
		padding: 0.45rem 0.6rem;
		border-radius: 6px;
		border: 1px solid #676e6b;
		background: #181b1a;
		color: #f3ebda;
	}

	.inline-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.inline-form input {
		flex: 1 1 220px;
	}

	.room-summary-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		padding: 0.5rem 0.7rem;
		background: #1d211f;
		border-radius: 6px;
		font-size: 0.78rem;
		margin-bottom: 0.7rem;
	}

	.explicit-email-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.55rem;
	}

	.email-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.5rem;
		background: #1c201e;
		border: 1px solid #59605d;
		border-radius: 999px;
		font-size: 0.72rem;
	}

	.email-chip button {
		background: none;
		border: 0;
		color: #ff9c8f;
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0;
	}

	.mic-test-box {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		justify-content: flex-end;
	}

	.mic-meter {
		height: 10px;
		background: #171a19;
		border: 1px solid #585f5c;
		border-radius: 999px;
		overflow: hidden;
	}

	.mic-meter-fill {
		height: 100%;
		background: linear-gradient(90deg, #fac458, #d96b38);
		transition: width 80ms linear;
	}

	.checkbox-stack {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.checkbox-row {
		flex-direction: row;
		align-items: flex-start;
		gap: 0.55rem;
		line-height: 1.4;
	}

	.local-test-auth {
		margin-top: 0.75rem;
		padding: 0.6rem;
		background: #1b1f1d;
		border: 1px dashed #6d7470;
		border-radius: 6px;
		font-size: 0.75rem;
	}

	.local-test-auth summary {
		cursor: pointer;
		color: #fac458;
		margin-bottom: 0.5rem;
	}

	.legal-summary ul {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.75rem;
		line-height: 1.45;
		color: #d5cdbd;
	}

	.legal-summary li {
		margin-bottom: 0.35rem;
	}

	.legal-summary a {
		color: #fac458;
	}
</style>
