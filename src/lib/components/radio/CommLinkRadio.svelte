<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import '@fontsource/barlow-condensed/600.css';
	import '@fontsource/barlow-condensed/700.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import '@fontsource/ibm-plex-mono/600.css';
	import '@fontsource/ibm-plex-mono/700.css';

	import CommLinkDrawer, { type ActivePanel } from './CommLinkDrawer.svelte';
	import {
		dialAngleForSlot,
		formatAmberScreenLines,
		formatPttActionLabel,
		mapRoomsToDialChannels
	} from '$lib/radio/display-model';
	import {
		classifyMediaError,
		enumerateAudioDevices,
		isSinkIdSupported,
		requestMicrophonePermissionStream,
		startLocalMicTester,
		stopMediaStreamTracks,
		type LocalMicTester
	} from '$lib/radio/audio-devices';
	import type { RadioMediaSession } from '$lib/radio/media-client';
	import type {
		InvitationPreview,
		RadioAccessPolicy,
		RadioConnectionState,
		RadioDeviceOption,
		RadioMediaErrorInfo,
		RadioMediaTokenResponse,
		RadioMicState,
		RadioMode,
		RadioProviderStatus,
		RadioRoomDetail,
		RadioRoomSummary,
		RadioUser
	} from '$lib/radio/types';

	interface Props {
		initialUser: RadioUser | null;
		initialProvider: RadioProviderStatus;
		allowLocalTestAuth: boolean;
		initialRooms: RadioRoomSummary[];
		initialPendingInvitation: InvitationPreview | null;
		initialPendingInviteToken: string | null;
		initialAuthError: string | null;
	}

	let {
		initialUser,
		initialProvider,
		allowLocalTestAuth,
		initialRooms,
		initialPendingInvitation,
		initialPendingInviteToken,
		initialAuthError
	}: Props = $props();

	let user = $state<RadioUser | null>(untrack(() => initialUser));
	let provider = $state<RadioProviderStatus>(untrack(() => initialProvider));
	let rooms = $state<RadioRoomSummary[]>(untrack(() => initialRooms));
	let pendingInvitation = $state<InvitationPreview | null>(
		untrack(() => initialPendingInvitation)
	);
	let pendingInviteToken = $state<string | null>(untrack(() => initialPendingInviteToken));

	let selectedSlot = $state<number>(1);
	let activeRoomDetail = $state<RadioRoomDetail | null>(null);
	let connectionState = $state<RadioConnectionState>('offline');
	let joinAsListener = $state<boolean>(false);
	let isMuted = $state<boolean>(true);
	let isTransmitting = $state<boolean>(false);
	let channelBusy = $state<boolean>(false);
	let micPermissionPrePromptConfirmed = $state<boolean>(false);
	let browserMicCapturedWhenMuted = $state<boolean>(false);

	let activeInviteTokenByRoom = $state<Record<string, string>>({});
	let copyFeedback = $state<string | null>(null);
	let statusBanner = $state<string | null>(null);
	let errorBanner = $state<string | null>(
		untrack(() => (initialAuthError ? `Authentication notice: ${initialAuthError}` : null))
	);
	let mediaError = $state<RadioMediaErrorInfo | null>(null);
	let audioPlaybackBlocked = $state<boolean>(false);

	let activePanel = $state<ActivePanel>(
		untrack(() => (initialPendingInvitation ? 'join-flow' : initialUser ? 'none' : 'join-flow'))
	);
	let highContrast = $state<boolean>(false);
	let pttLatchMode = $state<boolean>(false);
	let radioSoundsEnabled = $state<boolean>(false);
	let volume = $state<number>(85);

	let inputDevices = $state<RadioDeviceOption[]>([]);
	let outputDevices = $state<RadioDeviceOption[]>([]);
	let selectedInputDeviceId = $state<string>('');
	let selectedOutputDeviceId = $state<string>('');
	let sinkIdSupported = $state<boolean>(false);

	let localMicTester: LocalMicTester | null = null;
	let localMicTestActive = $state<boolean>(false);
	let localMicTestLevel = $state<number>(0);

	let mediaSession: RadioMediaSession | null = null;
	let activeMicStream: MediaStream | null = null;
	let latencyMs = $state<number | null>(null);
	let liveSpeakerNames = $state<string[]>([]);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let pttHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let pttHoldActive = false;
	let microphoneChangePending = false;
	let pollingRoomState = false;
	let failedRoomChecks = 0;

	const dialSlots = $derived(mapRoomsToDialChannels(rooms));

	const selectedRoom = $derived.by(() => {
		const slotObj = dialSlots.find((s) => s.slot === selectedSlot);
		if (slotObj?.room) return slotObj.room;
		return rooms[0] ?? null;
	});

	const dialRotationDeg = $derived(dialAngleForSlot(selectedSlot));

	const isConnected = $derived(connectionState === 'connected' && activeRoomDetail !== null);
	const isConnecting = $derived(connectionState === 'connecting');

	const effectiveMode = $derived<RadioMode>(
		activeRoomDetail?.mode ?? selectedRoom?.mode ?? 'conversation'
	);

	const effectiveMicState = $derived.by<RadioMicState>(() => {
		if (!isConnected) return 'off';
		if (joinAsListener) return 'listener';
		if (effectiveMode === 'radio') {
			if (isTransmitting) return 'transmitting';
			if (channelBusy) return 'busy';
			return 'ptt_ready';
		}
		return isMuted ? 'muted' : 'transmitting';
	});

	const activeSpeakerName = $derived.by<string | null>(() => {
		if (!isConnected || !activeRoomDetail) return null;
		if (activeRoomDetail.mode === 'radio') {
			if (activeRoomDetail.pttLease.holderName) {
				return activeRoomDetail.pttLease.holderName;
			}
			return null;
		}
		if (liveSpeakerNames.length > 0) {
			return liveSpeakerNames[0];
		}
		const speakingFromServer = activeRoomDetail.participants.find((p) => p.isSpeaking);
		return speakingFromServer?.displayName ?? null;
	});

	const isSelfSpeaking = $derived.by<boolean>(() => {
		if (!isConnected || !user || !activeRoomDetail) return false;
		if (activeRoomDetail.mode === 'radio') {
			return activeRoomDetail.pttLease.holderUserId === user.id && isTransmitting;
		}
		return !isMuted && (isTransmitting || liveSpeakerNames.includes(user.displayName));
	});

	const amberLines = $derived(
		formatAmberScreenLines({
			isAuthenticated: Boolean(user),
			connectionState,
			selectedRoomName:
				(isConnected && selectedRoom && activeRoomDetail && selectedRoom.id !== activeRoomDetail.id
					? `${selectedRoom.name}`
					: activeRoomDetail?.name) ??
				selectedRoom?.name ??
				pendingInvitation?.roomName ??
				null,
			selectedChannelSlot: selectedSlot,
			participantCount:
				activeRoomDetail?.activeParticipantCount ??
				selectedRoom?.activeParticipantCount ??
				pendingInvitation?.activeParticipantCount ??
				0,
			maxParticipants:
				activeRoomDetail?.maxParticipants ??
				selectedRoom?.maxParticipants ??
				pendingInvitation?.maxParticipants ??
				12,
			mode: effectiveMode,
			micState: effectiveMicState,
			activeSpeakerName,
			isSelfSpeaking,
			isRoomLocked: Boolean(activeRoomDetail?.isLocked ?? selectedRoom?.isLocked)
		})
	);

	const pttButtonLabel = $derived(
		formatPttActionLabel({
			isConnected,
			mode: effectiveMode,
			micState: effectiveMicState,
			pttLatchMode
		})
	);

	const activeInviteLink = $derived.by<string | null>(() => {
		const targetId = activeRoomDetail?.id ?? selectedRoom?.id ?? null;
		if (!targetId) return null;
		const token = activeInviteTokenByRoom[targetId];
		if (!token) return null;
		if (typeof window === 'undefined') return `/tools/radio?invite=${token}`;
		return `${window.location.origin}/tools/radio?invite=${token}`;
	});

	// Real-state meter bars (0..3) based on actual room connection, mic state, and participant activity
	const realMeterBars = $derived.by<number>(() => {
		if (!isConnected) return 0;
		if (isSelfSpeaking || isTransmitting) return 4;
		if (activeSpeakerName) return 3;
		if (!isMuted && !joinAsListener) return 2;
		return 1;
	});

	async function refreshDeviceLists() {
		sinkIdSupported = isSinkIdSupported();
		const devices = await enumerateAudioDevices();
		inputDevices = devices.inputs;
		outputDevices = devices.outputs;
	}

	onMount(() => {
		refreshDeviceLists();

		// Synchronize selected slot if initialRooms or pendingInvitation match
		if (pendingInvitation?.roomId) {
			const matchSlot = dialSlots.find((s) => s.room?.id === pendingInvitation?.roomId);
			if (matchSlot) selectedSlot = matchSlot.slot;
		}

		const handleWindowBlur = () => {
			if (pttHoldActive || (effectiveMode === 'radio' && isTransmitting && !pttLatchMode)) {
				void handlePttPressEnd();
			}
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden' && isTransmitting && effectiveMode === 'radio') {
				void handlePttPressEnd();
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code !== 'Space' || e.repeat) return;
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'a') {
				return;
			}
			if (isConnected && effectiveMode === 'radio' && !joinAsListener) {
				e.preventDefault();
				if (pttLatchMode) {
					if (isTransmitting) {
						void handlePttPressEnd();
					} else {
						void handlePttPressStart();
					}
				} else {
					void handlePttPressStart();
				}
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.code !== 'Space') return;
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'a') {
				return;
			}
			if (isConnected && effectiveMode === 'radio' && !pttLatchMode && isTransmitting) {
				e.preventDefault();
				void handlePttPressEnd();
			}
		};

		window.addEventListener('blur', handleWindowBlur);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		pollTimer = setInterval(() => {
			void pollRoomState();
		}, provider.radioModeAvailable ? 2_000 : 5_000);

		return () => {
			window.removeEventListener('blur', handleWindowBlur);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (pttHeartbeatTimer) clearInterval(pttHeartbeatTimer);
		if (localMicTester) {
			localMicTester.stop();
			localMicTester = null;
		}
		if (mediaSession) {
			void mediaSession.disconnect();
			mediaSession = null;
		}
		stopMediaStreamTracks(activeMicStream);
		activeMicStream = null;
	});

	async function pollRoomState() {
		if (!user || pollingRoomState) return;
		pollingRoomState = true;

		try {
			if (isConnected && activeRoomDetail) {
				const res = await fetch(`/api/radio/rooms/${activeRoomDetail.id}/join`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					signal: AbortSignal.timeout(10_000),
					body: JSON.stringify({
						action: 'heartbeat',
						isSpeaking: isSelfSpeaking
					})
				});
				if (res.ok) {
					failedRoomChecks = 0;
					const data = await res.json();
					if (data.rooms) rooms = data.rooms;
					if (data.room) {
						activeRoomDetail = data.room;
						// If host muted us or mode switched to radio while unmuted, enforce locally
						if (data.room.myParticipant?.isMuted && !isMuted && data.room.mode === 'conversation') {
							isMuted = true;
							await mediaSession?.setMicrophoneEnabled(false);
						}
						if (
							data.room.mode === 'radio' &&
							isTransmitting &&
							data.room.pttLease.holderUserId !== user.id
						) {
							isTransmitting = false;
							await mediaSession?.setMicrophoneEnabled(false);
						}
						channelBusy = Boolean(
							data.room.mode === 'radio' &&
								data.room.pttLease.holderUserId &&
								data.room.pttLease.holderUserId !== user.id
						);
					}
				} else if ([401, 403, 404].includes(res.status)) {
					// Removed by host or room ended
					const errData = await res.json().catch(() => ({}));
					await cleanupMediaAndDisconnect();
					errorBanner = errData.error || 'Disconnected from room by host or room ended.';
				} else {
					await handleFailedRoomCheck();
				}
			} else if (
				selectedRoom &&
				(selectedRoom.myAdmissionStatus === 'pending_approval' ||
					(selectedRoom.hostUserId === user.id && activePanel === 'people'))
			) {
				const waitingForAdmission = selectedRoom.myAdmissionStatus === 'pending_approval';
				const roomId = selectedRoom.id;
				const res = await fetch(`/api/radio/rooms/${roomId}`);
				if (selectedRoom?.id !== roomId) return;
				if (res.ok) {
					const data = await res.json();
					if (data.rooms) rooms = data.rooms;
					if (data.room) {
						activeRoomDetail = data.room;
						if (waitingForAdmission && data.room.myAdmissionStatus === 'admitted') {
							statusBanner = 'Host admitted you to the room. Choose Enable Microphone or Join Listening.';
						}
					}
				} else if (waitingForAdmission && (res.status === 403 || res.status === 404)) {
					rooms = rooms.filter((room) => room.id !== roomId);
					activeRoomDetail = null;
					pendingInvitation = null;
					pendingInviteToken = null;
					errorBanner = 'This room is no longer available to you.';
				}
			}
		} catch {
			if (isConnected) await handleFailedRoomCheck();
		} finally {
			pollingRoomState = false;
		}
	}

	async function handleFailedRoomCheck() {
		if (++failedRoomChecks < 2) return;
		await cleanupMediaAndDisconnect();
		errorBanner = 'We lost contact with this room. Your microphone is off. Rejoin to continue.';
	}

	function stepDial(delta: number) {
		const next = ((selectedSlot - 1 + delta + 12) % 12) + 1;
		selectedSlot = next;
		const slotObj = dialSlots.find((s) => s.slot === next);
		if (slotObj?.room) {
			if (isConnected && activeRoomDetail && slotObj.room.id !== activeRoomDetail.id) {
				statusBanner = `Channel ${String(next).padStart(2, '0')} (${slotObj.room.name}) selected on dial. Use SCAN → Review / Join to switch rooms explicitly.`;
			} else {
				statusBanner = `Selected Channel ${String(next).padStart(2, '0')}: ${slotObj.room.name} (not joined until you confirm).`;
			}
		} else {
			statusBanner = `Selected Channel ${String(next).padStart(2, '0')}: Empty slot.`;
		}
	}

	function selectRoomById(roomId: string) {
		const slotObj = dialSlots.find((s) => s.room?.id === roomId);
		if (slotObj) {
			selectedSlot = slotObj.slot;
		}
	}

	async function handleStartCreateRoom(payload: {
		name: string;
		mode: RadioMode;
		accessPolicy: RadioAccessPolicy;
		maxParticipants: number;
		explicitMemberEmails: string[];
		invitationExpiryHours: number;
	}) {
		errorBanner = null;
		statusBanner = null;
		const res = await fetch('/api/radio/rooms', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await res.json();
		if (!res.ok || !data.ok) {
			errorBanner = data.error || 'Could not create room.';
			return;
		}

		rooms = data.rooms ?? rooms;
		activeRoomDetail = data.room;
		if (data.inviteToken && data.room?.id) {
			activeInviteTokenByRoom = {
				...activeInviteTokenByRoom,
				[data.room.id]: data.inviteToken
			};
		}
		selectRoomById(data.room.id);
		statusBanner = `Created room "${data.room.name}". Copy its invitation link or join below.`;
		activePanel = 'join-flow';
	}

	async function handlePreviewInviteInput(tokenOrUrl: string) {
		errorBanner = null;
		const trimmed = tokenOrUrl.trim();
		if (!trimmed) return;

		let token = trimmed;
		try {
			if (trimmed.includes('invite=')) {
				const parsedUrl = new URL(trimmed, window.location.origin);
				token = parsedUrl.searchParams.get('invite') || trimmed;
			}
		} catch {
			token = trimmed;
		}

		const res = await fetch('/api/radio/invitations/preview', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ inviteToken: token })
		});
		const data = await res.json();
		if (!res.ok || !data.ok) {
			errorBanner = data.error || 'Invalid invitation link.';
			return;
		}
		pendingInvitation = data.preview;
		pendingInviteToken = data.preview?.valid ? token : null;
		activePanel = 'join-flow';
	}

	async function handleRequestJoinRoom(
		roomId: string,
		inviteToken: string | null,
		asListener: boolean
	) {
		errorBanner = null;
		mediaError = null;
		const res = await fetch(`/api/radio/rooms/${roomId}/join`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'request_join',
				inviteToken,
				joinAsListener: asListener
			})
		});
		const data = await res.json();
		if (data.rooms) rooms = data.rooms;
		if (data.room) {
			activeRoomDetail = data.room;
			selectRoomById(data.room.id);
		}

		if (!res.ok || !data.ok) {
			errorBanner = data.error || 'Unable to join room.';
			return;
		}

		if (data.status === 'pending_approval') {
			statusBanner = 'Admission request sent to the room host. Waiting for approval...';
			return;
		}

		if (asListener) {
			await handleJoinListeningOnly(roomId);
		} else {
			await handleConfirmMicPrePromptAndJoin(roomId);
		}
	}

	async function handleConfirmMicPrePromptAndJoin(roomId: string) {
		errorBanner = null;
		mediaError = null;
		micPermissionPrePromptConfirmed = true;

		// Stop any local mic test before joining a live room
		if (localMicTester) {
			localMicTester.stop();
			localMicTester = null;
			localMicTestActive = false;
			localMicTestLevel = 0;
		}

		// Explicitly request audio-only microphone permission after user action
		const micRes = await requestMicrophonePermissionStream(selectedInputDeviceId || undefined);
		if (micRes.error || !micRes.stream) {
			mediaError = micRes.error ?? classifyMediaError(new Error('Microphone unavailable'));
			return;
		}

		// Join muted by default: disable tracks until user explicitly unmutes or holds PTT
		for (const track of micRes.stream.getAudioTracks()) {
			track.enabled = false;
		}
		activeMicStream = micRes.stream;
		browserMicCapturedWhenMuted = true;
		await refreshDeviceLists();

		await connectToRoomMedia(roomId, false, micRes.stream);
	}

	async function handleJoinListeningOnly(roomId: string) {
		errorBanner = null;
		mediaError = null;
		if (localMicTester) {
			localMicTester.stop();
			localMicTester = null;
			localMicTestActive = false;
			localMicTestLevel = 0;
		}
		stopMediaStreamTracks(activeMicStream);
		activeMicStream = null;
		browserMicCapturedWhenMuted = false;

		await connectToRoomMedia(roomId, true, null);
	}

	async function connectToRoomMedia(
		roomId: string,
		asListener: boolean,
		stream: MediaStream | null
	) {
		if (!user) return;
		failedRoomChecks = 0;
		connectionState = 'connecting';
		joinAsListener = asListener;
		isMuted = true;
		isTransmitting = false;
		let reserved = false;
		let connected = false;

		try {
			// 1. Register connection in room store
			const connectRes = await fetch(`/api/radio/rooms/${roomId}/join`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'connect',
					joinAsListener: asListener
				})
			});
			const connectData = await connectRes.json();
			if (!connectRes.ok || !connectData.ok) {
				connectionState = 'error';
				errorBanner = connectData.error || 'Could not connect to room.';
				stopMediaStreamTracks(stream);
				activeMicStream = null;
				browserMicCapturedWhenMuted = false;
				return;
			}
			reserved = true;

			if (connectData.rooms) rooms = connectData.rooms;
			if (connectData.room) {
				activeRoomDetail = connectData.room;
				selectRoomById(connectData.room.id);
			}

			// 2. Request short-lived audio-only media token
			const requestToken = () => fetch(`/api/radio/rooms/${roomId}/token`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ joinAsListener: asListener })
			});
			let tokenRes = await requestToken();
			const retrySeconds = Number(tokenRes.headers.get('Retry-After'));
			if (tokenRes.status === 409 && retrySeconds > 0 && retrySeconds <= 3) {
				await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1_000));
				tokenRes = await requestToken();
			}
			const tokenData = await tokenRes.json();
			if (!tokenRes.ok || !tokenData.ok) {
				connectionState = 'error';
				errorBanner = tokenData.error || 'Media token rejected.';
				stopMediaStreamTracks(stream);
				activeMicStream = null;
				browserMicCapturedWhenMuted = false;
				return;
			}

			const tokenPayload = tokenData.media as RadioMediaTokenResponse;

			// 3. Lazy-load WebRTC media client
			const { createRadioMediaSession } = await import('$lib/radio/media-client');
			if (mediaSession) {
				await mediaSession.disconnect();
				mediaSession = null;
			}

			mediaSession = await createRadioMediaSession(
				tokenPayload,
				{
					onConnectionStateChanged: (state) => {
						if (
							state === 'offline' &&
							(connectionState === 'connected' || connectionState === 'reconnecting')
						) {
							statusBanner = 'Audio disconnected. Rejoin the room to listen again.';
						}
						connectionState = state;
						if (state === 'reconnecting' || state === 'offline') {
							isMuted = true;
							isTransmitting = false;
						}
					},
					onActiveSpeakersChanged: (speakerIds) => {
						if (!activeRoomDetail) return;
						const names = speakerIds
							.map((id) => activeRoomDetail?.participants.find((p) => p.userId === id)?.displayName)
							.filter((n): n is string => Boolean(n));
						liveSpeakerNames = names;
					},
					onAudioPlaybackBlocked: (blocked) => {
						audioPlaybackBlocked = blocked;
					},
					onLatencyMeasured: (rtt) => {
						latencyMs = rtt;
					},
					onError: (msg) => {
						errorBanner = msg;
					}
				},
				{
					initialStream: stream,
					inputDeviceId: selectedInputDeviceId || undefined,
					outputDeviceId: selectedOutputDeviceId || undefined,
					volume: volume / 100
				}
			);

			// Ensure muted by default on entry
			await mediaSession.setMicrophoneEnabled(false);
			connectionState = 'connected';
			connected = true;
			pendingInvitation = null;
			pendingInviteToken = null;
			activePanel = 'none';

			statusBanner = asListener
				? `Connected to "${activeRoomDetail?.name}" as Listener Only.`
				: `Connected to "${activeRoomDetail?.name}". Microphone is MUTED by default — press PTT to ${
						activeRoomDetail?.mode === 'radio' ? 'speak' : 'unmute'
					}.`;
		} catch (error) {
			connectionState = 'error';
			errorBanner = error instanceof Error ? error.message : 'Failed to initialize room audio.';
			stopMediaStreamTracks(stream);
			activeMicStream = null;
			browserMicCapturedWhenMuted = false;
		} finally {
			if (reserved && !connected) {
				await fetch(`/api/radio/rooms/${roomId}/join`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'leave' })
				}).catch(() => {});
			}
		}
	}

	async function cleanupMediaAndDisconnect() {
		if (pttHeartbeatTimer) {
			clearInterval(pttHeartbeatTimer);
			pttHeartbeatTimer = null;
		}
		pttHoldActive = false;
		isTransmitting = false;
		isMuted = true;
		channelBusy = false;
		liveSpeakerNames = [];

		stopMediaStreamTracks(activeMicStream);
		activeMicStream = null;
		browserMicCapturedWhenMuted = false;
		connectionState = 'offline';
		const previousSession = mediaSession;
		mediaSession = null;
		await previousSession?.disconnect().catch(() => {});
	}

	async function handleDisconnectRoom() {
		const currentRoomId = activeRoomDetail?.id;
		await cleanupMediaAndDisconnect();

		if (currentRoomId && user) {
			try {
				const res = await fetch(`/api/radio/rooms/${currentRoomId}/join`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'leave' })
				});
				const data = await res.json();
				if (data.rooms) rooms = data.rooms;
			} catch {
				// Ignore
			}
		}
		activeRoomDetail = null;
		statusBanner = 'Disconnected and released microphone.';
	}

	async function handleTogglePower() {
		if (isConnected) {
			await handleDisconnectRoom();
			return;
		}
		if (!user) {
			activePanel = 'join-flow';
			statusBanner = 'Sign in with Google first to power on and join a room.';
			return;
		}
		const target = selectedRoom;
		if (!target) {
			activePanel = 'scan';
			statusBanner = 'Create or select an authorised room to connect.';
			return;
		}
		activePanel = 'join-flow';
	}

	async function handlePttToggleConversation() {
		if (!isConnected || !activeRoomDetail) {
			activePanel = 'join-flow';
			return;
		}
		if (joinAsListener) {
			statusBanner = 'You joined as a listener. Rejoin with microphone enabled to speak.';
			activePanel = 'join-flow';
			return;
		}
		if (activeRoomDetail.mode !== 'conversation') return;

		const session = mediaSession;
		if (!session || microphoneChangePending) return;
		microphoneChangePending = true;
		const nextMuted = !isMuted;
		const roomId = activeRoomDetail.id;
		const requestMute = (muted: boolean) =>
			fetch(`/api/radio/rooms/${roomId}/join`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'set_mute', muted })
			});
		try {
			if (nextMuted) {
				isMuted = true;
				isTransmitting = false;
				await session.setMicrophoneEnabled(false);
			}
			const res = await requestMute(nextMuted);
			const data = await res.json();
			if (mediaSession !== session || activeRoomDetail?.id !== roomId) return;
			if (!res.ok || !data.ok) {
				errorBanner = data.error || 'Could not toggle microphone state.';
				return;
			}
			if (!nextMuted) {
				const enabled = await session.setMicrophoneEnabled(true);
				if (mediaSession !== session || activeRoomDetail?.id !== roomId) return;
				if (!enabled || connectionState !== 'connected') {
					await session.setMicrophoneEnabled(false);
					await requestMute(true);
					errorBanner = 'Your microphone could not be enabled. You are still muted.';
					return;
				}
				isMuted = false;
				isTransmitting = true;
			}
			if (data.room) activeRoomDetail = data.room;
			if (data.rooms) rooms = data.rooms;
			if (radioSoundsEnabled) {
				const { playOptionalRadioCue } = await import('$lib/radio/media-client');
				playOptionalRadioCue(nextMuted ? 'ptt_end' : 'ptt_start', true);
			}
		} catch {
			errorBanner = 'Could not update the microphone. Please try again.';
		} finally {
			microphoneChangePending = false;
		}
	}

	async function handlePttPressStart() {
		if (!isConnected || !activeRoomDetail) {
			activePanel = 'join-flow';
			return;
		}
		if (joinAsListener) {
			statusBanner = 'Listening only mode active — enable microphone to transmit.';
			return;
		}
		if (activeRoomDetail.mode !== 'radio') {
			await handlePttToggleConversation();
			return;
		}
		if (isTransmitting) return;

		pttHoldActive = true;
		const roomId = activeRoomDetail.id;
		const res = await fetch(`/api/radio/rooms/${roomId}/ptt`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'acquire' })
		});
		const data = await res.json();
		if (data.rooms) rooms = data.rooms;
		if (data.room) activeRoomDetail = data.room;

		if (!pttHoldActive && !pttLatchMode) {
			// User released button while acquire request was in flight
			if (data.ok) {
				await fetch(`/api/radio/rooms/${roomId}/ptt`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'release' })
				});
			}
			return;
		}

		if (!data.ok) {
			if (data.busy) {
				channelBusy = true;
				statusBanner = `Channel busy: ${data.speakerName || 'Another participant'} is transmitting.`;
				if (radioSoundsEnabled) {
					const { playOptionalRadioCue } = await import('$lib/radio/media-client');
					playOptionalRadioCue('busy', true);
				}
			} else {
				errorBanner = data.error || 'Unable to acquire speaking turn.';
			}
			return;
		}

		channelBusy = false;
		isTransmitting = true;
		isMuted = false;
		await mediaSession?.setMicrophoneEnabled(true);

		if (radioSoundsEnabled) {
			const { playOptionalRadioCue } = await import('$lib/radio/media-client');
			playOptionalRadioCue('ptt_start', true);
		}

		if (pttHeartbeatTimer) clearInterval(pttHeartbeatTimer);
		pttHeartbeatTimer = setInterval(async () => {
			if (!activeRoomDetail || !isTransmitting) return;
			const hb = await fetch(`/api/radio/rooms/${activeRoomDetail.id}/ptt`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'heartbeat' })
			});
			if (!hb.ok) {
				await handlePttPressEnd();
			}
		}, 2500);
	}

	async function handlePttPressEnd() {
		pttHoldActive = false;
		if (pttHeartbeatTimer) {
			clearInterval(pttHeartbeatTimer);
			pttHeartbeatTimer = null;
		}

		const wasTransmitting = isTransmitting;
		isTransmitting = false;
		if (activeRoomDetail?.mode === 'radio') {
			isMuted = true;
		}
		await mediaSession?.setMicrophoneEnabled(false);

		if (wasTransmitting && activeRoomDetail) {
			try {
				const res = await fetch(`/api/radio/rooms/${activeRoomDetail.id}/ptt`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'release' })
				});
				const data = await res.json();
				if (data.room) activeRoomDetail = data.room;
				if (data.rooms) rooms = data.rooms;
			} catch {
				// Ignore
			}
			if (radioSoundsEnabled) {
				const { playOptionalRadioCue } = await import('$lib/radio/media-client');
				playOptionalRadioCue('ptt_end', true);
			}
		}
	}

	async function handleModeButtonPress() {
		if (!provider.radioModeAvailable) {
			statusBanner = 'This radio is set to Conversation. Push-to-talk is not available yet.';
			return;
		}
		if (!user) {
			activePanel = 'join-flow';
			return;
		}
		const target = activeRoomDetail ?? selectedRoom;
		if (!target) {
			activePanel = 'scan';
			return;
		}
		if (target.hostUserId !== user.id) {
			statusBanner = `Room is in ${target.mode.toUpperCase()} mode. Room-wide mode changes are restricted to the host.`;
			return;
		}

		const nextMode: RadioMode = target.mode === 'conversation' ? 'radio' : 'conversation';
		await handleHostAction({ action: 'set_mode', mode: nextMode });
	}

	async function handleHostAction(payload: Record<string, unknown>) {
		const targetId = activeRoomDetail?.id ?? selectedRoom?.id;
		if (!targetId) return;

		errorBanner = null;
		const res = await fetch(`/api/radio/rooms/${targetId}/host`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await res.json();
		if (!res.ok || !data.ok) {
			errorBanner = data.error || 'Host action failed.';
			return;
		}

		if (data.rooms) rooms = data.rooms;
		if (data.room) {
			activeRoomDetail = data.room;
			if (data.room.mode === 'radio' && isConnected && !isTransmitting) {
				isMuted = true;
				await mediaSession?.setMicrophoneEnabled(false);
			}
		}
		if (data.inviteToken) {
			activeInviteTokenByRoom = {
				...activeInviteTokenByRoom,
				[targetId]: data.inviteToken
			};
			statusBanner = 'Generated new invitation link.';
		}
		if (payload.action === 'revoke_invitations') {
			const nextMap = { ...activeInviteTokenByRoom };
			delete nextMap[targetId];
			activeInviteTokenByRoom = nextMap;
			statusBanner = 'Revoked all active invitation links for this room.';
		}
		if (payload.action === 'end_room') {
			await cleanupMediaAndDisconnect();
			activeRoomDetail = null;
			statusBanner = 'Room ended by host.';
		}
	}

	async function handleCopyInviteLink() {
		if (!activeInviteLink) return;
		try {
			await navigator.clipboard.writeText(activeInviteLink);
			copyFeedback = 'Copied!';
			setTimeout(() => {
				copyFeedback = null;
			}, 2000);
		} catch {
			copyFeedback = 'Select & copy link above';
		}
	}

	async function handleNativeShareInviteLink() {
		if (!activeInviteLink) return;
		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({
					title: `COMM-LINK Room: ${activeRoomDetail?.name ?? selectedRoom?.name ?? 'Audio Room'}`,
					text: 'Join my audio room on COMM-LINK:',
					url: activeInviteLink
				});
				return;
			} catch {
				// Fallback to copy
			}
		}
		await handleCopyInviteLink();
	}

	function handleVolumeChange(val: number) {
		volume = val;
		mediaSession?.setVolume(val / 100);
	}

	function handleSelectInputDevice(id: string) {
		selectedInputDeviceId = id;
	}

	async function handleSelectOutputDevice(id: string) {
		selectedOutputDeviceId = id;
		await mediaSession?.setOutputDevice(id);
	}

	async function handleToggleLocalMicTest() {
		mediaError = null;
		if (localMicTester) {
			localMicTester.stop();
			localMicTester = null;
			localMicTestActive = false;
			localMicTestLevel = 0;
			return;
		}

		const res = await startLocalMicTester(
			selectedInputDeviceId || undefined,
			(level) => {
				localMicTestLevel = level;
			}
		);
		if (res.error || !res.tester) {
			mediaError = res.error ?? classifyMediaError(new Error('Mic test failed'));
			return;
		}
		localMicTester = res.tester;
		localMicTestActive = true;
		await refreshDeviceLists();
	}

	async function handleResumeBlockedAudio() {
		await mediaSession?.resumeBlockedAudio();
	}

	async function handleSignOut() {
		await cleanupMediaAndDisconnect();
		await fetch('/api/radio/auth/signout', { method: 'POST' });
		user = null;
		rooms = [];
		activeRoomDetail = null;
		statusBanner = 'Signed out and released microphone.';
		activePanel = 'join-flow';
	}

	async function handleDeleteAccount() {
		await cleanupMediaAndDisconnect();
		const res = await fetch('/api/radio/account', { method: 'DELETE' });
		if (res.ok) {
			user = null;
			rooms = [];
			activeRoomDetail = null;
			statusBanner = 'Deleted your COMM-LINK account, created rooms, and active invitations.';
			activePanel = 'join-flow';
		}
	}

	async function handleSubmitAbuseReport(payload: {
		reason: 'harassment' | 'impersonation' | 'spam' | 'unauthorised_access' | 'privacy' | 'other';
		details: string;
		targetUserId: string | null;
	}) {
		await fetch('/api/radio/report', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				roomId: activeRoomDetail?.id ?? selectedRoom?.id ?? null,
				targetUserId: payload.targetUserId,
				reason: payload.reason,
				details: payload.details
			})
		});
	}

	async function handleLocalTestSignIn(profile: {
		sub: string;
		email: string;
		displayName: string;
	}) {
		errorBanner = null;
		const res = await fetch('/api/radio/auth/test-session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(profile)
		});
		const data = await res.json();
		if (!res.ok || !data.ok) {
			errorBanner = data.error || 'Local test sign-in failed.';
			return;
		}

		const sessionRes = await fetch('/api/radio/session');
		const sessionData = await sessionRes.json();
		if (sessionData.ok) {
			user = sessionData.user;
			rooms = sessionData.rooms ?? [];
			if (sessionData.pendingInvitation) {
				pendingInvitation = sessionData.pendingInvitation;
			}
			statusBanner = `Signed in as ${user?.displayName}.`;
		}
	}

	function togglePanel(panel: ActivePanel) {
		activePanel = activePanel === panel ? 'none' : panel;
	}
