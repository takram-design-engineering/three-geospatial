# Changelog

### Changed

- Added support for the irradiance mask, [#30](https://github.com/takram-design-engineering/three-geospatial/issues/30).

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

- `SkyMaterial`: Fixed changes to `groundAlbedo` didn’t trigger shader recompilation.
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

- Switched to Vite’s native raw loading function for importing GLSL shaders.
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

- Made `AerialPerspectiveEffect`’s camera parameter optional, [#18](https://github.com/takram-design-engineering/three-geospatial/pull/18).
- Changed `Stars` so it doesn’t render until the data is loaded, [#16](https://github.com/takram-design-engineering/three-geospatial/pull/16).

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
