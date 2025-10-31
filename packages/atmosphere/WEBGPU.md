# @takram/three-atmosphere/webgpu

[![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

A work-in-progress and experimental WebGPU support for `@takram/three-atmosphere`.

## Usage

### Atmospheric lighting

[`AtmosphereLight`](#atmospherelight) replaces `SunLight` and `SkyLight`, providing physically correct lighting for large-scale scenes and maintaining compatibility with built-in Three.js materials and shadows.

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
getSunDirectionECEF(date, context.sunDirectionECEF.value)

// AtmosphereLightNode must be associated with AtmosphereLight in the
// renderer's node library before use:
renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)

const light = new AtmosphereLight(context)
scene.add(light)
```

### Aerial perspective

[`AerialPerspectiveNode`](#aerialperspectivenode) is a post-processing node that renders atmospheric transparency and inscattered light. It takes a color (beauty) buffer and a depth buffer, and also renders the sky for texels whose depth value is 1.

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
getSunDirectionECEF(date, context.sunDirectionECEF.value)

const passNode = pass(scene, camera, { samples: 0 })
const colorNode = passNode.getTextureNode('output')
const depthNode = passNode.getTextureNode('depth')

const postProcessing = new PostProcessing(renderer)
postProcessing.outputNode = aerialPerspective(context, colorNode, depthNode)
```

### Sky

[`SkyNode`](#skynode) replaces `SkyMaterial` and is also aggregated in `AerialPerspectiveNode`. Despite its name, it renders the atmospheric transparency and inscattered light at infinite distance (or clamped to a virtual ground at the ellipsoidal surface), along with the sun, moon and stars.

```ts
import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  AtmosphereContextNode,
  skyBackground
} from '@takram/three-atmosphere/webgpu'
import { Scene } from 'three'

declare const date: Date

const context = new AtmosphereContextNode()

const scene = new Scene()
scene.backgroundNode = skyBackground(context)

// Update the following uniforms in the context:
//   - matrixECIToECEF: For the stars
//   - sunDirectionECEF: For the sun
//   - moonDirectionECEF: For the moon
const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context
const matrix = getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(matrix)
getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(matrix)
```

### World origin rebasing

World origin rebasing is a common technique for large coordinates like ECEF. Instead of moving the camera, it moves and rotate the world coordinates to reduces loss of floating-point precision.

This appears to be required for the shadows to work correctly with `WebGPURenderer`.

```ts
import { AtmosphereContextNode } from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'

declare const longitude: number // In degrees
declare const latitude: number // In degrees
declare const height: number // In meters

const context = new AtmosphereContextNode()

// Convert the geographic coordinates to ECEF coordinates in meters:
const positionECEF = new Geodetic(
  radians(longitude),
  radians(latitude),
  height
).toECEF()

// Update the matrixWorldToECEF uniform in the context so that the scene's
// orientation aligns with x: north, y: up, z: east.
Ellipsoid.WGS84.getNorthUpEastFrame(
  positionECEF,
  context.matrixWorldToECEF.value
)
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

### Uniforms

#### matrixWorldToECEF

```ts
matrixWorldToECEF = uniform(new Matrix4())
```

The matrix for converting world coordinates to ECEF coordinates. Use this matrix to define a reference frame of the scene or, more commonly, to orient the ellipsoid for working near the world space origin and adapting to Three.js’s Y-up coordinate system.

It must be orthogonal and consist only of translation and rotation (no scaling).

#### matrixECIToECEF

```ts
matrixECIToECEF = uniform(new Matrix4())
```

The rotation matrix for converting ECI to ECEF coordinates. This matrix is used to orient stars as seen from the earth in `StarsNode`.

#### sunDirectionECEF, moonDirectionECEF

```ts
sunDirectionECEF = uniform(new Vector3())
moonDirectionECEF = uniform(new Vector3())
```

The normalized direction to the sun and moon in ECEF coordinates.

#### matrixMoonFixedToECEF

```ts
matrixMoonFixedToECEF = uniform(new Matrix4())
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

## AtmosphereParameters

### Static options

#### worldToUnit

```ts
worldToUnit = 0.001
```

A unit-less scaling factor for convert meters to the internal length unit (defaults to km) to reduce loss of floating-point precision during internal calculation.

#### solarIrradiance

```ts
solarIrradiance = new Vector3(1.474, 1.8504, 1.91198)
```

The solar irradiance (W･m<sup>-2</sup>･nm<sup>-1</sup>) at the top of the atmosphere.

Note that this and other spectral parameters are simplified to only 3 wavelengths: 680 nm, 550 nm, and 440 nm.

#### sunAngularRadius

```ts
sunAngularRadius = 0.004675
```

The sun's angular radius, in radians.

#### bottomRadius

```ts
bottomRadius = 6360000
```

The distance between the planet center and the bottom of the atmosphere, in meters.

#### topRadius

```ts
topRadius = 6420000
```

The distance between the planet center and the top of the atmosphere, in meters.

#### rayleighDensity

```ts
rayleighDensity = new DensityProfile([
  new DensityProfileLayer(),
  new DensityProfileLayer(0, 1, -1 / 8000)
])
```

The density profile of air molecules.

#### rayleighScattering

```ts
rayleighScattering = new Vector3(0.000005802, 0.000013558, 0.0000331)
```

The scattering coefficient (m<sup>-1</sup>) of air molecules at the altitude where their density is maximum.

#### mieDensity

```ts
mieDensity = new DensityProfile([
  new DensityProfileLayer(),
  new DensityProfileLayer(0, 1, -1 / 1200)
])
```

The density profile of aerosols.

#### mieScattering

```ts
mieScattering = new Vector3().setScalar(0.000003996)
```

The scattering coefficient (m<sup>-1</sup>) of aerosols at the altitude where their density is maximum.

#### mieExtinction

```ts
mieExtinction = new Vector3().setScalar(0.00000444)
```

The extinction coefficient (m<sup>-1</sup>) of aerosols at the altitude where their density is maximum.

#### miePhaseFunctionG

```ts
miePhaseFunctionG = 0.8
```

The anisotropy parameter for the Cornette-Shanks phase function.

#### absorptionDensity

```ts
absorptionDensity = new DensityProfile([
  new DensityProfileLayer(25000, 0, 0, 1 / 15000, -2 / 3),
  new DensityProfileLayer(0, 0, 0, -1 / 15000, 8 / 3)
])
```

The density profile of air molecules that absorb light (e.g. ozone).

#### absorptionExtinction

```ts
absorptionExtinction = new Vector3(0.00000065, 0.000001881, 0.000000085)
```

The extinction coefficient (m<sup>-1</sup>) of molecules that absorb light (e.g. ozone) at the altitude where their density is maximum.

#### groundAlbedo

```ts
groundAlbedo = new Vector3().setScalar(0.3)
```

The average albedo of the ground.

#### minCosSun

```ts
minCosSun = Math.cos(radians(102))
```

The cosine of the maximum sun zenith angle for which atmospheric scattering must be precomputed (for maximum precision, use the smallest sun zenith angle yielding negligible sky light radiance values).

#### sunRadianceToLuminance, skyRadianceToLuminance

```ts
sunRadianceToLuminance = new Vector3(98242.786222, 69954.398112, 66475.012354)
skyRadianceToLuminance = new Vector3(114974.91644, 71305.954816, 65310.548555)
```

The precomputed coefficients (lm･W<sup>-1</sup>) to approximate the conversion from RGB spectral radiance (W･m<sup>-2</sup>･nm<sup>-1</sup>) to luminance (cd･m<sup>-2</sup>).

#### luminanceScale

```ts
luminanceScale = 1 / luminanceCoefficients.dot(sunRadianceToLuminance)
```

A unit-less scaling factor to bring true luminance values into a numerically stable range. This helps prevent noticeable precision loss in half-float buffers.

#### transmittancePrecisionLog

```ts
transmittancePrecisionLog = false
```

Whether to store the optical depth instead of the transmittance in the transmittance textures. Linear filtering on logarithmic numbers yields non-linear interpolations so that sampling will be performed manually, thus this should be enabled only in the precomputation stage.

#### combinedScatteringTextures

```ts
combinedScatteringTextures = true
```

Whether to store the single Mie scattering in the alpha channel of the scattering texture, reducing the memory footprint on the GPU.

#### higherOrderScatteringTexture

```ts
higherOrderScatteringTexture = true
```

Whether to generate and use a separate texture for higher-order scattering (n >= 2) for a better approximation of the multi-scattering occlusion.
