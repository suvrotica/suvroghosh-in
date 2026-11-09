import { buildAudioCaptureConstraints, stopMediaStreamTracks } from './audio-devices';
import type { RadioConnectionState, RadioMediaTokenResponse } from './types';

export interface MediaClientCallbacks {
	onConnectionStateChanged: (state: RadioConnectionState) => void;
	onActiveSpeakersChanged: (speakerUserIds: string[]) => void;
	onAudioPlaybackBlocked: (blocked: boolean) => void;
	onLatencyMeasured: (rttMs: number | null) => void;
	onError: (message: string) => void;
}

export interface RadioMediaSession {
	setMicrophoneEnabled: (enabled: boolean, deviceId?: string) => Promise<boolean>;
	releaseMicrophone: () => Promise<void>;
	publishLoopbackPttStream?: (stream: MediaStream, signal: AbortSignal) => Promise<boolean>;
	setOutputDevice: (deviceId: string) => Promise<boolean>;
	setVolume: (normalizedVolume: number) => void;
	resumeBlockedAudio: () => Promise<boolean>;
	disconnect: () => Promise<void>;
	isMicrophoneTrackActive: () => boolean;
}

/**
 * Optional subtle radio beep cues. Off by default to preserve natural speech.
 */
export function playOptionalRadioCue(
	kind: 'ptt_start' | 'ptt_end' | 'busy',
	enabled: boolean
): void {
	if (!enabled || typeof window === 'undefined') return;
	try {
		const AudioContextCtor =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		const ctx = new AudioContextCtor();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'sine';

		const now = ctx.currentTime;
		if (kind === 'ptt_start') {
			osc.frequency.setValueAtTime(1180, now);
			osc.frequency.setValueAtTime(1480, now + 0.035);
			gain.gain.setValueAtTime(0.035, now);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(now);
			osc.stop(now + 0.08);
		} else if (kind === 'ptt_end') {
			osc.frequency.setValueAtTime(1320, now);
			osc.frequency.setValueAtTime(980, now + 0.04);
			gain.gain.setValueAtTime(0.03, now);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(now);
			osc.stop(now + 0.09);
		} else {
			osc.frequency.setValueAtTime(440, now);
			gain.gain.setValueAtTime(0.04, now);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(now);
			osc.stop(now + 0.15);
		}

		setTimeout(() => {
			void ctx.close().catch(() => {});
		}, 220);
	} catch {
		// Ignore optional cue failure
	}
}

export async function createRadioMediaSession(
	tokenInfo: RadioMediaTokenResponse,
	callbacks: MediaClientCallbacks,
	options: {
		initialStream: MediaStream | null;
		inputDeviceId?: string;
		outputDeviceId?: string;
		volume: number;
	}
): Promise<RadioMediaSession> {
	if (tokenInfo.transport === 'livekit' && tokenInfo.serverUrl) {
		return createLiveKitSession(tokenInfo, callbacks, options);
	}
	return createLoopbackWebRtcSession(tokenInfo, callbacks, options);
}

export async function publishRadioPttStream(
	media: RadioMediaTokenResponse,
	stream: MediaStream,
	signal: AbortSignal,
	onConnectionLost: () => void,
	canTransmit: () => boolean
): Promise<boolean> {
	const track = stream.getAudioTracks()[0];
	if (
		!track || signal.aborted || !canTransmit() || !media.canPublish ||
		media.transport !== 'livekit' || !media.serverUrl
	) return false;
	const { Room, RoomEvent, Track, ConnectionState } = await import('livekit-client');
	if (signal.aborted || !canTransmit()) return false;
	const room = new Room({ reconnectPolicy: { nextRetryDelayInMs: () => null } });
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		signal.removeEventListener('abort', close);
		stopMediaStreamTracks(stream);
		void room.disconnect(true).catch(() => {});
	};
	signal.addEventListener('abort', close, { once: true });
	const interrupt = () => {
		if (closed) return;
		close();
		onConnectionLost();
	};
	room.on(RoomEvent.ConnectionStateChanged, (state) => {
		if (
			state === ConnectionState.Disconnected || state === ConnectionState.Reconnecting ||
			state === ConnectionState.SignalReconnecting
		) {
			interrupt();
		}
	});
	room.on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
		if (participant === room.localParticipant && participant.permissions?.canPublish === false) {
			interrupt();
		}
	});

	try {
		await room.connect(media.serverUrl, media.token, {
			autoSubscribe: false,
			maxRetries: 0,
			websocketTimeout: 5_000,
			peerConnectionTimeout: 5_000
		});
		if (signal.aborted || !canTransmit() || closed || room.state !== ConnectionState.Connected) {
			close();
			return false;
		}
		track.enabled = true;
		await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
		if (signal.aborted || !canTransmit() || closed || room.state !== ConnectionState.Connected) {
			close();
			return false;
		}
		return true;
	} catch {
		close();
		return false;
	}
}

