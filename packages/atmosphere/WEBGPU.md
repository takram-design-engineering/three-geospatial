# @takram/three-atmosphere/webgpu

[![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

A work-in-progress and experimental WebGPU support for `@takram/three-atmosphere`.

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
- [`SunNode`](#sunnode)
- [`MoonNode`](#moonnode)
- [`StarsNode`](#starsnode)

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
const atmosphereContext: (
  renderer: Renderer,
  parameters?: AtmosphereParameters,
  lutNode?: AtmosphereLUTNode
) => AtmosphereContextNode
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

#### matrixECIToECEF

```ts
matrixECIToECEF = new Matrix4().identity()
```

#### sunDirectionECEF

```ts
sunDirectionECEF = new Vector3()
```

#### moonDirectionECEF

```ts
moonDirectionECEF = new Vector3()
```

#### matrixMoonFixedToECEF

```ts
matrixMoonFixedToECEF = new Matrix4().identity()
```

### Static options

#### camera

```ts
camera = new Camera()
```

#### ellipsoid

```ts
ellipsoid = Ellipsoid.WGS84
```

#### correctAltitude

```ts
correctAltitude = true
```

#### constrainCamera

```ts
constrainCamera = true
```

#### showGround

```ts
showGround = true
```

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
interface AtmosphereLight {
  new: (
    atmosphereContext?: AtmosphereContextNode,
    distance?: number
  ) => AtmosphereLight
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
skyNode?: Node | null = sky()
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

<!-- prettier-ignore -->
```ts
const sky: (atmosphereContext: AtmosphereContext) => NodeObject<SkyNode>
const skyWorld: (atmosphereContext: AtmosphereContext) => NodeObject<SkyNode>
const skyBackground: (atmosphereContext: AtmosphereContext) => NodeObject<SkyNode>
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
