import { RepairShopAudio, type RepairSfxKind } from './audio';
import {
	fastenClockBackScrew,
	fastenRadioBackScrew,
	fitSpareProjectorBelt,
	inspectProjectorComponent,
	inspectRadioComponent,
	manualAdvanceProjector,
	placeClockGear,
	removeWornProjectorBelt,
	rewindProjectorLeader,
	runRadioClosedTest,
	seatRadioSpeakerConnector,
	selectClockGear,
	setClockHandsMinutes,
	setProjectorFocus,
	setRadioTuningDial,
	threadProjectorGuide,
	toggleClockBackPlate,
	toggleProjectorCover,
	toggleProjectorPower,
	toggleRadioBackCover,
	toggleRadioBatteryClip,
	toggleRadioPower,
	turnClockInput,
	unscrewClockBack,
	unscrewRadioBack,
	unthreadLastProjectorGuide
} from './repairs';
import {
	SCREENING_DURATION_SECONDS,
	applyDialogueChoice,
	finishCourtyardScreening,
	getNearbyPrompts,
	inspectPartsDrawer,
	openCharacterConversation,
	openWorkbenchForJob,
	resetSingleRepair,
	setWalkDestination,
	startCourtyardScreening,
	syncDerivedState,
	workbenchPresetView
} from './state';
import { RepairShopThreeRenderer } from './three-world-renderer';
import type {
	CharacterId,
	ClockGearId,
	ClockSlotId,
	JobId,
	ProjectorComponentId,
	ProjectorGuideId,
	RadioComponentId,
	RepairShopGameState,
	RepairShopSettings,
	Vec2,
	WorkbenchCameraPreset
} from './types';
import {
	KEY_PLACES,
	clampToWalkable,
	distance2D,
	getCharacterWorldPosition,
	surfaceAtPoint
} from './world';

export type WorkbenchActionPayload =
	| { type: 'set-job'; job: JobId }
	| { type: 'camera-preset'; preset: WorkbenchCameraPreset }
	| { type: 'camera-nudge'; dyaw?: number; dpitch?: number; dzoom?: number }
	| { type: 'leave-bench' }
	| { type: 'reset-repair'; job: JobId }
	| { type: 'ask-hint' }
	// Radio
	| { type: 'radio-toggle-power' }
	| { type: 'radio-closed-test' }
	| { type: 'radio-unscrew' }
	| { type: 'radio-fasten-screw' }
	| { type: 'radio-toggle-cover' }
	| { type: 'radio-inspect'; part: RadioComponentId }
	| { type: 'radio-toggle-battery' }
	| { type: 'radio-seat-speaker' }
	| { type: 'radio-tune'; value: number }
	// Clock
	| { type: 'clock-unscrew' }
	| { type: 'clock-fasten-screw' }
	| { type: 'clock-toggle-back' }
	| { type: 'clock-turn-input' }
	| { type: 'clock-select-gear'; gear: ClockGearId | null }
	| { type: 'clock-place-gear'; gear: ClockGearId; slot: ClockSlotId }
	| { type: 'clock-set-hands'; minutes: number }
	// Projector
	| { type: 'projector-toggle-power' }
	| { type: 'projector-toggle-cover' }
	| { type: 'projector-inspect'; part: ProjectorComponentId }
	| { type: 'projector-remove-belt' }
	| { type: 'projector-fit-belt' }
	| { type: 'projector-thread'; guide: ProjectorGuideId }
	| { type: 'projector-undo-guide' }
	| { type: 'projector-rewind' }
	| { type: 'projector-manual-turn' }
	| { type: 'projector-focus'; value: number };

export interface RepairShopRuntimeCallbacks {
	onStateChange: (state: RepairShopGameState) => void;
	onSaveMilestone: (state: RepairShopGameState) => void;
	onRequestPauseToggle: () => void;
	onWebGLError: (message: string) => void;
}

