<script lang="ts">
	import { onMount, tick } from 'svelte';
	import AccessibleSolver from './AccessibleSolver.svelte';
	import CompletionPostcard from './CompletionPostcard.svelte';
	import CrosswordGrid from './CrosswordGrid.svelte';
	import CrosswordKeyboard from './CrosswordKeyboard.svelte';
	import CrosswordLanding from './CrosswordLanding.svelte';
	import CrosswordPanel from './CrosswordPanel.svelte';
	import CrosswordSettings from './CrosswordSettings.svelte';
	import {
		CROSSWORD_STORAGE_KEY,
		applyCheck,
		backspace,
		buildPuzzleModel,
		checkEntry,
		checkLetter,
		checkPuzzle,
		clearAllCrosswordData,
		clearPackProgress,
		createEmptyMasteryHistory,
		createEmptyProgress,
		createPuzzleState,
		deleteCell,
		enterEntryAnswer,
		enterLetter,
		exportProgress,
		findCrossingConflicts,
		getCompletedEntryIds,
		getCompletionReport,
		getSelectedEntryId,
		importProgress,
		isPuzzleComplete,
		loadCrosswordProgress,
		moveSpatial,
		moveToNextEntry,
		moveToPreviousEntry,
		recommendNextEntry,
		recordCompletedPuzzle,
		removeSavedPuzzle,
		requestNextHint,
		restorePuzzleState,
		revealEntry,
		revealUsefulCrossingLetter,
		savePuzzleState,
		selectCell,
		selectEntry,
		selectReviewConcepts,
		storeCrosswordProgress,
		toggleDirection,
		togglePencilMode,
		updateElapsedTime,
		updateCrosswordSettings,
		type CellKey,
		type CrosswordPack,
		type CrosswordProgress,
		type CrosswordPuzzle,
		type CrosswordSettings as Settings,
		type PuzzleModel,
		type PuzzleState,
		type RoundSelection
	} from '$lib/games/crossword';
	import type { GameCatalogEntry } from '$lib/games/catalog';

	type GamePhase = 'landing' | 'solving' | 'complete';
	type SolverView = 'grid' | 'list';

	let {
		game,
		pack
	}: {
		game: GameCatalogEntry;
		pack: CrosswordPack;
	} = $props();

	let shell: HTMLElement;
	let fileAnchor: HTMLAnchorElement;
	let phase = $state<GamePhase>('landing');
	let solverView = $state<SolverView>('grid');
	let progress = $state<CrosswordProgress>(createEmptyProgress(new Date(0)));
	let selection = $state<RoundSelection>({
		topicIds: ['mixed-systems'],
		level: 'adaptive',
		sessionFormat: 'coffee'
	});
	let model = $state<PuzzleModel | undefined>();
	let puzzleState = $state<PuzzleState | undefined>();
	let activeEntryId = $state<string | undefined>();
	let feedback = $state('');
	let announcement = $state('');
	let showSettings = $state(false);
	let hideCompleted = $state(false);
	let cssImmersive = $state(false);
	let nativeFullscreen = $state(false);
	let fullscreenSupported = $state(false);
	let hydrated = $state(false);
	let lastFocus = $state<HTMLElement | undefined>();
	let settingsReturnFocus = $state<HTMLElement | undefined>();
	let settingsTrigger = $state<HTMLButtonElement>();
	let tutorialStepIndex = $state(0);
	let clockBaseMs = 0;
	let lastClockPersistBlock = 0;
	let completedEntryIds = $derived(
		model && puzzleState ? getCompletedEntryIds(puzzleState, model) : []
	);
	let completionReport = $derived(
		model && puzzleState ? getCompletionReport(puzzleState, model) : undefined
	);
	let packMastery = $derived(progress.masteryByPack[pack.id] ?? createEmptyMasteryHistory());
	let reviewCount = $derived(selectReviewConcepts(packMastery, { limit: 99 }).length);
	let resumable = $derived(
		Object.values(progress.savedPuzzles)
			.filter((saved) => saved.packId === pack.id)
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
	);
	let activePuzzle = $derived(model?.puzzle);
	let tutorialStep = $derived(activePuzzle?.tutorial?.[tutorialStepIndex]);
	let progressPercent = $derived(
		model
			? Math.round((completedEntryIds.length / Math.max(1, model.puzzle.entries.length)) * 100)
			: 0
	);

	function announce(message: string, essential = false) {
		feedback = message;
		if (essential || puzzleState?.settings.announcementsEnabled !== false) announcement = message;
	}

	function storage(): Storage | undefined {
		try {
			return window.localStorage;
		} catch {
			return undefined;
		}
	}

	function persist(state = puzzleState) {
		if (!state) return;
		progress = savePuzzleState(progress, state);
		const target = storage();
		if (target) storeCrosswordProgress(target, progress);
	}

	function normalizeLandingSelection(value: RoundSelection): RoundSelection {
		return {
			...value,
			topicIds: [value.topicIds[0] ?? 'mixed-systems'],
			sessionFormat: value.sessionFormat === 'tutorial' ? 'coffee' : value.sessionFormat
		};
	}

	function choosePuzzle(current: RoundSelection): CrosswordPuzzle {
		const topic = current.topicIds[0];
		if (current.sessionFormat === 'review' && reviewCount > 0) {
			const reviewSeeds = pack.puzzles.filter(
				(puzzle) => puzzle.sessionFormat === 'review' || puzzle.level === 'adaptive'
			);
			if (reviewSeeds.length) {
				const queued = selectReviewConcepts(packMastery, { limit: 12 });
				return (
					reviewSeeds.find((puzzle) =>
						puzzle.entries.some((entry) =>
							queued.some((record) => record.conceptId === (entry.conceptId ?? entry.id))
						)
					) ?? reviewSeeds[0]
				);
			}
		}

		const exact = pack.puzzles.filter(
			(puzzle) =>
				(topic === 'mixed-systems' || puzzle.topicIds.includes(topic)) &&
				(current.level === 'adaptive' || puzzle.level === current.level) &&
				(current.sessionFormat === 'review' || puzzle.sessionFormat === current.sessionFormat)
		);
		if (exact.length) return exact[0];
		const sameTopicAndLevel = pack.puzzles.filter(
			(puzzle) =>
				(topic === 'mixed-systems' || puzzle.topicIds.includes(topic)) &&
				(current.level === 'adaptive' || puzzle.level === current.level)
		);
		if (sameTopicAndLevel.length) return sameTopicAndLevel[0];
		const sameTopic = pack.puzzles.filter(
			(puzzle) => topic === 'mixed-systems' || puzzle.topicIds.includes(topic)
		);
		if (sameTopic.length) return sameTopic[0];
		return pack.puzzles[0];
	}

	function loadPuzzle(puzzle: CrosswordPuzzle, restored?: PuzzleState | null) {
		model = buildPuzzleModel(puzzle);
		const repaired = restored
			? restorePuzzleState(
					{
						...progress,
						savedPuzzles: {
							...progress.savedPuzzles,
							[`${puzzle.packId}/${puzzle.id}`]: {
								packId: puzzle.packId,
								puzzleId: puzzle.id,
								state: restored,
								updatedAt: restored.updatedAt
							}
						}
					},
					puzzle.packId,
					puzzle.id,
					model
				)
			: null;
		puzzleState =
			repaired ??
			createPuzzleState(model, {
				settings: progress.settings,
				selection
			});
		clockBaseMs = Date.now() - puzzleState.elapsedMs;
		lastClockPersistBlock = Math.floor(puzzleState.elapsedMs / 10_000);
		tutorialStepIndex = 0;
		activeEntryId = getSelectedEntryId(puzzleState, model) ?? undefined;
		phase = isPuzzleComplete(puzzleState, model) ? 'complete' : 'solving';
		feedback = puzzle.subtitle ?? 'The grid is ready.';
		persist(puzzleState);
		void tick().then(() => shell?.scrollIntoView({ block: 'start' }));
	}

	function startTutorial() {
		const tutorial = pack.puzzles.find((puzzle) => puzzle.sessionFormat === 'tutorial');
		if (!tutorial) return startRound();
		selection = {
			topicIds: [...tutorial.topicIds],
			level: tutorial.level,
			sessionFormat: 'tutorial'
		};
		loadPuzzle(tutorial);
		if (tutorial.tutorial?.[0]?.entryId) selectGridEntry(tutorial.tutorial[0].entryId);
		announce(
			`Guided round started. ${tutorial.tutorial?.[0]?.text ?? tutorial.subtitle ?? ''}`,
			true
		);
	}

	function advanceTutorial() {
		if (!activePuzzle?.tutorial?.length) return;
		const nextIndex = tutorialStepIndex + 1;
		if (nextIndex >= activePuzzle.tutorial.length) {
			tutorialStepIndex = activePuzzle.tutorial.length;
			announce('The guided introduction is complete. Hints and Unstuck remain available.');
			return;
		}
		tutorialStepIndex = nextIndex;
		const nextStep = activePuzzle.tutorial[nextIndex];
		if (nextStep.entryId) selectGridEntry(nextStep.entryId);
		announce(`Tutorial step ${nextIndex + 1}: ${nextStep.text}`, true);
	}

	function skipTutorial() {
		if (!activePuzzle?.tutorial) return;
		tutorialStepIndex = activePuzzle.tutorial.length;
		announce('Guided prompts hidden. Hints and Unstuck remain available.');
	}

	function startRound() {
		loadPuzzle(choosePuzzle(selection));
		announce(`Started ${choosePuzzle(selection).title}.`);
	}

	function resumeRound() {
		if (!resumable) return startRound();
		const puzzle = pack.puzzles.find((candidate) => candidate.id === resumable.puzzleId);
		if (!puzzle) return startRound();
		selection = resumable.state.selection;
		loadPuzzle(puzzle, resumable.state);
		announce(`Resumed ${puzzle.title}.`);
	}

	function syncActiveEntry() {
		if (!model || !puzzleState) return;
		activeEntryId = getSelectedEntryId(puzzleState, model) ?? undefined;
	}

	function afterStateChange(previousCompleted = completedEntryIds) {
		if (!model || !puzzleState) return;
		syncActiveEntry();
		const nowComplete = getCompletedEntryIds(puzzleState, model);
		const newlyComplete = nowComplete.filter((entryId) => !previousCompleted.includes(entryId));
		if (newlyComplete.length) {
			const entry = model.entriesById[newlyComplete[0]];
			announce(
				`${model.entryNumbers[entry.id]} ${entry.direction} completed. Its Aha card is ready.`
			);
			if (puzzleState.settings.hapticsEnabled && navigator.vibrate) navigator.vibrate(22);
			if (puzzleState.settings.soundEnabled) playCompletionTone();
		}
		persist();
		if (isPuzzleComplete(puzzleState, model)) finishRound();
	}

	function playCompletionTone() {
		try {
			const AudioCtor = window.AudioContext;
			if (!AudioCtor) return;
			const context = new AudioCtor();
			const oscillator = context.createOscillator();
			const gain = context.createGain();
			oscillator.type = 'sine';
			oscillator.frequency.value = 392;
			gain.gain.setValueAtTime(0.0001, context.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.025, context.currentTime + 0.012);
			gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
			oscillator.connect(gain).connect(context.destination);
			oscillator.start();
			oscillator.stop(context.currentTime + 0.12);
			oscillator.onended = () => void context.close();
		} catch {
			// Audio is a nonessential acknowledgement; the visible state is authoritative.
		}
	}

	function selectGridCell(key: CellKey) {
		if (!model || !puzzleState) return;
		puzzleState = selectCell(puzzleState, model, key);
		syncActiveEntry();
		feedback = '';
	}

	function selectGridEntry(entryId: string) {
		if (!model || !puzzleState) return;
		puzzleState = selectEntry(puzzleState, model, entryId);
		activeEntryId = entryId;
		feedback = '';
	}

	function enterGridLetter(letter: string) {
		if (!model || !puzzleState || phase !== 'solving') return;
		const before = completedEntryIds;
		puzzleState = enterLetter(puzzleState, model, letter);
		if (
			puzzleState.settings.playMode === 'coach' &&
			puzzleState.selectedCellKey &&
			Object.values(puzzleState.cells).some((cell) => cell.checkStatus === 'incorrect')
		) {
			feedback = 'That letter does not fit here. It remains visible so you can reconsider it.';
		} else feedback = '';
		afterStateChange(before);
	}

	function eraseGridLetter() {
		if (!model || !puzzleState) return;
		puzzleState = backspace(puzzleState, model);
		feedback = '';
		persist();
	}

	function deleteGridLetter() {
		if (!model || !puzzleState) return;
		puzzleState = deleteCell(puzzleState, model);
		feedback = '';
		persist();
	}

	function moveGrid(direction: 'up' | 'down' | 'left' | 'right') {
		if (!model || !puzzleState) return;
		const [row, column] =
			direction === 'up'
				? [-1, 0]
				: direction === 'down'
					? [1, 0]
					: direction === 'left'
						? [0, -1]
						: [0, 1];
		puzzleState = moveSpatial(puzzleState, model, row, column);
		syncActiveEntry();
	}

	function toggleGridDirection() {
		if (!model || !puzzleState) return;
		puzzleState = toggleDirection(puzzleState, model);
		syncActiveEntry();
	}

	function previousEntry() {
		if (!model || !puzzleState) return;
		puzzleState = moveToPreviousEntry(puzzleState, model);
		syncActiveEntry();
	}

	function nextEntry() {
		if (!model || !puzzleState) return;
		puzzleState = moveToNextEntry(puzzleState, model);
		syncActiveEntry();
	}

	function fillListAnswer(entryId: string, value: string) {
		if (!model || !puzzleState) return;
		const before = completedEntryIds;
		puzzleState = enterEntryAnswer(puzzleState, model, entryId, value);
		activeEntryId = entryId;
		afterStateChange(before);
	}

	function requestHint(entryId = activeEntryId) {
		if (!entryId || !model || !puzzleState) return;
		const result = requestNextHint(puzzleState, model, entryId);
		puzzleState = result.state;
		activeEntryId = entryId;
		announce(
			result.hint
				? `Hint ${result.level}: ${result.hint.text}`
				: 'No further hint is available for this answer.',
			true
		);
		afterStateChange();
	}

	function revealActiveEntry(entryId = activeEntryId) {
		if (!entryId || !model || !puzzleState) return;
		const result = revealEntry(puzzleState, model, entryId);
		puzzleState = result.state;
		activeEntryId = entryId;
		const entry = model.entriesById[entryId];
		announce(
			`${entry.displayAnswer ?? entry.answer} revealed. ${entry.learning.definition} ${entry.learning.whyItMatters}`,
			true
		);
		afterStateChange();
	}

	function revealCrossing() {
		if (!model || !puzzleState || !activeEntryId) return;
		const result = revealUsefulCrossingLetter(puzzleState, model, activeEntryId);
		puzzleState = result.state;
		announce(
			result.revealedCellKeys.length
				? 'One useful crossing letter was added and marked as revealed.'
				: 'Every useful crossing in this answer is already known.',
			true
		);
		persist();
	}

	function recommendClue() {
		if (!model || !puzzleState) return;
		const entryId = recommendNextEntry(puzzleState, model);
		if (!entryId) return announce('Every clue is already complete.');
		selectGridEntry(entryId);
		const entry = model.entriesById[entryId];
		announce(
			`Try ${model.entryNumbers[entryId]} ${entry.direction}; it has the most helpful completed crossings.`
		);
	}

	function explainConflict() {
		if (!model || !puzzleState) return;
		const conflict = findCrossingConflicts(puzzleState, model)[0];
		if (!conflict) return announce('No filled crossing is currently in conflict.');
		selectGridCell(conflict.cellKey);
		announce(
			`${conflict.message} First clue: ${conflict.clues[0]} Second clue: ${conflict.clues[1]}`,
			true
		);
	}

	function checkSelectedLetter() {
		if (!model || !puzzleState) return;
		const result = checkLetter(puzzleState, model);
		puzzleState = applyCheck(puzzleState, result);
		announce(
			result.cells[0]?.status === 'correct'
				? 'This letter fits.'
				: result.cells[0]?.status === 'incorrect'
					? 'This letter does not fit.'
					: 'The selected cell is blank.',
			true
		);
		persist();
	}

	function checkSelectedEntry() {
		if (!model || !puzzleState) return;
		const result = checkEntry(puzzleState, model, activeEntryId ?? null);
		puzzleState = applyCheck(puzzleState, result);
		announce(
			result.complete
				? 'This answer is complete and correct.'
				: result.correct
					? 'No entered letter conflicts, but the answer is not complete.'
					: 'At least one letter in this answer does not fit.',
			true
		);
		persist();
	}

	function checkEntirePuzzle() {
		if (!model || !puzzleState) return;
		const result = checkPuzzle(puzzleState, model);
		puzzleState = applyCheck(puzzleState, result);
		const incorrect = result.cells.filter((cell) => cell.status === 'incorrect').length;
		const blanks = result.cells.filter((cell) => cell.status === 'blank').length;
		announce(
			result.complete
				? 'Every answer is complete and correct.'
				: `${incorrect} conflicting ${incorrect === 1 ? 'letter' : 'letters'} and ${blanks} blank ${blanks === 1 ? 'cell' : 'cells'} remain.`,
			true
		);
		persist();
	}

	function finishRound() {
		if (!model || !puzzleState || phase === 'complete') return;
		const history = recordCompletedPuzzle(packMastery, model, puzzleState);
		progress = {
			...progress,
			masteryByPack: { ...progress.masteryByPack, [pack.id]: history }
		};
		progress = removeSavedPuzzle(progress, pack.id, model.puzzle.id);
		const target = storage();
		if (target) storeCrosswordProgress(target, progress);
		phase = 'complete';
		announce('Puzzle complete. The completion note is ready.', true);
	}

	function resetCurrentRound() {
		if (!model) return;
		puzzleState = createPuzzleState(model, {
			settings: progress.settings,
			selection
		});
		activeEntryId = getSelectedEntryId(puzzleState, model) ?? undefined;
		phase = 'solving';
		showSettings = false;
		announce('Current puzzle reset to a clean grid.', true);
		persist();
	}

	function clearPackData() {
		if (!confirm('Clear every saved round and learning record for this crossword pack?')) return;
		progress = clearPackProgress(progress, pack.id);
		const target = storage();
		if (target) storeCrosswordProgress(target, progress);
		showSettings = false;
		selection = normalizeLandingSelection(selection);
		phase = 'landing';
		model = undefined;
		puzzleState = undefined;
		announce('This pack’s local progress was cleared.', true);
	}

	function clearAllData() {
		if (!confirm('Clear all local crossword progress on this device?')) return;
		progress = clearAllCrosswordData();
		const target = storage();
		if (target) {
			target.removeItem(CROSSWORD_STORAGE_KEY);
			storeCrosswordProgress(target, progress);
		}
		showSettings = false;
		selection = normalizeLandingSelection(selection);
		phase = 'landing';
		model = undefined;
		puzzleState = undefined;
		announce('All local crossword data was cleared.', true);
	}

	function updateSettings(settings: Settings) {
		progress = { ...progress, settings };
		if (puzzleState) puzzleState = updateCrosswordSettings(puzzleState, settings);
		const target = storage();
		if (target) storeCrosswordProgress(target, progress);
		persist();
	}

	function downloadProgress() {
		const blob = new Blob([exportProgress(progress)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		fileAnchor.href = url;
		fileAnchor.download = 'systems-rounds-progress.json';
		fileAnchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
		announce('A private progress file was downloaded.');
	}

	async function importProgressFile(file: File) {
		const result = importProgress(await file.text());
		if (!result.ok) return announce(result.error, true);
		progress = result.progress;
		const target = storage();
		if (target) storeCrosswordProgress(target, progress);
		announce('Compatible crossword progress was imported.', true);
	}

	async function toggleFullscreen() {
		if (!shell) return;
		lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		if (nativeFullscreen) {
			await document.exitFullscreen();
			return;
		}
		if (cssImmersive) {
			exitCssImmersive();
			return;
		}
		if (fullscreenSupported) {
			try {
				await shell.requestFullscreen();
				return;
			} catch {
				// The CSS fallback retains the same puzzle state and visible exit control.
			}
		}
		cssImmersive = true;
		document.documentElement.dataset.gameImmersive = 'true';
		await tick();
		shell.querySelector<HTMLElement>('[data-fullscreen-exit]')?.focus({ preventScroll: true });
		announce('Immersive view opened. Escape or the visible Exit button returns to the page.', true);
	}

	function exitCssImmersive() {
		if (!cssImmersive) return;
		cssImmersive = false;
		delete document.documentElement.dataset.gameImmersive;
		lastFocus?.focus({ preventScroll: true });
		lastFocus = undefined;
	}

	function shareResult() {
		if (!activePuzzle || !completionReport) return;
		const text = `${activePuzzle.title}: ${completionReport.independent} independent, ${completionReport.withHints} with hints, ${completionReport.revealed} revealed. No answers included.`;
		if (navigator.share) {
			void navigator.share({ title: game.title, text, url: location.href }).catch(() => undefined);
		} else {
			void navigator.clipboard?.writeText(`${text} ${location.href}`);
			announce('Privacy-safe completion note copied.');
		}
	}

	function startRelated() {
		phase = 'landing';
		selection = { ...selection, sessionFormat: 'coffee' };
		startRound();
	}

	function startReview() {
		phase = 'landing';
		selection = { ...selection, sessionFormat: 'review', level: 'adaptive' };
		startRound();
	}

	function chooseDifferent() {
		selection = normalizeLandingSelection(selection);
		phase = 'landing';
		model = undefined;
		puzzleState = undefined;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (showSettings) {
			void closeSettings();
			return;
		}
		if (cssImmersive) exitCssImmersive();
	}

	function openSettings() {
		settingsReturnFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : settingsTrigger;
		showSettings = true;
	}

	async function closeSettings() {
		showSettings = false;
		await tick();
		settingsReturnFocus?.focus({ preventScroll: true });
		settingsReturnFocus = undefined;
	}

	onMount(() => {
		const target = storage();
		progress = target ? loadCrosswordProgress(target) : createEmptyProgress();
		if (resumable) selection = normalizeLandingSelection(resumable.state.selection);
		fullscreenSupported = Boolean(document.fullscreenEnabled && shell?.requestFullscreen);
		const handleFullscreenChange = () => {
			nativeFullscreen = document.fullscreenElement === shell;
			if (!nativeFullscreen && lastFocus) {
				lastFocus.focus({ preventScroll: true });
				lastFocus = undefined;
			}
		};
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		const timer = window.setInterval(() => {
			if (phase !== 'solving' || !puzzleState?.settings.timingEnabled) return;
			puzzleState = updateElapsedTime(puzzleState, Date.now() - clockBaseMs);
			const block = Math.floor(puzzleState.elapsedMs / 10_000);
			if (block > lastClockPersistBlock) {
				lastClockPersistBlock = block;
				persist(puzzleState);
			}
		}, 1000);
		hydrated = true;
		return () => {
			window.clearInterval(timer);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			delete document.documentElement.dataset.gameImmersive;
			if (document.fullscreenElement === shell) void document.exitFullscreen();
		};
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section
	bind:this={shell}
	id="game-experience"
	class:immersive={cssImmersive || nativeFullscreen}
	class:css-immersive={cssImmersive}
	class="crossword-game"
	data-phase={phase}
	data-view={phase === 'solving' ? 'playing' : phase}
	data-immersive={cssImmersive || nativeFullscreen}
	data-solver-mode={solverView}
	data-puzzle-id={activePuzzle?.id}
	data-testid="crossword-game"
	style={`--cw-pack-accent: ${pack.theme?.accent ?? '#8a4b2a'}; --cw-pack-accent-soft: ${pack.theme?.accentSoft ?? '#d7aa78'}; --cw-pack-grid-paper: ${pack.theme?.gridPaper ?? '#f2e7cf'}`}
	aria-labelledby="crossword-game-label"
>
	<h2 id="crossword-game-label" class="sr-only">{pack.title} game experience</h2>
	{#if phase === 'landing'}
		<CrosswordLanding
			{pack}
			{selection}
			canResume={hydrated && Boolean(resumable)}
			{reviewCount}
			onselection={(value) => (selection = value)}
			onstart={startRound}
			onresume={resumeRound}
			ontutorial={startTutorial}
		/>
	{:else if model && puzzleState && activePuzzle}
		<header class="instrument-bar">
			<div class="round-identity">
				<button type="button" class="back-button" onclick={chooseDifferent}>
					<span aria-hidden="true">←</span> Rounds
				</button>
				<div>
					<p>
						{activePuzzle.topicIds
							.map((id) => pack.topics.find((topic) => topic.id === id)?.shortTitle ?? id)
							.join(' · ')}
					</p>
					<h3>{activePuzzle.title}</h3>
				</div>
			</div>
			<div class="round-progress">
				<span>{completedEntryIds.length} of {activePuzzle.entries.length} answers</span>
				<div
					role="progressbar"
					aria-label="Round progress"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={progressPercent}
				>
					<span style={`width: ${progressPercent}%`}></span>
				</div>
			</div>
			<div class="instrument-actions">
				<button
					type="button"
					class:active={puzzleState.pencilMode}
					aria-pressed={puzzleState.pencilMode}
					onclick={() => {
						if (!puzzleState) return;
						puzzleState = togglePencilMode(puzzleState);
						announce(puzzleState.pencilMode ? 'Pencil mode on.' : 'Pencil mode off.');
						persist();
					}}
				>
					Pencil
				</button>
				<button
					type="button"
					class:active={solverView === 'list'}
					aria-pressed={solverView === 'list'}
					onclick={() => (solverView = solverView === 'grid' ? 'list' : 'grid')}
				>
					{solverView === 'grid' ? 'Solve as a list' : 'Solve on the grid'}
				</button>
				<button bind:this={settingsTrigger} type="button" onclick={openSettings}>Settings</button>
				<button
					type="button"
					data-fullscreen-exit={cssImmersive || nativeFullscreen ? '' : undefined}
					onclick={() => void toggleFullscreen()}
				>
					{cssImmersive || nativeFullscreen ? 'Exit full screen' : 'Full screen'}
				</button>
			</div>
		</header>

		{#if phase === 'complete' && completionReport}
			<div class="completion-wrap">
				<CompletionPostcard
					title={activePuzzle.title}
					independent={completionReport.independent}
					withHints={completionReport.withHints}
					revealed={completionReport.revealed}
					elapsedMs={completionReport.elapsedMs}
					forReview={completionReport.markedForReview.length}
					strongestTopic={activePuzzle.topicIds[0]
						? (pack.topics.find((topic) => topic.id === activePuzzle.topicIds[0])?.title ??
							'Mixed systems')
						: 'Mixed systems'}
					revisitTopic={completionReport.markedForReview.length
						? 'Queued concepts'
						: 'A neighbouring system'}
					crossings={activePuzzle.entries.slice(0, 4).map((entry) => ({
						term: entry.displayAnswer ?? entry.answer,
						link: entry.learning.related?.[0] ?? entry.learning.whyItMatters
					}))}
					achievement={activePuzzle.topicIds.includes('interoperability-hie')
						? 'Crossed the Interface'
						: activePuzzle.topicIds.includes('ai-readiness-modernization')
							? 'Human Still in the Loop'
							: 'Systems remained on speaking terms'}
					onreview={startReview}
					onrelated={startRelated}
					ondifferent={chooseDifferent}
					onreplay={resetCurrentRound}
					onshare={shareResult}
				/>
			</div>
		{:else if solverView === 'list'}
			<div class="list-mode-wrap">
				<AccessibleSolver
					{model}
					state={puzzleState}
					{activeEntryId}
					{completedEntryIds}
					onselectentry={selectGridEntry}
					onanswer={fillListAnswer}
					onhint={requestHint}
				/>
			</div>
		{:else}
			<div class="solving-layout">
				<div
					class:dense-grid={activePuzzle.width > 15 || activePuzzle.height > 20}
					class:with-tutorial={Boolean(tutorialStep)}
					class="grid-workspace"
				>
					{#if tutorialStep && activePuzzle.tutorial}
						<aside class="tutorial-guide" aria-labelledby="tutorial-guide-title">
							<div>
								<p>
									Guided first crossing · {tutorialStepIndex + 1} of {activePuzzle.tutorial.length}
								</p>
								<h4 id="tutorial-guide-title">{tutorialStep.title}</h4>
								<span>{tutorialStep.text}</span>
							</div>
							<div>
								<button type="button" onclick={skipTutorial}>Hide guide</button>
								<button type="button" class="next" onclick={advanceTutorial}>
									{tutorialStepIndex + 1 === activePuzzle.tutorial.length
										? 'Finish guide'
										: 'Next step'}
								</button>
							</div>
						</aside>
					{/if}
					<div class="puzzle-meta" aria-label="Round details">
						<span
							>{pack.levels.find((level) => level.id === activePuzzle.level)?.title ??
								activePuzzle.level}</span
						>
						<span>{activePuzzle.estimatedMinutes} min estimate</span>
						{#if puzzleState.settings.timingEnabled}
							<span
								>{Math.floor(puzzleState.elapsedMs / 60000)}:{String(
									Math.floor(puzzleState.elapsedMs / 1000) % 60
								).padStart(2, '0')} elapsed</span
							>
						{/if}
						<span
							>{puzzleState.settings.playMode === 'coach'
								? 'Coach checking'
								: 'Traditional checking'}</span
						>
					</div>
					<CrosswordGrid
						{model}
						state={puzzleState}
						{completedEntryIds}
						onselect={selectGridCell}
						onletter={enterGridLetter}
						onbackspace={eraseGridLetter}
						ondelete={deleteGridLetter}
						onmove={moveGrid}
						ontoggle={toggleGridDirection}
					/>
					<div class="mobile-current-clue" aria-live="polite">
						{#if activeEntryId}
							<strong
								>{model.entryNumbers[activeEntryId]}
								{model.entriesById[activeEntryId].direction}</strong
							>
							<span>{model.entriesById[activeEntryId].clue}</span>
						{/if}
					</div>
					<CrosswordKeyboard onletter={enterGridLetter} onbackspace={eraseGridLetter} />
					<div class="traditional-checks">
						<button type="button" onclick={checkSelectedLetter}>Check letter</button>
						<button type="button" onclick={checkSelectedEntry}>Check answer</button>
						<button type="button" onclick={checkEntirePuzzle}>Check puzzle</button>
					</div>
				</div>
				<CrosswordPanel
					{model}
					{puzzleState}
					{activeEntryId}
					{completedEntryIds}
					{feedback}
					{hideCompleted}
					onselectentry={selectGridEntry}
					onprevious={previousEntry}
					onnext={nextEntry}
					onhint={requestHint}
					oncheckletter={checkSelectedLetter}
					oncheckentry={checkSelectedEntry}
					onrevealentry={revealActiveEntry}
					onrevealcrossing={revealCrossing}
					onrecommend={recommendClue}
					onconflict={explainConflict}
					ontogglehide={() => (hideCompleted = !hideCompleted)}
				/>
			</div>
		{/if}

		{#if showSettings}
			<button
				type="button"
				class="settings-scrim"
				aria-label="Close settings"
				onclick={() => void closeSettings()}
			></button>
			<CrosswordSettings
				settings={puzzleState.settings}
				onupdate={updateSettings}
				onresetround={resetCurrentRound}
				onclearpack={clearPackData}
				onclearall={clearAllData}
				onexport={downloadProgress}
				onimport={importProgressFile}
				onclose={() => void closeSettings()}
			/>
		{/if}
	{/if}

	<a
		bind:this={fileAnchor}
		href="#game-experience"
		class="download-anchor"
		aria-hidden="true"
		tabindex="-1">Download</a
	>
	<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
</section>

<style>
	:global(body:has(.crossword-game.immersive)) {
		overflow: hidden;
	}

	.crossword-game {
		--cw-paper: var(--paper, #f7f2e7);
		--cw-paper-raised: var(--paper-raised, #fdfaf3);
		--cw-grid-paper: var(--cw-pack-grid-paper, #f2e7cf);
		--cw-ink: var(--ink, #1d211d);
		--cw-muted: var(--ink-muted, #5c4f3e);
		--cw-moss: #526b5b;
		--cw-ochre: #a86327;
		--cw-focus: var(--focus, #172822);
		position: relative;
		isolation: isolate;
		width: 100%;
		min-height: min(82dvh, 58rem);
		overflow: clip;
		background:
			radial-gradient(
				circle at 12% 10%,
				color-mix(in oklab, var(--cw-ochre) 7%, transparent),
				transparent 28rem
			),
			var(--cw-paper);
		color: var(--cw-ink);
		font-family: var(--font-sans, system-ui, sans-serif);
		scroll-margin-top: 4.5rem;
	}

	.crossword-game.immersive {
		position: fixed;
		z-index: 100;
		inset: 0;
		width: 100vw;
		height: 100dvh;
		min-height: 0;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
			env(safe-area-inset-left);
		overflow: hidden;
	}

	.crossword-game:fullscreen {
		width: 100vw;
		height: 100dvh;
		background: var(--cw-paper);
	}

	.instrument-bar {
		display: grid;
		grid-template-columns: minmax(14rem, 1fr) minmax(10rem, 0.55fr) auto;
		gap: 1rem;
		align-items: center;
		min-height: 4.3rem;
		padding: 0.55rem max(0.75rem, env(safe-area-inset-right)) 0.55rem
			max(0.75rem, env(safe-area-inset-left));
		border-bottom: 1px solid color-mix(in oklab, var(--cw-ink) 28%, transparent);
		background: color-mix(in oklab, var(--cw-paper-raised) 94%, transparent);
		backdrop-filter: blur(8px);
	}

	.round-identity {
		display: flex;
		min-width: 0;
		gap: 0.8rem;
		align-items: center;
	}

	.back-button {
		min-height: 2.75rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 28%, transparent);
		border-radius: 0.28rem;
		background: transparent;
		color: var(--cw-ink);
		font-size: 0.7rem;
		font-weight: 800;
		cursor: pointer;
	}

	.round-identity div {
		min-width: 0;
	}

	.round-identity p,
	.round-identity h3 {
		overflow: hidden;
		margin: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.round-identity p {
		color: var(--cw-ochre);
		font: 800 0.58rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.round-identity h3 {
		font-size: 1rem;
	}

	.round-progress {
		display: grid;
		gap: 0.25rem;
	}

	.round-progress > span {
		color: var(--cw-muted);
		font: 700 0.62rem/1.2 var(--font-mono, ui-monospace, monospace);
		text-align: center;
	}

	.round-progress [role='progressbar'] {
		height: 0.38rem;
		overflow: hidden;
		border-radius: 99rem;
		background: color-mix(in oklab, var(--cw-ink) 14%, transparent);
	}

	.round-progress [role='progressbar'] span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--cw-ochre);
		transition: width 240ms ease;
	}

	.instrument-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		justify-content: end;
	}

	.instrument-actions button,
	.traditional-checks button {
		min-height: 2.75rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 28%, transparent);
		border-radius: 0.28rem;
		background: transparent;
		color: var(--cw-ink);
		font-size: 0.68rem;
		font-weight: 800;
		cursor: pointer;
		touch-action: manipulation;
	}

	.instrument-actions button.active {
		background: var(--cw-ink);
		color: var(--cw-paper-raised);
	}

	button:focus-visible,
	.download-anchor:focus-visible {
		outline: 3px solid var(--cw-focus);
		outline-offset: 2px;
	}

	.solving-layout {
		display: grid;
		grid-template-columns: minmax(23rem, 1.12fr) minmax(20rem, 0.88fr);
		gap: clamp(0.75rem, 1.5vw, 1.3rem);
		width: min(100%, 94rem);
		height: min(76dvh, 54rem);
		min-height: 42rem;
		margin-inline: auto;
		padding: clamp(0.7rem, 1.8vw, 1.4rem);
	}

	.immersive .solving-layout {
		height: calc(100dvh - 4.3rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
		min-height: 0;
	}

	.grid-workspace {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto auto;
		min-width: 0;
		min-height: 0;
		gap: 0.55rem;
		align-items: center;
	}

	.grid-workspace.with-tutorial {
		grid-template-rows: auto auto minmax(0, 1fr) auto auto;
	}

	.grid-workspace.dense-grid {
		align-items: start;
		overflow: auto;
		overscroll-behavior: contain;
	}

	.tutorial-guide {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 0.75rem;
		border: 1px solid color-mix(in oklab, var(--cw-ochre) 48%, var(--cw-ink));
		border-left: 0.35rem solid var(--cw-ochre);
		background: color-mix(in oklab, var(--cw-paper-raised) 90%, var(--cw-pack-accent-soft));
		box-shadow: 0 0.35rem 1rem color-mix(in oklab, var(--cw-ink) 8%, transparent);
	}

	.tutorial-guide p,
	.tutorial-guide h4,
	.tutorial-guide span {
		margin: 0;
	}

	.tutorial-guide p {
		color: var(--cw-ochre);
		font: 800 0.58rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.tutorial-guide h4 {
		font-size: 0.95rem;
	}

	.tutorial-guide span {
		display: block;
		margin-top: 0.15rem;
		color: var(--cw-muted);
		font: 600 0.75rem/1.35 var(--font-serif, Georgia, serif);
	}

	.tutorial-guide > div:last-child {
		display: flex;
		flex: none;
		gap: 0.35rem;
	}

	.tutorial-guide button {
		min-height: 2.6rem;
		padding: 0.45rem 0.65rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 28%, transparent);
		background: transparent;
		color: var(--cw-ink);
		font-size: 0.67rem;
		font-weight: 800;
	}

	.tutorial-guide button.next {
		background: var(--cw-ink);
		color: var(--cw-paper-raised);
	}

	.puzzle-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		justify-content: center;
		color: var(--cw-muted);
		font: 700 0.58rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.grid-workspace :global(.grid-frame) {
		max-height: 100%;
	}

	@media (min-width: 901px) and (min-height: 501px) {
		.grid-workspace:not(.dense-grid) :global(.grid-frame) {
			width: auto;
			height: 100%;
			max-width: 100%;
			max-height: 100%;
			justify-self: center;
		}
	}

	.mobile-current-clue {
		display: none;
	}

	.traditional-checks {
		display: flex;
		gap: 0.4rem;
		justify-content: center;
	}

	.list-mode-wrap,
	.completion-wrap {
		height: min(76dvh, 54rem);
		overflow: auto;
		padding: clamp(0.8rem, 2vw, 1.8rem);
	}

	.immersive .list-mode-wrap,
	.immersive .completion-wrap {
		height: calc(100dvh - 4.3rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
	}

	.settings-scrim {
		position: absolute;
		z-index: 19;
		inset: 0;
		background: color-mix(in oklab, var(--cw-ink) 42%, transparent);
	}

	.download-anchor {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	@media (max-width: 900px) and (orientation: portrait) {
		.instrument-bar {
			grid-template-columns: 1fr auto;
			gap: 0.45rem;
		}

		.round-progress {
			grid-column: 1 / -1;
			grid-row: 2;
		}

		.instrument-actions button:first-child {
			display: none;
		}

		.solving-layout {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(23rem, 55%) minmax(16rem, 45%);
			height: auto;
			min-height: 0;
		}

		.immersive .solving-layout {
			grid-template-rows: minmax(19rem, 56%) minmax(13rem, 44%);
			overflow: hidden;
		}

		.grid-workspace {
			grid-template-rows: minmax(0, 1fr) auto auto;
		}

		.grid-workspace.with-tutorial {
			grid-template-rows: auto minmax(0, 1fr) auto auto;
		}

		.tutorial-guide {
			align-items: start;
		}

		.puzzle-meta,
		.traditional-checks {
			display: none;
		}

		.mobile-current-clue {
			display: grid;
			grid-template-columns: auto 1fr;
			gap: 0.55rem;
			min-height: 2.75rem;
			align-items: center;
			padding: 0.45rem 0.6rem;
			border: 1px solid color-mix(in oklab, var(--cw-ink) 24%, transparent);
			background: var(--cw-paper-raised);
			font: 600 0.76rem/1.35 var(--font-serif, Georgia, serif);
		}

		.mobile-current-clue strong {
			color: var(--cw-ochre);
			font: 800 0.62rem/1.2 var(--font-mono, ui-monospace, monospace);
			text-transform: uppercase;
		}
	}

	@media (max-width: 620px) and (orientation: portrait) {
		.instrument-bar {
			min-height: 5.5rem;
		}

		.round-identity h3 {
			max-width: 11rem;
		}

		.instrument-actions button {
			min-width: 2.75rem;
			padding-inline: 0.45rem;
		}

		.solving-layout {
			grid-template-rows: auto auto;
			padding: 0.45rem;
		}

		.immersive .solving-layout {
			height: calc(100dvh - 5.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
			grid-template-rows: minmax(22rem, 58%) minmax(12rem, 42%);
		}

		.grid-workspace :global(.grid-frame) {
			width: min(100%, 27rem);
		}

		.tutorial-guide {
			display: grid;
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.instrument-bar {
			min-height: 3.25rem;
			padding-block: 0.2rem;
		}

		.instrument-actions button,
		.back-button {
			min-height: 2.4rem;
		}

		.round-progress > span {
			display: none;
		}

		.solving-layout,
		.immersive .solving-layout {
			grid-template-columns: minmax(18rem, 0.9fr) minmax(20rem, 1.1fr);
			height: calc(100dvh - 3.25rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
			min-height: 0;
			padding: 0.35rem;
		}

		.puzzle-meta,
		.mobile-current-clue,
		.traditional-checks {
			display: none;
		}

		.grid-workspace {
			grid-template-rows: minmax(0, 1fr) auto;
			gap: 0.25rem;
		}

		.grid-workspace.with-tutorial {
			grid-template-rows: auto minmax(0, 1fr) auto;
		}

		.tutorial-guide span {
			display: none;
		}

		.grid-workspace :global(.grid-frame) {
			width: auto;
			height: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.round-progress [role='progressbar'] span {
			transition: none;
		}
	}

	:global(html[data-theme='high-contrast']) .crossword-game {
		--cw-moss: #0033cc;
		--cw-ochre: #7a2d00;
		--cw-grid-paper: #fff;
	}

	@media (forced-colors: active) {
		.crossword-game,
		.instrument-bar,
		.mobile-current-clue,
		.instrument-actions button,
		.traditional-checks button,
		.back-button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
			backdrop-filter: none;
		}

		.instrument-actions button.active,
		.round-progress [role='progressbar'] span {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
