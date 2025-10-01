# @takram/three-atmosphere/webgpu

[![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

A work-in-progress and experimental WebGPU support for `@takram/three-atmosphere`.

## Usage

### Atmospheric lighting

```ts
import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'

declare const renderer: WebGPURenderer
declare const scene: Scene
declare const date: Date

const context = new AtmosphereContextNode()
getSunDirectionECEF(date, context.sunDirectionECEF)

// AtmosphereLightNode must be associated with AtmosphereLight in the
// renderer's node library before use:
renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)

const light = new AtmosphereLight(context)
scene.add(light)
```

### Aerial perspective

```ts
import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContextNode
} from '@takram/three-atmosphere/webgpu'
import { pass } from 'three/tsl'
import { PostProcessing } from 'three/webgpu'

declare const camera: Camera
declare const date: Date

const context = new AtmosphereContextNode()
context.camera = camera
getSunDirectionECEF(date, context.sunDirectionECEF)

const passNode = pass(scene, camera, { samples: 0 })
const colorNode = passNode.getTextureNode('output')
const depthNode = passNode.getTextureNode('depth')

const postProcessing = new PostProcessing(renderer)
postProcessing.outputNode = aerialPerspective(context, colorNode, depthNode)
```

## API changes

- `PrecomputedTexturesGenerator` was replaced by `AtmosphereLUTNode`.
- `AerialPerspectiveEffect` was replaced by `AerialPerspectiveNode`.
- `SunDirectionalLight` and `SkyLightProbe` were replaced by `AtmosphereLight` and `AtmosphereLightNode`.
- `SkyMaterial` was replaced by `SkyNode` (`skyBackground`) that can be used in `Scene.backgroundNode`.
- `LightingMaskPass` was removed.
- `StarsMaterial` and `StarsGeometry` were replaced by `StarsNode`.

# API

- [`AtmosphereContextNode`](#atmospherecontextnode)
- [`AtmosphereLight`](#atmospherelight)
- [`AerialPerspectiveNode`](#aerialperspectivenode)
- [`SkyNode`](#skynode)
- [`SkyEnvironmentNode`](#skyenvironmentnode)

**Advanced**

- [`AtmosphereParameters`](#atmosphereparameters)
- [`AtmosphereLUTNode`](#atmospherelutnode)
- [`AtmosphereLightNode`](#atmospherelightnode)

The following terms refer to class fields:

- **Dependencies** : Class fields of type `Node` that the subject depends on.
- **Parameters** : Class fields whose changes take effect immediately.
- **Uniforms** : Class field of type `UniformNode`. Changes in its value takes effect immediately.
- **Static options** : Class fields whose changes take effect only after calling `setup()`.

## AtmosphereContextNode

→ [Source](/packages/atmosphere/src/webgpu/AtmosphereContextNode.ts)

### Constructor

```ts
class AtmosphereContextNode {
  constructor(parameters?: AtmosphereParameters, lutNode?: AtmosphereLUTNode)
}
```

### Dependencies

#### lutNode

```ts
lutNode: AtmosphereLUTNode
```

### Parameters

#### matrixWorldToECEF

```ts
matrixWorldToECEF = new Matrix4().identity()
```

The matrix for converting world coordinates to ECEF coordinates. Use this matrix to define a reference frame of the scene or, more commonly, to orient the ellipsoid for working near the world space origin and adapting to Three.js’s Y-up coordinate system.

It must be orthogonal and consist only of translation and rotation (no scaling).

#### matrixECIToECEF

```ts
matrixECIToECEF = new Matrix4().identity()
```

The rotation matrix for converting ECI to ECEF coordinates. This matrix is used to orient stars as seen from the earth in `StarsNode`.

#### sunDirectionECEF, moonDirectionECEF

```ts
sunDirectionECEF = new Vector3()
moonDirectionECEF = new Vector3()
```

The normalized direction to the sun and moon in ECEF coordinates.

#### matrixMoonFixedToECEF

```ts
matrixMoonFixedToECEF = new Matrix4().identity()
```

The rotation matrix for converting moon fixed coordinates to ECEF coordinates. This matrix is used to orient the moon’s surface as seen from the earth in `MoonNode`.

### Static options

#### camera

```ts
camera = new Camera()
```

The camera used for rendering the scene. This is required because the atmospheric effects are rendered in post-processing stages.

#### ellipsoid

```ts
ellipsoid = Ellipsoid.WGS84
```

The ellipsoid model representing the earth.

#### correctAltitude

```ts
correctAltitude = true
```

Whether to adjust the atmosphere’s inner sphere to osculate (touch and share a tangent with) the ellipsoid.

The atmosphere is approximated as a sphere, with a radius between the ellipsoid’s major and minor axes. The difference can exceed 10,000 meters in the worst cases, roughly equal to the cruising altitude of a passenger jet. This option compensates for this difference.

#### constrainCamera

```ts
constrainCamera = true
```

Whether to constrain the camera above the atmosphere’s inner sphere.

#### showGround

```ts
showGround = true
```

Disable this option to constrain the camera’s ray above the horizon, effectively hiding the virtual ground.

## AtmosphereLight

Represents direct and indirect sunlight. The lighting is correct at large scale regardless of the materials used on surfaces, unlike `SunDirectionalLight` and `SkyLightProbe` in the previous implementation.

Add it along with [`AtmosphereLightNode`](#atmospherelightnode) to the renderer’s node library before use:

```ts
import {
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'

renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
```

→ [Source](/packages/atmosphere/src/webgpu/AtmosphereLight.ts)

### Constructor

```ts
class AtmosphereLight {
  constructor(atmosphereContext?: AtmosphereContextNode, distance?: number)
}
```

### Parameters

#### distance

```ts
distance = 1
```

The distance from `DirectionalLight.target` to the light’s position. Adjust the target and this value when shadows are enabled so that the shadow camera covers the objects you want to cast shadows.

### Uniforms

#### direct

```ts
direct = uniform(true)
```

Whether to enable direct sunlight. This must be turned off when you use an environment map that includes direct sunlight.

#### indirect

```ts
indirect = uniform(true)
```

Whether to enable indirect sunlight. This must be turned off when you use an environment map.

## AerialPerspectiveNode

→ [Source](/packages/atmosphere/src/webgpu/AerialPerspectiveNode.ts)

### Constructor

```ts
const aerialPerspective: (
  atmosphereContext: AtmosphereContext,
  colorNode: Node,
  depthNode: Node,
  normalNode?: Node | null
) => NodeObject<AerialPerspectiveNode>
```

### Dependencies

#### colorNode

```ts
colorNode: Node
```

#### depthNode

```ts
depthNode: Node
```

#### normalNode

```ts
normalNode?: Node | null
```

#### skyNode

```ts
skyNode?: Node | null
```

#### shadowLengthNode

```ts
shadowLengthNode?: Node | null
```

### Static options

#### correctGeometricError

```ts
correctGeometricError = true
```

#### lighting

```ts
lighting = false
```

#### transmittance

```ts
transmittance = true
```

#### inscatter

```ts
inscatter = true
```

## SkyNode

→ [Source](/packages/atmosphere/src/webgpu/SkyNode.ts)

### Constructor

```ts
const sky: (atmosphereContext: AtmosphereContext) => NodeObject<SkyNode>

const skyWorld: (atmosphereContext: AtmosphereContext) => NodeObject<SkyNode>

const skyBackground: (
  atmosphereContext: AtmosphereContext
) => NodeObject<SkyNode>
```

### Dependencies

#### shadowLengthNode

```ts
shadowLengthNode?: Node | null
```

#### sunNode

```ts
sunNode: SunNode
```

#### moonNode

```ts
moonNode: MoonNode
```

#### starsNode

```ts
starsNode: StarsNode
```

### Uniforms

#### sunNode.angularRadius

```ts
sunNode.angularRadius = uniform(0.004675) // ≈ 16 arcminutes
```

#### sunNode.intensity

```ts
sunNode.intensity = uniform(1)
```

#### moonNode.angularRadius

```ts
moonNode.angularRadius = uniform(0.0045) // ≈ 15.5 arcminutes
```

#### moonNode.intensity

```ts
moonNode.intensity = uniform(1)
```

#### starsNode.pointSize

```ts
starsNode.pointSize = uniform(1)
```

#### starsNode.intensity

```ts
starsNode.intensity = uniform(1)
```

### Static options

#### showSun

```ts
showSun = true
```

#### showMoon

```ts
showMoon = true
```

#### showStars

```ts
showStars = true
```

## SkyEnvironmentNode

→ [Source](/packages/atmosphere/src/webgpu/SkyEnvironmentNode.ts)

### Constructor

```ts
const skyEnvironment: (
  atmosphereContext: AtmosphereContext,
  size?: number
) => NodeObject<SkyEnvironmentNode>
```

### Dependencies

#### skyNode

```ts
skyNode: SkyNode
```
