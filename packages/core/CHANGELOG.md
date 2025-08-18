# Changelog

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
