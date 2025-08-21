# @takram/three-atmosphere/webgpu

[![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

A work-in-progress and experimental WebGPU support for `@takram/three-atmosphere`.

## API changes

- `PrecomputedTexturesGenerator` was replaced by `AtmosphereLUTNode`.
- `AerialPerspectiveEffect` was replaced by `AerialPerspectiveNode`.
- `SunDirectionalLight` and `SkyLightProbe` were replaced by `AtmosphereLight` and `AtmosphereLightNode`.
- `SkyMaterial` was replaced by `SkyNode` (`skyBackground`) that can be used in `Scene.backgroundNode`.
- `LightingMaskPass` was removed.
- `LensFlareEffect` was moved from `effects` to here and replaced by `LensFlareNode`.

# API

**Nodes**

- [`AtmosphereLUTNode`](#atmospherelutnode)
- [`SkyNode`](#skynode)
- [`SkyEnvironmentNode`](#skyenvironmentnode)
- [`AerialPerspectiveNode`](#aerialperspectivenode)
- [`LensFlareNode`](#lensflarenode)

**Objects**

- [`AtmosphereParameters`](#atmosphereparameters)
- [`AtmosphereContext`](#atmospherecontext)
- [`AtmosphereLight`](#atmospherelight)
