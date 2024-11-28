# Geovanni

## Packages

<!-- prettier-ignore -->
| Name | Description | Status | NPM |
| -- | -- | -- | -- |
| [3d-tiles](packages/3d-tiles) | Supporting functions for [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS) | Pre-release | @takram/three-3d-tiles-support |
| [atmosphere](packages/atmosphere) | An implementation of [Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/) | Beta | [@takram/three-atmosphere](https://www.npmjs.com/package/@takram/three-atmosphere) |
| [core](packages/core) | Provides fundamental functions for rendering GIS data | Alpha | [@takram/three-geospatial](https://www.npmjs.com/package/@takram/three-geospatial) |
| [csm](packages/csm) | A fork of [three-csm](https://github.com/StrandedKitty/three-csm) (cascaded shadow map) | Pre-release | @takram/three-csm |
| [effects](packages/effects) | | Alpha | [@takram/three-geospatial-effects](https://www.npmjs.com/package/@takram/three-geospatial-effects) |
| [terrain](packages/terrain) | | Pre-release | @takram/three-terrain |
| [terrain-core](packages/terrain-core) | | Pre-release | @takram/three-terrain-core |
| [worker](packages/worker) | | Pre-release | @takram/three-geospatial-worker |

## Developing

Run `nx dev playground` to serve the playground in development mode.

Run `nx storybook` to serve stories.

### Environment variables

Create `.env` at the root directory.

<!-- prettier-ignore -->
| Name | Description |
| -- | -- |
| `(NEXT_PUBLIC\|STORYBOOK)_GOOGLE_MAP_API_KEY` | [Google Map Tiles API key](https://developers.google.com/maps/documentation/tile/get-api-key) |
| `(NEXT_PUBLIC\|STORYBOOK)_ION_API_TOKEN` | [Cesium Ion API access token](https://cesium.com/learn/ion/cesium-ion-access-tokens/) |

### Generating package

For React library:

```sh
nx generate @nx/react:library --name={name} --bundler=vite --directory=packages/{name} --compiler=swc --importPath={package_name} --style=none --unitTestRunner=jest --no-interactive
```

Add storybook configuration:

```sh
nx generate @nx/storybook:configuration --project={name} --uiFramework=@storybook/react-vite --no-interactive
```
