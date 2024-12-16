# @takram/three-atmosphere

[![npm version](https://img.shields.io/npm/v/@takram/three-atmosphere.svg?style=flat-square)](https://www.npmjs.com/package/@takram/three-atmosphere) [![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial/?path=/story/atmosphere-atmosphere--basic)

A Three.js and R3F (React Three Fiber) implementation of Eric Bruneton’s [Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/).

This library is part of a project to prototype the rendering aspect of a Web GIS engine. For more details on the background and current status of this project, please refer to the [main README](/README.md).

## Installation

```sh
npm install @takram/three-atmosphere
pnpm add @takram/three-atmosphere
yarn add @takram/three-atmosphere
```

## Synopsis

### Deferred lighting

Suitable for large-scale scenes, but supports only Lambertian BRDF.

```tsx
import { useLoader } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'
import {
  AerialPerspective,
  Atmosphere,
  Sky
} from '@takram/three-atmosphere/r3f'

const Scene = () => {
  const precomputedTextures = useLoader(PrecomputedTexturesLoader, '/assets')
  return (
    <Atmosphere
      textures={precomputedTextures}
      date={/* Date object or timestamp */}
    >
      <Sky />
      <EffectComposer enableNormalPass>
        <AerialPerspective skyIrradiance sunIrradiance />
      </EffectComposer>
    </Atmosphere>
  )
}
```

![Example of deferred lighting](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/manhattan.jpg)
[Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/atmosphere-photorealistic-tiles--manhattan) (Requires [Google Maps API key](https://developers.google.com/maps/documentation/tile/get-api-key) to display the scene.)

![Example of deferred lighting](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/fuji.jpg)
[Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/atmosphere-photorealistic-tiles--fuji) (Requires [Google Maps API key](https://developers.google.com/maps/documentation/tile/get-api-key) to display the scene.)

### Forward lighting

Compatible with built-in Three.js materials and shadows, but both direct and indirect irradiance are approximated only for small-scale scenes.

```tsx
import { useLoader } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'
import {
  AerialPerspective,
  Atmosphere,
  Sky,
  SkyLight,
  SunLight
} from '@takram/three-atmosphere/r3f'

const Scene = () => {
  const precomputedTextures = useLoader(PrecomputedTexturesLoader, '/assets')
  return (
    <Atmosphere
      textures={precomputedTextures}
      date={/* Date object or timestamp */}
    >
      <Sky />
      <group position={/* ECEF coordinate in meters */}>
        <SkyLight />
        <SunLight />
      </group>
      <EffectComposer>
        <AerialPerspective />
      </EffectComposer>
    </Atmosphere>
  )
}
```

![Example of forward lighting](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/forward.jpg)
[Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/atmosphere-atmosphere--vanilla)

### Transient update by date

```tsx
import { useFrame } from '@react-three/fiber'
import {
  Atmosphere,
  Sky,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { useRef } from 'react'

const Scene = () => {
  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.updateByDate(new Date())
  })
  return (
    <Atmosphere ref={atmosphereRef}>
      <Sky />
      ...
    </Atmosphere>
  )
}
```

### Non-suspending texture loading

```tsx
const Scene = () => (
  // Provide a url instead of textures to load them asynchronously.
  <Atmosphere textures='/assets'>
    <Sky />
    <EffectComposer>
      <AerialPerspective />
    </EffectComposer>
  </Atmosphere>
)
```

### Vanilla Three.js

See the [story](/storybook/src/atmosphere/Atmosphere-Vanilla.tsx) for complete example.

```ts
const position = new Vector3(/* ECEF coordinate in meters */)

// SkyMaterial disables projection. Provide a plane that covers clip space.
const skyMaterial = new SkyMaterial()
const sky = new Mesh(new PlaneGeometry(2, 2), skyMaterial)
sky.frustumCulled = false
sky.position.copy(position)
scene.add(sky)

// SkyLightProbe computes sky irradiance of its position.
const skyLight = new SkyLightProbe()
skyLight.position.copy(position)
scene.add(skyLight)

// SunDirectionalLight computes sunlight transmittance to its target position.
const sunLight = new SunDirectionalLight()
sunLight.target.position.copy(position)
scene.add(sunLight)
scene.add(sunLight.target)

// Demonstrates forward lighting here. For deferred lighting, set sunIrradiance
// and skyIrradiance to true, remove SkyLightProbe and SunDirectionalLight, and
// provide a normal buffer to AerialPerspectiveEffect.
const aerialPerspective = new AerialPerspectiveEffect(camera)

// Use floating-point render buffer, as radiance/luminance is stored here.
const composer = new EffectComposer(renderer, {
  frameBufferType: HalfFloatType
})
composer.addPass(new RenderPass(scene, camera))
composer.addPass(
  new EffectPass(
    camera,
    aerialPerspective,
    new ToneMappingEffect({ mode: ToneMappingMode.AGX })
  )
)

// PrecomputedTexturesLoader defaults to loading single-precision float
// textures. Check for OES_texture_float_linear and load the appropriate one.
const texturesLoader = new PrecomputedTexturesLoader()
texturesLoader.useHalfFloat =
  renderer.getContext().getExtension('OES_texture_float_linear') == null
texturesLoader.load('/assets', textures => {
  Object.assign(skyMaterial, textures)
  skyMaterial.useHalfFloat = texturesLoader.useHalfFloat
  sunLight.transmittanceTexture = textures.transmittanceTexture
  skyLight.irradianceTexture = textures.irradianceTexture
  Object.assign(aerialPerspective, textures)
  aerialPerspective.useHalfFloat = texturesLoader.useHalfFloat
})

const sunDirection = new Vector3()
const moonDirection = new Vector3()

function render(): void {
  // Suppose `date` is updated elsewhere.
  getSunDirectionECEF(date, sunDirection)
  getMoonDirectionECEF(date, moonDirection)

  skyMaterial.sunDirection.copy(sunDirection)
  skyMaterial.moonDirection.copy(moonDirection)
  sunLight.sunDirection.copy(sunDirection)
  skyLight.sunDirection.copy(sunDirection)
  aerialPerspective.sunDirection.copy(sunDirection)

  sunLight.update()
  skyLight.update()
  composer.render()
}
```

## Limitations

- The reference frame is fixed to ECEF and cannot be configured, [#11](https://github.com/takram-design-engineering/three-geospatial/issues/11).

- The viewpoint is restricted to positions above the atmosphere’s inner sphere. It doesn’t render correctly underground, [#5](https://github.com/takram-design-engineering/three-geospatial/issues/5).

- The aerial perspective (specifically the inscatter term) includes a [workaround for the horizon artifact](https://github.com/ebruneton/precomputed_atmospheric_scattering/pull/32#issuecomment-480523982), but due to finite floating-point precision, this artifact cannot be removed completely.

- Volumetric light shaft is not implemented as it requires ray tracing. You may notice scattered light is not occluded by scene objects.

- Although you can generate custom precomputed textures, the implementation is effectively limited to Earth’s atmosphere. For rendering atmospheres of other planets, consider implementing Sébastien Hillaire’s [A Scalable and Production Ready Sky and Atmosphere Rendering Technique](https://sebh.github.io/publications/egsr2020.pdf).

- Currently developed using GLSL. The node-based TSL is not used yet but is planned.

# API

**R3F components**

- [`Atmosphere`](#atmosphere)
- [`Sky`](#sky)
- [`Stars`](#stars)
- [`SkyLight`](#skylight)
- [`SunLight`](#sunlight)
- [`AerialPerspective`](#aerialperspective)

**Three.js**

- [`AtmosphereMaterialBase`](#atmospherematerialbase)
- [`SkyMaterial`](#skymaterial)
- [`StarsMaterial`](#starsmaterial)
- [`SkyLightProbe`](#skylightprobe)
- [`SunDirectionalLight`](#sundirectionallight)
- [`AerialPerspectiveEffect`](#aerialperspectiveeffect)

**Functions**

- [`getSunDirectionECEF`](#getsundirectionecef-getmoondirectionecef)
- [`getMoonDirectionECEF`](#getsundirectionecef-getmoondirectionecef)
- [`getECIToECEFRotationMatrix`](#getecitoecefrotationmatrix)
- [`getSunLightColor`](#getsunlightcolor)

## Atmosphere

Provides and synchronizes props of atmosphere components. It’s the recommended way to configure components unless you need finer control over properties of individual components.

[Source](/packages/atmosphere/src/r3f/Atmosphere.tsx)

```tsx
import { useFrame } from '@react-three/fiber'
import {
  Atmosphere,
  Sky,
  useAtmosphereTextureProps,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { useRef } from 'react'

const Scene = () => {
  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    // Computes sun direction, moon direction and ECI to ECEF rotation
    // matrix by the date, then propagates them to descendant components via
    // context.
    atmosphereRef.current?.updateByDate(new Date())
  })

  // The choice of precomputed textures depends on whether single-precision
  // float or half-float textures are supported. Some devices don't support
  // single-precision textures, so this hook fallbacks to half-float textures
  // when necessary.
  const textureProps = useAtmosphereTextureProps('/assets')
  return (
    <Atmosphere ref={atmosphereRef} {...textureProps}>
      <Sky />
      ...
    </Atmosphere>
  )
}
```

### Props

#### textures

```ts
textures: PrecomputedTextures | string = undefined
```

The [precomputed textures](assets), or a URL to the directory containing them.

#### useHalfFloat

```ts
useHalfFloat: boolean = false
```

Whether the internal format of the textures is half-float.

#### ellipsoid

```ts
ellipsoid: Ellipsoid = Ellipsoid.WGS84
```

The ellipsoid model representing Earth.

#### correctAltitude

```ts
correctAltitude: boolean = true
```

Whether to adjust the atmosphere’s inner sphere to osculate (touch and share a tangent with) the ellipsoid.

The atmosphere is approximated as a sphere, with a radius between the ellipsoid’s major and minor axes. The difference can exceed 10,000 meters in worst cases, roughly equal to the cruising altitude of a passenger jet. This option compensates for this difference.

An example at an altitude of 2,000 meters and a latitude of 35°:

<!-- prettier-ignore -->
| `correctAltitude = false` | `correctAltitude = true` |
| :-: | :-: |
| ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/altitude-correction-false.jpg) | ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/altitude-correction-true.jpg) |

#### photometric

```ts
photometric: boolean = true
```

Whether to store luminance instead of radiance in render buffers.

<!-- prettier-ignore -->
| `photometric = false` | `photometric = true` |
| :-: | :-: |
| ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/photometric-false.jpg) | ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/photometric-true.jpg) |

#### date

```ts
date: number | Date = undefined
```

Specifies the date used to obtain the directions of the sun, moon, and ECI to ECEF rotation matrix.

The behavior when used together with the `updateByDate` function is not defined.

### Ref

#### updateByDate

```ts
function updateByDate(date: number | Date): void
```

Updates the directions of the sun, moon, and the ECI to ECEF rotation matrix for the specified date. Use this function via the `ref` instead of the `date` prop if you want to update it smoothly.

The behavior when used together with the `date` prop is not defined.

## Sky

Displays the sky in a screen quad.

See [`SkyMaterial`](#skymaterial) for further details.

[Source](/packages/atmosphere/src/r3f/Sky.tsx)

```tsx
import { useLoader } from '@react-three/fiber'
import {
  getMoonDirectionECEF,
  getSunDirectionECEF,
  PrecomputedTexturesLoader
} from '@takram/three-atmosphere'
import { Sky } from '@takram/three-atmosphere/r3f'

const sunDirection = getSunDirectionECEF(/* date */)
const moonDirection = getMoonDirectionECEF(/* date */)

const Scene = () => {
  const precomputedTextures = useLoader(PrecomputedTexturesLoader, '/assets')
  return (
    <Sky
      {...precomputedTextures}
      sunDirection={sunDirection}
      moonDirection={moonDirection}
    />
  )
}
```

### Props

The parameters of [`AtmosphereMaterialBase`](#atmospherematerialbase) and [`SkyMaterial`](#skymaterial) are exposed as props.

## Stars

Represents the brightest stars as points at an infinite distance.

See [`StarsMaterial`](#starsmaterial) for further details.

[Source](/packages/atmosphere/src/r3f/Stars.tsx)

```tsx
import { useLoader } from '@react-three/fiber'
import {
  getECIToECEFRotationMatrix,
  getSunDirectionECEF,
  PrecomputedTexturesLoader
} from '@takram/three-atmosphere'
import { Stars } from '@takram/three-atmosphere/r3f'
import { ArrayBufferLoader } from '@takram/three-geospatial'

const sunDirection = getSunDirectionECEF(/* date */)
const rotationMatrix = getECIToECEFRotationMatrix(/* date */)

const Scene = () => {
  const precomputedTextures = useLoader(PrecomputedTexturesLoader, '/assets')
  const starsData = useLoader(ArrayBufferLoader, '/assets/stars.bin')
  return (
    <Stars
      {...precomputedTextures}
      data={starsData}
      sunDirection={sunDirection}
      matrix={rotationMatrix}
    />
  )
}
```

### Props

The parameters of [`AtmosphereMaterialBase`](#atmospherematerialbase) and [`StarsMaterial`](#starsmaterial) are also exposed as props.

#### data

```ts
data: ArrayBuffer | string = undefined
```

The data containing the position and magnitude of the stars, or a URL to it.

## SkyLight

A light probe for indirect sky irradiance.

See [`SkyLightProbe`](#skylightprobe) for further details.

[Source](/packages/atmosphere/src/r3f/SkyLight.tsx)

```tsx
import { useLoader } from '@react-three/fiber'
import { getSunDirectionECEF } from '@takram/three-atmosphere'
import { SkyLight } from '@takram/three-atmosphere/r3f'
import { Float32Data2DLoader } from '@takram/three-geospatial'
import { Vector3 } from 'three'

const position = new Vector3(/* ECEF coordinate in meters */)
const sunDirection = getSunDirectionECEF(/* date */)

const Scene = () => {
  const irradianceTexture = useLoader(
    Float32Data2DLoader,
    '/assets/irradiance.bin'
  )
  return (
    <SkyLight
      irradianceTexture={irradianceTexture}
      position={position}
      sunDirection={sunDirection}
    />
  )
}
```

### Props

The parameters of [`SkyLightProbe`](#skylightprobe) are exposed as props.

## SunLight

A directional light representing the sun.

See [`SunDirectionalLight`](#directionalsunlight) for further details.

[Source](/packages/atmosphere/src/r3f/SunLight.tsx)

```tsx
import { useLoader } from '@react-three/fiber'
import { getSunDirectionECEF } from '@takram/three-atmosphere'
import { SunLight } from '@takram/three-atmosphere/r3f'
import { Float32Data2DLoader } from '@takram/three-geospatial'
import { Vector3 } from 'three'

const position = new Vector3(/* ECEF coordinate in meters */)
const sunDirection = getSunDirectionECEF(/* date */)

const Scene = () => {
  const transmittanceTexture = useLoader(
    Float32Data2DLoader,
    '/assets/transmittance.bin'
  )
  return (
    <SunLight
      transmittanceTexture={transmittanceTexture}
      position={position}
      sunDirection={sunDirection}
    />
  )
}
```

### Props

The parameters of [`SunDirectionalLight`](#directionalsunlight) are exposed as props.

## AerialPerspective

A post-processing effect that renders atmospheric transparency and inscattered light.

See [`AerialPerspectiveEffect`](#aerialperspectiveeffect) for further details.

[Source](/packages/atmosphere/src/r3f/AerialPerspective.tsx)

```tsx
import { useLoader } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import {
  getSunDirectionECEF,
  PrecomputedTexturesLoader
} from '@takram/three-atmosphere'
import { AerialPerspective } from '@takram/three-atmosphere/r3f'
import { Vector3 } from 'three'

const sunDirection = getSunDirectionECEF(/* date */)

const Scene = () => {
  const precomputedTextures = useLoader(PrecomputedTexturesLoader, '/assets')
  return (
    <EffectComposer>
      <AerialPerspective {...precomputedTextures} sunDirection={sunDirection} />
    </EffectComposer>
  )
}
```

### Props

The parameters of [`AerialPerspectiveEffect`](#aerialperspectiveeffect) are exposed as props.

## AtmosphereMaterialBase

The base class of [`SkyMaterial`](#skymaterial) and [`StarsMaterial`](#starsmaterial).

[Source](/packages/atmosphere/src/AtmosphereMaterialBase.ts)

### Parameters

#### irradianceTexture, scatteringTexture, transmittanceTexture

```ts
irradianceTexture: DataTexture | null = null
scatteringTexture: Data3DTexture | null = null
transmittanceTexture: DataTexture | null = null
```

The [precomputed textures](assets).

#### useHalfFloat

```ts
useHalfFloat: boolean = false
```

See [useHalfFloat](#usehalffloat).

#### ellipsoid

```ts
ellipsoid: Ellipsoid = Ellipsoid.WGS84
```

See [ellipsoid](#ellipsoid).

#### correctAltitude

```ts
correctAltitude: boolean = true
```

See [correctAltitude](#correctaltitude).

#### photometric

```ts
photometric: boolean = true
```

See [photometric](#photometric).

#### sunDirection

```ts
sunDirection: Vector3 = new Vector3()
```

The normalized direction to the sun in ECEF coordinates.

#### sunAngularRadius

```ts
sunAngularRadius: number = 0.004675
```

The angular radius of the sun, in radians.

Increase this value if the sun flickers in a low-resolution environment map. Modifying this value does not affect the sky’s total radiance unless the sun is partially visible.

<!-- prettier-ignore -->
| `sunAngularRadius = 0.004675` | `sunAngularRadius = 0.1` |
| :-: | :-: |
| ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/sun-angular-radius-default.jpg) | ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/sun-angular-radius-01.jpg) |

## SkyMaterial

A material for displaying the sky. Apply this to a screen quad.

Despite its name, this material renders the atmosphere itself, along with the sun and moon. When viewed from within the atmosphere, it appears as the sky. From space, it represents Earth’s atmosphere with a flat ground.

[Source](/packages/atmosphere/src/SkyMaterial.ts)

```ts
const material = new SkyMaterial()
getSunDirectionECEF(/* date */, material.sunDirection)
const sky = new Mesh(new PlaneGeometry(2, 2), material)
sky.frustumCulled = false
scene.add(sky)
```

### Parameters

Extends [`AtmosphereMaterialBase`](#atmospherematerialbase).

#### sun, moon

```ts
sun: boolean = true
moon: boolean = true
```

Whether to display the sun and moon.

#### moonDirection

```ts
moonDirection: Vector3 = new Vector()
```

The normalized direction to the moon in ECEF coordinates.

#### moonAngularRadius

```ts
moonAngularRadius: number = 0.0045
```

The angular radius of the moon, in radians.

#### lunarRadianceScale

```ts
lunarRadianceScale: number = 1
```

A scaling factor to adjust the brightness of the moon.

<!-- prettier-ignore -->
| `lunarRadianceScale = 1` | `lunarRadianceScale = 5` |
| :-: | :-: |
| ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/lunar-radiance-scale-1.jpg) | ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/lunar-radiance-scale-5.jpg) |

## StarsMaterial

Represents the brightest stars as points at an infinite distance.

The provided data ([stars.bin](/packages/atmosphere/assets/stars.bin)) contains the J2000 ECI directions, magnitudes and black body chromaticities of the 9,096 stars listed in [Yale Bright Star Catalog version 5](http://tdc-www.harvard.edu/catalogs/bsc5.html).

[Source](/packages/atmosphere/src/StarsMaterial.ts)

```ts
const data: ArrayBuffer = /* Load stars.bin */
const material = new StarsMaterial({
  irradianceTexture,
  scatteringTexture,
  transmittanceTexture
})
getSunDirectionECEF(/* date */, material.sunDirection)
const stars = new Points(new StarsGeometry(data), material)
stars.setRotationFromMatrix(getECIToECEFRotationMatrix(/* date */))
scene.add(stars)
```

### Parameters

Extends [`AtmosphereMaterialBase`](#atmospherematerialbase).

#### pointSize

```ts
pointSize: number = 1
```

The size of each star, in points.

#### radianceScale

```ts
radianceScale: number = 1
```

A scaling factor to adjust the brightness of the stars.

#### background

```ts
background: boolean = true
```

Whether to display the stars at an infinite distance, otherwise, they appear on a unit sphere.

## SkyLightProbe

A light probe for indirect sky irradiance.

It calculates spherical harmonics of sky irradiance at its position by sampling the precomputed irradiance texture on the CPU.

[Source](/packages/atmosphere/src/SkyLightProbe.ts)

```ts
const skyLight = new SkyLightProbe({ irradianceTexture })
skyLight.position.set(/* ECEF coordinate in meters */)
getSunDirectionECEF(/* date */, skyLight.sunDirection)
scene.add(skyLight)

skyLight.update()
```

### Parameters

Extends [`LightProbe`](https://threejs.org/docs/?q=lightprobe#api/en/lights/LightProbe)

#### irradianceTexture

```ts
irradianceTexture: DataTexture | null = null
```

The [precomputed irradiance texture](assets).

#### ellipsoid

```ts
ellipsoid: Ellipsoid = Ellipsoid.WGS84
```

See [ellipsoid](#ellipsoid).

#### correctAltitude

```ts
correctAltitude: boolean = true
```

See [correctAltitude](#correctaltitude)

#### photometric

```ts
photometric: boolean = true
```

See [photometric](#photometric).

#### sunDirection

```ts
sunDirection: Vector3 = new Vector3()
```

See [sunDirection](#sundirection).

## SunDirectionalLight

A directional light representing the sun.

It calculates the sun’s radiance by sampling the precomputed transmittance texture on the CPU.

[Source](/packages/atmosphere/src/SunDirectionalLight.ts)

```ts
const sunLight = new SunDirectionalLight({ transmittanceTexture })
sunLight.target.position.set(/* ECEF coordinate in meters */)
getSunDirectionECEF(/* date */, sunLight.sunDirection)
scene.add(sunLight)
scene.add(sunLight.target)

sunLight.update()
```

### Parameters

Extends [`DirectionalLight`](https://threejs.org/docs/?q=DirectionalLight#api/en/lights/DirectionalLight)

#### transmittanceTexture

```ts
transmittanceTexture: DataTexture | null = null
```

The [precomputed transmittance texture](assets).

#### ellipsoid

```ts
ellipsoid: Ellipsoid = Ellipsoid.WGS84
```

See [ellipsoid](#ellipsoid).

#### correctAltitude

```ts
correctAltitude: boolean = true
```

See [correctAltitude](#correctaltitude)

#### photometric

```ts
photometric: boolean = true
```

See [photometric](#photometric).

#### sunDirection

```ts
sunDirection: Vector3 = new Vector3()
```

See [sunDirection](#sundirection).

Note it's the direction to the sun, not that of light.

#### distance

```ts
distance: number = 1
```

The distance from the target. Adjust this value if shadows are enabled for the light, as it may need to cover the entire scene.

## AerialPerspectiveEffect

A post-processing effect that renders atmospheric transparency and inscattered light. It can optionally render sun and sky irradiance as deferred lighting.

This is for use with the [`postprocessing`](https://github.com/pmndrs/postprocessing)’s `EffectComposer` and is not compatible with the one in Three.js examples.

[Source](/packages/atmosphere/src/AerialPerspectiveEffect.ts)

```ts
const aerialPerspective = new AerialPerspectiveEffect(camera, {
  irradianceTexture,
  scatteringTexture,
  transmittanceTexture
})
getSunDirectionECEF(/* date */, aerialPerspective.sunDirection)

const composer = new EffectComposer(renderer, {
  frameBufferType: HalfFloatType
})
composer.addPass(new RenderPass(scene, camera))
composer.addPass(
  new EffectPass(
    camera,
    aerialPerspective,
    new ToneMappingEffect({ mode: ToneMappingMode.AGX })
  )
)
```

### Parameters

Extends [`postprocessing`](https://github.com/pmndrs/postprocessing)’s [`Effect`](https://pmndrs.github.io/postprocessing/public/docs/class/src/effects/Effect.js~Effect.html).

#### normalBuffer

```ts
normalBuffer: Texture | null = null
```

The normal buffer used for deferred lighting. It is not required if both `sunIrradiance` and `skyIrradiance` are disabled.

`EffectComposer`’s default normal buffer lacks sufficient precision, causing banding in shaded areas. Using a floating-point normal buffer resolves this issue.

#### octEncodedNormal

```ts
octEncodedNormal: boolean = false
```

Indicates that the normal is oct-encoded and stored in the first two elements of the normal buffer texels.

#### reconstructNormal

```ts
reconstructNormal: boolean = false
```

Whether to reconstruct normals from depth buffer.

#### irradianceTexture, scatteringTexture, transmittanceTexture

```ts
irradianceTexture: DataTexture | null = null
scatteringTexture: Data3DTexture | null = null
transmittanceTexture: DataTexture | null = null
```

The [precomputed textures](assets).

#### useHalfFloat

```ts
useHalfFloat: boolean = false
```

See [useHalfFloat](#usehalffloat).

#### ellipsoid

```ts
ellipsoid: Ellipsoid = Ellipsoid.WGS84
```

See [ellipsoid](#ellipsoid).

#### correctAltitude

```ts
correctAltitude: boolean = true
```

See [correctAltitude](#correctaltitude)

#### correctGeometricError

```ts
correctGeometricError: boolean = true
```

These options corrects lighting artifacts caused by geometric errors in surface tiles. The Earth’s surface normals are gradually morphed to a true sphere.

Disable this option if your scene contains objects that penetrate the atmosphere or are located in space.

<!-- prettier-ignore -->
| `correctGeometricError = false` | `correctGeometricError = true` |
| :-: | :-: |
| ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/correct-geometric-error-false.jpg) | ![](https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/main/packages/atmosphere/docs/correct-geometric-error-true.jpg) |

#### photometric

```ts
photometric: boolean = true
```

See [photometric](#photometric).

#### sunDirection

```ts
sunDirection: Vector3 = new Vector3()
```

See [sunDirection](#sundirection).

#### sunIrradiance, skyIrradiance

```ts
sunIrradiance: boolean = false
skyIrradiance: boolean = false
```

Whether to apply sun and sky irradiance as deferred lighting.

Enabling one without the other is physically incorrect and should only be done for demonstration purposes.

#### transmittance, inscatter

```ts
transmittance: boolean = true
inscatter: boolean = true
```

Whether to account for the atmospheric transmittance and inscattered light.

#### irradianceScale

```ts
irradianceScale: number = 1
```

This value adjusts the color buffer to reduce contrast.

Deferred lighting treats the color buffer as albedo, but textures like those in Google Photorealistic 3D Tiles have baked lighting and shadows, resulting in higher contrast. Adjusting this value helps make it less noticeable.

#### sky

```ts
sky: boolean = false
```

Whether to render the sky as a post-processing effect. Enabling this may reduce the total number of fragments needed to compute the sky radiance.

In this case, the `Sky` component is redundant and should be omitted.

#### sun, moon

```ts
sun: boolean = true
moon: boolean = true
```

See [sun, moon](#sun-moon).

#### moonDirection

```ts
moonDirection: Vector3 = new Vector()
```

See [moonDirection](#moondirection).

#### moonAngularRadius

```ts
moonAngularRadius: number = 0.0045
```

See [moonAngularRadius](#moonangularradius).

#### lunarRadianceScale

```ts
lunarRadianceScale: number = 1
```

See [lunarRadianceScale](#lunarradiancescale).

## Functions

### getSunDirectionECEF, getMoonDirectionECEF

```ts
function getSunDirectionECEF(date: number | Date, result?: Vector3): Vector3
function getMoonDirectionECEF(date: number | Date, result?: Vector3): Vector3
```

Obtains the direction to the sun and moon in ECEF coordinates for the specified UTC time. This internally uses [astronomy-engine](https://github.com/cosinekitty/astronomy) and it approximates UTC as being equivalent to UT1.

[Source](/packages/atmosphere/src/celestialDirections.ts)

### getECIToECEFRotationMatrix

```ts
function getECIToECEFRotationMatrix(
  date: number | Date,
  result?: Matrix4
): Matrix4
```

Obtains the rotation matrix to convert coordinates from J2000 ECI to ECEF. This internally uses [astronomy-engine](https://github.com/cosinekitty/astronomy) and it approximates UTC as being equivalent to UT1.

[Source](/packages/atmosphere/src/celestialDirections.ts)

### getSunLightColor

```ts
interface SunLightColorOptions {
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
}

function getSunLightColor(
  transmittanceTexture: DataTexture,
  worldPosition: Vector3,
  sunDirection: Vector3,
  result?: Color,
  options?: SunLightColorOptions
): Color
```

Calculates the radiance of sunlight observed from a given position by sampling the precomputed transmittance texture on the CPU.

[Source](/packages/atmosphere/src/getSunLightColor.ts)

## License

[MIT](LICENSE)