async function createLiveKitSession(
	tokenInfo: RadioMediaTokenResponse,
	callbacks: MediaClientCallbacks,
	options: {
		initialStream: MediaStream | null;
		inputDeviceId?: string;
		outputDeviceId?: string;
		volume: number;
	}
): Promise<RadioMediaSession> {
	const livekit = await import('livekit-client');
	const { Room, RoomEvent, Track, ConnectionState } = livekit;

	// Release any pre-acquired stream before LiveKit manages its own track
	stopMediaStreamTracks(options.initialStream);

	const audioElements = new Set<HTMLMediaElement>();
	let currentVolume = Math.max(0, Math.min(1, options.volume));
	let currentSinkId = options.outputDeviceId || '';
	let statsTimer: ReturnType<typeof setInterval> | null = null;
	let disconnected = false;
	let microphoneCleanup: Promise<void> | null = null;

	const room = new Room({
		adaptiveStream: false,
		dynacast: false,
		audioCaptureDefaults: {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
			channelCount: 1,
			deviceId:
				options.inputDeviceId && options.inputDeviceId !== 'default'
					? options.inputDeviceId
					: undefined
		},
		publishDefaults: {
			dtx: true,
			red: true,
			simulcast: false
		}
	});

	const applyAudioElementSettings = (el: HTMLMediaElement) => {
		el.volume = currentVolume;
		if (
			currentSinkId &&
			currentSinkId !== 'default' &&
			'setSinkId' in el &&
			typeof (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId ===
				'function'
		) {
			void (
				el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }
			)
				.setSinkId(currentSinkId)
				.catch(() => {});
		}
	};

	room.on(RoomEvent.ConnectionStateChanged, (state) => {
		if (disconnected) return;
		if (state === ConnectionState.Connected) {
			callbacks.onConnectionStateChanged('connected');
		} else if (state === ConnectionState.Connecting) {
			callbacks.onConnectionStateChanged('connecting');
		} else if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
			const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
			if (track) track.mediaStreamTrack.enabled = false;
			void room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
			callbacks.onConnectionStateChanged('reconnecting');
		} else if (state === ConnectionState.Disconnected) {
			callbacks.onConnectionStateChanged('offline');
		}
	});

	function awaitMicrophonePermission(): Promise<boolean> {
		if (room.localParticipant.permissions?.canPublish) return Promise.resolve(true);
		return new Promise((resolve) => {
			const finish = (allowed: boolean) => {
				clearTimeout(timeout);
				room.off(RoomEvent.ParticipantPermissionsChanged, onPermissionChange);
				resolve(allowed);
			};
			const onPermissionChange = () => {
				if (room.localParticipant.permissions?.canPublish) finish(true);
			};
			const timeout = setTimeout(() => finish(false), 1_500);
			room.on(RoomEvent.ParticipantPermissionsChanged, onPermissionChange);
		});
	}

	room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
		const ids = speakers.map((s) => s.identity).filter(Boolean);
		callbacks.onActiveSpeakersChanged(ids);
	});

	room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
		callbacks.onAudioPlaybackBlocked(!room.canPlaybackAudio);
	});

	const isOwnPttPublisher = (participant: import('livekit-client').RemoteParticipant) =>
		participant.identity.startsWith('ptt_') && participant.metadata === tokenInfo.participantId;
	const subscribeMicrophone = (
		publication: import('livekit-client').RemoteTrackPublication,
		participant: import('livekit-client').RemoteParticipant
	) => {
		if (!isOwnPttPublisher(participant) && publication.kind === Track.Kind.Audio &&
			publication.source === Track.Source.Microphone) {
			publication.setSubscribed(true);
		}
	};
	room.on(RoomEvent.TrackPublished, subscribeMicrophone);

	room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
		if (track.kind !== Track.Kind.Audio || isOwnPttPublisher(participant)) return;
		const el = track.attach();
		el.style.display = 'none';
		document.body.appendChild(el);
		audioElements.add(el);
		applyAudioElementSettings(el);
		void el.play().catch(() => {
			callbacks.onAudioPlaybackBlocked(true);
		});
	});

	room.on(RoomEvent.TrackUnsubscribed, (track) => {
		const detached = track.detach();
		for (const el of detached) {
			audioElements.delete(el);
			el.remove();
		}
	});

	try {
		callbacks.onConnectionStateChanged('connecting');
		await room.connect(tokenInfo.serverUrl!, tokenInfo.token, {
			autoSubscribe: false
		});
		for (const participant of room.remoteParticipants.values()) {
			for (const publication of participant.trackPublications.values()) {
				subscribeMicrophone(publication, participant);
			}
		}
		// Join muted by default
		await room.localParticipant.setMicrophoneEnabled(false);
		callbacks.onConnectionStateChanged('connected');
		if (!room.canPlaybackAudio) {
			callbacks.onAudioPlaybackBlocked(true);
		}
	} catch (err) {
		disconnected = true;
		await room.disconnect().catch(() => {});
		for (const element of audioElements) element.remove();
		audioElements.clear();
		callbacks.onConnectionStateChanged('error');
		callbacks.onError(
			err instanceof Error ? err.message : 'Unable to connect to audio room server.'
		);
		throw err;
	}

	statsTimer = setInterval(() => {
		if (disconnected) return;
		const engine = (room as unknown as { engine?: { client?: { rtt?: number } } }).engine;
		const rtt = engine?.client?.rtt;
		if (typeof rtt === 'number' && rtt >= 0) {
			callbacks.onLatencyMeasured(Math.round(rtt));
		}
	}, 3000);

	return {
		setMicrophoneEnabled: async (enabled: boolean, deviceId?: string) => {
			if (disconnected) return false;
			try {
				if (microphoneCleanup) await microphoneCleanup;
				if (enabled && !(await awaitMicrophonePermission())) return false;
				if (disconnected || (enabled && room.state !== ConnectionState.Connected)) return false;
				if (!enabled) {
					const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
					if (track) track.mediaStreamTrack.enabled = false;
				}
				if (deviceId && deviceId !== 'default') {
					await room.switchActiveDevice('audioinput', deviceId);
				}
				await room.localParticipant.setMicrophoneEnabled(enabled);
				return true;
			} catch (err) {
				callbacks.onError(
					err instanceof Error ? err.message : 'Microphone could not be toggled.'
				);
				return false;
			}
		},
		releaseMicrophone: () => {
			if (microphoneCleanup) return microphoneCleanup;
			const tracks = [...room.localParticipant.audioTrackPublications.values()]
				.flatMap(({ track }) => track ? [track] : []);
			for (const track of tracks) {
				track.mediaStreamTrack.enabled = false;
				track.stop();
			}
			microphoneCleanup = Promise.allSettled(
				tracks.map((track) => room.localParticipant.unpublishTrack(track))
			).then(() => { microphoneCleanup = null; });
			return microphoneCleanup;
		},
		setOutputDevice: async (deviceId: string) => {
			currentSinkId = deviceId;
			try {
				if (deviceId && deviceId !== 'default') {
					await room.switchActiveDevice('audiooutput', deviceId);
				}
				for (const el of audioElements) {
					applyAudioElementSettings(el);
				}
				return true;
			} catch {
				return false;
			}
		},
		setVolume: (normalizedVolume: number) => {
			currentVolume = Math.max(0, Math.min(1, normalizedVolume));
			for (const el of audioElements) {
				el.volume = currentVolume;
			}
		},
		resumeBlockedAudio: async () => {
			try {
				await room.startAudio();
				for (const el of audioElements) {
					await el.play().catch(() => {});
				}
				callbacks.onAudioPlaybackBlocked(!room.canPlaybackAudio);
				return room.canPlaybackAudio;
			} catch {
				return false;
			}
		},
		disconnect: async () => {
			if (disconnected) return;
			disconnected = true;
			if (statsTimer) {
				clearInterval(statsTimer);
				statsTimer = null;
			}
			try {
				for (const pub of room.localParticipant.audioTrackPublications.values()) {
					pub.track?.stop();
				}
				await room.disconnect(true);
			} catch {
				// Ignore disconnect error
			}
			for (const el of audioElements) {
				try {
					el.pause();
					el.srcObject = null;
					el.remove();
				} catch {
					// Ignore
				}
			}
			audioElements.clear();
		},
		isMicrophoneTrackActive: () => {
			if (disconnected) return false;
			for (const pub of room.localParticipant.audioTrackPublications.values()) {
				if (pub.track && pub.track.mediaStreamTrack?.readyState === 'live') {
					return true;
				}
			}
			return false;
		}
	};
}

