# Changelog

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
