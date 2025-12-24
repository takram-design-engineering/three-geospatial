# Changelog

## [0.5.0] - 2025-12-24

### Changed

- Migrated types to `@types/three@0.181.0`.
- Updated dependencies.

## [0.4.3] - 2025-11-01

### Fixed

- Removed `three-stdlib` from dependencies to fix compatibility with importmaps.
- Reverted the TS target to `es2017` to fix incorrect code generation.

## [0.4.2] - 2025-11-01

### Changed

- Removed module augmentation from type definitions.
- Updated dependencies.

## [0.4.1] - 2025-08-19

### Changed

- Updated dependencies.

## [0.4.0] - 2025-07-05

### Changed

- Migrated to core API changes.
- Updated dependencies.

### Fixed

- Fixed unnecessary side effects of type-only imports.

## [0.3.2] - 2025-06-12

### Changed

- Removed the use of `forwardRef` and added it in props.
- Updated dependencies.

## [0.3.1] - 2025-05-23

### Fixed

- Removed `process.env.NODE_ENV` from the ES build output.

## [0.3.0] - 2025-03-14

### Changed

- Removed `SSAO` component in favor of the one in `@react-three/postprocessing`.

## [0.2.0] - 2025-03-09

Updated peer dependencies to React 19 and R3F v9. For React 18 and R3F v8, use version 0.1.x, which will continue to receive fixes.

### Changed

- Migrated types and internal fields to R3F v9.
- Removed deprecated classes and properties.

## [0.1.0] - 2025-03-09

Compatibility release to continue support for React 18 and R3F v8.
