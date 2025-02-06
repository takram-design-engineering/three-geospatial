# @takram/three-clouds

[![npm version](https://img.shields.io/npm/v/@takram/three-clouds.svg?style=flat-square)](https://www.npmjs.com/package/@takram/three-clouds) [![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-clouds--basic)

This library is under active development and is in pre-release status.

This library is part of a project to prototype the rendering aspect of a Web GIS engine. For more details on the background and current status of this project, please refer to the [main README](/README.md).

**This document is a draft.**

## Installation

<!-- ```sh
npm install @takram/three-clouds
pnpm add @takram/three-clouds
yarn add @takram/three-clouds
``` -->

## Synopsis

## Possible improvements

## Limitations

## Performance tweaks

# API

**R3F components**

- [`Clouds`](#clouds)
- [`CloudLayer`](#cloudlayer)

**Three.js**

- [`CloudsEffect`](#cloudseffect)
- [`LocalWeather`](#localweather)
- [`CloudShape`](#cloudshape)
- [`CloudShapeDetail`](#cloudshapedetail)
- [`Turbulence`](#turbulence)

## Clouds

[Source](/packages/clouds/src/r3f/Clouds.tsx)

## CloudLayer

[Source](/packages/clouds/src/r3f/CloudLayer.tsx)

## CloudsEffect

[Source](/packages/clouds/src/CloudsEffect.ts)

### Details

![Rendering path diagram](docs/rendering-path.png)

- **Shadow**

  Performs ray marching in the sun’s orthographic projection and outputs the necessary values for computing the optical depth of clouds (BSM) during the main camera’s ray marching.

- **Shadow resolve**

  Applies TAA on BSM, not for the aliasing at polygon edges, but rather to:

  - Reduce spatial aliasing in BSM due to the high-frequency details of clouds relative to the output resolution.
  - Reduce temporal aliasing caused by temporal jitters during shadow ray marching.

- **Clouds**

  Renders the color and transparency of the clouds, optionally including the shadow length. The aerial perspective effect is already to the clouds here.

- **Clouds resolve**

  Performs TAAU-like upscaling on the clouds pass output, reducing the computational cost of ray marching for clouds by approximately 1/16.

- **Aerial perspective**

  This pass is part of [`atmosphere`](../atmosphere). It provides `overlay`, `shadow`, and `shadowLength` properties for compositing while applying atmospheric transparency and adding sun and sky irradiance into the scene.

### Parameters

- [Rendering](#rendering)
- [Cloud layers](#cloud-layers)
- [Textures](#textures)
- [Scattering](#scattering)
- [Weather and shape](#weather-and-shape)
- [Cascaded shadow maps](#cascaded-shadow-maps)
- [Advanced parameters](#advanced-parameters)
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
  expTerm: number = 0
  expScale: number = 0
  linearTerm: number = 0.75
  constantTerm: number = 0.25
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
absorptionCoefficient: number = 0.02
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

### Advanced parameters

#### clouds.accurateSunSkyIrradiance
#### clouds.multiScatteringOctaves
#### clouds.maxIterationCount
#### clouds.minStepSize, clouds.maxStepSize
#### clouds.maxRayDistance
#### clouds.perspectiveStepScale
#### clouds.minDensity, clouds.minExtinction, clouds.minTransmittance
#### clouds.maxIterationCountToSun, clouds.maxIterationCountToGround
#### clouds.minSecondaryStepSize
#### clouds.secondaryStepScale
#### clouds.maxShadowFilterRadius
#### clouds.maxShadowLengthIterationCount
#### clouds.minShadowLengthStepSize
#### clouds.maxShadowLengthRayDistance

### Advanced shadow parameters

#### shadow.temporalPass
#### shadow.temporalJitter
#### shadow.maxIterationCount
#### shadow.minStepSize, shadow.maxStepSize
#### shadow.minDensity, shadow.minExtinction, shadow.minTransmittance
#### shadow.opticalDepthTailScale

## LocalWeather

[Source](/packages/clouds/src/LocalWeather.ts)

## CloudShape

[Source](/packages/clouds/src/CloudShape.ts)

## CloudShapeDetail

[Source](/packages/clouds/src/CloudShapeDetail.ts)

## Turbulence

[Source](/packages/clouds/src/Turbulence.ts)

# References

In alphabetical order

- [A Survey of Temporal Antialiasing Techniques](https://research.nvidia.com/labs/rtr/publication/yang2020survey/)
  - Summarizes key concepts and techniques of TAA and TAAU.
- [An Excursion in Temporal Supersampling](https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf)
  - Covers variance clipping in detail.
- [Convincing Cloud Rendering – An Implementation of Real-Time Dynamic Volumetric Clouds in Frostbite](https://odr.chalmers.se/items/53d0fe07-df09-4cd1-ae7d-6c05491b52bf)
  - A comprehensive guide to rendering volumetric clouds.
- [Interactive Multiple Anisotropic Scattering in Clouds](https://inria.hal.science/inria-00333007)
  - Not specifically for real-time rendering, but provides the math behind light-cloud interactions.
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
