# Changelog

## Unreleased

This might be one of the biggest changes in the atmosphere package. This release introduces the multiple scattering LUT proposed in Sébastien Hillaire's [A Scalable and Production Ready Sky and Atmosphere Rendering Technique](https://sebh.github.io/publications/egsr2020.pdf). This removes the need for expensive stepwise computation of higher-order scattering in the 4D scattering LUT, and also allows inscattered light to be raymarched at runtime, eliminating artifacts due to floating-point precision in the 4D scattering LUT.

Please consider this release as transitional, and further fundamental improvements such as Sky-View LUT and raymarched volumetric shadows, will be added.

All changes were made to the WebGPU implementation, unless otherwise noted.

### Added

- Added preliminary support for moonlight and scattering in a low light setup.
- `AerialPerspectiveNode`: Added support for reversed depth buffers.
- Added `ShadowLengthNode` for epipolar volumetric shadow sampling.
- Added Hillaire's multiple scattering LUT, and removed stepwise computation of higher-order scattering in the 4D scattering LUT.
- `AtmosphereContext`: Added `raymarchScattering` option to enable raymarching inscattered light between the camera and scene objects. This is enabled by default.
- `AtmosphereContext`: Added `accurateShadowScattering` option to account for shadowed segments along the ray more accurately.

### Changed

- `SkyEnvironmentNode`: Optimized the PMREM texture generation.
- `AtmosphereContext`: Deprecated and renamed `inscatter` to `inscattering`.
- `AtmosphereParameters`: Deprecated and renamed `*Sun*` properties to `*Light*`.
- `AtmosphereParameters`: Removed `transmittancePrecisionLog` option.
- `AtmosphereLUTNode`: 4D scattering LUT now only contains the single Rayleigh scattering when `higherOrderScatteringTexture` option is enabled.
- `AtmosphereLUTNode`: Higher-order scattering LUT now contains the scattering term rather than that over the Rayleigh phase.
- `AerialPerspectiveNode`: Added approximated inscattered light below the bottom of the atmosphere.
- `StarsNode`: Changed the luminance of stars more physically correct and the default intensity to 1000.

### Fixed