export interface RepairShopRuntimeApi {
	setPaused(paused: boolean): void;
	setSettings(settings: RepairShopSettings): void;
	enableAudioFromGesture(existingContext?: AudioContext): Promise<boolean>;
	replaceState(nextState: RepairShopGameState): void;
	interactWithTarget(targetId: string): void;
	walkToPlace(point: Vec2): void;
	chooseDialogue(choiceId: string): void;
	closeDrawerNotice(): void;
	dispatchWorkbench(action: WorkbenchActionPayload): void;
	finishScreening(): void;
	focusCanvas(): void;
	destroy(): void;
}

export function createRepairShopRuntime(
	canvas: HTMLCanvasElement,
	host: HTMLElement,
	initialState: RepairShopGameState,
	initialSettings: RepairShopSettings,
	callbacks: RepairShopRuntimeCallbacks
): RepairShopRuntimeApi {
	let state = syncDerivedState(initialState);
	let settings = { ...initialSettings };
	let destroyed = false;
	let userPaused = false;
	let hiddenPaused =
		typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false;
	let frameId = 0;
	let lastTimestamp = 0;
	let elapsedSec = 0;
	let nudgeAnim = 0;
	let keySpinAnim = 0;
	let stepAccumulator = 0;
	let pendingInteractId: string | null = null;

	const pressedKeys = new Set<string>();
	const audio = new RepairShopAudio();
	audio.setSettings(settings);

	let threeRenderer: RepairShopThreeRenderer;
	try {
		threeRenderer = new RepairShopThreeRenderer(canvas, {
			onContextLost: () => {
				stopLoop();
				callbacks.onWebGLError(
					'The browser paused or reset its 3D graphics context. Your repair progress is saved — press Reload 3D Workshop to step right back in.'
				);
			},
			onContextRestored: () => {
				scheduleLoop();
			}
		});
	} catch (err) {
		audio.dispose();
		throw new Error(
			err instanceof Error && err.message
				? `WebGL 3D view could not start (${err.message}). Check hardware acceleration or try another browser.`
				: 'WebGL 3D view could not start in this browser.',
			{ cause: err }
		);
	}

	const emitState = (save = false) => {
		if (destroyed) return;
		callbacks.onStateChange(state);
		if (save) callbacks.onSaveMilestone(state);
	};

	const triggerInteractionNow = (targetId: string) => {
		pendingInteractId = null;
		if (targetId === 'workbench') {
			state = openWorkbenchForJob(state);
			audio.playSfx('click');
			emitState(true);
			return;
		}
		if (targetId === 'drawers') {
			state = inspectPartsDrawer(state);
			audio.playSfx('cover');
			emitState(true);
			return;
		}
		if (targetId === 'courtyard-screening') {
			if (
				state.jobs.radio === 'returned' &&
				state.jobs.clock === 'returned' &&
				state.jobs.projector === 'returned'
			) {
				state = startCourtyardScreening(state);
				audio.playSfx('success');
				emitState(true);
			} else {
				state = {
					...state,
					statusCaption:
						'Once all three repairs are finished and returned, step up here to start the courtyard film.'
				};
				emitState(false);
			}
			return;
		}
		if (targetId.startsWith('char:')) {
			const charId = targetId.slice(5) as CharacterId;
			state = openCharacterConversation(state, charId);
			audio.playSfx('click');
			emitState(false);
		}
	};

	const interactOrApproach = (targetId: string) => {
		let standSpot: Vec2 = KEY_PLACES.workbench;
		let lookSpot: Vec2 = KEY_PLACES.workbench;

		if (targetId === 'workbench') {
			standSpot = KEY_PLACES.workbench;
			lookSpot = { x: -2.15, z: -3.8 };
		} else if (targetId === 'drawers') {
			standSpot = KEY_PLACES.drawers;
			lookSpot = { x: -4.45, z: -2.45 };
		} else if (targetId === 'courtyard-screening') {
			standSpot = KEY_PLACES.courtyardTable;
			lookSpot = { x: -7.85, z: -0.65 };
		} else if (targetId.startsWith('char:')) {
			const charId = targetId.slice(5) as CharacterId;
			const charPlacement = getCharacterWorldPosition(charId, state);
			standSpot = charPlacement.interactStandPos;
			lookSpot = charPlacement.pos;
		}

		if (distance2D(state.playerPos, standSpot) <= 1.85) {
			state = {
				...state,
				walkTarget: null,
				walkPath: [],
				playerHeading: Math.atan2(lookSpot.x - state.playerPos.x, lookSpot.z - state.playerPos.z)
			};
			triggerInteractionNow(targetId);
		} else {
			pendingInteractId = targetId;
			state = setWalkDestination(state, standSpot);
			emitState(false);
		}
	};

	// Workbench pointer orbit / drag-to-place state
	let pointerDown = false;
	let pointerMoved = false;
	let pointerStartX = 0;
	let pointerStartY = 0;
	let draggedClockGear: ClockGearId | null = null;

	const onPointerDown = (event: PointerEvent) => {
		if (destroyed || userPaused) return;
		if (event.button !== 0) return;
		pointerDown = true;
		pointerMoved = false;
		pointerStartX = event.clientX;
		pointerStartY = event.clientY;
		draggedClockGear = null;

		if (state.mode === 'workbench') {
			const pick = threeRenderer.pickAtClientPoint(event.clientX, event.clientY, 'workbench');
			if (
				pick?.kind === 'workbench-pick' &&
				pick.pickType === 'clock-gear' &&
				state.clock.backOpen
			) {
				draggedClockGear = pick.pickId as ClockGearId;
			}
		}
		canvas.setPointerCapture?.(event.pointerId);
	};

	const onPointerMove = (event: PointerEvent) => {
		if (!pointerDown || destroyed || userPaused) return;
		const dx = event.clientX - pointerStartX;
		const dy = event.clientY - pointerStartY;
		if (Math.hypot(dx, dy) > 6) pointerMoved = true;

		if (state.mode === 'workbench' && state.workbench && !draggedClockGear && pointerMoved) {
			pointerStartX = event.clientX;
			pointerStartY = event.clientY;
			state = {
				...state,
				workbench: {
					...state.workbench,
					yawOffset: state.workbench.yawOffset - dx * 0.008,
					pitchOffset: Math.max(-0.22, Math.min(0.62, state.workbench.pitchOffset + dy * 0.006))
				}
			};
			emitState(false);
		}
	};

	const onPointerUp = (event: PointerEvent) => {
		if (!pointerDown) return;
		pointerDown = false;
		canvas.releasePointerCapture?.(event.pointerId);
		if (destroyed || userPaused) return;

		if (state.mode === 'workbench') {
			const pick = threeRenderer.pickAtClientPoint(event.clientX, event.clientY, 'workbench');
			if (draggedClockGear && pointerMoved) {
				if (pick?.kind === 'workbench-pick' && pick.pickType === 'clock-slot') {
					handleWorkbenchAction({
						type: 'clock-place-gear',
						gear: draggedClockGear,
						slot: pick.pickId as ClockSlotId
					});
				}
				draggedClockGear = null;
				return;
			}
			draggedClockGear = null;

			if (!pointerMoved && pick?.kind === 'workbench-pick') {
				handleWorkbenchPick(pick.pickType, pick.pickId);
			}
			return;
		}

		if (pointerMoved || state.mode !== 'explore') return;

		const pick = threeRenderer.pickAtClientPoint(event.clientX, event.clientY, 'explore');
		if (!pick) return;
		if (pick.kind === 'interact') {
			interactOrApproach(pick.targetId);
		} else if (pick.kind === 'ground') {
			pendingInteractId = null;
			state = setWalkDestination(state, pick.point);
			emitState(false);
		}
	};

	const onWheel = (event: WheelEvent) => {
		if (destroyed || userPaused || state.mode !== 'workbench' || !state.workbench) return;
		event.preventDefault();
		const nextZoom = Math.max(
			0.75,
			Math.min(1.45, state.workbench.zoom - Math.sign(event.deltaY) * 0.08)
		);
		state = {
			...state,
			workbench: { ...state.workbench, zoom: nextZoom }
		};
		emitState(false);
	};

	const handleWorkbenchPick = (pickType: string, pickId: string) => {
		if (pickType === 'radio-action' && pickId === 'toggle-power') {
			handleWorkbenchAction({ type: 'radio-toggle-power' });
		} else if (pickType === 'radio-part') {
			if (pickId === 'back-screws') {
				handleWorkbenchAction({
					type: state.radio.coverOpen
						? 'radio-inspect'
						: state.radio.screwsRemoved < 2
							? 'radio-unscrew'
							: 'radio-fasten-screw',
					part: 'back-screws'
				} as WorkbenchActionPayload);
			} else if (pickId === 'back-cover') {
				handleWorkbenchAction({ type: 'radio-toggle-cover' });
			} else if (
				pickId === 'speaker-connector' &&
				state.radio.inspectedParts.includes('speaker-connector') &&
				!state.radio.speakerConnectorSeated
			) {
				handleWorkbenchAction({ type: 'radio-seat-speaker' });
			} else {
				handleWorkbenchAction({ type: 'radio-inspect', part: pickId as RadioComponentId });
			}
		} else if (pickType === 'clock-part') {
			if (pickId === 'thumbscrews') {
				handleWorkbenchAction({
					type: state.clock.screwsRemoved < 2 ? 'clock-unscrew' : 'clock-fasten-screw'
				});
			} else if (pickId === 'back-plate') {
				handleWorkbenchAction({ type: 'clock-toggle-back' });
			}
		} else if (pickType === 'clock-action' && pickId === 'turn-input') {
			handleWorkbenchAction({ type: 'clock-turn-input' });
		} else if (pickType === 'clock-gear') {
			handleWorkbenchAction({ type: 'clock-select-gear', gear: pickId as ClockGearId });
		} else if (pickType === 'clock-slot' && state.clock.selectedGearForPlacement) {
			handleWorkbenchAction({
				type: 'clock-place-gear',
				gear: state.clock.selectedGearForPlacement,
				slot: pickId as ClockSlotId
			});
		} else if (pickType === 'projector-part') {
			if (pickId === 'side-cover') {
				handleWorkbenchAction({ type: 'projector-toggle-cover' });
			} else if (pickId === 'drive-belt' && state.projector.coverOpen) {
				if (state.projector.beltState === 'worn') {
					handleWorkbenchAction({ type: 'projector-remove-belt' });
				} else {
					handleWorkbenchAction({ type: 'projector-inspect', part: 'drive-belt' });
				}
			} else {
				handleWorkbenchAction({
					type: 'projector-inspect',
					part: pickId as ProjectorComponentId
				});
			}
		} else if (pickType === 'projector-action' && pickId === 'fit-belt') {
			handleWorkbenchAction({ type: 'projector-fit-belt' });
		} else if (pickType === 'projector-guide') {
			handleWorkbenchAction({ type: 'projector-thread', guide: pickId as ProjectorGuideId });
		}
	};

	const handleWorkbenchAction = (action: WorkbenchActionPayload) => {
		let sfx: RepairSfxKind = 'click';
		const prevStatus = state.workbench ? state.jobs[state.workbench.activeJob] : null;

		switch (action.type) {
			case 'set-job':
				state = openWorkbenchForJob(state, action.job);
				break;
			case 'camera-preset':
				if (state.workbench) {
					state = {
						...state,
						workbench: workbenchPresetView(state.workbench.activeJob, action.preset)
					};
				}
				break;
			case 'camera-nudge':
				if (state.workbench) {
					state = {
						...state,
						workbench: {
							...state.workbench,
							yawOffset: state.workbench.yawOffset + (action.dyaw ?? 0),
							pitchOffset: Math.max(
								-0.22,
								Math.min(0.62, state.workbench.pitchOffset + (action.dpitch ?? 0))
							),
							zoom: Math.max(0.75, Math.min(1.45, state.workbench.zoom + (action.dzoom ?? 0)))
						}
					};
				}
				break;
			case 'leave-bench':
				state = syncDerivedState({
					...state,
					mode: 'explore',
					workbench: null
				});
				break;
			case 'reset-repair':
				state = resetSingleRepair(state, action.job);
				sfx = 'cover';
				break;
			case 'ask-hint':
				if (state.workbench) {
					const job = state.workbench.activeJob;
					if (job === 'radio') {
						const nextLevel = Math.min(3, state.radio.hintLevel + 1) as 1 | 2 | 3;
						state = { ...state, radio: { ...state.radio, hintLevel: nextLevel } };
					} else if (job === 'clock') {
						const nextLevel = Math.min(3, state.clock.hintLevel + 1) as 1 | 2 | 3;
						state = { ...state, clock: { ...state.clock, hintLevel: nextLevel } };
					} else {
						const nextLevel = Math.min(3, state.projector.hintLevel + 1) as 1 | 2 | 3;
						state = { ...state, projector: { ...state.projector, hintLevel: nextLevel } };
					}
				}
				break;
			// Radio
			case 'radio-toggle-power':
				state = syncDerivedState({ ...state, radio: toggleRadioPower(state.radio) });
				break;
			case 'radio-closed-test': {
				const updated = runRadioClosedTest(state.radio);
				if (!state.radio.coverOpen && state.radio.powerOn && state.radio.batteryClipSeated) {
					nudgeAnim = 1.0;
					sfx = state.radio.speakerConnectorSeated ? 'success' : 'cutout';
				}
				state = syncDerivedState({ ...state, radio: updated });
				break;
			}
			case 'radio-unscrew':
				state = syncDerivedState({ ...state, radio: unscrewRadioBack(state.radio) });
				sfx = 'screw';
				break;
			case 'radio-fasten-screw':
				state = syncDerivedState({ ...state, radio: fastenRadioBackScrew(state.radio) });
				sfx = 'screw';
				break;
			case 'radio-toggle-cover':
				state = syncDerivedState({ ...state, radio: toggleRadioBackCover(state.radio) });
				sfx = 'cover';
				break;
			case 'radio-inspect':
				state = syncDerivedState({
					...state,
					radio: inspectRadioComponent(state.radio, action.part)
				});
				break;
			case 'radio-toggle-battery':
				state = syncDerivedState({ ...state, radio: toggleRadioBatteryClip(state.radio) });
				sfx = 'connector';
				break;
			case 'radio-seat-speaker':
				state = syncDerivedState({ ...state, radio: seatRadioSpeakerConnector(state.radio) });
				sfx = state.radio.speakerConnectorSeated ? 'connector' : 'click';
				break;
			case 'radio-tune':
				state = syncDerivedState({
					...state,
					radio: setRadioTuningDial(state.radio, action.value)
				});
				break;
			// Clock
			case 'clock-unscrew':
				state = syncDerivedState({ ...state, clock: unscrewClockBack(state.clock) });
				sfx = 'screw';
				break;
			case 'clock-fasten-screw':
				state = syncDerivedState({ ...state, clock: fastenClockBackScrew(state.clock) });
				sfx = 'screw';
				break;
			case 'clock-toggle-back':
				state = syncDerivedState({ ...state, clock: toggleClockBackPlate(state.clock) });
				sfx = 'cover';
				break;
			case 'clock-turn-input':
				keySpinAnim = 1.0;
				state = syncDerivedState({ ...state, clock: turnClockInput(state.clock) });
				sfx = state.clock.mechanismTested ? 'chime' : 'gear';
				break;
			case 'clock-select-gear':
				state = syncDerivedState({
					...state,
					clock: selectClockGear(state.clock, action.gear)
				});
				break;
			case 'clock-place-gear':
				state = syncDerivedState({
					...state,
					clock: placeClockGear(state.clock, action.gear, action.slot)
				});
				sfx = 'gear';
				break;
			case 'clock-set-hands':
				state = syncDerivedState({
					...state,
					clock: setClockHandsMinutes(state.clock, action.minutes)
				});
				if (state.clock.verifiedWorking) sfx = 'chime';
				break;
			// Projector
			case 'projector-toggle-power':
				state = syncDerivedState({ ...state, projector: toggleProjectorPower(state.projector) });
				break;
			case 'projector-toggle-cover':
				state = syncDerivedState({ ...state, projector: toggleProjectorCover(state.projector) });
				sfx = 'cover';
				break;
			case 'projector-inspect':
				state = syncDerivedState({
					...state,
					projector: inspectProjectorComponent(state.projector, action.part)
				});
				break;
			case 'projector-remove-belt':
				state = syncDerivedState({ ...state, projector: removeWornProjectorBelt(state.projector) });
				sfx = 'belt';
				break;
			case 'projector-fit-belt':
				state = syncDerivedState({
					...state,
					projector: fitSpareProjectorBelt(state.projector, state.unlocks.spareBeltInDrawer)
				});
				sfx = 'belt';
				break;
			case 'projector-thread':
				state = syncDerivedState({
					...state,
					projector: threadProjectorGuide(state.projector, action.guide)
				});
				sfx = 'film';
				break;
			case 'projector-undo-guide':
				state = syncDerivedState({
					...state,
					projector: unthreadLastProjectorGuide(state.projector)
				});
				sfx = 'film';
				break;
			case 'projector-rewind':
				state = syncDerivedState({ ...state, projector: rewindProjectorLeader(state.projector) });
				sfx = 'film';
				break;
			case 'projector-manual-turn':
				keySpinAnim = 1.0;
				state = syncDerivedState({
					...state,
					projector: manualAdvanceProjector(state.projector)
				});
				sfx = state.projector.manualCheckPassed ? 'success' : 'film';
				break;
			case 'projector-focus':
				state = syncDerivedState({
					...state,
					projector: setProjectorFocus(state.projector, action.value)
				});
				break;
		}

		const nextStatus = state.workbench ? state.jobs[state.workbench.activeJob] : null;
		if (prevStatus !== nextStatus && nextStatus === 'tested') {
			sfx = 'success';
		}
		audio.playSfx(sfx);
		emitState(action.type !== 'camera-nudge' && action.type !== 'camera-preset');
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (destroyed) return;
		const tag = (event.target as HTMLElement | null)?.tagName;
		const inFormControl = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

		if (event.key === 'Escape') {
			event.preventDefault();
			if (state.mode === 'workbench') {
				handleWorkbenchAction({ type: 'leave-bench' });
			} else if (state.mode === 'dialogue') {
				state = { ...state, mode: 'explore', activeDialogue: null };
				emitState(false);
			} else if (state.mode === 'drawer') {
				state = { ...state, mode: 'explore', drawerMessage: null };
				emitState(false);
			} else if (state.mode === 'screening') {
				state = finishCourtyardScreening(state);
				emitState(true);
			} else {
				callbacks.onRequestPauseToggle();
			}
			return;
		}

		if (userPaused || inFormControl) return;

		const keyLower = event.key.toLowerCase();
		if (
			state.mode === 'explore' &&
			(keyLower === 'w' ||
				keyLower === 'a' ||
				keyLower === 's' ||
				keyLower === 'd' ||
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight')
		) {
			if ((event.target as HTMLElement | null) === canvas || tag === 'BODY' || tag === 'MAIN') {
				event.preventDefault();
				pressedKeys.add(keyLower);
				if (state.walkPath.length > 0) {
					pendingInteractId = null;
					state = { ...state, walkTarget: null, walkPath: [] };
				}
			}
		} else if (
			state.mode === 'explore' &&
			(keyLower === 'e' ||
				(event.target === canvas && (event.key === 'Enter' || event.key === ' ')))
		) {
			const prompts = getNearbyPrompts(state);
			const inReach = prompts.find((p) => p.inReach);
			if (inReach) {
				event.preventDefault();
				triggerInteractionNow(inReach.id);
			}
		} else if (state.mode === 'workbench' && event.target === canvas && state.workbench) {
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				handleWorkbenchAction({ type: 'camera-nudge', dyaw: -0.22 });
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				handleWorkbenchAction({ type: 'camera-nudge', dyaw: 0.22 });
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				handleWorkbenchAction({ type: 'camera-nudge', dpitch: 0.12 });
			} else if (event.key === 'ArrowDown') {
				event.preventDefault();
				handleWorkbenchAction({ type: 'camera-nudge', dpitch: -0.12 });
			}
		}
	};

	const onKeyUp = (event: KeyboardEvent) => {
		pressedKeys.delete(event.key.toLowerCase());
	};

	const onWindowBlur = () => {
		pressedKeys.clear();
	};

	const onVisibilityChange = () => {
		hiddenPaused = document.visibilityState === 'hidden';
		pressedKeys.clear();
		audio.setHidden(hiddenPaused);
		if (hiddenPaused) {
			stopLoop();
		} else if (!userPaused) {
			scheduleLoop();
		}
	};

	const resize = () => {
		if (destroyed) return;
		const bounds = host.getBoundingClientRect();
		threeRenderer.resize(bounds.width || 800, bounds.height || 520);
		if (userPaused || hiddenPaused) {
			threeRenderer.renderFrame(state, settings, elapsedSec, nudgeAnim, keySpinAnim);
		}
	};

	const stepSimulation = (dt: number) => {
		elapsedSec += dt;
		if (nudgeAnim > 0) nudgeAnim = Math.max(0, nudgeAnim - dt * 1.1);
		if (keySpinAnim > 0) keySpinAnim = Math.max(0, keySpinAnim - dt * 1.25);

		if (state.mode === 'screening') {
			const prevWholeSec = Math.floor(state.screeningElapsedSeconds);
			const nextScreenSec = state.screeningElapsedSeconds + dt;
			if (nextScreenSec >= SCREENING_DURATION_SECONDS && !state.unlocks.screeningCompleted) {
				state = {
					...state,
					screeningElapsedSeconds: nextScreenSec,
					unlocks: { ...state.unlocks, screeningCompleted: true },
					statusCaption:
						'“Afternoon Across the Roofs” completed its first reel — stay and watch it loop or press Step Back to stroll the lane.'
				};
				emitState(true);
			} else {
				state = { ...state, screeningElapsedSeconds: nextScreenSec };
				if (Math.floor(nextScreenSec) !== prevWholeSec) {
					emitState(false);
				}
			}
		}

		if (state.mode === 'explore') {
			const speed = 3.15;
			let vx = 0;
			let vz = 0;
			if (pressedKeys.has('w') || pressedKeys.has('arrowup')) vz -= 1;
			if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) vz += 1;
			if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) vx -= 1;
			if (pressedKeys.has('d') || pressedKeys.has('arrowright')) vx += 1;

			if (vx !== 0 || vz !== 0) {
				const mag = Math.hypot(vx, vz);
				const nx = state.playerPos.x + (vx / mag) * speed * dt;
				const nz = state.playerPos.z + (vz / mag) * speed * dt;
				const clamped = clampToWalkable({ x: nx, z: nz }, state.playerPos);
				const moved = distance2D(state.playerPos, clamped);
				state = {
					...state,
					playerPos: clamped,
					playerHeading: Math.atan2(vx, vz)
				};
				stepAccumulator += moved;
				emitState(false);
			} else if (state.walkPath.length > 0) {
				const nextWp = state.walkPath[0];
				const dx = nextWp.x - state.playerPos.x;
				const dz = nextWp.z - state.playerPos.z;
				const dist = Math.hypot(dx, dz);
				const stepDist = speed * dt;

				if (dist <= Math.max(0.08, stepDist)) {
					const remaining = state.walkPath.slice(1);
					state = {
						...state,
						playerPos: nextWp,
						walkPath: remaining,
						walkTarget: remaining.length > 0 ? state.walkTarget : null
					};
					stepAccumulator += dist;
					if (remaining.length === 0 && pendingInteractId) {
						const targetToRun = pendingInteractId;
						pendingInteractId = null;
						triggerInteractionNow(targetToRun);
					} else {
						emitState(false);
					}
				} else {
					const nextPos = clampToWalkable(
						{
							x: state.playerPos.x + (dx / dist) * stepDist,
							z: state.playerPos.z + (dz / dist) * stepDist
						},
						state.playerPos
					);
					state = {
						...state,
						playerPos: nextPos,
						playerHeading: Math.atan2(dx, dz)
					};
					stepAccumulator += stepDist;
					emitState(false);
				}
			}

			if (stepAccumulator >= 0.92) {
				stepAccumulator = 0;
				const surf = surfaceAtPoint(state.playerPos);
				audio.playSfx(
					surf === 'oxide' ? 'step-oxide' : surf === 'brick' ? 'step-brick' : 'step-tarmac'
				);
			}
		}

		audio.updateWorldFrame(state);
	};

	const tick = (timestamp: number) => {
		frameId = 0;
		if (destroyed || userPaused || hiddenPaused) return;
		const dt =
			lastTimestamp > 0
				? Math.min(0.05, Math.max(0.001, (timestamp - lastTimestamp) / 1000))
				: 1 / 60;
		lastTimestamp = timestamp;

		stepSimulation(dt);
		threeRenderer.renderFrame(state, settings, elapsedSec, nudgeAnim, keySpinAnim);
		scheduleLoop();
	};

	const scheduleLoop = () => {
		if (destroyed || frameId || userPaused || hiddenPaused) return;
		frameId = requestAnimationFrame(tick);
	};

	const stopLoop = () => {
		if (frameId) {
			cancelAnimationFrame(frameId);
			frameId = 0;
		}
		lastTimestamp = 0;
	};

	const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
	resizeObserver?.observe(host);

	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointercancel', onPointerUp);
	canvas.addEventListener('wheel', onWheel, { passive: false });
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);
	window.addEventListener('blur', onWindowBlur);
	document.addEventListener('visibilitychange', onVisibilityChange);

	resize();
	emitState(false);
	threeRenderer.renderFrame(state, settings, 0, 0, 0);
	scheduleLoop();

	return {
		setPaused(paused: boolean) {
			userPaused = paused;
			pressedKeys.clear();
			if (paused) {
				stopLoop();
			} else {
				scheduleLoop();
			}
		},
		setSettings(nextSettings: RepairShopSettings) {
			settings = { ...nextSettings };
			audio.setSettings(settings);
			if (userPaused) {
				threeRenderer.renderFrame(state, settings, elapsedSec, nudgeAnim, keySpinAnim);
			}
		},
		enableAudioFromGesture(existingContext?: AudioContext) {
			return audio.enableFromGesture(existingContext);
		},
		replaceState(nextState: RepairShopGameState) {
			pendingInteractId = null;
			state = syncDerivedState(nextState);
			emitState(true);
			threeRenderer.renderFrame(state, settings, elapsedSec, nudgeAnim, keySpinAnim);
		},
		interactWithTarget(targetId: string) {
			interactOrApproach(targetId);
		},
		walkToPlace(point: Vec2) {
			pendingInteractId = null;
			state = setWalkDestination(state, point);
			emitState(false);
		},
		chooseDialogue(choiceId: string) {
			state = applyDialogueChoice(state, choiceId);
			audio.playSfx(
				choiceId.startsWith('return-') || choiceId === 'take-belt' ? 'success' : 'click'
			);
			emitState(choiceId !== 'close' && choiceId !== 'clarify');
		},
		closeDrawerNotice() {
			state = { ...state, mode: 'explore', drawerMessage: null };
			emitState(false);
		},
		dispatchWorkbench(action: WorkbenchActionPayload) {
			handleWorkbenchAction(action);
		},
		finishScreening() {
			state = finishCourtyardScreening(state);
			audio.playSfx('chime');
			emitState(true);
		},
		focusCanvas() {
			canvas.focus({ preventScroll: true });
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			stopLoop();
			resizeObserver?.disconnect();
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', onPointerUp);
			canvas.removeEventListener('wheel', onWheel);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onWindowBlur);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			audio.dispose();
			threeRenderer.dispose();
		}
	};
}
