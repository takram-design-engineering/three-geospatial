# @takram/three-clouds

[![npm version](https://img.shields.io/npm/v/@takram/three-clouds.svg?style=flat-square)](https://www.npmjs.com/package/@takram/three-clouds) [![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-clouds--basic)

A Three.js and R3F (React Three Fiber) implementation of geospatial volumetric clouds with features including:

- Shadows cast on scene objects
- Temporal upscaling and filtering
- Light shafts (crepuscular rays)
- Haze (sparse fog)

This library is part of a project to prototype the rendering aspect of a Web GIS engine. For more details on the background and current status of this project, please refer to the [main README](/README.md).

**This document is a draft.**

## Installation

<!-- ```sh
npm install @takram/three-clouds
pnpm add @takram/three-clouds
yarn add @takram/three-clouds
```

Peer dependencies include `three` and `postprocessing`, for R3F `react`, `@react-three/fiber`, and `@react-three/postprocessing`. -->

## Usage

### Default clouds

Place [`Clouds`](#clouds) inside [`EffectComposer`](https://github.com/pmndrs/postprocessing) before [`AerialPerspective`](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/atmosphere#aerialperspective).

```tsx
import { EffectComposer } from '@react-three/postprocessing'
import { AerialPerspective, Atmosphere } from '@takram/three-atmosphere/r3f'
import { Clouds } from '@takram/three-clouds/r3f'

const Scene = () => (
  <Atmosphere>
    <EffectComposer enableNormalPass>
      <Clouds qualityPreset='high' coverage={0.4} />
      <AerialPerspective sky skyIrradiance sunIrradiance />
    </EffectComposer>
  </Atmosphere>
)
```

![Example of Tokyo](docs/tokyo.jpg)
[&rarr; Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-photorealistic-tiles--tokyo)

![Example of Fuji](docs/fuji.jpg)
[&rarr; Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-photorealistic-tiles--fuji)

![Example of London](docs/london.jpg)
[&rarr; Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-photorealistic-tiles--london)

### Configuring cloud layers

Clouds can be customized using [`CloudLayer`](#cloudlayer).

```tsx
import { EffectComposer } from '@react-three/postprocessing'
import { AerialPerspective, Atmosphere } from '@takram/three-atmosphere/r3f'
import { Clouds } from '@takram/three-clouds/r3f'

const Scene = () => (
  <Atmosphere>
    <EffectComposer enableNormalPass>
      <Clouds qualityPreset='high' coverage={0.4}>
        <CloudLayer altitude={750} height={650} />
        <CloudLayer altitude={1000} height={1200} />
        <CloudLayer
          altitude={7500}
          height={500}
          densityScale={0.003}
          shapeAmount={0.4}
          shapeDetailAmount={0}
          coverageFilterWidth={0.5}
        />
      </Clouds>
      <AerialPerspective sky skyIrradiance sunIrradiance />
    </EffectComposer>
  </Atmosphere>
)
```

### Configuring weather

Provide a path to your weather texture. This also applies to shape, shape detail, and turbulence textures.

```tsx
import { EffectComposer } from '@react-three/postprocessing'
import { AerialPerspective, Atmosphere } from '@takram/three-atmosphere/r3f'
import { Clouds } from '@takram/three-clouds/r3f'

const Scene = () => (
  <Atmosphere>
    <EffectComposer enableNormalPass>
      <Clouds weatherTexture={/* path to weather texture */} />
      <AerialPerspective sky skyIrradiance sunIrradiance />
    </EffectComposer>
  </Atmosphere>
)
```

### Generating textures procedurally

Pass an object that implements from [`ProceduralTexture`](#proceduraltexture-procedural3dtexture). For shape and shape detail, use [`Procedural3DTexture`](#proceduraltexture-procedural3dtexture).

```tsx
import { EffectComposer } from '@react-three/postprocessing'
import { AerialPerspective, Atmosphere } from '@takram/three-atmosphere/r3f'
import { ProceduralTextureBase } from '@takram/three-clouds'
import { Clouds } from '@takram/three-clouds/r3f'

const weatherTexture = new ProceduralTextureBase({
  size: 512,
  fragmentShader: /* glsl */ `
    in vec2 vUv;
    layout(location = 0) out vec4 outputColor;
    void main() {
      outputColor = ...;
    }
  `
})

const Scene = () => (
  <Atmosphere>
    <EffectComposer enableNormalPass>
      <Clouds weatherTexture={weatherTexture} />
      <AerialPerspective sky skyIrradiance sunIrradiance />
    </EffectComposer>
  </Atmosphere>
)
```

## Performance tweaks

Volumetric clouds are not a lightweight effect. Please refer to the [performance tweaks](#performance-tweaks) section to optimize for your target devices.

![](docs/cloud-shape.png)
![](docs/ray-march.png)

## Limitations

- The number of cloud layers is limited to 4. This is because the coverage of all layers is packed into a texture, and all layers are computed at once as `vec4` in the shaders.

- It is difficult to maintain _the same_ rendering outputs while improving visual quality, performance, and adding new features, due to the way the clouds are modeled and ray marched.

### Known issues

- The temporal upscaling is still basic and prone to ghosting and smearing, especially when viewed through sparse clouds, and disocclusion errors on scene objects.

- Aerial perspective is applied to the clouds using transmittance-weighted front depth, an approximation that reduces the computation of atmospheric transparency. However, because this is a mean depth, it is not accurate for representing the depth of areas where distant sparse clouds overlap, and introduces artifacts.

### Possible improvements

- Local weather is not tiled across the entire globe. It is tiled using cube-sphere UV, which results in several seams, not only at the poles. While a single tile cannot seamlessly cover a sphere, blending the seams can improve it.

- The cloud base of each layer lines up at the same altitude, making it look artificial. This may be improved by tweaking the shape altering function.

- Interpolated sun and sky irradiance, when `accurateSunSkyIrradiance` is set to false, could be improved by using spherical harmonics to approximate the radial gradient of the sky.

- Compute light shafts of the scene objects (possibly in the [atmosphere package](../atmosphere)). Implementing this would require an additional depth pass to render the scene as seen from the sun, which is too expensive unless shadow map is already in use. It may provide a partial solution to project the main camera’s depth onto the sun’s view.

### Planned features

- The altitude of cloud layers is determined relative to the ellipsoid surface, but in reality, the cloud base altitude is not constant with respect to either the ellipsoid or geopotential height. Thus, clouds appear too low in high-altitude non-mountain areas (e.g. east of the west coast of North America). This could be compensated for by considering observed average cloud base heights, [X](https://x.com/shotamatsuda/status/1885737165709254882).

- Introduce global cloud coverage and support rendering views from space.

- Currently developed using GLSL. It does not use node-based TSL yet, and WebGPU is not supported, but both are planned.

# API

**R3F components**

- [`Clouds`](#clouds)
- [`CloudLayer`](#cloudlayer)

**Three.js**

- [`CloudsEffect`](#cloudseffect)
- [`ProceduralTexture`, `Procedural3DTexture`](#proceduraltexture-procedural3dtexture)
- [`LocalWeather`](#localweather)
- [`CloudShape`](#cloudshape)
- [`CloudShapeDetail`](#cloudshapedetail)
- [`Turbulence`](#turbulence)

## Clouds

&rarr; [Source](/packages/clouds/src/r3f/Clouds.tsx)

## CloudLayer

&rarr; [Source](/packages/clouds/src/r3f/CloudLayer.tsx)

## CloudsEffect

&rarr; [Source](/packages/clouds/src/CloudsEffect.ts)

### Details

![Rendering path diagram](docs/rendering-path.png)

- **Shadow**

  Performs ray marching in the sun’s orthographic projection and outputs the necessary values for computing the optical depth of the clouds (BSM) during the main camera’s ray marching.

  &rarr; [Shader](/packages/clouds/src/shaders/shadow.frag)

- **Shadow resolve**

  Applies TAA on BSM, not for the aliasing at polygon edges, but rather for temporal filtering:

  - Reduce spatial aliasing in BSM due to the high-frequency details of the clouds relative to the output resolution.
  - Reduce temporal aliasing caused by temporal jitters during shadow ray marching.

  &rarr; [Shader](/packages/clouds/src/shaders/shadowResolve.frag)

- **Clouds**

  Renders the color and transparency of the clouds, optionally including the shadow length. The aerial perspective is already applied to the clouds here.

  &rarr; [Shader](/packages/clouds/src/shaders/clouds.frag)

- **Clouds resolve**

  Performs TAAU-like upscaling on the clouds pass outputs, reducing the number of texels to ray march in the clouds shader pass by 1/16.

  &rarr; [Shader](/packages/clouds/src/shaders/cloudsResolve.frag)

- **Aerial perspective**

  This pass is part of the [atmosphere package](../atmosphere). It provides `overlay`, `shadow`, and `shadowLength` properties for compositing while applying atmospheric transparency and adding sun and sky irradiance into the scene.

  &rarr; [Documentation](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/atmosphere#aerialperspectiveeffect)

### Parameters

- [Rendering](#rendering)
- [Cloud layers](#cloud-layers)
- [Textures](#textures)
- [Scattering](#scattering)
- [Weather and shape](#weather-and-shape)
- [Cascaded shadow maps](#cascaded-shadow-maps)
- [Advanced clouds parameters](#advanced-clouds-parameters)
- [Advanced shadow parameters](#advanced-shadow-parameters)

### Rendering

#### qualityPreset

```ts
qualityPreset: CloudsQualityPreset = undefined
```

#### resolutionScale

```ts
resolutionScale: number = 1
```

#### temporalUpscale

```ts
temporalUpscale: boolean = true
```

#### lightShafts

```ts
lightShafts: boolean = true
```

#### shapeDetail

```ts
shapeDetail: boolean = true
```

#### turbulence

```ts
turbulence: boolean = true
```

#### haze

```ts
haze: boolean = true
```

### Cloud layers

#### cloudLayers

```ts
cloudLayers: CloudLayer[] = [defaultCloudLayer, ...]
```

#### _layer_.altitude

```ts
altitude: number = 0
```

#### _layer_.height

```ts
height: number = 0
```

#### _layer_.densityScale

```ts
densityScale: number = 0.2
```

#### _layer_.shapeAmount

```ts
shapeAmount: number = 1
```

#### _layer_.shapeDetailAmount

```ts
shapeDetailAmount: number = 1
```

#### _layer_.weatherExponent

```ts
weatherExponent: number = 1
```

#### _layer_.shapeAlteringBias

```ts
shapeAlteringBias: number = 0.35
```

#### _layer_.coverageFilterWidth

```ts
coverageFilterWidth: number = 0.6
```

#### _layer_.densityProfile

```ts
densityProfile: DensityProfile = {
  expTerm: (number = 0),
  expScale: (number = 0),
  linearTerm: (number = 0.75),
  constantTerm: (number = 0.25)
}
```

#### _layer_.shadow

```ts
shadow: boolean = false
```

### Textures

#### localWeatherTexture

```ts
localWeatherTexture: Texture | ProceduralTexture | null = null
```

#### shapeTexture, shapeDetailTexture

```ts
shapeTexture: Data3DTexture | Procedural3DTexture | null = null
shapeDetailTexture: Data3DTexture | Procedural3DTexture | null = null
```

#### turbulenceTexture

```ts
turbulenceTexture: Texture | ProceduralTexture | null = null
```

#### stbnTexture

```ts
stbnTexture: Data3DTexture | null = null
```

### Scattering

#### scatteringCoefficient, absorptionCoefficient

```ts
scatteringCoefficient: number = 1
absorptionCoefficient: number = 0
```

#### scatterAnisotropy1, scatterAnisotropy2, scatterAnisotropyMix

```ts
scatterAnisotropy1: number = 0.7
scatterAnisotropy2: number = -0.2
scatterAnisotropyMix: number = 0.5
```

#### skyIrradianceScale

```ts
skyIrradianceScale: number = 2.5
```

#### groundIrradianceScale

```ts
groundIrradianceScale: number = 3
```

#### powderScale, powderExponent

```ts
powderScale: number = 0.8
powderExponent: number = 150
```

### Weather and shape

#### coverage

```ts
coverage: number = 0.3
```

#### localWeatherRepeat, localWeatherOffset

```ts
localWeatherRepeat: Vector2 = new Vector2().setScalar(100)
localWeatherOffset: Vector2 = new Vector2()
```

#### localWeatherVelocity

```ts
localWeatherVelocity: Vector2 = new Vector2()
```

#### shapeRepeat, shapeDetailRepeat

```ts
shapeRepeat: Vector3 = new Vector3().setScalar(0.0003)
shapeDetailRepeat: Vector3 = new Vector3().setScalar(0.006)
```

#### shapeOffset, shapeDetailOffset

```ts
shapeDetailOffset: Vector3 = new Vector3()
shapeOffset: Vector3 = new Vector3()
```

#### shapeVelocity, shapeDetailVelocity

```ts
shapeVelocity: Vector3 = new Vector3()
shapeDetailVelocity: Vector3 = new Vector3()
```

#### turbulenceRepeat

```ts
turbulenceRepeat: Vector2 = new Vector2().setScalar(20)
```

#### turbulenceDisplacement

```ts
turbulenceDisplacement: number = 350
```

### Cascaded shadow maps

#### shadow.cascadeCount

```ts
cascadeCount: number = 3
```

#### shadow.mapSize

```ts
mapSize: Vector2 = new Vector2().setScalar(512)
```

#### shadow.maxFar, shadow.farScale

```ts
maxFar: number | null = null
farScale: number = 1
```

#### shadow.splitMode, shadow.splitLambda

```ts
splitMode: FrustumSplitMode = 'practical'
splitLambda: number = 0.6
```

### Advanced clouds parameters

These parameters are not intended to be adjusted unless you understand what the shader code does.

#### clouds.multiScatteringOctaves

```ts
multiScatteringOctaves: number = 8
```

The number of octaves accumulated to approximate multiple scattering. A higher value results in brighter clouds, but values beyond 8 have no noticeable effect.

#### clouds.accurateSunSkyIrradiance

```ts
accurateSunSkyIrradiance: boolean = true
```

Whether to sample sun and sky irradiance at every sample point during ray marching. If disabled, irradiance is approximated by interpolating values at the bottom and top of the total cloud layers above the camera, which is only plausible for small-scale scenes.

#### clouds.accuratePhaseFunction

```ts
accuratePhaseFunction: boolean = false
```

Set this to true to use a numerically-fitted large particle (d=10) Mie phase function instead of the dual-robe Henyey-Greenstein function. However, it won't be plausible without a more precise computation of multiple scattering.

#### clouds.maxIterationCount

```ts
maxIterationCount: number = 500
```

The limit on the number of iterations for the primary ray marching.

#### clouds.minStepSize, clouds.maxStepSize

```ts
minStepSize: number = 50
maxStepSize: number = 1000
```

Controls the step size for the primary ray marching.

#### clouds.maxRayDistance

```ts
maxRayDistance: number = 2e5
```

The limit on the primary ray distance.

#### clouds.perspectiveStepScale

```ts
perspectiveStepScale: number = 1.01
```

The growth factor of the step size during ray marching. This applies to both the primary rays and shadow length rays.

#### clouds.minDensity, clouds.minExtinction, clouds.minTransmittance

```ts
minDensity: number = 1e-5
minExtinction: number = 1e-5
minTransmittance: number = 1e-2
```

The minimum thresholds for density, extinction and transmittance, which determine the early termination of the primary rays.

#### clouds.maxIterationCountToSun, clouds.maxIterationCountToGround

```ts
maxIterationCountToSun: number = 3
maxIterationCountToGround: number = 2
```

The number of steps for ray marching toward the sun and ground (secondary rays). This enhances cloud details, but is very costly, and values greater than 4 have little improvements on quality.

#### clouds.minSecondaryStepSize, clouds.secondaryStepScale

```ts
minSecondaryStepSize: number = 100
secondaryStepScale: number = 2
```

Controls the step size for the secondary ray marching.

#### clouds.maxShadowFilterRadius

```ts
maxShadowFilterRadius: number = 6
```

The radius for PCF on BSM when the sun is near the horizon. Setting this to 0 disables PCF, but it will suffer from aliasing.

#### clouds.maxShadowLengthIterationCount

```ts
maxShadowFilterRadius: number = 500
```

The limit on the number of iterations for the shadow length ray marching.

#### clouds.minShadowLengthStepSize

```ts
minShadowLengthStepSize: number = 50
```

Controls the step size for the shadow length ray marching.

#### clouds.maxShadowLengthRayDistance

```ts
maxShadowLengthRayDistance: number = 2e5
```

The limit on the shadow length ray distance.

#### clouds.hazeDensityScale

```ts
hazeDensityScale: number = 3e-5
```

Controls the density of the haze. A greater value makes it denser.

#### clouds.hazeExpScale

```ts
hazeExpScale: number = 1e-3
```

Controls the rate at which the haze density exponentially decreases with altitude. A lower value makes it more concentrated near the ground and spreads it more at higher altitudes.

### Advanced shadow parameters

#### shadow.temporalPass

#### shadow.temporalJitter

#### shadow.maxIterationCount

#### shadow.minStepSize, shadow.maxStepSize

#### shadow.minDensity, shadow.minExtinction, shadow.minTransmittance

#### shadow.opticalDepthTailScale

## ProceduralTexture, Procedural3DTexture

## LocalWeather

&rarr; [Source](/packages/clouds/src/LocalWeather.ts)

## CloudShape

&rarr; [Source](/packages/clouds/src/CloudShape.ts)

## CloudShapeDetail

&rarr; [Source](/packages/clouds/src/CloudShapeDetail.ts)

## Turbulence

&rarr; [Source](/packages/clouds/src/Turbulence.ts)

# References

In alphabetical order

- [A Survey of Temporal Antialiasing Techniques](https://research.nvidia.com/labs/rtr/publication/yang2020survey/)
  - Summarizes key concepts and techniques of TAA and TAAU.
- [An Excursion in Temporal Supersampling](https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf)
  - Covers variance clipping in detail.
- [Convincing Cloud Rendering – An Implementation of Real-Time Dynamic Volumetric Clouds in Frostbite](https://odr.chalmers.se/items/53d0fe07-df09-4cd1-ae7d-6c05491b52bf)
  - A comprehensive guide to rendering volumetric clouds.
- [Deep Scattering - Rendering Atmospheric Clouds with Radiance-Predicting Neural Networks](https://dl.acm.org/doi/10.1145/3130800.3130880)
  - Not specifically for real-time rendering, but provides visual references and the math behind light-cloud interactions.
- [Nubis - Authoring Realtime Volumetric Cloudscapes with the Decima Engine](https://www.guerrilla-games.com/read/nubis-authoring-real-time-volumetric-cloudscapes-with-the-decima-engine)
  - A well-known presentation on volumetric clouds, similar to Guerrilla Games slides.
- [Oz: The Great and Volumetric](https://www.researchgate.net/publication/262309690_Oz_the_great_and_volumetric)
  - A short paper on the approximation of multiple scattering.
- [Physically Based and Scalable Atmospheres in Unreal Engine](https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf)
  - Briefly introduces BSM.
- [Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite](https://www.ea.com/frostbite/news/physically-based-sky-atmosphere-and-cloud-rendering)
  - Perhaps one of the most influential papers on real-time volumetric rendering. It covers many essential techniques, including the basics of volumetric ray marching, energy-conserving analytical integration of scattered light, transmittance-weighted mean depth of clouds, and more.
- [Real-Time Volumetric Rendering](https://patapom.com/topics/Revision2013/Revision%202013%20-%20Real-time%20Volumetric%20Rendering%20Course%20Notes.pdf)
  - An introductory course on volumetric cloud rendering.
- [Spatiotemporal Blue Noise Masks](https://research.nvidia.com/publication/2022-07_spatiotemporal-blue-noise-masks)
  - The paper and SDK on STBN, which is used extensively for the stochastic sampling.
- [Temporal Reprojection Anti-Aliasing in INSIDE](https://gdcvault.com/play/1022970/Temporal-Reprojection-Anti-Aliasing-in)
  - A detailed presentation on TAA.
- [The Real-time Volumetric Cloudscapes of Horizon Zero Dawn](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn)
  - Another well-known presentation on volumetric clouds, similar to the Nubis slides, introducing the powder term.

**Implementation references**

- [Clouds](https://github.com/lightest/clouds) by lightest
  - Useful for understanding the missing details in BSM and crepuscular rays.
- [Procedural Scene in OpenGL 4](https://github.com/fede-vaccaro/TerrainEngine-OpenGL) by fade-vaccaro
  - Helps in grasping the fundamentals of volumetric cloud ray marching.
- [Skybolt](https://github.com/Prograda/Skybolt) by Prograda
  - Helps in modeling global volumetric clouds and controlling coverage.
- [Structured Volume Sampling](https://github.com/huwb/volsample) by huwb
  - A reference for implementing Structured Volume Sampling.
- [three-csm](https://github.com/StrandedKitty/three-csm/) by StrandedKitty
  - A reference for implementing Cascaded Shadow Maps.
- [Tileable Volume Noise](https://github.com/sebh/TileableVolumeNoise) by sebh
  - A reference for implementing volumetric noise in cloud shape and details.
- [Volumetric Cloud](https://www.shadertoy.com/view/3sffzj) by airo
  - A basic example of volumetric cloud ray marching.

# License

[MIT](LICENSE)
