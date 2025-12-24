# Changelog

## [0.6.0] - 2025-12-24

### Changed

- Migrated types to `@types/three@0.181.0`.
- Updated dependencies.

## [0.5.2] - 2025-11-01

### Fixed

- Removed `three-stdlib` from dependencies to fix compatibility with importmaps.
- Reverted the TS target to `es2017` to fix incorrect code generation.

## [0.5.1] - 2025-11-01

### Changed

- Removed module augmentation from type definitions.
- Updated dependencies.

## [0.5.0] - 2025-08-19

### Changed

- Removed `ellipsoidCenter` and `ellipsoidMatrix`. They have been replaced by `worldToECEFMatrix` (breaking change).
- Updated dependencies.

### Fixed

- Improved the reprojection during temporal upscaling.
- Fixed noise in the velocity vector during temporal upscaling.

## [0.4.1] - 2025-07-14

### Changed

- Updated the dependency to atmosphere.

## [0.4.0] - 2025-07-05

### Added

- `CloudsEffect`: Added `singleMieScatteringTexture` and `higherOrderScatteringTexture` props.

### Changed

- Removed `photometric` options and props. It outputs luminance only now.
- Removed the shadow length attenuation hack.
- React components no longer trigger React state changes when textures are loaded.
- `CloudsEffect`: Deprecated and renamed `skyIrradianceScale`, `groundIrradianceScale` and `accurateSunSkyIrradiance` to `skyLightScale`, `groundBounceScale` and `accurateSunSkyLight`.
- Migrated to core API changes.
- Updated dependencies.

### Fixed

- Fixed unnecessary side effects of type-only imports.

## [0.3.0] - 2025-06-12

### Changed

- Added support for absorption in haze.
- `CloudsMaterial`: Changed the default values of both `skyIrradianceScale` and `groundIrradianceScale` to 1.
- `CloudsMaterial`: Added `hazeScatteringCoefficient` and `hazeAbsorptionCoefficient` which are separated from those of the clouds.
- Removed the use of `forwardRef` and added it in props.

### Fixed

- Adjusted the scaling of irradiance for cloud particles to better reflect isotropic scattering.
- Added a workaround so that the unlit rays towards far clouds appear orange.
- Fixed incorrect handling of cloud transmittance and inscattered light when compositing into the render buffer.
- Changed the behavior of unlit rays through haze so that they don't occlude sky light.
- Improved approximation of the haze integral to reduce unnatural gradient just above the clouds at the horizon.
- Fixed scene depth conversion when logarithmic depth is used, [#66](https://github.com/takram-design-engineering/three-geospatial/pull/66).

## [0.2.2] - 2025-05-23

### Fixed

- Removed `process.env.NODE_ENV` from the ES build output.

## [0.2.1] - 2025-03-14

### Fixed

- `CloudsEffect`: Fixed the camera provided in the constructor was not applied to the internal passes.
- Fixed artifacts due to insufficient precision of linear interpolation, [#41](https://github.com/takram-design-engineering/three-geospatial/issues/41).

## [0.2.0] - 2025-03-09

Updated peer dependencies to React 19 and R3F v9. For React 18 and R3F v8, use version 0.1.x, which will continue to receive fixes.

### Changed

- Migrated types and internal fields to R3F v9.
- Removed deprecated classes and properties.

## [0.1.2] - 2025-03-09

Compatibility release to continue support for React 18 and R3F v8.

## [0.1.1] - 2025-03-02

### Changed

- Deprecated `useHalfFloat`, as it is now always true.
- Increased step resolution in `ultra` quality preset.
- Updated dependencies.

## [0.1.0] - 2025-02-23

Initial release
