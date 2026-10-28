# Kagojer Dana world/render integration

`KagojerDanaWorldScene` owns the Three.js scene, camera, streamed chunk objects,
paper-plane visual, and post-process resources. It deliberately does **not**
create or dispose the controller's `WebGLRenderer`.

Create it only after the visitor starts the game:

```ts
import * as THREE from 'three';
import { createKagojerDanaWorldScene } from './render';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high' });
const world = createKagojerDanaWorldScene({ seed, quality, calmCamera });

world.resize(width, height, devicePixelRatio);

// Each animation frame, after the fixed-step simulation has advanced:
world.update(
	{
		position: plane.position,
		groundVelocity: plane.groundVelocity,
		orientation: plane.orientation,
		airspeed,
		altitudeM: plane.position.y,
		rollRadians,
		gustStrength,
		creaseLevel: plane.creaseLevel,
		apparentWind,
		elapsedSeconds: simulationTime
	},
	deltaSeconds
);
collisionSystem.setColliders(world.getColliders());
world.render(renderer);
```

`getColliders()` keeps the same array identity and changes its contents only at
chunk boundaries. People and animals are never included. For folio credit,
accumulate dwell only while `getVisibleHeroLandmark()?.inView === true`; the
helper combines the camera frustum with a centre-ray occlusion test.

Quality and accessibility changes are independent of simulation:

```ts
world.setQuality('balanced');
world.setCalmCamera(true);
world.setStrongWindMarks(true);
```

On navigation, call `world.destroy()` before `renderer.dispose()`. Destruction
is idempotent and releases chunk geometry, sign textures, materials, render
targets, paper geometry, and wind-mark buffers.

## Visual conventions

Surface strokes are filtered against their pixel footprint, and contour ink
recedes with view distance and scene fog. Keep structural silhouettes readable
without restoring black edges over distant mist. The matte paper plane uses
outward face normals and attached crease/perimeter lines; its visual wing flex
does not change collision or flight state.

Chunk batches must distinguish both geometry and material identity. A semantic
prop name alone can combine differently shaped clay objects or replace a taxi's
colour with the bus material. Clearing a chunk disposes each `InstancedMesh`'s
instance buffers; pooled geometry and materials remain owned by the factory.

Quality changes retain the requested device pixel ratio so returning from
battery to high quality restores sharpness. Battery rendering still bypasses
the normal/contour passes. The world owns and releases its atmospheric scenery;
it never owns the controller's renderer.

`npm run kagojer-dana:assets` captures seven fixed development views with the
existing capture seed and regenerates the poster/social/portrait images. The
capture hides HUD and privacy chrome only in its isolated page, without changing
consent. Use the ordinary playable route on a production preview for interaction
tests; development capture poses are intentionally unavailable in production.