- Fixed errors when `higherOrderScatteringTexture` is disabled.
- Fixed changes in `AtmosphereParameters` not being applied when used by multiple renderers.
- `MoonNode`: Fixed unstable derivatives.
- `SkyEnvironmentNode`: Fixed incompatibility with Three.js r183, [#105](https://github.com/takram-design-engineering/three-geospatial/issues/105).
- `StarsNode`: Fixed incompatibility with Three.js r183, [#105](https://github.com/takram-design-engineering/three-geospatial/issues/105).
- Fixed linear sRGB representation of stars. This shifts them more toward blue.

## [0.18.0] - 2026-04-05

### Changed

- WebGPU entry point (`@takram/three-atmosphere/webgpu`) requires `three >= 0.182.0`.
- BREAKING: Nodes and objects no longer take `atmosphereContext` as a constructor parameter. Use `renderer.contextNode` instead.

  Before:

  ```ts
  import {
    aerialPerspective,
    AtmosphereContextNode,
    AtmosphereLight
  } from '@takram/three-atmosphere/webgpu'

  const atmosphereContext = new AtmosphereContextNode()

  const node = aerialPerspective(atmosphereContext, colorNode, depthNode)
  const light = new AtmosphereLight(atmosphereContext)
  ```

  After:

  ```ts
  import {
    aerialPerspective,
    AtmosphereContext,
    AtmosphereLight
  } from '@takram/three-atmosphere/webgpu'
  import { context } from 'three/tsl'

  // AtmosphereContextNode is replaced by AtmosphereContext:
  const atmosphereContext = new AtmosphereContext()

  // Instead of passing the atmosphere context in the parameter of classes and
  // functions, create `getAtmosphere: () => AtmosphereContext` in the
  // renderer's global context:
  renderer.contextNode = context({
    ...renderer.contextNode.value, // Merge with the existing context values
    getAtmosphere: () => atmosphereContext
  })

  // The atmosphere context parameter must then be omitted:
  const node = aerialPerspective(colorNode, depthNode)
  const light = new AtmosphereLight()
  ```

- Deprecated `AtmosphereContextNode` and renamed it to `AtmosphereContext`.
- Changed default values for `depthTest` and `depthWrite` in `SkyMaterial` and `StarsMaterial`.
- Deprecated `SKY_RENDER_ORDER`, which is no longer used.
- BREAKING: Replaced `MoonNode.normalNode` with `MoonNode.displacementNode`.

### Fixed

- Fixed `StarsMaterial` not fully appearing over post-processing sky, [#28](https://github.com/takram-design-engineering/three-geospatial/issues/28).

## [0.17.1] - 2026-03-23

### Fixed

- Fixed depth test when logarithmic depth is used with `postprocessing >= 6.38.0`, [#100](https://github.com/takram-design-engineering/three-geospatial/issues/100).

## [0.17.0] - 2026-03-09

### Changed

- Updated the peer dependency for `postprocessing` to `>= 6.38.0`.
- `PrecomputedTexturesLoader`: Removed deprecated `setTypeFromRenderer()`.
- Removed deprecated `sunIrradiance` and `skyIrradiance` options.
- Removed deprecated `IrradianceMask`.
- `AerialPerspectiveEffect`: Removed deprecated `irradianceScale` option.
- `StarsMaterial`: Removed deprecated `radianceScale` option.
- Removed deprecated `useAtmosphereTextureProps` hook.
- Updated dependencies.

### Fixed

- Fixed logarithmic depth when used with `postprocessing >= 6.38.0`.

## [0.16.0] - 2025-12-24

### Changed

- Migrated types to `@types/three@0.181.0`
- `AerialPerspectiveEffect`, `AerialPerspectiveNode`: Improved post-process lighting when normal buffer is disabled, [97](https://github.com/takram-design-engineering/three-geospatial/pull/97).
- Updated dependencies.

## [0.15.1] - 2025-11-01

### Fixed

- Removed `three-stdlib` from dependencies to fix compatibility with importmaps.
- Reverted the TS target to `es2017` to fix incorrect code generation.

## [0.15.0] - 2025-11-01

### Added

- Added initial support for WebGPU / TSL. See [WEBGPU.md](https://github.com/takram-design-engineering/three-geospatial/blob/main/packages/atmosphere/WEBGPU.md) for details.

### Changed

- Removed module augmentation from type definitions.
- Updated dependencies.

### Fixed

- Fixed `USE_LOGARITHMIC_DEPTH_BUFFER` was not respected.

## [0.14.0] - 2025-08-19

### Added

- `AerialPerspectiveEffect`, `SkyMaterial`: Added `ground` option.

### Changed

- Removed `ellipsoidCenter` and `ellipsoidMatrix`. They have been replaced by `worldToECEFMatrix` (breaking change).
- `Atmosphere`: Renamed `rotationMatrix` to `inertialToECEFMatrix` (breaking change).
- Updated dependencies.

### Fixed

- Atmosphere now correctly renders the surface below the ellipsoid surface, [5](https://github.com/takram-design-engineering/three-geospatial/issues/5).
- Fixed the nutation and precession that were incorrectly accounted for in the celestial directions.

## [0.13.2] - 2025-07-14

### Fixed

- Fixed `PrecomputedTexturesGenerator` incorrectly reads FP32 values from half-float textures on the CPU.

## [0.13.1] - 2025-07-14

### Fixed

- Fixed the transmittance values underflow to zero in half-float precision at the precomputation stage.

## [0.13.0] - 2025-07-05

### Added

- Added `PrecomputedTexturesGenerator`. It's now possible to apply atmospheric effects without needing to load assets.
- `PrecomputedTexturesLoader`: Added a `singleMieScattering` option to reduce artifacts in Mie scattering.
- `PrecomputedTexturesLoader`: Added a `higherOrderScattering` option to attenuate only single scattering by shadow length.
- `AerialPerspectiveEffect`, `AtmosphereMaterialBase`: Added `singleMieScatteringTexture` and `higherOrderScatteringTexture` props.
- Added `PrecomputedTextures` interface.

### Changed

- `Atmosphere`: Precomputed textures are now generated by default.
- `PrecomputedTexturesLoader`: Deprecated and renamed `setTypeFromRenderer()` to `setType()`.
- `PrecomputedTexturesLoader`: `load()` returns textures that will be loaded asynchronously.
- `PrecomputedTexturesLoader`: Takes both format and type in the constructor.
- Reorganized the atmosphere shaders.
- Removed a slight night light from the precomputed textures.
- Relaxed the type of transmittance and irradiance textures from `DataTexture` to `Texture`.
- Removed `photometric` options and props. It now outputs only luminance.
- Changed CPU texture sampling to cache Float16Array instances.
- React components no longer trigger React state changes when textures are loaded.
- Deprecated and renamed `sunIrradiance` and `skyIrradiance` options and props to `sunLight` and `skyLight`.
- Deprecated and renamed `IrradianceMask` to `LightingMask`.
- `AerialPerspectiveEffect`: Deprecated and renamed `irradianceScale` to `albedoScale`.
- `StarsMaterial`: Deprecated and renamed `radianceScale` to `intensity`.
- Deprecated `useAtmosphereTextureProps`.
- Migrated to core API changes.
- Updated dependencies.

### Fixed

- `AerialPerspectiveEffect`: Fixed saturated inscattered light when the camera is located below the bottom atmosphere and `correctGeometricError` is enabled.
- Fixed potential texture memory leaks.
- Fixed unnecessary side effects of type-only imports.

## [0.12.0] - 2025-06-12

### Changed

- Added support for the irradiance mask, [#30](https://github.com/takram-design-engineering/three-geospatial/issues/30).
- Removed the use of `forwardRef` and added it in props.

### Fixed

- `AerialPerspectiveEffect`: Fixed artifacts in transmittance and inscattered light for the points above the top atmosphere boundary.
- Fixed the flashing artifacts that appear on surfaces shading the sun, [#47](https://github.com/takram-design-engineering/three-geospatial/issues/47).

## [0.11.2] - 2025-05-23

### Fixed

- `Sky`: `groundAlbedo` prop now resets to default value when removed.
- Removed `process.env.NODE_ENV` from the ES build output.

## [0.11.1] - 2025-03-14

### Fixed

- Fixed artifacts due to insufficient precision of linear interpolation, [#41](https://github.com/takram-design-engineering/three-geospatial/issues/41).

## [0.11.0] - 2025-03-09

Updated peer dependencies to React 19 and R3F v9. For React 18 and R3F v8, use version 0.10.x, which will continue to receive fixes.

### Changed

- Migrated types and internal fields to R3F v9.
- Removed deprecated classes and properties.

## [0.10.2] - 2025-03-09

### Fixed

- `SkyLight`, `SunLight`: Fixed props not rolling back when unset.

## [0.10.1] - 2025-03-09

Compatibility release to continue support for React 18 and R3F v8.

## [0.10.0] - 2025-03-02

### Changed

- Added OpenEXR precomputed textures and made them default, [#32](https://github.com/takram-design-engineering/three-geospatial/issues/32).
- Updated binary precomputed textures to use half-float.
- Deprecated `useHalfFloat`, as it is now always true.
- Updated dependencies.

## [0.9.0] - 2025-02-23

### Changed

- Switched transpiler to Babel to support property decorators.
- Updated prop types to use interfaces.
- Refactored GLSL macro properties using decorators.
- `AerialPerspectiveEffect`: Changed PCF filter for BSM to IGN + Vogel disk and reduced default sample count.

### Fixed

- Moved `type-fest` to dependencies.

## [0.8.0] - 2025-02-12

### Changed

- `Atmosphere`, `useAtmosphereTextureProps`: Precomputed textures will now be loaded directly from GitHub if `textures` prop is left undefined.
- `Stars`: Data will now be loaded directly from GitHub if `data` prop is left undefined.
- Improved safety of number conversion to GLSL macros.
- Removed shadow length hack near the horizon.
- Renamed `AtmosphereTransientProps` type to `AtmosphereTransientStates`.
- Updated undocumented functions for preparing cloud and light shafts compositing.
- Updated dependencies.

### Fixed

- `SkyMaterial`: Fixed changes to `groundAlbedo` didn't trigger shader recompilation.
- `Atmosphere`: STBN texture is now loaded only when necessary.
- Removed dependency on `jotai`.
- Fixed type error related to `Event`.

## [0.7.1] - 2025-02-11

### Fixed

- Fixed incorrect precomputed scattering textures, [#33](https://github.com/takram-design-engineering/three-geospatial/issues/33).

## [0.7.0] - 2025-02-02

### Added

- `SkyMaterial`: Added support for custom ground albedo in sky rendering (undocumented for now).
- `AerialPerspectiveEffect`: Refined R3F type definitions.
- Added uniform type definitions.
- Added undocumented functions for preparing cloud and light shafts compositing.

### Changed

- Switched to Vite's native raw loading function for importing GLSL shaders.
- Separated shader code exports in `@takram/three-atmosphere/shaders`.
- Removed unused shader codes in atmosphere functions.
- Updated dependencies.

### Fixed

- `StarsMaterial`: Fixed incorrect proxy to `magnitudeRange` uniform.
- `StarsMaterial`: Ensured stars are not rendered in front of the ground.

## [0.6.0] - 2025-01-19

### Added

- Added function to move the ellipsoid via `ellipsoidCenter` and `ellipsoidMatrix`, [#11](https://github.com/takram-design-engineering/three-geospatial/issues/11).

### Changed

- Updated dependencies.

## [0.5.0] - 2024-12-19

### Added

- `AerialPerspectiveEffect`: Added `sky` option to render the sky in post-processing.

### Changed

- `Sky`, `Stars`: Render after scene objects to take advantage of early Z rejection, [#27](https://github.com/takram-design-engineering/three-geospatial/pull/27).
- Updated dependencies.

### Fixed

- Fixed handling of negative square root calculations, [#26](https://github.com/takram-design-engineering/three-geospatial/pull/26).

## [0.4.0] - 2024-12-15

### Changed

- `AerialPerspectiveEffect`: Refined the geometric error correction to support different FoVs and orthographic camera, [#21](https://github.com/takram-design-engineering/three-geospatial/pull/21).
- `AerialPerspectiveEffect`: Removed `geometricErrorAltitudeRange` parameter, [#21](https://github.com/takram-design-engineering/three-geospatial/pull/21).
- `SkyMaterial`: Disabled sun and moon fragment output when using orthographic camera.
- `Stars`, `StarsMaterial`: Disabled when using orthographic camera.

### Fixed

- `AerialPerspectiveEffect`: Fixed the shading was not visible due to the geometric error correction, [#21](https://github.com/takram-design-engineering/three-geospatial/pull/21).

## [0.3.0] - 2024-12-11

### Added

- Added support for orthographic camera, [#15](https://github.com/takram-design-engineering/three-geospatial/pull/15).

## [0.2.0] - 2024-12-10

### Changed

- Made `AerialPerspectiveEffect`'s camera parameter optional, [#18](https://github.com/takram-design-engineering/three-geospatial/pull/18).
- Changed `Stars` so it doesn't render until the data is loaded, [#16](https://github.com/takram-design-engineering/three-geospatial/pull/16).

## [0.1.0] - 2024-12-06

### Changed

- Added date prop, [#10](https://github.com/takram-design-engineering/three-geospatial/issues/10).
- Added workaround for the viewpoint located underground, [#5](https://github.com/takram-design-engineering/three-geospatial/issues/5).

### Fixed

- Removed unused dependency.

## [0.0.2] - 2024-12-03

_Note this version should have been 0.1.0._

### Changed

- Added sourcemaps, [#6](https://github.com/takram-design-engineering/three-geospatial/issues/6).
- Removed redundant precomputed textures, [#9](https://github.com/takram-design-engineering/three-geospatial/issues/9).
- Reduced bundle size.

### Fixed

- Fixed handling of non-logarithmic depth buffer, [#3](https://github.com/takram-design-engineering/three-geospatial/issues/3).
- Fixed incorrect ECI to ECEF transformation.
- Refined type definitions.

## [0.0.1] - 2024-11-30

Initial release
