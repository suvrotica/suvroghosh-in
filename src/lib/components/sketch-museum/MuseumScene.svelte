<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		ACESFilmicToneMapping,
		AdditiveBlending,
		AmbientLight,
		BoxGeometry,
		Color,
		CylinderGeometry,
		DirectionalLight,
		DoubleSide,
		FogExp2,
		Group,
		HemisphereLight,
		MathUtils,
		Mesh,
		MeshBasicMaterial,
		MeshStandardMaterial,
		Object3D,
		OrthographicCamera,
		PCFSoftShadowMap,
		PerspectiveCamera,
		PlaneGeometry,
		PointLight,
		Raycaster,
		Scene,
		SpotLight,
		SRGBColorSpace,
		Texture,
		TextureLoader,
		Vector2,
		Vector3,
		WebGLRenderer
	} from 'three';
	import { renderPixelDensity } from '$lib/visualizations/webgl';
	import type { SketchArtwork } from '$lib/sketches/types';
	import MuseumControls from './MuseumControls.svelte';
	import {
		createArtworkPlaque,
		createBaroqueFrame,
		createMountedSketchMaterial,
		createPlaceholderArtwork,
		createRoomNavigationSign,
		createSoftLightPoolTexture,
		disposeObjectTree,
		disposeSharedMuseumMaterials,
		prepareSketchTexture
	} from './museum-materials';
	import { shouldHandleMuseumMovementKey } from './museum-input';
	import { createMuseumLoadQueue } from './museum-loading';
	import {
		DOOR_HEIGHT,
		DOOR_WIDTH,
		EYE_HEIGHT,
		activeRoomIdsFor,
		calculateArtworkFootprint,
		createMuseumLayout,
		focusedArtworkView,
		isWalkable,
		isWalkableSegment,
		roomWayfindingFor,
		roomOverviewLayout
	} from './museum-layout';
	import type {
		ArtworkPlacement,
		MuseumQuality,
		MuseumRoomLayout,
		MuseumWall
	} from './museum-types';

	type Props = {
		artworks: SketchArtwork[];
		selectedSlug?: string | null;
		reducedMotion?: boolean;
		onSelect: (slug: string) => void;
		onDetails: (artwork: SketchArtwork) => void;
		onExit: () => void;
		onReady?: () => void;
		onError?: (message: string) => void;
	};

	let {
		artworks,
		selectedSlug = null,
		reducedMotion = false,
		onSelect,
		onDetails,
		onExit,
		onReady = () => {},
		onError = () => {}
	}: Props = $props();

	let shell: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let viewport: HTMLDivElement;
	let viewMode = $state<'overview' | 'focus' | 'walk'>('overview');
	let overviewWall = $state<MuseumWall>('north');
	let overviewKind = $state<'room' | 'wall'>('room');
	const overviewRoot = new Group();
	let overviewCamera: OrthographicCamera | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let inViewport = true;
	const textureQueue = createMuseumLoadQueue(4);
	let status = $state('Preparing gallery');
	let roomName = $state('Opening Gallery');
	let currentSlug = $state<string | null>(null);
	let pointerLocked = $state(false);
	let pointerLockAvailable = $state(false);
	let fullscreenActive = $state(false);
	let fullscreenAvailable = $state(false);
	let initialised = $state(false);
	let currentArtwork = $derived(
		currentSlug ? (artworks.find((artwork) => artwork.slug === currentSlug) ?? null) : null
	);

	let layout = $derived(createMuseumLayout(artworks));
	let artworkBySlug = $derived(new Map(artworks.map((artwork) => [artwork.slug, artwork])));
	let placementBySlug = $derived(
		new Map(layout.placements.map((placement) => [placement.artwork.slug, placement]))
	);

	interface RuntimeArtwork {
		placement: ArtworkPlacement;
		group: Group;
		canvasMesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
		texture: Texture | null;
		material: MeshStandardMaterial | null;
		loading: Promise<void> | null;
		requestId: number;
		failed: boolean;
	}

	let renderer: WebGLRenderer | null = null;
	let scene: Scene | null = null;
	let camera: PerspectiveCamera | null = null;
	let animationFrame = 0;
	let resizeObserver: ResizeObserver | null = null;
	let destroyed = false;
	let visible = true;
	let quality = $state<MuseumQuality>('medium');
	let yaw = 0;
	let pitch = 0;
	let lastFrameTime = 0;
	let frameCounter = 0;
	let activeRoomId = $state('');
	let activeRoomIds: Set<string> = new SvelteSet<string>();
	let roomActivationId = 0;
	let lightPoolTexture: Texture | null = null;
	let touchStrafe = 0;
	let touchForward = 0;
	let draggingPointer: number | null = null;
	let dragDistance = 0;
	let pointerStart = new Vector2();
	let focusFading = $state(false);
	let focusRequestId = 0;
	let autoSelectionArmed = true;
	let activeRoomIndex = $derived(
		Math.max(
			0,
			layout.rooms.findIndex((room) => room.id === activeRoomId)
		)
	);
	let previousRoom = $derived(layout.rooms[activeRoomIndex - 1] ?? null);
	let nextRoom = $derived(layout.rooms[activeRoomIndex + 1] ?? null);
	let roomArtworks = $derived(
		(layout.rooms[activeRoomIndex]?.artworkSlugs ?? []).flatMap((slug) => {
			const artwork = artworkBySlug.get(slug);
			return artwork ? [artwork] : [];
		})
	);
	let roomWalls = $derived(
		(['north', 'east', 'south', 'west'] as const).filter((wall) =>
			layout.placements.some(
				(placement) => placement.roomId === activeRoomId && placement.wall === wall
			)
		)
	);
	let focusAnimation: {
		startedAt: number;
		duration: number;
		startPosition: Vector3;
		endPosition: Vector3;
		startYaw: number;
		endYaw: number;
		startPitch: number;
		endPitch: number;
	} | null = null;

	const pressedKeys = new SvelteSet<string>();
	const roomGroups = new SvelteMap<string, Group>();
	const runtimes = new SvelteMap<string, RuntimeArtwork>();
	const roomNavigationMeshes = new SvelteMap<string, Mesh[]>();
	const activeSpots: SpotLight[] = [];
	const spotTargets: Object3D[] = [];
	const activeSpotBeams: Array<Mesh<CylinderGeometry, MeshBasicMaterial>> = [];
	const raycaster = new Raycaster();
	const pointer = new Vector2();
	const forward = new Vector3();
	const right = new Vector3();
	const candidatePosition = new Vector3();
	const worldPosition = new Vector3();
	const beamDirection = new Vector3();
	const beamMidpoint = new Vector3();
	const worldUp = new Vector3(0, 1, 0);
	const textureLoader = new TextureLoader();

	const waitingMaterial = new MeshStandardMaterial({
		color: '#ded5c4',
		roughness: 0.92,
		metalness: 0
	});
	const wallMaterial = new MeshStandardMaterial({
		color: '#b9aa8f',
		roughness: 0.96,
		metalness: 0
	});
	const wallInsetMaterial = new MeshStandardMaterial({
		color: '#9d8a6b',
		roughness: 0.92,
		metalness: 0
	});
	const floorMaterial = new MeshStandardMaterial({
		color: '#2a1d16',
		roughness: 0.58,
		metalness: 0.08
	});
	const ceilingMaterial = new MeshStandardMaterial({
		color: '#d8ccb5',
		roughness: 1,
		metalness: 0,
		side: DoubleSide
	});
	const benchMaterial = new MeshStandardMaterial({
		color: '#321e13',
		roughness: 0.48,
		metalness: 0.03
	});
	const fixtureMaterial = new MeshStandardMaterial({
		color: '#6d5434',
		emissive: '#c89045',
		emissiveIntensity: 0.28,
		roughness: 0.45,
		metalness: 0.55
	});

	$effect(() => {
		const requestedSlug = selectedSlug;
		if (!initialised || !requestedSlug || requestedSlug === currentSlug) return;
		// The parent already owns this selection (for example, an open detail dialog).
		// Refocus the scene without reporting it back and accidentally closing that UI.
		void focusArtwork(requestedSlug, false);
	});

	function detectQuality(): MuseumQuality {
		const hardwareConcurrency = navigator.hardwareConcurrency || 4;
		const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
		const compact = window.matchMedia('(max-width: 48rem)').matches;
		if (compact || hardwareConcurrency <= 4 || deviceMemory <= 4) return 'low';
		if (hardwareConcurrency >= 8 && deviceMemory >= 8 && window.innerWidth >= 1100) return 'high';
		return 'medium';
	}

	function wallPiece(
		group: Group,
		wall: MuseumWall,
		offset: number,
		length: number,
		centerY: number,
		height: number,
		room: MuseumRoomLayout
	) {
		const horizontal = wall === 'north' || wall === 'south';
		const geometry = horizontal
			? new BoxGeometry(length, height, 0.24)
			: new BoxGeometry(0.24, height, length);
		const piece = new Mesh(geometry, wallMaterial);
		piece.position.y = centerY;
		if (wall === 'north') piece.position.set(offset, centerY, -room.depth / 2);
		if (wall === 'south') piece.position.set(offset, centerY, room.depth / 2);
		if (wall === 'east') piece.position.set(room.width / 2, centerY, offset);
		if (wall === 'west') piece.position.set(-room.width / 2, centerY, offset);
		piece.receiveShadow = true;
		piece.castShadow = quality === 'high';
		group.add(piece);
	}

	function addWall(group: Group, room: MuseumRoomLayout, wall: MuseumWall) {
		const connected = room.connections.some((connection) => connection.wall === wall);
		const length = wall === 'north' || wall === 'south' ? room.width : room.depth;
		if (!connected) {
			wallPiece(group, wall, 0, length, room.height / 2, room.height, room);
			return;
		}

		const doorHeight = DOOR_HEIGHT;
		const sideLength = (length - DOOR_WIDTH) / 2;
		const sideOffset = DOOR_WIDTH / 2 + sideLength / 2;
		wallPiece(group, wall, -sideOffset, sideLength, room.height / 2, room.height, room);
		wallPiece(group, wall, sideOffset, sideLength, room.height / 2, room.height, room);
		wallPiece(
			group,
			wall,
			0,
			DOOR_WIDTH,
			doorHeight + (room.height - doorHeight) / 2,
			room.height - doorHeight,
			room
		);
	}

	function createRoom(room: MuseumRoomLayout) {
		const existing = roomGroups.get(room.id);
		if (existing) return existing;
		const group = new Group();
		group.name = room.id;
		group.position.set(room.center[0], 0, room.center[1]);

		const floor = new Mesh(new PlaneGeometry(room.width, room.depth), floorMaterial);
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = true;
		group.add(floor);

		const ceiling = new Mesh(new PlaneGeometry(room.width, room.depth), ceilingMaterial);
		ceiling.position.y = room.height;
		ceiling.rotation.x = Math.PI / 2;
		ceiling.receiveShadow = true;
		group.add(ceiling);

		for (const wall of ['north', 'east', 'south', 'west'] as const) {
			addWall(group, room, wall);
		}

		const ceilingFixture = new Mesh(new CylinderGeometry(0.42, 0.42, 0.12, 24), fixtureMaterial);
		ceilingFixture.position.y = room.height - 0.16;
		group.add(ceilingFixture);
		const roomLight = new PointLight(
			'#ffe5b9',
			quality === 'low' ? 14 : 20,
			Math.max(room.width, room.depth),
			1.45
		);
		roomLight.position.y = room.height - 0.95;
		group.add(roomLight);

		const navigationMeshes: Mesh[] = [];
		for (const wayfinding of roomWayfindingFor(layout, room.id)) {
			const sign = createRoomNavigationSign(wayfinding.direction, wayfinding.targetRoomName);
			sign.group.position.set(...wayfinding.localPosition);
			sign.group.rotation.y = wayfinding.rotationY;
			sign.hitTarget.userData.targetRoomId = wayfinding.targetRoomId;
			sign.hitTarget.userData.roomId = room.id;
			navigationMeshes.push(sign.hitTarget);
			group.add(sign.group);
		}
		roomNavigationMeshes.set(room.id, navigationMeshes);

		const dado = new Mesh(new BoxGeometry(room.width - 0.4, 0.13, 0.1), wallInsetMaterial);
		dado.position.set(0, 1.05, -room.depth / 2 + 0.15);
		group.add(dado);
		const cornice = new Mesh(new BoxGeometry(room.width - 0.35, 0.2, 0.18), wallInsetMaterial);
		cornice.position.set(0, room.height - 0.34, -room.depth / 2 + 0.16);
		group.add(cornice);

		const bench = new Group();
		const seat = new Mesh(new BoxGeometry(2.7, 0.2, 0.78), benchMaterial);
		seat.position.y = 0.72;
		seat.castShadow = true;
		bench.add(seat);
		for (const x of [-1.05, 1.05]) {
			for (const z of [-0.24, 0.24]) {
				const leg = new Mesh(new BoxGeometry(0.16, 0.68, 0.16), benchMaterial);
				leg.position.set(x, 0.34, z);
				leg.castShadow = true;
				bench.add(leg);
			}
		}
		bench.position.set(0, 0, room.depth * 0.1);
		group.add(bench);

		roomGroups.set(room.id, group);
		scene?.add(group);
		return group;
	}

	function addArtwork(
		placement: ArtworkPlacement,
		room: MuseumRoomLayout,
		poolTexture: Texture | null
	) {
		if (runtimes.has(placement.artwork.slug)) return;
		const roomGroup = roomGroups.get(room.id);
		if (!roomGroup) return;
		const group = new Group();
		group.name = placement.artwork.slug;
		group.position.set(
			placement.position[0] - room.center[0],
			placement.position[1],
			placement.position[2] - room.center[1]
		);
		group.rotation.y = placement.rotationY;

		if (poolTexture) {
			const poolMaterial = new MeshBasicMaterial({
				map: poolTexture,
				transparent: true,
				opacity: 0.94,
				depthWrite: false,
				color: '#ffe2a3',
				toneMapped: false
			});
			poolMaterial.userData.museumRoomOwned = true;
			const pool = new Mesh(
				new PlaneGeometry(placement.frame.outerWidth + 2.1, placement.frame.outerHeight + 2.2),
				poolMaterial
			);
			pool.name = 'artwork-light-pool';
			pool.position.z = 0.035;
			group.add(pool);
		}

		group.add(createBaroqueFrame(placement.frame));
		group.add(createArtworkPlaque(placement.frame, placement.artwork.title));

		const canvasMesh = new Mesh(
			new PlaneGeometry(placement.frame.artWidth, placement.frame.artHeight),
			waitingMaterial
		);
		canvasMesh.position.z = 0.145;
		canvasMesh.userData.slug = placement.artwork.slug;
		canvasMesh.receiveShadow = true;
		group.add(canvasMesh);

		const fixture = new Mesh(new CylinderGeometry(0.11, 0.16, 0.34, 12), fixtureMaterial);
		fixture.name = 'artwork-fixture';
		fixture.position.set(0, placement.frame.outerHeight / 2 + 0.82, 0.38);
		fixture.rotation.x = Math.PI / 2;
		fixture.castShadow = true;
		group.add(fixture);

		roomGroup.add(group);
		runtimes.set(placement.artwork.slug, {
			placement,
			group,
			canvasMesh,
			texture: null,
			material: null,
			loading: null,
			requestId: 0,
			failed: false
		});
	}

	function ensureRoomGeometry(room: MuseumRoomLayout) {
		if (roomGroups.has(room.id)) return;
		createRoom(room);
		for (const placement of layout.placements) {
			if (placement.roomId === room.id) addArtwork(placement, room, lightPoolTexture);
		}
	}

	function variantSource(artwork: SketchArtwork) {
		return quality === 'low' ? artwork.variants.preview.src : artwork.variants.museum.src;
	}

	async function ensureTexture(runtime: RuntimeArtwork) {
		if (runtime.texture || runtime.loading) return runtime.loading;
		const requestId = ++runtime.requestId;
		let load!: Promise<void>;
		load = textureQueue.run(
			async () => {
				try {
					const texture = prepareSketchTexture(
						await textureLoader.loadAsync(variantSource(runtime.placement.artwork))
					);
					if (
						destroyed ||
						requestId !== runtime.requestId ||
						!activeRoomIds.has(runtime.placement.roomId)
					) {
						texture.dispose();
						return;
					}
					const material = createMountedSketchMaterial(
						texture,
						runtime.placement.artwork.canvasMode,
						quality
					);
					runtime.texture = texture;
					runtime.material = material;
					runtime.canvasMesh.material = material;
					runtime.failed = false;
				} catch (error) {
					if (destroyed || requestId !== runtime.requestId) return;
					runtime.failed = true;
					const placeholder = createPlaceholderArtwork(
						runtime.placement.artwork.source.width,
						runtime.placement.artwork.source.height
					);
					const material = createMountedSketchMaterial(placeholder, 'original', 'low');
					runtime.texture = placeholder;
					runtime.material = material;
					runtime.canvasMesh.material = material;
					console.warn(`Sketch Museum could not load ${runtime.placement.artwork.slug}.`, error);
				} finally {
					if (runtime.loading === load) runtime.loading = null;
					startAnimation();
				}
			},
			() =>
				!destroyed && requestId === runtime.requestId && activeRoomIds.has(runtime.placement.roomId)
		);
		runtime.loading = load;
		return load;
	}

	function releaseTexture(runtime: RuntimeArtwork) {
		runtime.requestId += 1;
		runtime.loading = null;
		runtime.texture?.dispose();
		runtime.material?.dispose();
		runtime.texture = null;
		runtime.material = null;
		runtime.failed = false;
		runtime.canvasMesh.material = waitingMaterial;
	}

	function disposeRoomGeometry(roomId: string) {
		const group = roomGroups.get(roomId);
		if (!group) return;

		for (const [slug, runtime] of [...runtimes]) {
			if (runtime.placement.roomId !== roomId) continue;
			releaseTexture(runtime);
			runtimes.delete(slug);
		}

		const geometries = new SvelteSet<{ dispose: () => void }>();
		const ownedMaterials = new SvelteSet<{ dispose: () => void }>();
		const ownedTextures = new SvelteSet<Texture>();
		group.traverse((object) => {
			const mesh = object as Mesh;
			if (mesh.geometry) geometries.add(mesh.geometry);
			const materials = Array.isArray(mesh.material)
				? mesh.material
				: mesh.material
					? [mesh.material]
					: [];
			for (const material of materials) {
				if (material.userData.museumRoomOwned !== true) continue;
				ownedMaterials.add(material);
				for (const value of Object.values(material) as unknown[]) {
					if (value instanceof Texture && value.userData.museumRoomOwned === true) {
						ownedTextures.add(value);
					}
				}
			}
		});

		group.removeFromParent();
		roomGroups.delete(roomId);
		roomNavigationMeshes.delete(roomId);
		for (const geometry of geometries) geometry.dispose();
		for (const texture of ownedTextures) texture.dispose();
		for (const material of ownedMaterials) material.dispose();
	}

	async function activateRoom(roomId: string) {
		const room = layout.rooms.find((candidate) => candidate.id === roomId) ?? layout.rooms[0];
		if (!room) return;
		activeRoomId = room.id;
		roomName = room.name;
		const nextActive = new SvelteSet(
			viewMode === 'walk' ? activeRoomIdsFor(layout, room.id) : [room.id]
		);
		const changed =
			nextActive.size !== activeRoomIds.size ||
			[...nextActive].some((roomKey) => !activeRoomIds.has(roomKey));
		const geometryMissing = [...nextActive].some((roomKey) => !roomGroups.has(roomKey));
		if (!changed && !geometryMissing) return;

		restorePhysicalHanging();
		const activationId = ++roomActivationId;
		activeRoomIds = nextActive;

		for (const instantiatedRoomId of [...roomGroups.keys()]) {
			if (!nextActive.has(instantiatedRoomId)) disposeRoomGeometry(instantiatedRoomId);
		}
		for (const nextRoomId of nextActive) {
			const nextRoom = layout.rooms.find((candidate) => candidate.id === nextRoomId);
			if (nextRoom) ensureRoomGeometry(nextRoom);
		}
		if (viewMode === 'overview') updateOverviewCamera();

		const nearby = [...runtimes.values()]
			.filter((runtime) => nextActive.has(runtime.placement.roomId))
			.sort(
				(a, b) => Number(b.placement.roomId === room.id) - Number(a.placement.roomId === room.id)
			);
		status = `Loading ${room.name}`;
		let loaded = 0;
		await Promise.all(
			nearby.map(async (runtime) => {
				await ensureTexture(runtime);
				loaded += 1;
				if (!destroyed && activationId === roomActivationId) {
					status = `Hanging artwork ${loaded} of ${nearby.length}`;
				}
			})
		);
		if (!destroyed && activationId === roomActivationId) {
			status = `${room.name} ready`;
			onReady();
		}
	}

	function roomContaining(position: Vector3) {
		return layout.rooms.find(
			(room) =>
				Math.abs(position.x - room.center[0]) <= room.width / 2 &&
				Math.abs(position.z - room.center[1]) <= room.depth / 2
		);
	}

	function viewingAngles(position: Vector3, target: Vector3) {
		const direction = target.clone().sub(position).normalize();
		return {
			yaw: Math.atan2(-direction.x, -direction.z),
			pitch: Math.asin(clamp(direction.y, -0.92, 0.92))
		};
	}

	function artworkFocusTarget(placement: ArtworkPlacement) {
		const footprint = calculateArtworkFootprint(placement.frame);
		const verticalOffset = (footprint.minY + footprint.maxY) / 2;
		return new Vector3(
			placement.position[0],
			placement.position[1] + verticalOffset,
			placement.position[2]
		);
	}

	function clamp(value: number, minimum: number, maximum: number) {
		return Math.min(maximum, Math.max(minimum, value));
	}

	function shortestAngle(from: number, to: number) {
		return from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
	}

	function waitForFade(duration: number) {
		return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
	}

	async function focusArtwork(slug: string, notify: boolean) {
		const placement = placementBySlug.get(slug);
		if (!placement || !camera) return;
		restorePhysicalHanging();
		viewMode = 'focus';
		overviewWall = placement.wall;
		clearMovement();
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		const requestId = ++focusRequestId;
		autoSelectionArmed = false;
		currentSlug = slug;
		if (notify) onSelect(slug);
		const fitted = focusedArtworkView(layout, placement, camera.aspect);
		camera.fov = fitted.fov;
		camera.updateProjectionMatrix();
		const endPosition = new Vector3(...fitted.position);
		const target = new Vector3(...fitted.target);
		const angles = viewingAngles(endPosition, target);
		const currentRoom = roomContaining(camera.position);
		const canInterpolate =
			!reducedMotion &&
			currentRoom?.id === placement.roomId &&
			isWalkableSegment(
				layout,
				[camera.position.x, camera.position.z],
				[endPosition.x, endPosition.z]
			);

		focusAnimation = null;
		if (!canInterpolate && !reducedMotion) {
			focusFading = true;
			await waitForFade(150);
			if (destroyed || requestId !== focusRequestId) return;
		}

		await activateRoom(placement.roomId);
		if (destroyed || requestId !== focusRequestId || !camera) return;

		if (!canInterpolate) {
			camera.position.copy(endPosition);
			yaw = angles.yaw;
			pitch = angles.pitch;
			focusAnimation = null;
			focusFading = false;
			startAnimation();
			return;
		}
		focusFading = false;
		focusAnimation = {
			startedAt: performance.now(),
			duration: 760,
			startPosition: camera.position.clone(),
			endPosition,
			startYaw: yaw,
			endYaw: shortestAngle(yaw, angles.yaw),
			startPitch: pitch,
			endPitch: angles.pitch
		};
		startAnimation();
	}

	function selectNearest(direction: 1 | -1) {
		const orderedArtworks = layout.placements.map((placement) => placement.artwork);
		if (orderedArtworks.length === 0) return;
		const currentIndex = currentSlug
			? orderedArtworks.findIndex((artwork) => artwork.slug === currentSlug)
			: direction === 1
				? -1
				: 0;
		const nextIndex = (currentIndex + direction + orderedArtworks.length) % orderedArtworks.length;
		void focusArtwork(orderedArtworks[nextIndex].slug, true);
	}

	function restorePhysicalHanging() {
		overviewRoot.visible = false;
		for (const roomGroup of roomGroups.values()) roomGroup.visible = true;
		for (const runtime of runtimes.values()) {
			const room = layout.rooms.find((item) => item.id === runtime.placement.roomId);
			const roomGroup = roomGroups.get(runtime.placement.roomId);
			if (!room || !roomGroup) continue;
			if (runtime.group.parent !== roomGroup) roomGroup.add(runtime.group);
			runtime.group.position.set(
				runtime.placement.position[0] - room.center[0],
				runtime.placement.position[1],
				runtime.placement.position[2] - room.center[1]
			);
			runtime.group.rotation.y = runtime.placement.rotationY;
			for (const child of runtime.group.children) {
				if (child.name === 'artwork-light-pool' || child.name === 'artwork-fixture')
					child.visible = true;
			}
		}
	}

	function updateOverviewCamera() {
		if (!overviewCamera || !viewport) return;
		const room = layout.rooms.find((candidate) => candidate.id === activeRoomId);
		if (!room) return;
		restorePhysicalHanging();
		const available = layout.placements.filter((placement) => placement.roomId === room.id);
		const aspect = Math.max(0.1, viewport.clientWidth / Math.max(1, viewport.clientHeight));
		if (viewMode === 'overview' && overviewKind === 'room') {
			const hanging = roomOverviewLayout(available, aspect);
			for (const roomGroup of roomGroups.values()) roomGroup.visible = false;
			overviewRoot.visible = true;
			for (const item of hanging.positions) {
				const runtime = runtimes.get(item.slug);
				if (!runtime) continue;
				overviewRoot.add(runtime.group);
				runtime.group.position.set(...item.position);
				runtime.group.rotation.y = 0;
				for (const child of runtime.group.children) {
					if (child.name === 'artwork-light-pool' || child.name === 'artwork-fixture')
						child.visible = false;
				}
			}
			const fitHeight = Math.max(hanging.height, hanging.width / aspect);
			overviewCamera.left = (-fitHeight * aspect) / 2;
			overviewCamera.right = (fitHeight * aspect) / 2;
			overviewCamera.top = fitHeight / 2;
			overviewCamera.bottom = -fitHeight / 2;
			overviewCamera.position.set(0, 0, 12);
			overviewCamera.lookAt(0, 0, 0);
			overviewCamera.updateProjectionMatrix();
			overviewCamera.updateMatrixWorld();
			startAnimation();
			return;
		}
		if (!available.some((placement) => placement.wall === overviewWall))
			overviewWall = available[0]?.wall ?? 'north';
		const wallWorks = available.filter((placement) => placement.wall === overviewWall);
		const horizontal = overviewWall === 'north' || overviewWall === 'south';
		const axis = horizontal ? 0 : 2;
		const minimum = Math.min(...wallWorks.map((p) => p.position[axis] - p.frame.outerWidth / 2));
		const maximum = Math.max(...wallWorks.map((p) => p.position[axis] + p.frame.outerWidth / 2));
		const bottom = Math.min(...wallWorks.map((p) => p.position[1] - p.frame.outerHeight / 2 - 0.7));
		const top = Math.max(...wallWorks.map((p) => p.position[1] + p.frame.outerHeight / 2));
		const width = wallWorks.length ? maximum - minimum + 0.8 : 10;
		const height = wallWorks.length ? top - bottom + 0.8 : 5;
		const fitHeight = Math.max(height, width / aspect);
		overviewCamera.left = (-fitHeight * aspect) / 2;
		overviewCamera.right = (fitHeight * aspect) / 2;
		overviewCamera.top = fitHeight / 2;
		overviewCamera.bottom = -fitHeight / 2;
		const middle = wallWorks.length
			? (minimum + maximum) / 2
			: horizontal
				? room.center[0]
				: room.center[1];
		const centerY = wallWorks.length ? (bottom + top) / 2 : 2.5;
		const target = new Vector3(room.center[0], centerY, room.center[1]);
		if (horizontal) {
			target.x = middle;
			target.z += overviewWall === 'north' ? -room.depth / 2 : room.depth / 2;
			overviewCamera.position.set(middle, centerY, room.center[1]);
		} else {
			target.z = middle;
			target.x += overviewWall === 'west' ? -room.width / 2 : room.width / 2;
			overviewCamera.position.set(room.center[0], centerY, middle);
		}
		overviewCamera.lookAt(target);
		overviewCamera.updateProjectionMatrix();
		overviewCamera.updateMatrixWorld();
		startAnimation();
	}

	function showRoomOverview() {
		overviewKind = 'room';
		beginOverview();
	}

	function showWall(wall: MuseumWall = overviewWall) {
		overviewKind = 'wall';
		overviewWall = wall;
		beginOverview();
	}

	function beginOverview() {
		viewMode = 'overview';
		cancelGuidedFocus();
		autoSelectionArmed = false;
		pressedKeys.clear();
		touchForward = touchStrafe = 0;
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		void activateRoom(activeRoomId);
		updateOverviewCamera();
	}

	function navigateToRoom(roomId: string) {
		const targetRoom = layout.rooms.find((room) => room.id === roomId);
		if (!targetRoom) return;
		overviewKind = 'room';
		viewMode = 'overview';
		cancelGuidedFocus();
		autoSelectionArmed = false;
		pressedKeys.clear();
		touchForward = touchStrafe = 0;
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		currentSlug = targetRoom.artworkSlugs[0] ?? null;
		if (currentSlug) onSelect(currentSlug);
		void activateRoom(roomId);
		updateOverviewCamera();
	}

	function toggleWalking() {
		if (viewMode === 'walk') {
			showWall();
			return;
		}
		restorePhysicalHanging();
		viewMode = 'walk';
		cancelGuidedFocus();
		const room = layout.rooms[activeRoomIndex];
		if (camera && room) {
			camera.fov = 58;
			camera.updateProjectionMatrix();
			camera.position.set(room.center[0], EYE_HEIGHT, room.center[1] + room.depth * 0.28);
			yaw = pitch = 0;
		}
		void activateRoom(activeRoomId);
		startAnimation();
	}

	function cancelGuidedFocus() {
		focusRequestId += 1;
		focusAnimation = null;
		focusFading = false;
	}

	function resetPosition() {
		const openingRoom = layout.rooms[0];
		if (openingRoom) navigateToRoom(openingRoom.id);
	}

	function updateTouchMove(strafe: number, forwardAmount: number) {
		touchStrafe = strafe;
		touchForward = forwardAmount;
		startAnimation();
		if (Math.abs(strafe) + Math.abs(forwardAmount) > 0.05) cancelGuidedFocus();
	}

	function requestPointerLook() {
		if (!canvas) return;
		if (document.pointerLockElement === canvas) {
			document.exitPointerLock();
			return;
		}
		canvas.focus({ preventScroll: true });
		void canvas.requestPointerLock();
	}

	function handleFullscreenChange() {
		fullscreenActive = document.fullscreenElement === shell;
		pressedKeys.clear();
		requestAnimationFrame(sizeRenderer);
	}

	async function toggleFullscreen() {
		if (!fullscreenAvailable) return;
		try {
			if (document.fullscreenElement === shell) {
				await document.exitFullscreen();
			} else {
				if (document.fullscreenElement) await document.exitFullscreen();
				await shell.requestFullscreen();
			}
		} catch (error) {
			console.warn('Sketch Museum could not change full-screen mode.', error);
		}
	}

	async function exitMuseum() {
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		if (document.fullscreenElement === shell) {
			try {
				await document.exitFullscreen();
			} catch (error) {
				console.warn('Sketch Museum could not exit full-screen mode.', error);
			}
		}
		onExit();
	}

	function openDetails() {
		clearMovement();
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		if (currentArtwork) onDetails(currentArtwork);
	}

	function isTypingTarget(target: EventTarget | null) {
		return (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		);
	}

	function hasMuseumKeyboardContext(event: KeyboardEvent) {
		if (document.pointerLockElement === canvas) return true;
		const target = event.target;
		const activeElement = document.activeElement;
		return (
			target instanceof Node &&
			activeElement instanceof Node &&
			shell.contains(target) &&
			shell.contains(activeElement)
		);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (viewMode !== 'walk') return;
		const key = event.key.toLowerCase();
		if (
			!shouldHandleMuseumMovementKey(key, {
				insideMuseum: hasMuseumKeyboardContext(event),
				typingTarget: isTypingTarget(event.target)
			})
		)
			return;
		pressedKeys.add(key);
		startAnimation();
		cancelGuidedFocus();
		event.preventDefault();
	}

	function handleKeyUp(event: KeyboardEvent) {
		pressedKeys.delete(event.key.toLowerCase());
	}

	function rotateView(deltaX: number, deltaY: number) {
		if (viewMode !== 'walk') return;
		cancelGuidedFocus();
		yaw -= deltaX * 0.0036;
		pitch = clamp(pitch - deltaY * 0.0032, -1.25, 1.25);
		startAnimation();
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0 || document.pointerLockElement === canvas) return;
		canvas.focus({ preventScroll: true });
		draggingPointer = event.pointerId;
		dragDistance = 0;
		pointerStart.set(event.clientX, event.clientY);
		canvas.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (document.pointerLockElement === canvas) {
			rotateView(event.movementX, event.movementY);
			return;
		}
		if (draggingPointer !== event.pointerId) return;
		const deltaX = event.clientX - pointerStart.x;
		const deltaY = event.clientY - pointerStart.y;
		dragDistance += Math.hypot(deltaX, deltaY);
		pointerStart.set(event.clientX, event.clientY);
		rotateView(deltaX, deltaY);
	}

	function selectFromPointer(event: PointerEvent) {
		if (!camera || dragDistance > 8) return;
		const bounds = canvas.getBoundingClientRect();
		pointer.set(
			((event.clientX - bounds.left) / bounds.width) * 2 - 1,
			-((event.clientY - bounds.top) / bounds.height) * 2 + 1
		);
		raycaster.setFromCamera(
			pointer,
			viewMode === 'overview' && overviewCamera ? overviewCamera : camera
		);
		const visibleArtworkMeshes = [...runtimes.values()]
			.filter(({ placement }) => {
				const roomGroup = roomGroups.get(placement.roomId);
				return (
					activeRoomIds.has(placement.roomId) &&
					(roomGroup?.visible === true || (viewMode === 'overview' && overviewKind === 'room'))
				);
			})
			.map((runtime) => runtime.canvasMesh);
		const visibleNavigationMeshes =
			overviewKind === 'room' && viewMode === 'overview'
				? []
				: (roomNavigationMeshes.get(activeRoomId) ?? []);
		const intersection = raycaster.intersectObjects(
			[...visibleArtworkMeshes, ...visibleNavigationMeshes],
			false
		)[0];
		const targetRoomId = intersection?.object.userData.targetRoomId;
		if (typeof targetRoomId === 'string') {
			navigateToRoom(targetRoomId);
			return;
		}
		const slug = intersection?.object.userData.slug;
		if (typeof slug === 'string' && artworkBySlug.has(slug)) void focusArtwork(slug, true);
	}

	function handlePointerUp(event: PointerEvent) {
		if (draggingPointer !== event.pointerId) return;
		selectFromPointer(event);
		draggingPointer = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}

	function handlePointerCancel(event: PointerEvent) {
		if (draggingPointer !== event.pointerId) return;
		draggingPointer = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}

	function updateMovement(deltaSeconds: number) {
		if (!camera || viewMode !== 'walk') return;
		const keyboardForward =
			(pressedKeys.has('w') || pressedKeys.has('arrowup') ? 1 : 0) -
			(pressedKeys.has('s') || pressedKeys.has('arrowdown') ? 1 : 0);
		const keyboardStrafe =
			(pressedKeys.has('d') || pressedKeys.has('arrowright') ? 1 : 0) -
			(pressedKeys.has('a') || pressedKeys.has('arrowleft') ? 1 : 0);
		const forwardAmount = clamp(keyboardForward + touchForward, -1, 1);
		const strafeAmount = clamp(keyboardStrafe + touchStrafe, -1, 1);
		if (Math.abs(forwardAmount) + Math.abs(strafeAmount) < 0.02) return;
		autoSelectionArmed = true;

		const speed = pressedKeys.has('shift') ? 3.15 : 2.15;
		forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
		right.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
		const movement = forward
			.multiplyScalar(forwardAmount)
			.add(right.multiplyScalar(strafeAmount))
			.normalize()
			.multiplyScalar(speed * deltaSeconds);
		candidatePosition.copy(camera.position).add(movement);
		if (isWalkable(layout, candidatePosition.x, candidatePosition.z)) {
			camera.position.x = candidatePosition.x;
			camera.position.z = candidatePosition.z;
		}
		camera.position.y = EYE_HEIGHT;
	}

	function updateFocus(now: number) {
		if (!camera || !focusAnimation) return;
		const elapsed = (now - focusAnimation.startedAt) / focusAnimation.duration;
		const progress = clamp(elapsed, 0, 1);
		const eased = 1 - Math.pow(1 - progress, 3);
		camera.position.lerpVectors(focusAnimation.startPosition, focusAnimation.endPosition, eased);
		yaw = MathUtils.lerp(focusAnimation.startYaw, focusAnimation.endYaw, eased);
		pitch = MathUtils.lerp(focusAnimation.startPitch, focusAnimation.endPitch, eased);
		if (progress >= 1) focusAnimation = null;
	}

	function updateNearbyArtwork() {
		if (!camera || viewMode !== 'walk' || focusAnimation || focusFading || !autoSelectionArmed)
			return;
		let nearest: RuntimeArtwork | null = null;
		let nearestDistance = 4.25;
		for (const runtime of runtimes.values()) {
			if (!activeRoomIds.has(runtime.placement.roomId)) continue;
			runtime.group.getWorldPosition(worldPosition);
			const distance = camera.position.distanceTo(worldPosition);
			if (distance < nearestDistance) {
				nearest = runtime;
				nearestDistance = distance;
			}
		}
		if (nearest && nearest.placement.artwork.slug !== currentSlug) {
			currentSlug = nearest.placement.artwork.slug;
			autoSelectionArmed = false;
			onSelect(currentSlug);
		}
	}

	function updateSpotlights() {
		if (viewMode === 'overview' && overviewKind === 'room') {
			for (const light of activeSpots) light.visible = false;
			for (const beam of activeSpotBeams) beam.visible = false;
			return;
		}
		const lightingCamera = viewMode === 'overview' ? overviewCamera : camera;
		if (!lightingCamera) return;
		const nearby = [...runtimes.values()]
			.filter((runtime) => activeRoomIds.has(runtime.placement.roomId))
			.map((runtime) => {
				runtime.group.getWorldPosition(worldPosition);
				return { runtime, distance: lightingCamera.position.distanceToSquared(worldPosition) };
			})
			.sort((left, right) => left.distance - right.distance)
			.slice(0, activeSpots.length);

		for (const [index, light] of activeSpots.entries()) {
			const match = nearby[index];
			const beam = activeSpotBeams[index];
			if (!match) {
				light.visible = false;
				if (beam) beam.visible = false;
				continue;
			}
			light.visible = true;
			const placement = match.runtime.placement;
			const room = layout.rooms.find((candidate) => candidate.id === placement.roomId);
			const target = spotTargets[index];
			target.position.set(...placement.position);
			light.position.set(
				placement.viewPosition[0],
				(room?.height ?? 6.4) - 0.38,
				placement.viewPosition[2]
			);
			if (beam) {
				beam.visible = true;
				beamDirection.subVectors(target.position, light.position);
				const beamLength = beamDirection.length();
				beamMidpoint.copy(light.position).add(target.position).multiplyScalar(0.5);
				beam.position.copy(beamMidpoint);
				beam.scale.set(1, beamLength, 1);
				beam.quaternion.setFromUnitVectors(worldUp, beamDirection.normalize());
			}
		}
	}

	function animate(now: number) {
		animationFrame = 0;
		if (destroyed || !renderer || !scene || !camera || !visible || !inViewport) return;
		const delta = Math.min(0.05, Math.max(0, (now - (lastFrameTime || now)) / 1000));
		lastFrameTime = now;
		updateFocus(now);
		updateMovement(delta);
		camera.rotation.order = 'YXZ';
		camera.rotation.y = yaw;
		camera.rotation.x = pitch;

		frameCounter += 1;
		if (frameCounter % 20 === 0) {
			const currentRoom = viewMode === 'walk' ? roomContaining(camera.position) : null;
			if (currentRoom && currentRoom.id !== activeRoomId) void activateRoom(currentRoom.id);
			updateNearbyArtwork();
		}
		updateSpotlights();

		renderer.render(scene, viewMode === 'overview' && overviewCamera ? overviewCamera : camera);
		const moving =
			viewMode === 'walk' &&
			(pressedKeys.size > 0 || Math.abs(touchForward) + Math.abs(touchStrafe) > 0.02);
		if (focusAnimation || moving) animationFrame = requestAnimationFrame(animate);
	}

	function startAnimation() {
		if (destroyed || !visible || !inViewport || animationFrame) return;
		lastFrameTime = 0;
		animationFrame = requestAnimationFrame(animate);
	}

	function stopAnimation() {
		if (!animationFrame) return;
		cancelAnimationFrame(animationFrame);
		animationFrame = 0;
	}

	function clearMovement() {
		pressedKeys.clear();
		touchStrafe = touchForward = 0;
	}

	function handleVisibility() {
		visible = !document.hidden;
		if (!visible) clearMovement();
		if (visible) startAnimation();
		else stopAnimation();
	}

	function handlePointerLockChange() {
		pointerLocked = document.pointerLockElement === canvas;
	}

	function handleContextLost(event: Event) {
		event.preventDefault();
		stopAnimation();
		status = 'The 3D gallery is unavailable. Return to the collection to browse every drawing.';
		onError(status);
	}

	function sizeRenderer() {
		if (!renderer || !camera || !viewport) return;
		const width = Math.max(1, viewport.clientWidth);
		const height = Math.max(1, viewport.clientHeight);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		if (viewMode === 'focus' && currentSlug) {
			const placement = placementBySlug.get(currentSlug);
			if (placement) {
				const fitted = focusedArtworkView(layout, placement, camera.aspect);
				focusAnimation = null;
				camera.position.set(...fitted.position);
				camera.fov = fitted.fov;
				const angles = viewingAngles(camera.position, new Vector3(...fitted.target));
				yaw = angles.yaw;
				pitch = angles.pitch;
			}
		}
		camera.updateProjectionMatrix();
		updateOverviewCamera();
	}

	async function initialise() {
		try {
			quality = detectQuality();
			pointerLockAvailable = 'requestPointerLock' in canvas;
			renderer = new WebGLRenderer({
				canvas,
				antialias: quality !== 'low',
				alpha: false,
				powerPreference: quality === 'low' ? 'low-power' : 'high-performance'
			});
			renderer.setPixelRatio(renderPixelDensity());
			renderer.outputColorSpace = SRGBColorSpace;
			renderer.toneMapping = ACESFilmicToneMapping;
			renderer.toneMappingExposure = 0.92;
			renderer.shadowMap.enabled = quality !== 'low';
			renderer.shadowMap.type = PCFSoftShadowMap;

			scene = new Scene();
			scene.background = new Color('#241b15');
			scene.fog = new FogExp2('#3b322a', quality === 'low' ? 0.009 : 0.012);
			camera = new PerspectiveCamera(58, 1, 0.08, 90);
			camera.position.set(...layout.startPosition);
			activeRoomId = layout.rooms[0]?.id ?? '';
			fullscreenAvailable =
				document.fullscreenEnabled &&
				typeof shell.requestFullscreen === 'function' &&
				typeof document.exitFullscreen === 'function';
			handleFullscreenChange();

			scene.add(new HemisphereLight('#ffe9c8', '#3b2418', quality === 'low' ? 0.9 : 0.72));
			scene.add(new AmbientLight('#fff1d8', quality === 'low' ? 0.42 : 0.3));
			overviewRoot.add(new AmbientLight('#ffffff', 1.25));
			overviewRoot.visible = false;
			scene.add(overviewRoot);
			const directional = new DirectionalLight('#ffe4b8', quality === 'high' ? 0.56 : 0.4);
			directional.position.set(-4, 6, 3);
			directional.castShadow = quality === 'high';
			scene.add(directional);

			for (let index = 0; index < (quality === 'low' ? 1 : 3); index += 1) {
				const spot = new SpotLight(
					'#ffd69a',
					quality === 'high' ? 76 : quality === 'medium' ? 64 : 50,
					14,
					0.48,
					0.76,
					1.4
				);
				spot.castShadow = quality === 'high' && index === 0;
				spot.shadow.mapSize.set(512, 512);
				const target = new Object3D();
				scene.add(target);
				spot.target = target;
				activeSpots.push(spot);
				spotTargets.push(target);
				scene.add(spot);

				const beamMaterial = new MeshBasicMaterial({
					color: '#ffe0a1',
					transparent: true,
					opacity: quality === 'low' ? 0.065 : 0.085,
					depthWrite: false,
					side: DoubleSide,
					blending: AdditiveBlending,
					toneMapped: false
				});
				beamMaterial.fog = false;
				const beam = new Mesh(
					new CylinderGeometry(0.82, 0.04, 1, quality === 'low' ? 12 : 20, 1, true),
					beamMaterial
				);
				beam.visible = false;
				beam.renderOrder = 1;
				activeSpotBeams.push(beam);
				scene.add(beam);
			}

			lightPoolTexture = createSoftLightPoolTexture();

			const initialPlacement = selectedSlug ? placementBySlug.get(selectedSlug) : undefined;
			if (initialPlacement) {
				camera.position.set(...initialPlacement.viewPosition);
				const angles = viewingAngles(camera.position, artworkFocusTarget(initialPlacement));
				yaw = angles.yaw;
				pitch = angles.pitch;
				currentSlug = initialPlacement.artwork.slug;
				activeRoomId = initialPlacement.roomId;
			}

			resizeObserver = new ResizeObserver(sizeRenderer);
			resizeObserver.observe(viewport);
			overviewCamera = new OrthographicCamera(-8, 8, 4, -4, 0.1, 50);
			if (initialPlacement) viewMode = 'focus';
			if ('IntersectionObserver' in window) {
				intersectionObserver = new IntersectionObserver(([entry]) => {
					inViewport = entry.isIntersecting;
					if (inViewport) startAnimation();
					else {
						clearMovement();
						stopAnimation();
					}
				});
				intersectionObserver.observe(viewport);
			}
			sizeRenderer();
			window.addEventListener('keydown', handleKeyDown, { passive: false });
			window.addEventListener('keyup', handleKeyUp);
			window.addEventListener('blur', clearMovement);
			document.addEventListener('visibilitychange', handleVisibility);
			document.addEventListener('pointerlockchange', handlePointerLockChange);
			document.addEventListener('fullscreenchange', handleFullscreenChange);
			canvas.addEventListener('pointerdown', handlePointerDown);
			canvas.addEventListener('pointermove', handlePointerMove);
			canvas.addEventListener('pointerup', handlePointerUp);
			canvas.addEventListener('pointercancel', handlePointerCancel);
			canvas.addEventListener('webglcontextlost', handleContextLost);

			initialised = true;
			const initialRoom = layout.rooms.find((room) => room.id === activeRoomId) ?? layout.rooms[0];
			if (initialRoom) await activateRoom(initialRoom.id);
			updateOverviewCamera();
			updateSpotlights();
			if (!destroyed) startAnimation();
		} catch (error) {
			if (destroyed) return;
			const message =
				error instanceof Error ? error.message : 'The 3D gallery could not be prepared.';
			console.error('Sketch Museum failed to initialise.', error);
			status = message;
			onError(message);
		}
	}

	function teardown() {
		destroyed = true;
		roomActivationId += 1;
		stopAnimation();
		resizeObserver?.disconnect();
		intersectionObserver?.disconnect();
		textureQueue.clear();
		window.removeEventListener('keydown', handleKeyDown);
		window.removeEventListener('keyup', handleKeyUp);
		window.removeEventListener('blur', clearMovement);
		document.removeEventListener('visibilitychange', handleVisibility);
		document.removeEventListener('pointerlockchange', handlePointerLockChange);
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		canvas?.removeEventListener('pointerdown', handlePointerDown);
		canvas?.removeEventListener('pointermove', handlePointerMove);
		canvas?.removeEventListener('pointerup', handlePointerUp);
		canvas?.removeEventListener('pointercancel', handlePointerCancel);
		canvas?.removeEventListener('webglcontextlost', handleContextLost);
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		if (document.fullscreenElement === shell) void document.exitFullscreen();
		restorePhysicalHanging();
		for (const runtime of runtimes.values()) releaseTexture(runtime);
		if (scene) disposeObjectTree(scene);
		lightPoolTexture?.dispose();
		lightPoolTexture = null;
		roomGroups.clear();
		runtimes.clear();
		roomNavigationMeshes.clear();
		activeRoomIds.clear();
		activeSpots.length = 0;
		spotTargets.length = 0;
		activeSpotBeams.length = 0;
		for (const material of [
			waitingMaterial,
			wallMaterial,
			wallInsetMaterial,
			floorMaterial,
			ceilingMaterial,
			benchMaterial,
			fixtureMaterial
		]) {
			material.dispose();
		}
		disposeSharedMuseumMaterials();
		renderer?.dispose();
		renderer?.forceContextLoss();
		renderer = null;
		scene = null;
		camera = null;
	}

	onMount(() => {
		void initialise();
		return teardown;
	});
