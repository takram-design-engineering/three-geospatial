# @takram/three-atmosphere

A Three.js and R3F (React Three Fiber) implementation of Eric Bruneton’s [Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/).

## Installation

```sh
npm install @takram/three-atmosphere
yarn add @takram/three-atmosphere
```

## Synopsis

### Deferred lighting

Suitable for large-scale scenes, but supports only Lambertian BRDF.

```tsx
const Scene = () => {
  const textures = useLoader(PrecomputedTexturesLoader, '/assets')
  return (
    <Atmosphere textures={precomputedTextures}>
      <Sky />
      <EffectComposer enableNormalPass>
        <AerialPerspective skyIrradiance sunIrradiance />
      </EffectComposer>
    </Atmosphere>
  )
}
```

![deferred-1](https://github.com/user-attachments/assets/76fb8715-02ff-4833-b2af-ad5526a0ff0c)
![deferred-2](https://github.com/user-attachments/assets/6605f432-933b-43fb-9c55-2c8aba5ddef6)

### Forward lighting

Compatible with built-in Three.js materials and shadows, but both direct and indirect irradiance are approximated only for small-scale scenes.

```tsx
const Scene = () => {
  const precomputedTextures = useLoader(PrecomputedTexturesLoader, '/assets')
  return (
    <Atmosphere textures={precomputedTextures}>
      <Sky />
      <group position={position}>
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

![forward-1](https://github.com/user-attachments/assets/10b3befe-8a1f-47f3-8ac9-caaa19debbfb)

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

### Transient update by date

```tsx
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

// Demonstrates forward lighting here. For deferred lighting, set sunIrradiance
// and skyIrradiance to true, remove SkyLightProbe and SunDirectionalLight, and
// provide a normal buffer to AerialPerspectiveEffect.
const aerialPerspective = new AerialPerspectiveEffect(camera)

// Use floating-point render buffer, as irradiance/illuminance is stored here.
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

function render(): void {
  // Suppose `date` is updated elsewhere.
  const sunDirection = getSunDirectionECEF(date)
  const moonDirection = getMoonDirectionECEF(date)

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

- The reference frame is fixed to ECEF and cannot be configured.

- The aerial perspective (specifically the in-scatter term) includes a [workaround for the horizon artifact](https://github.com/ebruneton/precomputed_atmospheric_scattering/pull/32#issuecomment-480523982), but due to finite floating-point precision, this artifact cannot be removed completely.

- EffectComposer’s default normal buffer lacks sufficient precision during the lighting stage, causing banding in shaded areas when deferred lighting is used (i.e. AerialPerspective's skyIrradiance and sunIrradiance are enabled). Using a floating-point normal buffer resolves this issue.

- Volumetric light shaft is not implemented as they requires ray tracing. You may notice scattered light is not occluded by scene objects.

- Although you can generate custom precomputed textures, the implementation is effectively limited to Earth’s atmosphere. For rendering atmospheres of other planets, consider implementing Sébastien Hillaire’s [A Scalable and Production Ready Sky and Atmosphere Rendering Technique](https://sebh.github.io/publications/egsr2020.pdf).

- Since this project is developed in TypeScript, the Node-based TSL cannot be used yet, as it lacks type definitions as of this writing.

# API

**R3F components**

- [`Atmosphere`](#atmosphere)
- [`Sky`](#sky)
- [`Stars`](#stars)
- [`SkyLight`](#skylight)
- [`SunLight`](#sunlight)
- [`AerialPerspective`](#aerialperspective)

**Three.js**

- [`AtmosphereParameters`](#atmosphereparameters)
- [`AtmosphereMaterialBase`](#atmospherematerialbase)
- [`SkyMaterial`](#skymaterial)
- [`SkyLightProbe`](#skylightprobe)
- [`SunDirectionalLight`](#directionalsunlight)
- [`StarsGeometry`](#starsgeometry)
- [`StarsMaterial`](#starsmaterial)
- [`AerialPerspectiveEffect`](#aerialperspectiveeffect)

**Functions**

- [`getSunDirectionECEF`](#getsundirectionecef)
- [`getMoonDirectionECEF`](#getmoondirectionecef)
- [`getECIToECEFRotationMatrix`](#getecitoecefrotationmatrix)
- [`computeSunLightColor`](#computesunlightcolor)

## Atmosphere

Provides and synchronizes props of atmosphere components. It’s the recommended way to configure components unless you need finer control over properties of individual components.

```tsx
import {
  Atmosphere,
  Sky,
  ...,
  useAtmosphereTextureProps,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'

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
  const atmosphereProps = useAtmosphereTextureProps('/assets')
  return (
    <Atmosphere ref={atmosphereRef} {...atmosphereProps}>
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

The precomputed textures, or a URL to the directory containing them.

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

#### osculateEllipsoid

```ts
osculateEllipsoid: boolean = true
```

Whether to adjust the atmosphere’s bottom sphere to osculate the ellipsoid.

#### photometric

```ts
photometric: boolean = true
```

Whether to store illuminance instead of irradiance in render buffers.

## Sky

Displays the sky in a screen quad.

Despite its name, this component renders the atmosphere itself, along with the sun and moon. When viewed from within the atmosphere, it appears as the sky. From space, it represents Earth’s atmosphere with a flat ground, creating the appearance of an ”empty Earth”.

See [`SkyMaterial`](#skymaterial) for further details.

```tsx
import { useLoader } from '@react-three/fiber'
import { Vector3 } from 'three'

import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'
import { Sky } from '@takram/three-atmosphere/r3f'

const sunDirection = new Vector3(1, 1, 1).normalize()
const moonDirection = new Vector3(1, 1, 1).normalize()

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

The parameters of [`SkyMaterial`](#skymaterial) are exposed as props.

## Stars

Represents the stars in as points at an infinite distance. The provided data contains the 9,096 stars listed in [Yale Bright Star Catalog version 5](http://tdc-www.harvard.edu/catalogs/bsc5.html).

See [`StarsMaterial`](#starsmaterial) for further details.

```tsx
import { useLoader } from '@react-three/fiber'
import { Euler, Matrix4, Vector3 } from 'three'

import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'
import { Stars } from '@takram/three-atmosphere/r3f'
import { ArrayBufferLoader } from '@takram/three-geospatial'

const sunDirection = new Vector3(1, 1, 1).normalize()
const rotationMatrix = new Matrix4().makeRotationFromEuler(new Euler(1, 1, 1))

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

```tsx
import { useLoader } from '@react-three/fiber'
import { Vector3 } from 'three'

import { SkyLight } from '@takram/three-atmosphere/r3f'
import { Float32Data2DLoader, Geodetic } from '@takram/three-geospatial'

const position = new Geodetic().toECEF()
const sunDirection = new Vector3(1, 1, 1).normalize()

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

```tsx
import { useLoader } from '@react-three/fiber'
import { Vector3 } from 'three'

import { SunLight } from '@takram/three-atmosphere/r3f'
import { Float32Data2DLoader, Geodetic } from '@takram/three-geospatial'

const position = new Geodetic().toECEF()
const sunDirection = new Vector3(1, 1, 1).normalize()

const Scene = () => {
  const transmittanceTexture = useLoader(
    Float32Data2DLoader,
    '/assets/transmittance.bin'
  )
  return (
    <SunLight
      transmittanceTexture={transmittanceTexture}
      position={position}
      direction={sunDirection}
    />
  )
}
```

### Props

The parameters of [`SunDirectionalLight`](#directionalsunlight) are exposed as props.

## AerialPerspective

A post-processing effect that renders atmospheric transparency and inscattered light. It can optionally render sun and sky irradiance as deferred lighting.

This is for use with the [postprocessing](https://github.com/pmndrs/postprocessing)’s EffectComposer and is not compatible with the one in Three.js examples.

See [`AerialPerspectiveEffect`](#aerialperspectiveeffect) for further details.

```tsx
import { useLoader } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { Vector3 } from 'three'

import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'
import { AerialPerspective } from '@takram/three-atmosphere/r3f'

const sunDirection = new Vector3(1, 1, 1).normalize()

const Scene = () => {
  const precomputedTextures = useLoader(PrecomputedTexturesLoader, '/assets')
  return (
    <EffectComposer>
      <AerialPerspectiveEffect
        {...precomputedTextures}
        sunDirection={sunDirection}
      />
    </EffectComposer>
  )
}
```

### Props

The parameters of [`AerialPerspectiveEffect`](#aerialperspectiveeffect) are exposed as props.

## AtmosphereMaterialBase

The base class of [`SkyMaterial`](#skymaterial) and [`StarsMaterial`](#starsmaterial).

Extends [`RawShaderMaterial`](https://threejs.org/docs/?q=shader#api/en/materials/RawShaderMaterial).

### Parameters

#### irradianceTexture, scatteringTexture, transmittanceTexture

```ts
irradianceTexture: DataTexture | null = null
scatteringTexture: Data3DTexture | null = null
transmittanceTexture: DataTexture | null = null
```

#### useHalfFloat

```ts
useHalfFloat: boolean = false
```

#### ellipsoid

```ts
ellipsoid: Ellipsoid = Ellipsoid.WGS84
```

#### osculateEllipsoid

```ts
osculateEllipsoid: boolean = true
```

#### photometric

```ts
photometric: boolean = true
```

#### sunDirection

```ts
sunDirection: Vector3 = new Vector3()
```

#### sunAngularRadius

```ts
sunAngularRadius: number = 0.004675
```

## SkyMaterial

Extends [`AtmosphereMaterialBase`](#atmospherematerialbase).

```ts
new SkyMaterial(params?: SkyMaterialParameters)
```

### Parameters

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

## SkyLightProbe

Extends [`LightProbe`](https://threejs.org/docs/?q=lightprobe#api/en/lights/LightProbe)

## SunDirectionalLight

Extends [`DirectionalLight`](https://threejs.org/docs/?q=DirectionalLight#api/en/lights/DirectionalLight)

## StarsGeometry

Extends [`BufferGeometry`](https://threejs.org/docs/?q=BufferGeometry#api/en/core/BufferGeometry).

```ts
new StarsGeometry(data: ArrayBuffer)
```

### Parameters

#### data

```ts
data: ArrayBuffer
```

The data containing the position and magnitude of the stars

## StarsMaterial

Extends [`AtmosphereMaterialBase`](#atmospherematerialbase).

```ts
new StarsMaterial(params?: StarsMaterialParameters)
```

### Parameters

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

## AerialPerspectiveEffect

### Parameters

Extends [`postprocessing`](https://github.com/pmndrs/postprocessing)’s [`Effect`](https://pmndrs.github.io/postprocessing/public/docs/class/src/effects/Effect.js~Effect.html).

#### normalBuffer

```ts
normalBuffer: Texture \| null = null
```

#### octEncodedNormal

```ts
octEncodedNormal: boolean = false
```

#### reconstructNormal

```ts
reconstructNormal: boolean = false
```

#### irradianceTexture, scatteringTexture, transmittanceTexture

```ts
irradianceTexture: DataTexture | null = null
scatteringTexture: Data3DTexture | null = null
transmittanceTexture: DataTexture | null = null
```

#### useHalfFloat

```ts
useHalfFloat: boolean = false
```

#### ellipsoid

```ts
ellipsoid: Ellipsoid = Ellipsoid.WGS84
```

#### morphToSphere

```ts
morphToSphere: boolean = true
```

#### morphToSphereRange

```ts
morphToSphereRange: Vector2 = new Vector2(2e5, 6e5)
```

#### photometric

```ts
photometric: boolean = true
```

#### sunDirection

```ts
sunDirection: Vector3 = new Vector3()
```

#### sunIrradiance, skyIrradiance

```ts
sunIrradiance: boolean = false
skyIrradiance: boolean = false
```

#### transmittance, inscatter

```ts
transmittance: boolean = true
inscatter: boolean = true
```

#### albedoScale

```ts
albedoScale: number = 1
```

## Functions

### getSunDirectionECEF

```ts
function getSunDirectionECEF(date: number | Date, result?: Vector3): Vector3
```

### getMoonDirectionECEF

```ts
function getMoonDirectionECEF(date: number | Date, result?: Vector3): Vector3
```

### getECIToECEFRotationMatrix

```ts
function getECIToECEFRotationMatrix(
  date: number | Date,
  result?: Matrix4
): Matrix4
```

### computeSunLightColor

```ts
interface SunLightColorOptions {
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
}

function computeSunLightColor(
  transmittanceTexture: DataTexture,
  worldPosition: Vector3,
  sunDirection: Vector3,
  result?: Color,
  options?: SunLightColorOptions
): Color
```

# References

- [Precomputed Atmospheric Scattering](https://inria.hal.science/inria-00288758/en) ([Github](https://github.com/ebruneton/precomputed_atmospheric_scattering)) by Eric Bruneton and Fabrice Neyret
- [The Bright Star Catalogue, 5th Revised Ed.](http://tdc-www.harvard.edu/catalogs/bsc5.html) by Hoffleit D. and Warren Jr W.H.
- [Physically Based Rendering in Filament](https://google.github.io/filament/Filament.html) by Google
