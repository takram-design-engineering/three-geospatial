# @takram/three-atmosphere/webgpu

[![npm version](https://img.shields.io/npm/v/@takram/three-atmosphere.svg?style=flat-square)](https://www.npmjs.com/package/@takram/three-atmosphere) [![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

Work-in-progress WebGPU support for `@takram/three-atmosphere`.

The atmospheric model is based on Eric Bruneton's [Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/) and uses the 4D scattering LUT with several improvements. The key difference from the original implementation is that higher-order scattering is computed using the multiple scattering LUT proposed in Sébastien Hillaire's [A Scalable and Production Ready Sky and Atmosphere Rendering Technique](https://sebh.github.io/publications/egsr2020.pdf). It also performs raymarching of inscattered light between the camera and scene objects by default, which completely eliminates artifacts due to floating-point precision.

Once all packages support WebGPU, the current implementation of the shader-chunk-based architecture will be archived and superseded by the node-based implementation.

## Installation

```sh
npm install @takram/three-atmosphere
pnpm add @takram/three-atmosphere
yarn add @takram/three-atmosphere
```

Peer dependencies include `three`, as well as `@react-three/fiber` when using R3F.

```
three @react-three/fiber
```

Please note the peer dependencies differ from the required versions to maintain compatibility with the WebGL codebase. When using `@takram/three-atmosphere/webgpu`, apply the following rules.

```
"three": ">=0.182.0"
```

## Examples

<p align="center">
  <a href="https://takram-design-engineering.github.io/three-geospatial-webgpu/?path=/story/atmosphere-space--space"><img width="32%" src="https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/space.webp" /></a>
  <a href="https://takram-design-engineering.github.io/three-geospatial-webgpu/?path=/story/atmosphere-low-earth-orbit--low-earth-orbit"><img width="32%" src="https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/low-earth-orbit.webp" /></a>
  <a href="https://takram-design-engineering.github.io/three-geospatial-webgpu/?path=/story/atmosphere-cruising-altitude--cruising-altitude"><img width="32%" src="https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/cruising-altitude.webp" /></a>
  <a href="https://takram-design-engineering.github.io/three-geospatial-webgpu/?path=/story/atmosphere-cityscape--cityscape"><img width="32%" src="https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/cityscape.webp" /></a>
  <a href="https://takram-design-engineering.github.io/three-geospatial-webgpu/?path=/story/atmosphere-non-geospatial--non-geospatial"><img width="32%" src="https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/non-geospatial.webp" /></a>
  <a href="https://takram-design-engineering.github.io/three-geospatial-webgpu/?path=/story/atmosphere-sky--moon-surface"><img width="32%" src="https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/moon-surface.webp" /></a>
</p>

## Usage

### Atmospheric lighting

[`AtmosphereLight`](#-atmosphere-light) replaces `SunDirectionalLight` and `SkyLightProbe`, providing physically correct lighting for large-scale scenes while maintaining compatibility with built-in Three.js materials and shadows.

```ts
import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import { context } from 'three/tsl'

declare const renderer: WebGPURenderer
declare const scene: Scene
declare const date: Date

const atmosphereContext = new AtmosphereContext()
renderer.contextNode = context({
  ...renderer.contextNode.value,
  getAtmosphere: () => atmosphereContext
})

getSunDirectionECEF(date, atmosphereContext.sunDirectionECEF.value)

// AtmosphereLightNode must be associated with AtmosphereLight in the
// renderer's node library before use:
renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)

const light = new AtmosphereLight()
scene.add(light)
```

### Aerial perspective

[`AerialPerspectiveNode`](#-aerial-perspective-node) is a post-processing node that renders atmospheric transparency and inscattered light. It takes a color (beauty) buffer and a depth buffer, and also renders the sky for texels whose depth value is 1.

```ts
import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContext
} from '@takram/three-atmosphere/webgpu'
import { context, pass } from 'three/tsl'
import { RenderPipeline } from 'three/webgpu'

declare const camera: Camera
declare const date: Date

const atmosphereContext = new AtmosphereContext()
atmosphereContext.camera = camera
renderer.contextNode = context({
  ...renderer.contextNode.value,
  getAtmosphere: () => atmosphereContext
})

getSunDirectionECEF(date, atmosphereContext.sunDirectionECEF.value)

const passNode = pass(scene, camera, { samples: 0 })
const colorNode = passNode.getTextureNode('output')
const depthNode = passNode.getTextureNode('depth')

const renderPipeline = new RenderPipeline(renderer)
renderPipeline.outputNode = aerialPerspective(colorNode, depthNode)
```

### Sky

[`SkyNode`](#-sky-node) replaces `SkyMaterial` and is also aggregated in `AerialPerspectiveNode`. Despite its name, it renders atmospheric transparency and inscattered light at infinite distance (or clamped to a virtual ground at the ellipsoidal surface), along with the sun, moon, and stars.

```ts
import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  AtmosphereContext,
  skyBackground
} from '@takram/three-atmosphere/webgpu'
import { Scene } from 'three'
import { context } from 'three/tsl'

declare const date: Date

const atmosphereContext = new AtmosphereContext()
renderer.contextNode = context({
  ...renderer.contextNode.value,
  getAtmosphere: () => atmosphereContext
})

const scene = new Scene()
scene.backgroundNode = skyBackground()

// Update the following uniforms in the context:
//   - matrixECIToECEF: For the stars
//   - sunDirectionECEF: For the sun
//   - moonDirectionECEF: For the moon
const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } =
  atmosphereContext
const matrix = getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(matrix)
getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(matrix)
```

### World origin rebasing

World origin rebasing is a common technique for large coordinates like ECEF. Instead of moving the camera, it moves and rotates the world coordinates to reduce loss of floating-point precision.

```ts
import { AtmosphereContext } from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { context } from 'three/tsl'

declare const longitude: number // In degrees
declare const latitude: number // In degrees
declare const height: number // In meters

const atmosphereContext = new AtmosphereContext()
renderer.contextNode = context({
  ...renderer.contextNode.value,
  getAtmosphere: () => atmosphereContext
})

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
  atmosphereContext.matrixWorldToECEF.value
)
```

### Light shafts

Light shafts are produced by subtracting the inscattered light within shadowed segments of camera rays. [`ShadowLengthNode`](#-shadow-length-node) computes the shadow length along the camera ray using epipolar sampling and cascaded shadow maps.

```ts
import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContext,
  shadowLength,
  viewZUnit
} from '@takram/three-atmosphere/webgpu'
import { context, mrt, output, pass } from 'three/tsl'
import { RenderPipeline } from 'three/webgpu'

declare const camera: Camera
declare const date: Date
declare const csmShadowNode: CSMShadowNode

const atmosphereContext = new AtmosphereContext()
atmosphereContext.camera = camera
renderer.contextNode = context({
  ...renderer.contextNode.value,
  getAtmosphere: () => atmosphereContext
})

getSunDirectionECEF(date, atmosphereContext.sunDirectionECEF.value)

const passNode = pass(scene, camera, { samples: 0 }).setMRT(
  mrt({
    output,
    viewZUnit
  })
)
const colorNode = passNode.getTextureNode('output')
const depthNode = passNode.getTextureNode('depth')
const viewZUnitNode = passNode.getTextureNode('viewZUnit')

const renderPipeline = new RenderPipeline(renderer)
const shadowLengthNode = shadowLength(csmShadowNode, viewZUnitNode)
renderPipeline.outputNode = aerialPerspective(
  colorNode,
  depthNode,
  null,
  shadowLengthNode
)
```

## Changes from the WebGL API

- `PrecomputedTexturesGenerator` has been replaced by `AtmosphereLUTNode`.
- `AerialPerspectiveEffect` has been replaced by `AerialPerspectiveNode`.
- `SunDirectionalLight` and `SkyLightProbe` have been replaced by `AtmosphereLight` and `AtmosphereLightNode`.
- `SkyMaterial` has been replaced by `SkyNode` (`skyBackground`), which can be used as `Scene.backgroundNode`.
- `LightingMaskPass` has been removed.
- `StarsMaterial` and `StarsGeometry` have been replaced by `StarsNode`.

# API

- [`AtmosphereContext`](#-atmosphere-context)
- [`AtmosphereLight`](#-atmosphere-light)
- [`AerialPerspectiveNode`](#-aerial-perspective-node)
- [`SkyNode`](#-sky-node)
- [`SkyEnvironmentNode`](#-sky-environment-node)
- [`ShadowLengthNode`](#-shadow-length-node)

**Generators**

- [`viewZUnit`](#-view-z-unit)

**Advanced**

- [`AtmosphereParameters`](#-atmosphere-parameters)
- [`AtmosphereLUTNode`](#-atmosphere-lut-node)
- [`AtmosphereLightNode`](#-atmosphere-light-node)

The following terms refer to class fields:

- **Dependencies** : Class fields of type `Node` that the subject depends on.
- **Parameters** : Class fields whose changes take effect immediately.
- **Uniforms** : Class fields of type `UniformNode`. Changes to their values take effect immediately.
- **Static options** : Class fields whose changes take effect only after calling `setup()`.

<a id='-atmosphere-context'></a>

## AtmosphereContext

This instance aggregates the LUT, uniforms, and static options shared across all atmospheric nodes. A single instance should be added to the renderer's context to ensure consistent rendering.

→ [Source](/packages/atmosphere/src/webgpu/AtmosphereContext.ts)

### Constructor

```ts
class AtmosphereContext {
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
matrixWorldToECEF = uniform('mat4')
```

The matrix for converting world coordinates to ECEF coordinates. Use this matrix to define the reference frame of the scene or, more commonly, to orient the ellipsoid for working near the world space origin and adapting to Three.js's Y-up coordinate system.

It must be orthogonal and consist only of translation and rotation (no scaling).

#### matrixECIToECEF

```ts
matrixECIToECEF = uniform('mat4')
```

The rotation matrix for converting ECI to ECEF coordinates. This matrix is used to orient stars as seen from Earth in `StarsNode`.

#### sunDirectionECEF, moonDirectionECEF

```ts
sunDirectionECEF = uniform('vec3')
moonDirectionECEF = uniform('vec3')
```

The normalized direction to the sun and moon in ECEF coordinates.

#### matrixMoonFixedToECEF

```ts
matrixMoonFixedToECEF = uniform('mat4')
```

The rotation matrix for converting moon-fixed coordinates to ECEF coordinates. This matrix is used to orient the moon's surface as seen from Earth in `MoonNode`.

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

Whether to adjust the atmosphere's inner sphere to osculate (touch and share a tangent with) the ellipsoid at the camera's position.

The atmosphere is approximated as a sphere whose radius lies between the ellipsoid's semi-major and semi-minor axes. The difference can exceed 10,000 meters in the worst case, roughly equal to the cruising altitude of a passenger jet. This option compensates for that difference.

#### constrainCamera

```ts
constrainCamera = true
```

Whether to constrain the camera above the atmosphere's inner sphere.

#### showGround

```ts
showGround = true
```

Disable this option to constrain the camera's ray above the horizon, hiding the virtual ground.

#### raymarchScattering

```ts
raymarchScattering = true
```

Whether to raymarch inscattered light between the camera and scene objects instead of computing it from LUT lookups.

> [!TIP]
> Enabling this option might slightly increase computational cost depending on the device, but in general it is recommended to keep it enabled. Consider disabling it when the render output requires temporal stability, such as when temporal antialiasing cannot be used, because raymarching uses STBN which introduces temporal noise to reduce aliasing along the rays.

<a id='-atmosphere-light'></a>

## AtmosphereLight

Represents direct and indirect sunlight. Unlike `SunDirectionalLight` and `SkyLightProbe` in the previous implementation, lighting is correct at large scale regardless of the materials used on surfaces.

Add it along with [`AtmosphereLightNode`](#-atmosphere-light-node) to the renderer's node library before use:

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
class AtmosphereLight extends DirectionalLight {
  constructor(distance?: number)
}
```

### Parameters

#### distance

```ts
distance = 1
```

The distance from `DirectionalLight.target` to the light's position. Adjust the target and this value when shadows are enabled so that the shadow camera covers the objects that should cast shadows.

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

<a id='-aerial-perspective-node'></a>

## AerialPerspectiveNode

A post-processing node that renders atmospheric transparency and inscattered light. It can optionally apply post-process lighting.

→ [Source](/packages/atmosphere/src/webgpu/AerialPerspectiveNode.ts)

### Constructor

```ts
const aerialPerspective: (
  colorNode: Node,
  depthNode: Node,
  normalNode?: Node | null,
  shadowLengthNode?: Node | null
) => AerialPerspectiveNode
```

### Dependencies

#### colorNode

```ts
colorNode: Node
```

A node representing the scene pass or diffuse color.

#### depthNode

```ts
depthNode: Node
```

A node representing the scene's depth.

#### normalNode

```ts
normalNode?: Node | null
```

A node representing the scene's normal. It is only used for post-process lighting and is not required when `lighting` is disabled.

#### skyNode

```ts
skyNode?: Node | null
```

A node representing the radiance of celestial sources and atmospheric scattering as seen from the camera at the far depth (where the depth value equals 1).

#### shadowLengthNode

```ts
shadowLengthNode?: Node | null
```

A node representing the shadow length along camera rays. The x component stores the total shadow length, and the y component stores the distance from the camera to the first shadow segment.

> [!NOTE]
> This formulation assumes a single continuous shadow segment along the camera ray.

### Static options

#### correctGeometricError

```ts
correctGeometricError = true
```

This option corrects lighting artifacts caused by geometric errors in surface tiles.

When `lighting` is enabled, surface normals are gradually morphed toward those of a true sphere. Disable this option if your scene contains objects that penetrate the atmosphere or are located in space.

#### lighting

```ts
lighting = false
```

Whether to apply direct and indirect irradiance as post-process lighting. This option requires `normalNode` to be set when enabled.

#### transmittance, inscattering

```ts
transmittance = true
inscattering = true
```

Whether to account for atmospheric transmittance and inscattered light.

Enabling one without the other is physically incorrect and should only be used for debugging.

<a id='-sky-node'></a>

## SkyNode

A node for rendering the sky. It provides 2 constructor functions for different types of view direction mapping.

- `sky`: Uses the camera's view direction. Used in post-processing.
- `skyBackground`: Interprets the material's UV as equirectangular. Used when assigning the scene's background.

```ts
import { skyBackground } from '@takram/three-atmosphere/webgpu'
import { Scene } from 'three'

const scene = new Scene()
scene.backgroundNode = skyBackground()
```

→ [Source](/packages/atmosphere/src/webgpu/SkyNode.ts)

### Constructor

<!-- prettier-ignore -->
```ts
const sky: (shadowLengthNode?: Node | null) => SkyNode
const skyBackground: (shadowLengthNode?: Node | null) => SkyNode
```

### Dependencies

#### shadowLengthNode

```ts
shadowLengthNode?: Node | null
```

A node representing the shadow length along camera rays. The x component stores the total shadow length, and the y component stores the distance from the camera to the first shadow segment.

> [!NOTE]
> This formulation assumes a single continuous shadow segment along the camera ray.

#### sunNode

```ts
sunNode: SunNode
```

A node representing the sun.

#### moonNode

```ts
moonNode: MoonNode
```

A node representing the moon.

#### starsNode

```ts
starsNode: StarsNode
```

A node representing stars.

### Uniforms

#### sunNode.angularRadius

```ts
sunNode.angularRadius = uniform(0.004675) // ≈ 16 arcminutes
```

The angular radius of the sun in radians.

#### sunNode.intensity

```ts
sunNode.intensity = uniform(1)
```

A scaling factor for the brightness of the sun.

#### moonNode.angularRadius

```ts
moonNode.angularRadius = uniform(0.0045) // ≈ 15.5 arcminutes
```

The angular radius of the moon in radians.

#### moonNode.intensity

```ts
moonNode.intensity = uniform(1)
```

A scaling factor for the brightness of the moon.

#### starsNode.pointSize

```ts
starsNode.pointSize = uniform(1)
```

The apparent size of the stars, in pixels.

#### starsNode.intensity

```ts
starsNode.intensity = uniform(1000)
```

A scaling factor for the brightness of the stars.

> [!NOTE]
> The default value of 1000 is far too bright from a physical standpoint. Without it, stars would be completely invisible, which is physically correct but useless in most scenes.
> Set this value to 1 when physically correct star luminance is needed, as in the [Art002E000192 story](https://takram-design-engineering.github.io/three-geospatial-webgpu/?path=/story/atmosphere-space--art-002-e-000192).

### Static options

#### showSun

```ts
showSun = true
```

Whether to display the sun.

#### showMoon

```ts
showMoon = true
```

Whether to display the moon.

#### showStars

```ts
showStars = true
```

Whether to display the stars.

<a id='-sky-environment-node'></a>

## SkyEnvironmentNode

Generates a PMREM texture node for the sky.

```ts
import { skyEnvironment } from '@takram/three-atmosphere/webgpu'
import { Scene } from 'three'

const scene = new Scene()
scene.environmentNode = skyEnvironment()
```

→ [Source](/packages/atmosphere/src/webgpu/SkyEnvironmentNode.ts)

### Constructor

```ts
const skyEnvironment: (size?: number) => SkyEnvironmentNode
```

### Dependencies

#### skyNode

```ts
skyNode: SkyNode
```

A node representing the radiance of celestial sources and atmospheric scattering as seen from the camera.

### Parameters

#### distanceThreshold

```ts
distanceThreshold: 1000
```

The distance in meters the camera must move before the PMREM is updated.

#### angularThreshold

```ts
angularThreshold: radians(0.1)
```

The angle in radians the sun direction must change before the PMREM is updated.

<a id='-view-z-unit'></a>

## viewZUnit

```ts
const viewZUnit: Node<'float'>
```

The view Z for the current fragment depth, scaled by `worldToUnit`. This is used as an MRT output to produce the `viewZUnitNode` texture required by [`ShadowLengthNode`](#-shadow-length-node).

→ [Source](/packages/atmosphere/src/webgpu/accessors.ts)

```ts
import { viewZUnit } from '@takram/three-atmosphere/webgpu'
import { mrt, output, pass } from 'three/tsl'

const passNode = pass(scene, camera).setMRT(mrt({ output, viewZUnit }))
```

<a id='-shadow-length-node'></a>

## ShadowLengthNode

Computes the shadow length along camera rays using epipolar sampling combined with cascaded shadow maps. The output is a `vec2` where the x component is the total shadow length and the y component is the distance from the camera to the first shadow segment.

The implementation is based on Intel's [Outdoor Light Scattering](https://github.com/GameTechDev/OutdoorLightScattering).

→ [Source](/packages/atmosphere/src/webgpu/ShadowLengthNode.ts)

### Constructor

```ts
const shadowLength: (
  csmShadowNode: CascadedShadowMapsNode,
  viewZUnitNode: TextureNode
) => ShadowLengthNode
```

### Dependencies

#### csmShadowNode

```ts
csmShadowNode: CascadedShadowMapsNode
```

The cascaded shadow maps node.

#### viewZUnitNode

```ts
viewZUnitNode: TextureNode
```

A texture containing the view Z scaled by `worldToUnit`. This can be produced by writing [`viewZUnit`](#-view-z-unit) to MRT output.

### Parameters

#### resolutionScale

```ts
resolutionScale = 1
```

A scale factor applied to the internal render resolution.

#### autoSampleResolution

```ts
autoSampleResolution = true
```

Whether to automatically adjust `epipolarSliceCount` and `maxSliceSampleCount` based on the screen size.

### Uniforms

#### epipolarSliceCount

```ts
epipolarSliceCount = uniform(512)
```

The number of epipolar slices. For best results, use at least half the maximum screen dimension. Ignored when `autoSampleResolution` is enabled.

#### maxSliceSampleCount

```ts
maxSliceSampleCount = uniform(256)
```

The maximum number of samples per epipolar slice. For best results, use at least half the maximum screen dimension. Ignored when `autoSampleResolution` is enabled.

#### firstCascade

```ts
firstCascade = uniform(0)
```

The index of the first cascade used for shadow raymarching.

<a id='-atmosphere-parameters'></a>

## AtmosphereParameters

A class that encapsulates the parameters and static options for the atmospheric model based on [Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/).

```ts
import {
  AtmosphereContext,
  AtmosphereParameters
} from '@takram/three-atmosphere/webgpu'

const parameters = new AtmosphereParameters()
const atmosphereContext = new AtmosphereContext(parameters)
```

→ [Source](/packages/atmosphere/src/webgpu/AtmosphereParameters.ts)

### Static options

#### worldToUnit

```ts
worldToUnit = 0.001
```

A dimensionless scaling factor for converting meters to the internal length unit (defaults to km) to reduce loss of floating-point precision during internal calculations.

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

The sun's angular radius in radians.

#### bottomRadius

```ts
bottomRadius = 6360000
```

The distance in meters between the planet center and the bottom of the atmosphere.

#### topRadius

```ts
topRadius = 6420000
```

The distance in meters between the planet center and the top of the atmosphere.

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

#### minCosLight

```ts
minCosLight = Math.cos(radians(120))
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

A dimensionless scaling factor that brings true luminance values into a numerically stable range. This helps prevent noticeable precision loss in half-float buffers.

#### combinedScatteringTextures

```ts
combinedScatteringTextures = true
```

Whether to store the single Mie scattering in the alpha channel of the scattering texture, which reduces the GPU memory footprint. Disabling this option improves the color of the Mie scattering, especially when the sun is near the horizon.

#### higherOrderScatteringTexture

```ts
higherOrderScatteringTexture = true
```

Whether to generate and use a separate texture for higher-order scattering (n >= 2) for better approximation of multi-scattering occlusion.

<a id='-atmosphere-lut-node'></a>

## AtmosphereLUTNode

A node that generates and stores the LUT textures required for rendering the atmosphere.

→ [Source](/packages/atmosphere/src/webgpu/AtmosphereLUTNode.ts)

### Constructor

```ts
class AtmosphereLUTNode extends Node {
  constructor(parameters?: AtmosphereParameters, textureType?: AnyFloatType)
}
```

### Methods

#### getTextureNode

```ts
type AtmosphereLUTTextureName =
  | 'transmittance'
  | 'multipleScattering'
  | 'irradiance'
type AtmosphereLUTTexture3DName =
  | 'scattering'
  | 'singleMieScattering'
  | 'higherOrderScattering'

getTextureNode: (name: AtmosphereLUTTextureName) => TextureNode
getTextureNode: (name: AtmosphereLUTTexture3DName) => Texture3DNode
```

<a id='-atmosphere-light-node'></a>

## AtmosphereLightNode

Represents direct and indirect sunlight as a node.

Add it along with [`AtmosphereLight`](#-atmosphere-light) to the renderer's node library before use:

```ts
import {
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'

renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
```

→ [Source](/packages/atmosphere/src/webgpu/AtmosphereLightNode.ts)

### Constructor

```ts
class AtmosphereLightNode extends AnalyticLightNode<AtmosphereLight> {
  constructor(light?: AtmosphereLight | null)
}
```

# Acknowledgement

- [Bruneton's paper](https://inria.hal.science/inria-00288758/en) and [his reference implementation](https://github.com/ebruneton/precomputed_atmospheric_scattering).
- [Hillaire's paper](https://sebh.github.io/publications/egsr2020.pdf) and [his reference implementation](https://github.com/sebh/UnrealEngineSkyAtmosphere).
- [Intel's implementation](https://github.com/GameTechDev/OutdoorLightScattering) of epipolar sampling and the [documentation](https://www.intel.com/content/dam/develop/external/us/en/documents/outdoor-light-scattering-update.pdf).
- [Yale Bright Star Catalog version 5](http://tdc-www.harvard.edu/catalogs/bsc5.html) for the celestial dataset.

Additional context and related work:

- [Physically Based Real-Time Rendering of Atmospheres using Mie Theory](https://diglib.eg.org/items/1fb6b85a-b3f8-4817-975f-f65634020f03)
- [Epipolar Sampling for Shadows and Crepuscular Rays in Participating Media with Single Scattering](https://faculty.digipen.edu/~gherron/references/References/LightEffects/VolumetricLighting/espmss10.pdf)

# License

[MIT](LICENSE), except where indicated otherwise.