</script>

<div bind:this={shell} class="scene-shell" data-quality={quality}>
	<div bind:this={viewport} class="scene-viewport" class:walking={viewMode === 'walk'}>
		<canvas
			bind:this={canvas}
			class:focus-fading={focusFading}
			aria-label="Three-dimensional Sketch Museum. Choose a wall, jump to a room, or select a drawing. Walking is optional. The complete collection is available outside the museum."
			tabindex="0"
		></canvas>

		{#if status && !status.endsWith('ready')}
			<div class="scene-status" role="status" aria-live="polite">
				<span></span>
				{status}
			</div>
		{/if}
	</div>
	<MuseumControls
		rooms={layout.rooms}
		{activeRoomId}
		{roomArtworks}
		{roomWalls}
		{overviewWall}
		{overviewKind}
		onRoomOverview={showRoomOverview}
		{viewMode}
		onRoom={navigateToRoom}
		onWall={showWall}
		onWalking={toggleWalking}
		onArtwork={(slug) => void focusArtwork(slug, true)}
		{currentArtwork}
		{roomName}
		roomIndex={activeRoomIndex}
		roomCount={layout.rooms.length}
		previousRoomName={previousRoom?.name ?? null}
		nextRoomName={nextRoom?.name ?? null}
		{pointerLocked}
		{pointerLockAvailable}
		{fullscreenActive}
		{fullscreenAvailable}
		onPreviousRoom={() => previousRoom && navigateToRoom(previousRoom.id)}
		onNextRoom={() => nextRoom && navigateToRoom(nextRoom.id)}
		onPrevious={() => selectNearest(-1)}
		onNext={() => selectNearest(1)}
		onDetails={openDetails}
		onReset={resetPosition}
		onPointerLock={requestPointerLook}
		onFullscreen={toggleFullscreen}
		onExit={exitMuseum}
		onTouchMove={updateTouchMove}
	/>
</div>

<style>
	.scene-shell {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: 0.65rem;
		background: #19130f;
		box-shadow:
			0 1.4rem 4rem rgb(24 17 12 / 28%),
			inset 0 0 0 1px rgb(220 196 151 / 22%);
		isolation: isolate;
	}

	.scene-viewport {
		position: relative;
		height: min(58dvh, 40rem);
		min-height: 19rem;
		flex: 1 0 auto;
	}

	.scene-shell:fullscreen {
		width: 100vw;
		height: 100dvh;
		min-height: 0;
		overflow: auto;
		border-radius: 0;
	}

	.scene-shell:fullscreen::backdrop {
		background: #19130f;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
		opacity: 1;
		touch-action: pan-y;
		transition: opacity 150ms ease;
	}

	.walking canvas {
		touch-action: none;
	}

	canvas.focus-fading {
		opacity: 0;
	}

	canvas:active {
		cursor: grabbing;
	}

	canvas:focus-visible {
		outline: 3px solid #fff4d5;
		outline-offset: -5px;
	}

	.scene-status {
		position: absolute;
		z-index: 8;
		top: 50%;
		left: 50%;
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.75rem 1rem;
		border: 1px solid rgb(229 207 167 / 38%);
		border-radius: 0.4rem;
		background: rgb(21 15 11 / 88%);
		color: #f1e8d7;
		font-size: 0.8rem;
		font-weight: 700;
		translate: -50% -50%;
		backdrop-filter: blur(8px);
	}

	.scene-status span {
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid rgb(255 255 255 / 24%);
		border-top-color: #e7c983;
		border-radius: 50%;
		animation: museum-spin 0.85s linear infinite;
	}

	@keyframes museum-spin {
		to {
			rotate: 360deg;
		}
	}

	@media (max-width: 48rem) {
		.scene-shell {
			border-radius: 0.4rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		canvas {
			transition: none;
		}

		.scene-status span {
			animation: none;
		}
	}
</style>
