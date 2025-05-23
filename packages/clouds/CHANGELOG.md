# Changelog

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
