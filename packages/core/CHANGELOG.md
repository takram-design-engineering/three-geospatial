# Changelog

## [0.9.1] - 2026-05-06

### Fixed

- Fixed subclasses of TextureNode not being properly cloned.

## [0.9.0] - 2026-04-27

All changes were made to the WebGPU implementation, unless otherwise noted.

### Added

- `TemporalAntialiasNode`, `ScreenSpaceShadowNode`: Added support for reversed depth buffer.
- Added experimental `CascadedShadowMapsNode`.
- Added `STBNTextureNode` and `stbn` accessor.
- Added `viewZ` accessor.

### Changed

- `ScreenSpaceShadowNode`: Removed `nearDepth` and `farDepth` uniforms. They are determined by the renderer's depth buffer configuration.
- `FnLayout`: Removed `texture` and `texture3D` placeholder types.
- `TemporalAntialiasNode`: Adjusted the amount of subpixel correction.

### Fixed

- `TemporalAntialiasNode`: Fixed incompatibility with Three.js r183.
- `LensGlareNode`: Fixed occasional runtime errors on some devices, fixing the delayed update of the lens glare to texels.
- `ScreenSpaceShadowNode`: Fixed incompatibility with Three.js r184.

## [0.8.0] - 2026-04-05

### Added

- Added `ScreenSpaceShadowNode`.

### Changed

- WebGPU entry point (`@takram/three-geospatial/webgpu`) requires `three >= 0.182.0`.
- BREAKING: Removed `RTTTextureNode` and `convertToTexture`. Use `RTTNode` and `convertToTexture` in `three/tsl` instead.
- BREAKING: Changed the UV of `EllipsoidGeometry` to make (0, 0.5) coincide with the prime meridian without rotation. You might need to change the rotation of the mesh.
- Deprecated the higher-order function signature of `temporalAntialias`.
- `TemporalAntialiasNode`: Improved subpixel correction.

### Fixed

- `TemporalAntialiasNode`: Fixed ghosting when resizing canvas.

## [0.7.1] - 2026-03-23

### Fixed

- Fixed depth test when logarithmic depth is used with `postprocessing >= 6.38.0`, [#100](https://github.com/takram-design-engineering/three-geospatial/issues/100).
- Fixed convolution filters not being compiled with `three@0.183.0`.

## [0.7.0] - 2026-03-09

### Changed

- Migrated types to `@types/three@0.182.0`.
- Updated dependencies.

## [0.6.0] - 2025-12-24

### Changed

- Migrated types to `@types/three@0.181.0`.
- Updated dependencies.

## [0.5.1] - 2025-11-01

### Fixed

- Removed `three-stdlib` from dependencies to fix compatibility with importmaps.
- Reverted the TS target to `es2017` to fix incorrect code generation.

## [0.5.0] - 2025-11-01

### Added

- Added initial support for WebGPU / TSL. See [WEBGPU.md](https://github.com/takram-design-engineering/three-geospatial/blob/main/packages/core/WEBGPU.md) for details.
- Added `getMoonFixedToECIRotationMatrix`.
- `Ellipsoid`: Added `flattening`, `eccentricity`.

### Changed

- Removed module augmentation from type definitions.
- Updated dependencies.

### Fixed

- Addressed usage of `requestIdleCallback` in SSR environment.

## [0.4.0] - 2025-08-19

### Added

- `Ellipsoid`: Added `getNorthUpEastFrame`.

### Changed

- Updated dependencies.

## [0.3.0] - 2025-07-05

### Changed

- Removed loader factory functions and changed loaders to be configurable, since `useLoader` can now accept loader instances.
- Renamed `DataLoader` to `DataTextureLoader`.
- Renamed `EXR3DLoader` to `EXR3DTextureLoader`.
- Added `EXRTextureLoader`.
- Removed `Texture3DLoader`.
- Updated dependencies.

### Fixed

- Fixed unnecessary side effects of type-only imports.

## [0.2.2] - 2025-06-12

### Changed

- Removed the use of `forwardRef` and added it in props.
- Updated dependencies.

## [0.2.1] - 2025-05-23

### Fixed

- Removed `process.env.NODE_ENV` from the ES build output.

## [0.2.0] - 2025-03-09

Updated peer dependencies to React 19 and R3F v9. For React 18 and R3F v8, use version 0.1.x, which will continue to receive fixes.

### Changed

- Migrated types and internal fields to R3F v9.
- Removed deprecated classes and properties.

## [0.1.0] - 2025-03-09

Compatibility release to continue support for React 18 and R3F v8.
