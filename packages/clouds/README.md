# @takram/three-clouds

[![npm version](https://img.shields.io/npm/v/@takram/three-clouds.svg?style=flat-square)](https://www.npmjs.com/package/@takram/three-clouds) [![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-clouds--basic)

A Three.js and R3F (React Three Fiber) implementation of geospatial volumetric clouds with features including:

- Beer shadow maps (BSM) and shadows cast on scene objects
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
&rarr; [Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-photorealistic-tiles--tokyo)

![Example of Fuji](docs/fuji.jpg)
&rarr; [Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-photorealistic-tiles--fuji)

![Example of London](docs/london.jpg)
&rarr; [Storybook](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-photorealistic-tiles--london)

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

Volumetric clouds are not a lightweight effect. You might need to adjust the quality settings for your target devices.

There are 4 quality presets that you may consider:

- **Low**: Disables shape detail, light shafts, and turbulence, and significantly lowers the precision of ray marching
- **Medium**: Disables light shafts and turbulence, as well as lowering the precision of ray marching
- **High**: The baseline settings
- **Ultra**: Increases the resolution of BSM

If “Low” quality preset still does not meet your performance goal, then consider using skybox instead, which might offer better visual quality unless you specifically need volumetric clouds.

Below are my measurements as of version 0.0.1 on the [Tokyo scene](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-photorealistic-tiles--tokyo). Note that they are relatively new devices as of this writing.

| Device                | FPS       | Quality preset | Temporal upscaling | Canvas resolution | Browser |
| --------------------- | --------- | -------------- | ------------------ | ----------------- | ------- |
| iPhone 13             | 36-53     | Low            | Yes                | 780×1326px        | Safari  |
| iPad Pro (1st gen.)   | 30-32     | Low            | Yes                | 2388×1520px       | Safari  |
| iPad Pro (M4)         | **60**    | **Medium**     | Yes                | 2420×1520px       | Safari  |
| iPad Pro (M4)         | 43-55     | High           | Yes                | 2420×1520px       | Safari  |
| MacBook Pro (M3 Max)  | **92-95** | **High**       | Yes                | 4K                | Chrome  |
| MacBook Pro (M3 Max)  | **76-77** | **Ultra**      | Yes                | 4K                | Chrome  |
| MacBook Pro (M3 Max)  | 31        | High           | **No**             | 4K                | Chrome  |
| Mac Studio (M2 Ultra) | **60**    | **High**       | Yes                | 4K                | Chrome  |
| Mac Studio (M2 Ultra) | **60**    | **Ultra**      | Yes                | 4K                | Chrome  |
| Mac Studio (M2 Ultra) | 29-31     | High           | **No**             | 4K                | Chrome  |
| GeForce 4090          | **60**    | **Ultra**      | Yes                | 4K                | Chrome  |
| GeForce 4090          | **60**    | **Ultra**      | **No**             | 4K                | Chrome  |

The other factor that influences the performance is how clouds are modeled. Clouds are roughly modeled as shown in the image below.

![](docs/cloud-shape.png)

Ray marching can be visualized as follows:

![](docs/ray-march.png)

This illustrates that greater total cloud layer height increases computational cost, and excessive erosion reduces efficiency by causing rays to miss the clouds, leading to unnecessary sampling of the weather texture.

## Limitations

- The number of cloud layers is limited to 4. This is because the coverage of all layers is packed into a texture, and all layers are computed at once as `vec4` in the shaders.

- It is difficult to maintain _the same_ rendering outputs while improving visual quality, performance, and adding new features, due to the way the clouds are modeled and ray marched.

### Known issues

- The temporal upscaling is still basic and prone to ghosting and smearing, especially when viewed through sparse clouds, and disocclusion errors on scene objects.

- Aerial perspective is applied to the clouds using transmittance-weighted mean depth of clouds, an approximation that reduces the computation of atmospheric transparency. However, because this is a mean depth, it is not accurate for representing the depth of areas where distant sparse clouds overlap, and introduces artifacts.

### Possible improvements

- Local weather is not tiled across the entire globe. It is tiled using cube-sphere UV, which results in several seams, not only at the poles. While a single tile cannot seamlessly cover a sphere, blending the seams can improve it.

- The cloud base of each layer lines up at the same altitude, making it look artificial. This may be improved by tweaking the shape altering function.

- Interpolated sun and sky irradiance, when [`accurateSunSkyIrradiance`](#cloudsaccuratesunskyirradiance) is set to false, could be improved by using spherical harmonics to approximate the radial gradient of the sky.

- Compute light shafts of the scene objects (possibly in the [atmosphere package](../atmosphere)). Implementing this would require an additional depth pass to render the scene as seen from the sun, which is too expensive unless shadow map is already in use. It may provide a partial solution to project the main camera’s depth onto the sun’s view.

### Planned features

- The altitude of cloud layers is determined relative to the ellipsoid surface, but in reality, the cloud base altitude is not constant with respect to either the ellipsoid or geopotential height. Thus, clouds appear too low in high-altitude non-mountain areas (e.g. east of the west coast of North America). This could be compensated for by considering the observed average cloud base altitude, [X](https://x.com/shotamatsuda/status/1885737165709254882).

- Introduce global cloud coverage and support rendering views from space.

- Currently developed using GLSL. It does not use node-based TSL yet, and WebGPU is not supported, but both are planned.

# API

Nothing novel here, just an orchestration of existing techniques. See the [references section](#references) for further details.

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

### Props

#### localWeatherTexture

```ts
localWeatherTexture: Texture | ProceduralTexture | null = DEFAULT_LOCAL_WEATHER_URL
```

The local weather texture, or a URL to it.

Each channel corresponds to the local weather signal of a specific cloud layer. The texture must be tileable.

Alternatively, you can pass an object that implements from [`ProceduralTexture`](#proceduraltexture-procedural3dtexture).

If left undefined, the default texture will be loaded directly from GitHub.

#### shapeTexture, shapeDetailTexture

```ts
shapeTexture: Data3DTexture | Procedural3DTexture | null = DEFAULT_SHAPE_URL
shapeDetailTexture: Data3DTexture | Procedural3DTexture | null = DEFAULT_SHAPE_DETAIL_URL
```

The shape and shape detail textures, or URLs to them.

The red channel represents the inverse amount of erosion applied to the cloud shell (a value of 0 means more erosion). The texture must be tileable (stackable).

Alternatively, you can pass objects that implement from [`Procedural3DTexture`](#proceduraltexture-procedural3dtexture).

If left undefined, the default textures will be loaded directly from GitHub.

#### turbulenceTexture

```ts
turbulenceTexture: Texture | ProceduralTexture | null = DEFAULT_TURBULENCE_URL
```

The turbulence texture, or a URL to it.

The RGB value represents a 3D vector used for domain distortion of the shape and shape detail. The texture must be tileable.

Alternatively, you can pass an object that implements from [`ProceduralTexture`](#proceduraltexture-procedural3dtexture).

If left undefined, the default texture will be loaded directly from GitHub.

#### stbnTexture

```ts
stbnTexture: Data3DTexture | null = DEFAULT_STBN_URL
```

A [spatiotemporal blue noise](https://research.nvidia.com/publication/2022-07_spatiotemporal-blue-noise-masks) (STBN) texture, or a URL to it.

If left undefined, the default texture will be loaded directly from GitHub.

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

  Applies temporal anti-aliasing (TAA) on BSM, not for the aliasing at polygon edges, but rather for temporal filtering:

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
qualityPreset: 'low' | 'medium' | 'high' | 'ultra' = 'high'
```

See also the [performance tweaks section](#performance-tweaks).

#### resolutionScale

```ts
resolutionScale: number = 1
```

Specifies the final output resolution. For example, setting this to 0.5 reduces the total number of texels to compute by 1/4.

#### temporalUpscale

```ts
temporalUpscale: boolean = true
```

Whether to perform temporal upscaling, which reduces the number of texels to ray march in the clouds pass by 1/16. It is recommended to keep this enabled unless targeting very high-performance devices.

See also the [limitations section](#limitations), as this technique has tradeoffs.

#### lightShafts

```ts
lightShafts: boolean = true
```

Whether to render light shafts (crepuscular rays) using additional ray marching. This enhances the visual impact of cloud-light interaction but is computationally expensive.

#### shapeDetail

```ts
shapeDetail: boolean = true
```

Whether to sample the shape detail texture. This enhances cloud details but is computationally expensive.

#### turbulence

```ts
turbulence: boolean = true
```

Whether to apply turbulence at the bottom of clouds by sampling the turbulence texture. This adds a sense of wind but is computationally expensive.

#### haze

```ts
haze: boolean = true
```

Whether to apply an approximated haze effect. This is inexpensive and recommended to keep enabled.

### Cloud layers

#### cloudLayers

```ts
cloudLayers: CloudLayer[] = [defaultCloudLayer, ...]
```

#### _layer_.altitude

```ts
altitude: number = 0
```

The altitude of the bottom of the cloud layer, measured from the ellipsoid surface in meters.

#### _layer_.height

```ts
height: number = 0
```

The height of the cloud layer in meters. Settings this value to 0 disables the layer.

#### _layer_.densityScale

```ts
densityScale: number = 0.2
```

Controls the overall density of the clouds within the layer. Settings this value to 0 disables the layer.

#### _layer_.shapeAmount

```ts
shapeAmount: number = 1
```

Controls the influence of the shape texture on the cloud layer.

#### _layer_.shapeDetailAmount

```ts
shapeDetailAmount: number = 1
```

Controls the influence of the shape detail texture on the cloud layer.

#### _layer_.weatherExponent

```ts
weatherExponent: number = 1
```

Controls the gradient of the weather texture. Values greater than 1 sharpen the gradient, while lower values flatten the weather making it more uniform.

#### _layer_.shapeAlteringBias

```ts
shapeAlteringBias: number = 0.35
```

Controls the vertical bias of the cloud shape. A value of 1 results in symmetry, while 0 fully biases the shape at the bottom.

#### _layer_.coverageFilterWidth

```ts
coverageFilterWidth: number = 0.6
```

Determines how the weather signal influences the shape-altered density. A value of 1 produces a linear gradient, ignoring weather signal, while 0 creates a sharp density transition at the weather signal.

#### _layer_.densityProfile

<!-- prettier-ignore -->
```ts
densityProfile: DensityProfile = {
  expTerm: number = 0, // a
  expScale: number = 0, // b
  linearTerm: number = 0.75, // c
  constantTerm: number = 0.25 // d
}
```

Controls how density varies with the height fraction ($\eta$), ranging from 0 to 1 within the cloud layer. Clouds are typically denser at the top and sparser at the bottom (hence the default values). You can adjust these parameters to define a different density distribution: $ae^{b\eta}+c\eta+d$.

#### _layer_.shadow

```ts
shadow: boolean = false
```

Specifies whether this cloud layer defines the maximum height considered in BSM. All cloud layers below this layer will be included in BSM, while layers above it will be ignored. If enabled on multiple layers, the highest layer takes precedence.

### Textures

#### localWeatherTexture

```ts
localWeatherTexture: Texture | ProceduralTexture | null = null
```

Same as [localWeatherTexture](#localweathertexture), except that it does not accept URLs and no default texture will be loaded.

#### shapeTexture, shapeDetailTexture

```ts
shapeTexture: Data3DTexture | Procedural3DTexture | null = null
shapeDetailTexture: Data3DTexture | Procedural3DTexture | null = null
```

Same as [shapeTexture, shapeDetailTexture](#shapetexture-shapedetailtexture), except that it does not accept URLs and no default texture will be loaded.

#### turbulenceTexture

```ts
turbulenceTexture: Texture | ProceduralTexture | null = null
```

Same as [turbulenceTexture](#turbulencetexture), except that it does not accept URLs and no default texture will be loaded.

#### stbnTexture

```ts
stbnTexture: Data3DTexture | null = null
```

Same as [stbnTexture](#stbntexture), except that it does not accept URLs and no default texture will be loaded.

### Scattering

#### scatteringCoefficient, absorptionCoefficient

```ts
scatteringCoefficient: number = 1
absorptionCoefficient: number = 0
```

The scattering coefficient ($\sigma_s$) and absorption coefficient ($\sigma_a$) following the standard definition in volumetric ray marching. Clouds are known to have an albedo very close to 1, defined as $\sigma_s/(\sigma_s+\sigma_a)$, so it is recommended to keep the absorption coefficient low, unless you want a different cloud appearance.

#### scatterAnisotropy1, scatterAnisotropy2, scatterAnisotropyMix

```ts
scatterAnisotropy1: number = 0.7
scatterAnisotropy2: number = -0.2
scatterAnisotropyMix: number = 0.5
```

Controls dual-lobe Henyey-Greenstein phase function. Positive anisotropy strengthens forward scattering, and negative strengthens back-scattering. The two scattering phases are combined using `scatterAnisotropyMix`.

These values take effect only when [`accuratePhaseFunction`](#cloudsaccuratephasefunction) is disabled.

#### skyIrradianceScale

```ts
skyIrradianceScale: number = 2.5
```

The contribution of sky irradiance. A value of 0 disables sky irradiance, while 1 represents single isotropic scattering. Since real-world sky light scatters multiple times, values greater than 1 make it more plausible.

#### groundIrradianceScale

```ts
groundIrradianceScale: number = 3
```

The contribution of irradiance bouncing off the ground. This is a fudge factor and you might adjust this value to make it look convincing to you.

#### powderScale, powderExponent

```ts
powderScale: number = 0.8
powderExponent: number = 150
```

Controls the [“Beer-Powder” term](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn) on the clouds. This is a fudge factor and you might adjust this value to make it look convincing to you.

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

Set this to true to use a numerically-fitted large particle (d = 10 μm) Mie phase function instead of the dual-lobe Henyey-Greenstein phase function. However, it won't be plausible without a more precise computation of multiple scattering.

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

Controls the step size for the primary ray marching, in meters.

#### clouds.maxRayDistance

```ts
maxRayDistance: number = 2e5
```

The limit on the primary ray distance, in meters.

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

Controls the step size for the secondary ray marching, in meters.

#### clouds.maxShadowFilterRadius

```ts
maxShadowFilterRadius: number = 6
```

The radius for percentage-closer filtering (PCF) on BSM when the sun is near the horizon. Setting this to 0 disables PCF, but it will suffer from aliasing.

#### clouds.maxShadowLengthIterationCount

```ts
maxShadowFilterRadius: number = 500
```

The limit on the number of iterations for the shadow length ray marching.

#### clouds.minShadowLengthStepSize

```ts
minShadowLengthStepSize: number = 50
```

Controls the step size for the shadow length ray marching, in meters.

#### clouds.maxShadowLengthRayDistance

```ts
maxShadowLengthRayDistance: number = 2e5
```

The limit on the shadow length ray distance, in meters.

#### clouds.hazeDensityScale

```ts
hazeDensityScale: number = 3e-5
```

Controls the density of the haze. A greater value makes it denser.

#### clouds.hazeExpScale

```ts
hazeExpScale: number = 1e-3
```

Controls the rate at which the haze density exponentially decreases with altitude. A lower value makes it more concentrated near the ground, while a higher value spreads it more at higher altitudes.

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
