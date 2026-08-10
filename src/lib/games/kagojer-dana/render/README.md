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
