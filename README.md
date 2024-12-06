# Geospatial Rendering in Three.js

This repository hosts a prototype of the rendering aspect of a Web GIS engine. It’s part of Takram’s client projects, commissioned by a company selected by the Cabinet Office of Japan under the SBIR (Small/Startup Business Innovation Research) program.

Since the Web GIS engine is planned to be developed as an open-source project, this prototype is also being developed openly. While it’s uncertain whether we can provide long-term maintenance, we hope this work proves to be valuable.

Our contribution to the project is scheduled to conclude by March 2025.

## Packages

<!-- prettier-ignore -->
| Name | Description | Status | NPM |
| -- | -- | -- | -- |
| [atmosphere](packages/atmosphere) | An implementation of Precomputed Atmospheric Scattering | Beta | [@takram/three-atmosphere](https://www.npmjs.com/package/@takram/three-atmosphere) |
| [core](packages/core) | Provides fundamental functions for rendering GIS data | Alpha | [@takram/three-geospatial](https://www.npmjs.com/package/@takram/three-geospatial) |
| [effects](packages/effects) | A collection of post-processing effects | Alpha | [@takram/three-geospatial-effects](https://www.npmjs.com/package/@takram/three-geospatial-effects) |

## Developing

This repository uses a monorepo setup with [Nx](https://nx.dev). Please refer to its documentation for details of the concept.

The `packages` directory contains the publishable NPM packages listed above.

The `storybook` directory contains [Storybook](https://storybook.js.org) stories across the libraries. The stories are separated from the libraries to avoid circular dependencies. Story files and components are also separated to enable fast-refresh, which only supports files containing components only.

The `apps` directory contains standalone applications.

- `data`: A command-line app for generating data.

### Installing

```sh
git clone git@github.com:takram-design-engineering/three-geospatial.git
cd three-geospatial
pnpm install
```

### Commands

Project level commands are defined in [`project.json`](project.json). Although library and app-specific commands are defined in the respective `project.json`, most of them are inferred targets, and you may need to run `nx show project {name}` to see them.

- `nx storybook`: Run Storybook locally.
- `nx build`: Build all libraries and apps.
- `nx build-libs`: Build all libraries.
- `nx build {name}`: Build a specific library or app.
- `nx lint`: Run linter.
- `nx format`: Run prettier.

### Environment variables

Create a `.env` file in the root directory with the following variables:

<!-- prettier-ignore -->
| Name | Description |
| -- | -- |
| `STORYBOOK_GOOGLE_MAP_API_KEY` | [Google Maps API key](https://developers.google.com/maps/documentation/tile/get-api-key) |
| `STORYBOOK_ION_API_TOKEN` | [Cesium Ion API access token](https://cesium.com/learn/ion/cesium-ion-access-tokens/) |

### Generating a library

To generate a React library:

```sh
nx generate @nx/react:library --name={name} --bundler=vite --directory=packages/{name} --compiler=swc --importPath={package_name} --style=none --unitTestRunner=jest --no-interactive
```

To add a Storybook configuration:

```sh
nx generate @nx/storybook:configuration --project={name} --uiFramework=@storybook/react-vite --no-interactive
```

## License

[MIT](LICENSE)