</script>

<div class="workbench-surface" class:high-contrast={highContrast} data-testid="comm-link-workbench">
	<!-- Quiet minimal top navigation strip -->
	<header class="workbench-topbar">
		<a href="/blog/apps" class="back-link" data-testid="radio-back-to-blog">
			← SuvroGhosh.IN / Interactive Apps
		</a>
		<div class="topbar-right">
			{#if user}
				<span class="operator-tag" data-testid="signed-in-operator-tag">
					OP: {user.displayName}
				</span>
			{/if}
			<button
				type="button"
				class="utility-pill"
				aria-pressed={highContrast}
				onclick={() => (highContrast = !highContrast)}
				data-testid="topbar-high-contrast-btn"
			>
				{highContrast ? 'High-Contrast: ON' : 'High-Contrast View'}
			</button>
		</div>
	</header>

	<!-- Central Handheld Radio Device (UNIT-07) -->
	<div class="radio-stage">
		<div class="radio-unit-assembly" data-testid="handheld-radio-unit">
			<!-- Left-mounted Black Whip Antenna & Side L-Bracket -->
			<div class="antenna-assembly" aria-hidden="true">
				<div class="antenna-whip"></div>
				<div class="antenna-boot">
					<span class="boot-rib"></span>
					<span class="boot-rib"></span>
					<span class="boot-rib"></span>
					<span class="boot-rib"></span>
				</div>
				<div class="antenna-elbow-bracket">
					<span class="bracket-bolt"></span>
				</div>
			</div>

			<!-- Top Metal D-Ring Lanyard Loop & Burnt-Orange Cap -->
			<div class="top-hardware" aria-hidden="true">
				<div class="lanyard-d-ring"></div>
				<div class="top-orange-bumper"></div>
			</div>

			<!-- Left-side Ribbed Grip Trim -->
			<div class="side-grip-left" aria-hidden="true">
				<span></span><span></span><span></span><span></span><span></span>
			</div>

			<!-- Right-side Ribbed Accessory Guard -->
			<div class="side-guard-right" aria-hidden="true"></div>

			<!-- Main Ruggedized Radio Body -->
			<div class="radio-chassis">
				<!-- SVG Scratches, Bevel Highlights & Stepped 45-Degree Parting Seam Overlay -->
				<svg
					class="chassis-svg-overlay"
					viewBox="0 0 420 710"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<!-- Lower Burnt-Orange Panel Polygon with Iconic Stepped 45-deg Diagonal Seam -->
					<path
						d="M 3 446 L 178 446 L 234 390 L 417 390 L 417 692 Q 417 707 402 707 L 18 707 Q 3 707 3 692 Z"
						fill="url(#burntOrangeGrad)"
					/>
					<!-- Recessed dark parting seam line -->
					<path
						d="M 2 446 L 178 446 L 234 390 L 418 390"
						fill="none"
						stroke="#1b1e1d"
						stroke-width="4.5"
					/>
					<!-- Bevel edge highlight along the diagonal step -->
					<path
						d="M 4 449 L 179 449 L 235 393 L 416 393"
						fill="none"
						stroke="#d4886c"
						stroke-width="1.4"
						opacity="0.65"
					/>
					<!-- Realistic weathered scratches sampled from reference photo -->
					<g stroke="#9da3a2" stroke-width="1.1" opacity="0.42" fill="none">
						<path d="M 252 12 L 298 15" />
						<path d="M 355 185 L 363 230" />
						<path d="M 225 325 L 252 312" />
						<path d="M 345 335 L 385 352" />
						<path d="M 192 420 L 214 402" />
						<path d="M 218 525 L 256 544" />
						<path d="M 96 588 L 154 574" />
						<path d="M 342 608 L 368 594" />
					</g>
					<defs>
						<linearGradient id="burntOrangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stop-color="#b46a50" />
							<stop offset="55%" stop-color="#a85e44" />
							<stop offset="100%" stop-color="#8b4d35" />
						</linearGradient>
					</defs>
				</svg>

				<!-- UPPER SECTION: Recessed Amber Screen Housing -->
				<div class="screen-outer-bezel">
					<div class="screen-inner-recess">
						<div
							class="amber-lcd"
							role="region"
							aria-live="polite"
							aria-label="COMM-LINK Amber Status Display"
							data-testid="amber-screen"
						>
							<!-- Top dark-brown status bar inside amber LCD -->
							<div class="lcd-top-bar">
								<div class="lcd-top-glyphs" aria-hidden="true">
									<span class="glyph-box">⌘</span>
									<span class="glyph-box">▤</span>
									<span class="glyph-box">▣</span>
									<span class="glyph-box">⚙</span>
									<span class="glyph-box">◉</span>
								</div>
								<div class="lcd-top-right">
									<span class="lcd-chevron">«</span>
									<span class="lcd-mode-pill" data-testid="lcd-mode-indicator">
										{effectiveMode === 'radio' ? 'PTT' : 'CONV'}
									</span>
								</div>
							</div>

							<!-- Main LCD Body: 5 Left Icon Controls + Antenna/Level Graphic + 5-Line Live Readout -->
							<div class="lcd-body">
								<!-- 5 Interactive Icon Buttons matching the reference image column -->
								<div class="lcd-icon-column" role="toolbar" aria-label="Radio Functions">
									<button
										type="button"
										class="lcd-icon-btn"
										class:active={activePanel === 'join-flow'}
										onclick={() => togglePanel('join-flow')}
										title="Room Invitation & Join Flow"
										aria-label="Room Invitation and Join Flow"
										data-testid="icon-btn-invite"
									>
										@
									</button>
									<button
										type="button"
										class="lcd-icon-btn"
										class:active={activePanel === 'people'}
										onclick={() => togglePanel('people')}
										title="Participants & Host Controls"
										aria-label="Participants and Host Controls"
										data-testid="icon-btn-people"
									>
										<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
											<circle cx="8" cy="5" r="3" />
											<path d="M2.5 14c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5H2.5z" />
										</svg>
									</button>
									<button
										type="button"
										class="lcd-icon-btn"
										class:active={activePanel === 'settings'}
										onclick={() => togglePanel('settings')}
										title="Microphone, Accessibility & Account Settings"
										aria-label="Microphone, Accessibility and Account Settings"
										data-testid="icon-btn-settings"
									>
										<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
											<path
												d="M7 1h2l.4 1.8 1.5.6 1.5-1 1.4 1.4-1 1.5.6 1.5L15 7v2l-1.6.4-.6 1.5 1 1.5-1.4 1.4-1.5-1-1.5.6L9 15H7l-.4-1.6-1.5-.6-1.5 1-1.4-1.4 1-1.5-.6-1.5L1 9V7l1.6-.4.6-1.5-1-1.5 1.4-1.4 1.5 1 1.5-.6L7 1zm1 4.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5z"
											/>
										</svg>
									</button>
									<button
										type="button"
										class="lcd-icon-btn"
										class:active={activePanel === 'speaker'}
										onclick={() => togglePanel('speaker')}
										title="Speaker Volume & Output Device"
										aria-label="Speaker Volume and Output Device"
										data-testid="icon-btn-speaker"
									>
										<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
											<path d="M2 6h3l4-3.5v11L5 10H2V6zm9.5-1.5a4.5 4.5 0 0 1 0 7l-.9-.9a3.2 3.2 0 0 0 0-5.2l.9-.9z" />
										</svg>
									</button>
									<button
										type="button"
										class="lcd-icon-btn"
										class:active={activePanel === 'lock'}
										onclick={() => togglePanel('lock')}
										title="Room Access Settings & Lock Status"
										aria-label="Room Access Settings and Lock Status"
										data-testid="icon-btn-lock"
									>
										<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
											<path
												d="M5 7V5a3 3 0 0 1 6 0v2h1.5v7h-9V7H5zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2z"
											/>
										</svg>
									</button>
								</div>

								<!-- Framed Radio Tower Graphic + Real-State Meter Bars -->
								<div class="lcd-tower-widget" aria-hidden="true">
									<div class="tower-art">
										<svg viewBox="0 0 60 54" width="100%" height="100%">
											<!-- Concentric wave arcs -->
											<path
												d="M19 16 a15 15 0 0 0 0 20 M41 16 a15 15 0 0 1 0 20"
												fill="none"
												stroke="#3b1d04"
												stroke-width="2.2"
												stroke-linecap="round"
												opacity={realMeterBars >= 1 ? 1 : 0.35}
											/>
											<path
												d="M13 11 a22 22 0 0 0 0 30 M47 11 a22 22 0 0 1 0 30"
												fill="none"
												stroke="#3b1d04"
												stroke-width="2.2"
												stroke-linecap="round"
												opacity={realMeterBars >= 2 ? 1 : 0.3}
											/>
											<path
												d="M7 6 a29 29 0 0 0 0 40 M53 6 a29 29 0 0 1 0 40"
												fill="none"
												stroke="#3b1d04"
												stroke-width="2.2"
												stroke-linecap="round"
												opacity={realMeterBars >= 3 ? 1 : 0.25}
											/>
											<!-- Central antenna tower mast -->
											<circle cx="30" cy="24" r="3" fill="#3b1d04" />
											<path d="M30 26 L23 50 L37 50 Z" fill="#3b1d04" />
										</svg>
									</div>
									<div class="tower-bars">
										<div class="bar-slot"><span style="width: {realMeterBars >= 3 ? '100%' : realMeterBars >= 1 ? '45%' : '0%'}"></span></div>
										<div class="bar-slot"><span style="width: {realMeterBars >= 2 ? '82%' : '0%'}"></span></div>
										<div class="bar-slot"><span style="width: {realMeterBars >= 4 ? '100%' : realMeterBars >= 1 ? '60%' : '0%'}"></span></div>
									</div>
								</div>

								<!-- Concise 5-Line Live Text Readout -->
								<div class="lcd-readout" data-testid="amber-screen-lines">
									<div class="lcd-line line-1" data-testid="amber-line-1">{amberLines.line1}</div>
									<div class="lcd-line line-2" data-testid="amber-line-2">{amberLines.line2}</div>
									<div class="lcd-line line-3" data-testid="amber-line-3">{amberLines.line3}</div>
									<div class="lcd-line line-4" data-testid="amber-line-4">{amberLines.line4}</div>
									<div class="lcd-line line-5" data-testid="amber-line-5">{amberLines.line5}</div>
								</div>
							</div>

							<!-- Bottom decorative technical rule inside amber LCD -->
							<div class="lcd-bottom-trim" aria-hidden="true">
								<span class="trim-seg wide"></span>
								<span class="trim-seg"></span>
								<span class="trim-seg"></span>
								<span class="trim-seg"></span>
								<span class="trim-line"></span>
							</div>
						</div>
					</div>
				</div>

				<!-- MIDDLE SECTION: Channel-Selection Dial, Power Switch, and Exposed Hex Screws -->
				<div class="controls-mid-zone">
					<!-- Top row hex screws -->
					<div class="hex-screw pos-mid-left" aria-hidden="true"></div>
					<div class="hex-screw pos-mid-right" aria-hidden="true"></div>

					<!-- Left: CHANNEL SELECT Rotary Dial (Slots 1..12) -->
					<div class="dial-assembly">
						<div class="stencil-label small">CHANNEL SELECT</div>
						<div
							class="rotary-dial-ring"
							role="slider"
							tabindex="0"
							aria-label="Channel Select Dial (Slots 1 to 12)"
							aria-valuemin={1}
							aria-valuemax={12}
							aria-valuenow={selectedSlot}
							aria-valuetext={`Channel ${selectedSlot}: ${selectedRoom?.name ?? 'Empty'}`}
							onkeydown={(e) => {
								if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
									e.preventDefault();
									stepDial(1);
								} else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
									e.preventDefault();
									stepDial(-1);
								}
							}}
							onclick={() => stepDial(1)}
							data-testid="channel-select-dial"
						>
							<!-- 12 numbered channel markings around the orange collar -->
							{#each dialSlots as slotItem, i (slotItem.slot)}
								{@const angle = -60 + i * 30}
								<span
									class="dial-num"
									class:active={selectedSlot === slotItem.slot}
									class:occupied={Boolean(slotItem.room)}
									style="transform: rotate({angle}deg) translateY(-48px)"
								>
									{slotItem.slot}
								</span>
							{/each}

							<!-- Dark Knurled Center Knob -->
							<div
								class="dial-knob-center"
								style="transform: rotate({dialRotationDeg}deg)"
								data-testid="channel-dial-knob"
							>
								<div class="knob-orange-arc"></div>
								<div class="knob-pointer-notch"></div>
							</div>
						</div>

						<!-- Accessible step buttons paired with rotary dial -->
						<div class="dial-stepper-row">
							<button
								type="button"
								class="dial-step-btn"
								onclick={() => stepDial(-1)}
								aria-label="Previous channel slot"
								data-testid="dial-prev-btn"
							>
								◀ CH
							</button>
							<span class="dial-slot-readout" data-testid="dial-slot-readout">
								CH {String(selectedSlot).padStart(2, '0')}
							</span>
							<button
								type="button"
								class="dial-step-btn"
								onclick={() => stepDial(1)}
								aria-label="Next channel slot"
								data-testid="dial-next-btn"
							>
								CH ▶
							</button>
						</div>
					</div>

					<!-- Right: PWR: ON/OFF Mechanical Slide Switch -->
					<div class="power-switch-assembly">
						<div class="stencil-label small">PWR: ON/OFF</div>
						<button
							type="button"
							class="power-switch-well"
							class:powered-on={isConnected}
							role="switch"
							aria-checked={isConnected}
							aria-label={isConnected
								? 'Power Switch On — Click to disconnect and release microphone'
								: 'Power Switch Off — Click to connect to selected room'}
							onclick={() => handleTogglePower()}
							data-testid="orange-power-switch"
						>
							<span class="switch-slider">
								<span class="slider-ridge"></span>
							</span>
						</button>
						<div class="power-arrows" aria-hidden="true">
							<span>◀</span>
							<span>▲</span>
						</div>
					</div>

					<!-- Hex screws along the stepped parting seam -->
					<div class="hex-screw pos-seam-left-upper" aria-hidden="true"></div>
					<div class="hex-screw pos-seam-left-lower" aria-hidden="true"></div>
					<div class="hex-screw pos-seam-right-lower" aria-hidden="true"></div>
				</div>

				<!-- THREE-BUTTON CLUSTER ON RIGHT UPPER BURNT-ORANGE PANEL: SCAN | PTT | MODE -->
				<div class="three-button-cluster">
					<div class="btn-well small">
						<button
							type="button"
							class="hw-btn dark"
							class:active={activePanel === 'scan'}
							onclick={() => togglePanel('scan')}
							aria-label="SCAN — Open list of available authorised rooms"
							data-testid="scan-button"
						>
							SCAN
						</button>
					</div>

					<div class="ptt-column">
						<div class="btn-well ptt-well">
							<button
								type="button"
								class="hw-btn ptt-btn"
								class:transmitting={isTransmitting || (!isMuted && isConnected && effectiveMode === 'conversation')}
								aria-label={pttButtonLabel}
								aria-pressed={isTransmitting || (!isMuted && isConnected && effectiveMode === 'conversation')}
								onpointerdown={(e) => {
									if (effectiveMode === 'radio' && !pttLatchMode && isConnected) {
										e.currentTarget.setPointerCapture?.(e.pointerId);
										void handlePttPressStart();
									}
								}}
								onpointerup={() => {
									if (effectiveMode === 'radio' && !pttLatchMode && isConnected) {
										void handlePttPressEnd();
									}
								}}
								onpointercancel={() => {
									if (effectiveMode === 'radio' && !pttLatchMode && isConnected) {
										void handlePttPressEnd();
									}
								}}
								onlostpointercapture={() => {
									if (effectiveMode === 'radio' && !pttLatchMode && isTransmitting) {
										void handlePttPressEnd();
									}
								}}
								onclick={() => {
									if (!isConnected) {
										activePanel = 'join-flow';
										return;
									}
									if (effectiveMode === 'conversation') {
										void handlePttToggleConversation();
									} else if (pttLatchMode) {
										if (isTransmitting) {
											void handlePttPressEnd();
										} else {
											void handlePttPressStart();
										}
									}
								}}
								data-testid="ptt-button"
							>
								<span class="ptt-title">PTT</span>
								<span class="ptt-sub" data-testid="ptt-action-sublabel">
									{#if !isConnected}
										JOIN
									{:else if joinAsListener}
										LISTEN
									{:else if effectiveMode === 'conversation'}
										{isMuted ? 'UNMUTE' : 'MUTE'}
									{:else if isTransmitting}
										TX ON
									{:else if pttLatchMode}
										TAP TX
									{:else}
										HOLD
									{/if}
								</span>
							</button>
						</div>
						<div class="stencil-label tx-rx">TX/RX</div>
					</div>

					<div class="btn-well small">
						<button
							type="button"
							class="hw-btn dark"
							onclick={() => handleModeButtonPress()}
							aria-label="MODE — Choose Conversation or Radio mode (host only for room-wide changes)"
							data-testid="mode-button"
						>
							MODE
						</button>
					</div>
				</div>

				<!-- LOWER BURNT-ORANGE PANEL STENCILS & HARDWARE -->
				<div class="lower-panel-stencils">
					<div class="unit-branding">
						<div class="stencil-unit">UNIT-07</div>
						<div class="stencil-corp">AURA CORP.</div>
						<div class="stencil-model">RW-COMM-45</div>
						<div class="stencil-rugged">RUGGEDIZED</div>
						<div class="amber-hazard-bar" aria-hidden="true"></div>
					</div>

					<div class="freq-decorative" title="Decorative marking from reference image; COMM-LINK operates strictly over internet WebRTC audio.">
						<div>FREQ RANGE:</div>
						<div>144-440MHz</div>
					</div>
				</div>

				<!-- Bottom Row Bolts, Property Stencil, and Belt Clips -->
				<div class="bottom-panel-row">
					<div class="hex-bolt-large left" aria-hidden="true"></div>
					<div class="property-stencil">
						<div>PROPERTY OF</div>
						<div>ECHO-BASE</div>
					</div>
					<div class="hex-bolt-large right" aria-hidden="true"></div>
				</div>

				<!-- Bottom Metal Clips & Corner Rubber Bumpers -->
				<div class="bottom-clip left" aria-hidden="true"></div>
				<div class="bottom-clip right" aria-hidden="true"></div>
			</div>
		</div>
	</div>

	<!-- Recessed Operator Drawer / Tactical Inspection Deck -->
	<CommLinkDrawer
		{activePanel}
		{highContrast}
		{user}
		{provider}
		{allowLocalTestAuth}
		{rooms}
		{selectedRoom}
		{activeRoomDetail}
		{isConnected}
		{isConnecting}
		{isMuted}
		{isTransmitting}
		{joinAsListener}
		{micPermissionPrePromptConfirmed}
		{browserMicCapturedWhenMuted}
		{pendingInvitation}
		{pendingInviteToken}
		{activeInviteLink}
		{copyFeedback}
		{statusBanner}
		{errorBanner}
		{mediaError}
		{audioPlaybackBlocked}
		{pttLatchMode}
		{radioSoundsEnabled}
		{volume}
		{inputDevices}
		{outputDevices}
		{selectedInputDeviceId}
		{selectedOutputDeviceId}
		{sinkIdSupported}
		{localMicTestActive}
		{localMicTestLevel}
		{latencyMs}
		onClosePanel={() => (activePanel = 'none')}
		onSelectPanel={(p) => (activePanel = p)}
		onToggleHighContrast={() => (highContrast = !highContrast)}
		onSelectRoomSlot={selectRoomById}
		onStartCreateRoom={handleStartCreateRoom}
		onPreviewInviteInput={handlePreviewInviteInput}
		onRequestJoinRoom={handleRequestJoinRoom}
		onConfirmMicPrePromptAndJoin={handleConfirmMicPrePromptAndJoin}
		onJoinListeningOnly={handleJoinListeningOnly}
		onDisconnectRoom={handleDisconnectRoom}
		onTogglePower={handleTogglePower}
		onPttToggleConversation={handlePttToggleConversation}
		onPttPressStart={handlePttPressStart}
		onPttPressEnd={handlePttPressEnd}
		onHostAction={handleHostAction}
		onCopyInviteLink={handleCopyInviteLink}
		onNativeShareInviteLink={handleNativeShareInviteLink}
		onVolumeChange={handleVolumeChange}
		onSelectInputDevice={handleSelectInputDevice}
		onSelectOutputDevice={handleSelectOutputDevice}
		onToggleLocalMicTest={handleToggleLocalMicTest}
		onResumeBlockedAudio={handleResumeBlockedAudio}
		onTogglePttLatch={(enabled) => (pttLatchMode = enabled)}
		onToggleRadioSounds={(enabled) => (radioSoundsEnabled = enabled)}
		onSignOut={handleSignOut}
		onDeleteAccount={handleDeleteAccount}
		onSubmitAbuseReport={handleSubmitAbuseReport}
		onLocalTestSignIn={handleLocalTestSignIn}
	/>
</div>

<style>
	/* Quiet beige work-surface background sampled from the reference photograph */
	.workbench-surface {
		min-height: 100vh;
		width: 100%;
		box-sizing: border-box;
		padding: 0.75rem 0.75rem 2.5rem;
		background-color: #cfbca9;
		background-image:
			radial-gradient(circle at 22% 14%, rgba(255, 248, 236, 0.55) 0%, rgba(207, 188, 169, 0) 48%),
			radial-gradient(circle at 80% 82%, rgba(126, 104, 82, 0.28) 0%, rgba(207, 188, 169, 0) 55%),
			linear-gradient(165deg, #dfd0bf 0%, #cfbca9 48%, #bda791 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow-x: hidden;
	}

	.workbench-surface.high-contrast {
		background: #101211;
		color: #fff6dc;
	}

	.workbench-topbar {
		width: 100%;
		max-width: 680px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.76rem;
	}

	.back-link {
		color: #3a2e22;
		text-decoration: none;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 5px;
		background: rgba(255, 250, 242, 0.45);
		border: 1px solid rgba(74, 58, 42, 0.25);
	}

	.workbench-surface.high-contrast .back-link {
		color: #fac458;
		background: #1d211f;
		border-color: #fac458;
	}

	.topbar-right {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.operator-tag {
		padding: 0.22rem 0.55rem;
		border-radius: 5px;
		background: rgba(45, 50, 47, 0.88);
		color: #fac458;
		font-weight: 600;
		font-size: 0.72rem;
	}

	.utility-pill {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.25rem 0.6rem;
		border-radius: 5px;
		border: 1px solid #454b48;
		background: #2e3330;
		color: #ebe2d1;
		cursor: pointer;
	}

	.workbench-surface.high-contrast .utility-pill {
		border-color: #fac458;
		color: #fac458;
	}

	.radio-stage {
		width: 100%;
		display: flex;
		justify-content: center;
		padding-top: 4.5rem;
	}

	/* Handheld Radio Assembly matching reference proportions (420 x 710 aspect) */
	.radio-unit-assembly {
		position: relative;
		width: 100%;
		max-width: 416px;
		user-select: none;
		filter: drop-shadow(0 24px 32px rgba(42, 31, 20, 0.46))
			drop-shadow(0 6px 10px rgba(32, 23, 14, 0.32));
	}

	/* Left-Mounted Black Whip Antenna & Ribbed Conical Boot */
	.antenna-assembly {
		position: absolute;
		left: -26px;
		top: -118px;
		width: 50px;
		height: 295px;
		pointer-events: none;
		z-index: 2;
	}

	.antenna-whip {
		position: absolute;
		left: 11px;
		top: 0;
		width: 19px;
		height: 132px;
		background: linear-gradient(90deg, #171918 0%, #3a3f3d 42%, #141615 100%);
		border-radius: 6px 6px 2px 2px;
	}

	.antenna-boot {
		position: absolute;
		left: 6px;
		top: 126px;
		width: 29px;
		height: 92px;
		background: linear-gradient(90deg, #151716 0%, #373c3a 46%, #121413 100%);
		border-radius: 5px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 5px;
		padding: 6px 2px 10px;
		box-sizing: border-box;
	}

	.boot-rib {
		display: block;
		height: 6px;
		background: #0d0f0e;
		border-top: 1px solid #484e4c;
		border-radius: 3px;
	}

	.antenna-elbow-bracket {
		position: absolute;
		left: 2px;
		top: 215px;
		width: 38px;
		height: 56px;
		background: linear-gradient(135deg, #2d3230 0%, #171a19 100%);
		border: 2px solid #464c4a;
		border-radius: 6px 0 0 8px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bracket-bolt {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #1b1e1d;
		border: 2px solid #59605d;
	}

	/* Top D-ring loop & orange bumper */
	.top-hardware {
		position: relative;
		height: 24px;
		width: 100%;
		z-index: 1;
	}

	.lanyard-d-ring {
		position: absolute;
		left: 16px;
		top: -6px;
		width: 44px;
		height: 34px;
		border: 7px solid #7f8685;
		border-radius: 16px;
		transform: rotate(-22deg);
		box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.45);
	}

	.top-orange-bumper {
		position: absolute;
		left: 92px;
		top: 8px;
		width: 96px;
		height: 18px;
		background: linear-gradient(180deg, #c6765c 0%, #98523b 100%);
		border: 2px solid #5e3425;
		border-radius: 7px 7px 0 0;
	}

	/* Side grip & guard trims */
	.side-grip-left {
		position: absolute;
		left: -10px;
		top: 280px;
		width: 12px;
		height: 185px;
		background: linear-gradient(180deg, #a6573e 0%, #7d3e2b 100%);
		border-radius: 6px 0 0 6px;
		border: 1px solid #4b261a;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 8px;
		padding: 12px 0;
		box-sizing: border-box;
		z-index: 1;
	}

	.side-grip-left span {
		display: block;
		height: 8px;
		background: #3d2017;
	}

	.side-guard-right {
		position: absolute;
		right: -8px;
		top: 76px;
		width: 10px;
		height: 295px;
		background: linear-gradient(90deg, #3a3f3d 0%, #5c6361 100%);
		border-radius: 0 5px 5px 0;
		border: 1px solid #252928;
		z-index: 1;
	}

	/* Main Chassis Casing */
	.radio-chassis {
		position: relative;
		width: 100%;
		min-height: 695px;
		background: linear-gradient(155deg, #4b514e 0%, #3f433e 45%, #343835 100%);
		border-radius: 34px 34px 28px 28px;
		border: 4px solid #6b7170;
		box-shadow:
			inset 0 3px 0 rgba(190, 198, 196, 0.35),
			inset 0 -6px 14px rgba(15, 17, 16, 0.65);
		padding: 18px 18px 22px;
		box-sizing: border-box;
		overflow: hidden;
		z-index: 3;
	}

	.chassis-svg-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 0;
	}

	/* Recessed Amber Screen Bezel & Frame */
	.screen-outer-bezel {
		position: relative;
		z-index: 2;
		background: linear-gradient(180deg, #565c59 0%, #3a3f3c 100%);
		border: 3px solid #767d7b;
		border-radius: 24px;
		padding: 12px;
		box-shadow:
			0 6px 14px rgba(0, 0, 0, 0.45),
			inset 0 2px 3px rgba(255, 255, 255, 0.22);
	}

	.screen-inner-recess {
		background: #1b1f1c;
		border: 4px solid #2b302d;
		border-radius: 16px;
		padding: 8px;
		box-shadow: inset 0 6px 12px rgba(0, 0, 0, 0.85);
	}

	.amber-lcd {
		background: linear-gradient(180deg, #fac458 0%, #fab442 58%, #e9a635 100%);
		border: 3px solid #6b3506;
		border-radius: 10px;
		padding: 6px 8px 6px;
		color: #3b1d04;
		font-family: 'IBM Plex Mono', monospace;
		box-shadow:
			inset 0 0 18px rgba(138, 65, 6, 0.35),
			0 0 10px rgba(250, 180, 66, 0.28);
	}

	.lcd-top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #6b3506;
		color: #fac458;
		padding: 3px 7px;
		border-radius: 5px;
		margin-bottom: 6px;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.lcd-top-glyphs {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.glyph-box {
		display: inline-block;
		padding: 0 3px;
		border: 1px solid rgba(250, 196, 88, 0.55);
		border-radius: 2px;
		font-size: 0.65rem;
		line-height: 1.1;
	}

	.lcd-top-right {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.lcd-mode-pill {
		border: 1.5px solid #fac458;
		padding: 0 4px;
		border-radius: 3px;
		font-size: 0.65rem;
		letter-spacing: 0.04em;
	}

	.lcd-body {
		display: grid;
		grid-template-columns: 26px 64px 1fr;
		gap: 6px;
		align-items: stretch;
	}

	.lcd-icon-column {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 3px;
	}

	.lcd-icon-btn {
		width: 24px;
		height: 22px;
		padding: 0;
		border: 1.5px solid #4a2506;
		border-radius: 3px;
		background: rgba(250, 196, 88, 0.35);
		color: #3b1d04;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.72rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			background 100ms ease,
			color 100ms ease;
	}

	.lcd-icon-btn:hover,
	.lcd-icon-btn.active {
		background: #3b1d04;
		color: #fac458;
	}

	.lcd-tower-widget {
		border: 1.8px solid #4a2506;
		border-radius: 4px;
		padding: 3px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		background: rgba(233, 166, 53, 0.25);
	}

	.tower-art {
		height: 62px;
		border-bottom: 1.5px solid #4a2506;
		margin-bottom: 3px;
	}

	.tower-bars {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.bar-slot {
		height: 7px;
		border: 1.4px solid #4a2506;
		background: rgba(59, 29, 4, 0.12);
		padding: 1px;
	}

	.bar-slot span {
		display: block;
		height: 100%;
		background: #3b1d04;
		transition: width 120ms ease;
	}

	.lcd-readout {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 1px 2px;
		overflow: hidden;
	}

	.lcd-line {
		font-family: 'IBM Plex Mono', monospace;
		font-weight: 700;
		font-size: 0.78rem;
		line-height: 1.28;
		letter-spacing: 0.01em;
		color: #3b1d04;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.lcd-line.line-1 {
		font-size: 0.73rem;
		border-bottom: 1.5px solid rgba(74, 37, 6, 0.35);
		padding-bottom: 2px;
		margin-bottom: 1px;
	}

	.lcd-bottom-trim {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 5px;
		padding-top: 3px;
		border-top: 1.5px solid #4a2506;
	}

	.trim-seg {
		width: 10px;
		height: 4px;
		background: #3b1d04;
		transform: skewX(-25deg);
	}

	.trim-seg.wide {
		width: 24px;
	}

	.trim-line {
		flex: 1;
		height: 2px;
		background: #3b1d04;
	}

	/* MIDDLE CONTROLS ZONE */
	.controls-mid-zone {
		position: relative;
		z-index: 2;
		display: grid;
		grid-template-columns: 1.15fr 1fr;
		gap: 10px;
		padding: 14px 6px 6px;
		min-height: 196px;
	}

	.stencil-label {
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: #e0d8c8;
		text-transform: uppercase;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
	}

	.stencil-label.small {
		font-size: 0.84rem;
		margin-bottom: 4px;
		text-align: center;
	}

	/* Channel-Selection Dial */
	.dial-assembly {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-left: 8px;
	}

	.rotary-dial-ring {
		position: relative;
		width: 120px;
		height: 120px;
		border-radius: 50%;
		background: radial-gradient(circle, #714717 42%, #c77b28 60%, #9b5e1c 100%);
		border: 3px solid #262a28;
		box-shadow:
			0 6px 14px rgba(0, 0, 0, 0.55),
			inset 0 2px 4px rgba(255, 224, 170, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.rotary-dial-ring:focus-visible {
		outline: 3px solid #fac458;
		outline-offset: 3px;
	}

	.dial-num {
		position: absolute;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 0.72rem;
		font-weight: 700;
		color: #261403;
		line-height: 1;
		pointer-events: none;
	}

	.dial-num.active {
		color: #fff8e6;
		text-shadow: 0 0 4px #1a0d02;
	}

	.dial-knob-center {
		width: 78px;
		height: 78px;
		border-radius: 50%;
		background: radial-gradient(circle at 38% 35%, #5b625e 0%, #3d4340 65%, #252927 100%);
		border: 4px dashed #222625;
		box-shadow:
			0 4px 10px rgba(0, 0, 0, 0.65),
			inset 0 2px 3px rgba(255, 255, 255, 0.22);
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.knob-orange-arc {
		width: 54px;
		height: 54px;
		border-radius: 50%;
		border: 3px solid #d4832c;
		box-sizing: border-box;
	}

	.knob-pointer-notch {
		position: absolute;
		top: 6px;
		width: 5px;
		height: 13px;
		border-radius: 2px;
		background: #fac458;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.7);
	}

	.dial-stepper-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}

	.dial-step-btn {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.66rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid #6b726f;
		background: #2c312e;
		color: #e0d8c8;
		cursor: pointer;
	}

	.dial-slot-readout {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.72rem;
		font-weight: 700;
		color: #fac458;
	}

	/* Orange Power Switch */
	.power-switch-assembly {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 2px;
	}

	.power-switch-well {
		width: 96px;
		height: 46px;
		background: #1c201f;
		border: 3px solid #595f5c;
		border-radius: 8px;
		padding: 4px;
		box-sizing: border-box;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		box-shadow: inset 0 4px 8px rgba(0, 0, 0, 0.85);
		transition: border-color 140ms ease;
	}

	.power-switch-well.powered-on {
		justify-content: flex-end;
		border-color: #fac458;
	}

	.switch-slider {
		width: 58px;
		height: 32px;
		border-radius: 5px;
		background: linear-gradient(180deg, #cf7b49 0%, #ac6434 65%, #844821 100%);
		border: 1.5px solid #f0a775;
		box-shadow: 0 3px 6px rgba(0, 0, 0, 0.65);
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-right: 7px;
		box-sizing: border-box;
	}

	.slider-ridge {
		width: 6px;
		height: 22px;
		border-radius: 2px;
		background: #e79d6c;
		border-left: 1px solid #6b3716;
	}

	.power-arrows {
		width: 64px;
		display: flex;
		justify-content: space-between;
		font-size: 0.65rem;
		color: #e0d8c8;
		margin-top: 4px;
	}

	/* Exposed Hex Socket Screws */
	.hex-screw {
		position: absolute;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: radial-gradient(circle, #252928 32%, #686f6d 62%, #242826 100%);
		border: 2px solid #1a1d1c;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.65);
	}

	.hex-screw::after {
		content: '';
		position: absolute;
		inset: 5px;
		border-radius: 50%;
		background: #141716;
		border: 1px solid #494f4d;
	}

	.pos-mid-left {
		left: 2px;
		top: 10px;
	}

	.pos-mid-right {
		right: 6px;
		top: 10px;
	}

	.pos-seam-left-upper {
		left: 2px;
		bottom: 8px;
	}

	.pos-seam-left-lower {
		left: 2px;
		bottom: -32px;
	}

	.pos-seam-right-lower {
		right: 6px;
		bottom: 24px;
	}

	/* THREE-BUTTON CLUSTER: SCAN | PTT | MODE */
	.three-button-cluster {
		position: relative;
		z-index: 2;
		margin-left: auto;
		width: 60%;
		display: grid;
		grid-template-columns: 52px 84px 52px;
		align-items: start;
		justify-content: end;
		gap: 8px;
		margin-top: -12px;
		padding-right: 6px;
	}

	.btn-well {
		background: #1f2321;
		border: 2.5px solid #453028;
		border-radius: 10px;
		padding: 4px;
		box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.8);
	}

	.btn-well.small {
		margin-top: 8px;
	}

	.hw-btn {
		width: 100%;
		border-radius: 7px;
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 700;
		letter-spacing: 0.05em;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		transition: transform 70ms ease, box-shadow 70ms ease;
	}

	.hw-btn:active {
		transform: translateY(2px);
	}

	.hw-btn.dark {
		height: 38px;
		background: linear-gradient(180deg, #575f5d 0%, #3b4240 100%);
		border: 1.5px solid #7d8583;
		color: #ebe3d3;
		font-size: 0.85rem;
		box-shadow: 0 3px 5px rgba(0, 0, 0, 0.6);
	}

	.hw-btn.dark.active {
		border-color: #fac458;
		color: #fac458;
	}

	.ptt-column {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.hw-btn.ptt-btn {
		height: 56px;
		background: linear-gradient(160deg, #b84335 0%, #993327 58%, #77251b 100%);
		border: 2px solid #d18276;
		color: #f4ece1;
		box-shadow:
			0 4px 8px rgba(0, 0, 0, 0.65),
			inset 0 1px 2px rgba(255, 215, 205, 0.45);
		touch-action: none;
	}

	.hw-btn.ptt-btn.transmitting {
		background: linear-gradient(160deg, #e04836 0%, #b82918 100%);
		border-color: #fac458;
		box-shadow:
			0 0 14px rgba(250, 196, 88, 0.75),
			inset 0 2px 4px rgba(255, 255, 255, 0.45);
	}

	.ptt-title {
		font-size: 1.2rem;
		line-height: 1;
	}

	.ptt-sub {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.56rem;
		letter-spacing: 0.02em;
		opacity: 0.92;
		margin-top: 2px;
	}

	.stencil-label.tx-rx {
		font-size: 1.05rem;
		margin-top: 6px;
	}

	/* LOWER BURNT-ORANGE PANEL STENCILS */
	.lower-panel-stencils {
		position: relative;
		z-index: 2;
		display: flex;
		 align-items: flex-end;
		justify-content: space-between;
		padding: 16px 12px 10px 18px;
		margin-top: 4px;
	}

	.unit-branding {
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 700;
		color: #e4dcd0;
		text-transform: uppercase;
		line-height: 1.04;
		text-shadow: 0 1px 2px rgba(35, 16, 8, 0.55);
	}

	.stencil-unit {
		font-size: 2.25rem;
		letter-spacing: 0.04em;
	}

	.stencil-corp,
	.stencil-model,
	.stencil-rugged {
		font-size: 1.24rem;
		letter-spacing: 0.05em;
	}

	.amber-hazard-bar {
		width: 132px;
		height: 9px;
		margin-top: 6px;
		background: repeating-linear-gradient(
			-35deg,
			#d8973c,
			#d8973c 14px,
			#9a5b3c 14px,
			#9a5b3c 20px
		);
		border-radius: 2px;
		opacity: 0.9;
	}

	.freq-decorative {
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 700;
		font-size: 0.96rem;
		line-height: 1.12;
		letter-spacing: 0.04em;
		color: #e4dcd0;
		text-align: left;
		padding-right: 12px;
	}

	/* Bottom Bolts, Property Stencil & Clips */
	.bottom-panel-row {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px 4px;
	}

	.hex-bolt-large {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: radial-gradient(circle, #252928 30%, #6c7371 60%, #1c201f 100%);
		border: 3px solid #1b1e1d;
		box-shadow: 0 3px 6px rgba(0, 0, 0, 0.65);
		position: relative;
	}

	.hex-bolt-large::after {
		content: '';
		position: absolute;
		inset: 8px;
		border-radius: 50%;
		background: #141716;
		border: 1.5px solid #4d5351;
	}

	.property-stencil {
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 700;
		font-size: 0.92rem;
		line-height: 1.1;
		letter-spacing: 0.05em;
		color: #e4dcd0;
		text-align: center;
	}

	.bottom-clip {
		position: absolute;
		bottom: -4px;
		width: 30px;
		height: 36px;
		background: linear-gradient(90deg, #3c413f 0%, #686f6d 50%, #343937 100%);
		border: 2px solid #1f2321;
		border-radius: 4px;
		z-index: 4;
	}

	.bottom-clip.left {
		left: 108px;
	}

	.bottom-clip.right {
		right: 108px;
	}

	@media (max-width: 480px) {
		.workbench-surface {
			padding: 0.45rem 0.35rem 2rem;
		}

		.radio-stage {
			padding-top: 3.6rem;
		}

		.radio-unit-assembly {
			max-width: 100%;
		}

		.antenna-assembly {
			left: -8px;
			transform: scale(0.86);
			transform-origin: bottom left;
		}

		.radio-chassis {
			padding: 14px 12px 20px;
			min-height: 660px;
		}

		.lcd-body {
			grid-template-columns: 24px 54px 1fr;
			gap: 4px;
		}

		.lcd-line {
			font-size: 0.7rem;
		}

		.three-button-cluster {
			width: 64%;
			grid-template-columns: 46px 76px 46px;
			gap: 6px;
		}
	}
</style>