interface LoopbackSignalMessage {
	type: 'hello' | 'offer' | 'answer' | 'ice' | 'bye' | 'speaking';
	roomId: string;
	fromPeerId: string;
	fromUserId: string;
	toPeerId?: string;
	sdp?: RTCSessionDescriptionInit;
	candidate?: RTCIceCandidateInit;
	speaking?: boolean;
}

/**
 * Real WebRTC (RTCPeerConnection + Opus audio track) loopback mesh over BroadcastChannel
 * used strictly on localhost when LiveKit Cloud credentials are not configured, enabling
 * genuine multi-tab WebRTC audio verification.
 */
async function createLoopbackWebRtcSession(
	tokenInfo: RadioMediaTokenResponse,
	callbacks: MediaClientCallbacks,
	options: {
		initialStream: MediaStream | null;
		inputDeviceId?: string;
		outputDeviceId?: string;
		volume: number;
	}
): Promise<RadioMediaSession> {
	const peerInstanceId = `${tokenInfo.participantId}:${Math.random().toString(36).slice(2, 9)}`;
	const channelName = `comm_link_webrtc_${tokenInfo.roomId}`;
	const bc =
		typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;

	let localStream: MediaStream | null = options.initialStream;
	let micEnabled = false;
	let microphoneGeneration = 0;
	let currentVolume = Math.max(0, Math.min(1, options.volume));
	let currentSinkId = options.outputDeviceId || '';
	let disconnected = false;

	const peers = new Map<string, RTCPeerConnection>();
	const remoteAudioEls = new Map<string, HTMLAudioElement>();
	const activeRemoteSpeakers = new Set<string>();

	let audioCtx: AudioContext | null = null;
	let vadTimer: ReturnType<typeof setInterval> | null = null;
	let statsTimer: ReturnType<typeof setInterval> | null = null;
	let localSpeaking = false;

	// Ensure initial stream starts muted (track.enabled = false) as required
	if (localStream) {
		for (const track of localStream.getAudioTracks()) {
			track.enabled = false;
		}
	}

	const updateSpeakingList = () => {
		const list = Array.from(activeRemoteSpeakers);
		if (localSpeaking && micEnabled) {
			list.unshift(tokenInfo.participantId);
		}
		callbacks.onActiveSpeakersChanged(list);
	};

	const startLocalVad = (stream: MediaStream) => {
		if (vadTimer) clearInterval(vadTimer);
		if (audioCtx && audioCtx.state !== 'closed') {
			void audioCtx.close().catch(() => {});
		}
		try {
			const AudioContextCtor =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			audioCtx = new AudioContextCtor();
			const src = audioCtx.createMediaStreamSource(stream);
			const analyser = audioCtx.createAnalyser();
			analyser.fftSize = 256;
			src.connect(analyser);
			const buf = new Float32Array(analyser.fftSize);

			vadTimer = setInterval(() => {
				if (disconnected || !micEnabled) {
					if (localSpeaking) {
						localSpeaking = false;
						bc?.postMessage({
							type: 'speaking',
							roomId: tokenInfo.roomId,
							fromPeerId: peerInstanceId,
							fromUserId: tokenInfo.participantId,
							speaking: false
						} satisfies LoopbackSignalMessage);
						updateSpeakingList();
					}
					return;
				}
				analyser.getFloatTimeDomainData(buf);
				let sum = 0;
				for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
				const rms = Math.sqrt(sum / buf.length);
				const nowSpeaking = rms > 0.015;
				if (nowSpeaking !== localSpeaking) {
					localSpeaking = nowSpeaking;
					bc?.postMessage({
						type: 'speaking',
						roomId: tokenInfo.roomId,
						fromPeerId: peerInstanceId,
						fromUserId: tokenInfo.participantId,
						speaking: localSpeaking
					} satisfies LoopbackSignalMessage);
					updateSpeakingList();
				}
			}, 140);
		} catch {
			// Ignore VAD setup failure in headless environments without WebAudio
		}
	};

	if (localStream) {
		startLocalVad(localStream);
	}

	const getOrCreatePeer = (remotePeerId: string): RTCPeerConnection => {
		const existing = peers.get(remotePeerId);
		if (existing) return existing;

		const pc = new RTCPeerConnection({ iceServers: tokenInfo.iceServers });
		peers.set(remotePeerId, pc);

		if (localStream) {
			for (const track of localStream.getAudioTracks()) {
				pc.addTrack(track, localStream);
			}
		}

		pc.onicecandidate = (ev) => {
			if (ev.candidate && !disconnected) {
				bc?.postMessage({
					type: 'ice',
					roomId: tokenInfo.roomId,
					fromPeerId: peerInstanceId,
					fromUserId: tokenInfo.participantId,
					toPeerId: remotePeerId,
					candidate: ev.candidate.toJSON()
				} satisfies LoopbackSignalMessage);
			}
		};

		pc.ontrack = (ev) => {
			if (ev.track.kind !== 'audio') return;
			const stream = ev.streams[0] ?? new MediaStream([ev.track]);
			let audioEl = remoteAudioEls.get(remotePeerId);
			if (!audioEl) {
				audioEl = document.createElement('audio');
				audioEl.autoplay = true;
				audioEl.style.display = 'none';
				document.body.appendChild(audioEl);
				remoteAudioEls.set(remotePeerId, audioEl);
			}
			audioEl.srcObject = stream;
			audioEl.volume = currentVolume;
			if (
				currentSinkId &&
				currentSinkId !== 'default' &&
				'setSinkId' in audioEl &&
				typeof (
					audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
				).setSinkId === 'function'
			) {
				void (
					audioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }
				)
					.setSinkId(currentSinkId)
					.catch(() => {});
			}
			void audioEl.play().catch(() => {
				callbacks.onAudioPlaybackBlocked(true);
			});
		};

		return pc;
	};

	if (bc) {
		bc.onmessage = async (event: MessageEvent<LoopbackSignalMessage>) => {
			if (disconnected) return;
			const msg = event.data;
			if (!msg || msg.roomId !== tokenInfo.roomId || msg.fromPeerId === peerInstanceId) return;
			if (msg.toPeerId && msg.toPeerId !== peerInstanceId) return;

			try {
				if (msg.type === 'hello') {
					const pc = getOrCreatePeer(msg.fromPeerId);
					const offer = await pc.createOffer({ offerToReceiveAudio: true });
					await pc.setLocalDescription(offer);
					bc.postMessage({
						type: 'offer',
						roomId: tokenInfo.roomId,
						fromPeerId: peerInstanceId,
						fromUserId: tokenInfo.participantId,
						toPeerId: msg.fromPeerId,
						sdp: pc.localDescription ?? offer
					} satisfies LoopbackSignalMessage);
				} else if (msg.type === 'offer' && msg.sdp) {
					const pc = getOrCreatePeer(msg.fromPeerId);
					await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);
					bc.postMessage({
						type: 'answer',
						roomId: tokenInfo.roomId,
						fromPeerId: peerInstanceId,
						fromUserId: tokenInfo.participantId,
						toPeerId: msg.fromPeerId,
						sdp: pc.localDescription ?? answer
					} satisfies LoopbackSignalMessage);
				} else if (msg.type === 'answer' && msg.sdp) {
					const pc = peers.get(msg.fromPeerId);
					if (pc && pc.signalingState === 'have-local-offer') {
						await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
					}
				} else if (msg.type === 'ice' && msg.candidate) {
					const pc = peers.get(msg.fromPeerId);
					if (pc) {
						await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
					}
				} else if (msg.type === 'speaking') {
					if (msg.speaking) {
						activeRemoteSpeakers.add(msg.fromUserId);
					} else {
						activeRemoteSpeakers.delete(msg.fromUserId);
					}
					updateSpeakingList();
				} else if (msg.type === 'bye') {
					const pc = peers.get(msg.fromPeerId);
					if (pc) {
						pc.close();
						peers.delete(msg.fromPeerId);
					}
					const el = remoteAudioEls.get(msg.fromPeerId);
					if (el) {
						el.pause();
						el.srcObject = null;
						el.remove();
						remoteAudioEls.delete(msg.fromPeerId);
					}
					activeRemoteSpeakers.delete(msg.fromUserId);
					updateSpeakingList();
				}
			} catch {
				// Ignore transient signaling race
			}
		};

		bc.postMessage({
			type: 'hello',
			roomId: tokenInfo.roomId,
			fromPeerId: peerInstanceId,
			fromUserId: tokenInfo.participantId
		} satisfies LoopbackSignalMessage);
	}

	callbacks.onConnectionStateChanged('connected');

	statsTimer = setInterval(async () => {
		if (disconnected) return;
		for (const pc of peers.values()) {
			try {
				const stats = await pc.getStats();
				stats.forEach((report) => {
					if (
						report.type === 'candidate-pair' &&
						report.state === 'succeeded' &&
						typeof report.currentRoundTripTime === 'number'
					) {
						callbacks.onLatencyMeasured(Math.round(report.currentRoundTripTime * 1000));
					}
				});
			} catch {
				// Ignore stats error
			}
		}
	}, 2500);

	function releaseLoopbackMicrophone(): Promise<void> {
		if (disconnected) return Promise.resolve();
		microphoneGeneration++;
		micEnabled = false;
		localSpeaking = false;
		stopMediaStreamTracks(localStream);
		localStream = null;
		if (vadTimer) clearInterval(vadTimer);
		vadTimer = null;
		if (audioCtx && audioCtx.state !== 'closed') void audioCtx.close().catch(() => {});
		audioCtx = null;
		bc?.postMessage({
			type: 'speaking',
			roomId: tokenInfo.roomId,
			fromPeerId: peerInstanceId,
			fromUserId: tokenInfo.participantId,
			speaking: false
		} satisfies LoopbackSignalMessage);
		updateSpeakingList();
		return Promise.resolve();
	}

	async function attachLoopbackAudio(stream: MediaStream, stillCurrent: () => boolean) {
		const track = stream.getAudioTracks()[0];
		if (!track) return;
		for (const [remotePeerId, pc] of peers) {
			if (!stillCurrent()) return;
			const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'audio');
			if (sender) {
				await sender.replaceTrack(track);
				continue;
			}
			pc.addTrack(track, stream);
			const offer = await pc.createOffer({ offerToReceiveAudio: true });
			await pc.setLocalDescription(offer);
			if (!stillCurrent()) return;
			bc?.postMessage({
				type: 'offer',
				roomId: tokenInfo.roomId,
				fromPeerId: peerInstanceId,
				fromUserId: tokenInfo.participantId,
				toPeerId: remotePeerId,
				sdp: pc.localDescription ?? offer
			} satisfies LoopbackSignalMessage);
		}
	}

	return {
		setMicrophoneEnabled: async (enabled: boolean, deviceId?: string) => {
			if (disconnected) return false;
			if (!tokenInfo.canPublish && enabled) {
				return false;
			}
			const generation = ++microphoneGeneration;
			const stillCurrent = () => !disconnected && generation === microphoneGeneration;
			try {
				if (enabled && (deviceId || !localStream?.getAudioTracks().some((track) => track.readyState === 'live'))) {
					const constraints = buildAudioCaptureConstraints(deviceId || options.inputDeviceId);
					const nextStream = await navigator.mediaDevices.getUserMedia(constraints);
					if (!stillCurrent() || !nextStream.getAudioTracks()[0]) {
						stopMediaStreamTracks(nextStream);
						return false;
					}
					for (const track of nextStream.getTracks()) track.enabled = false;
					stopMediaStreamTracks(localStream);
					localStream = nextStream;
					await attachLoopbackAudio(nextStream, stillCurrent);
					if (!stillCurrent()) return false;
					startLocalVad(nextStream);
				}

				micEnabled = enabled;
				if (localStream) {
					for (const track of localStream.getAudioTracks()) {
						track.enabled = enabled;
					}
				}
				if (!enabled) {
					localSpeaking = false;
					bc?.postMessage({
						type: 'speaking',
						roomId: tokenInfo.roomId,
						fromPeerId: peerInstanceId,
						fromUserId: tokenInfo.participantId,
						speaking: false
					} satisfies LoopbackSignalMessage);
					updateSpeakingList();
				}
				return true;
			} catch (err) {
				callbacks.onError(
					err instanceof Error ? err.message : 'Unable to enable microphone.'
				);
				return false;
			}
		},
		releaseMicrophone: releaseLoopbackMicrophone,
		publishLoopbackPttStream: async (stream, signal) => {
			if (disconnected || signal.aborted || !tokenInfo.canPublish) return false;
			void releaseLoopbackMicrophone();
			localStream = stream;
			const stillCurrent = () => !signal.aborted && !disconnected && localStream === stream;
			await attachLoopbackAudio(stream, stillCurrent);
			if (!stillCurrent()) return false;
			micEnabled = true;
			for (const track of stream.getAudioTracks()) track.enabled = true;
			startLocalVad(stream);
			return true;
		},
		setOutputDevice: async (deviceId: string) => {
			currentSinkId = deviceId;
			for (const el of remoteAudioEls.values()) {
				if (
					deviceId &&
					deviceId !== 'default' &&
					'setSinkId' in el &&
					typeof (
						el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
					).setSinkId === 'function'
				) {
					await (
						el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }
					)
						.setSinkId(deviceId)
						.catch(() => {});
				}
			}
			return true;
		},
		setVolume: (normalizedVolume: number) => {
			currentVolume = Math.max(0, Math.min(1, normalizedVolume));
			for (const el of remoteAudioEls.values()) {
				el.volume = currentVolume;
			}
		},
		resumeBlockedAudio: async () => {
			let allPlaying = true;
			for (const el of remoteAudioEls.values()) {
				try {
					await el.play();
				} catch {
					allPlaying = false;
				}
			}
			callbacks.onAudioPlaybackBlocked(!allPlaying);
			return allPlaying;
		},
		disconnect: async () => {
			if (disconnected) return;
			disconnected = true;
			if (vadTimer) clearInterval(vadTimer);
			if (statsTimer) clearInterval(statsTimer);
			if (audioCtx && audioCtx.state !== 'closed') {
				void audioCtx.close().catch(() => {});
			}
			bc?.postMessage({
				type: 'bye',
				roomId: tokenInfo.roomId,
				fromPeerId: peerInstanceId,
				fromUserId: tokenInfo.participantId
			} satisfies LoopbackSignalMessage);
			bc?.close();
			for (const pc of peers.values()) {
				pc.close();
			}
			peers.clear();
			for (const el of remoteAudioEls.values()) {
				el.pause();
				el.srcObject = null;
				el.remove();
			}
			remoteAudioEls.clear();
			stopMediaStreamTracks(localStream);
			localStream = null;
		},
		isMicrophoneTrackActive: () => {
			if (disconnected || !localStream) return false;
			return localStream.getAudioTracks().some((t) => t.readyState === 'live');
		}
	};
}
