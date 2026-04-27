# Geospatial Rendering in Three.js

A monorepo of libraries for enhancing geospatial rendering in Three.js.

This project takes a modular approach, allowing users to selectively use only the parts they need rather than aiming to provide a comprehensive solution. It is designed to work alongside existing, excellent libraries such as `3d-tiles-renderer`, `astronomy-engine`, and of course Three.js and R3F (React Three Fiber).

This project originally started as a prototype focused on the rendering aspect of a Web GIS engine developed by Eukarya. It was part of Takram's client work, commissioned by Eukarya under the SBIR (Small/Startup Business Innovation Research) program led by the Cabinet Office of Japan. Our contribution to the project concluded in March 2025.

## Packages

<!-- prettier-ignore -->
| Name | Description | Status | NPM |
| -- | -- | -- | -- |
| [atmosphere](packages/atmosphere) | An implementation of Precomputed Atmospheric Scattering | Beta | [@takram/three-atmosphere](https://www.npmjs.com/package/@takram/three-atmosphere) |
| [clouds](packages/clouds) | Geospatial volumetric clouds | Beta | [@takram/three-clouds](https://www.npmjs.com/package/@takram/three-clouds) |
| [core](packages/core) | Provides fundamental functions for rendering GIS data | Alpha | [@takram/three-geospatial](https://www.npmjs.com/package/@takram/three-geospatial) |
| [effects](packages/effects) | A collection of post-processing effects | Alpha | [@takram/three-geospatial-effects](https://www.npmjs.com/package/@takram/three-geospatial-effects) |

Other packages not listed above are considered "examples" and are not intended for production use.

## Status of WebGPU support

I'm actively working on WebGPU support. This involves a complete rewrite of the API due to the transition from shader-chunk-based post-processing to a node-based approach. It already performs much better and offers greater flexibility.

→ [Storybook](https://takram-design-engineering.github.io/three-geospatial-webgpu)

It will feature:

- Much faster generation of the atmosphere LUT
- Accurate atmospheric lighting at large scale for all materials
- Geometry-based lens glare
- Temporal antialiasing
- The moon's surface
- More reliable rendering of stars

Once all packages support WebGPU, the current shader-chunk-based architecture will be archived and superseded by the node-based implementation. This does not mean dropping WebGL support, because a WebGL fallback will still be possible, but the new API will be incompatible with the current one.

<!-- prettier-ignore -->
| Name | Status |
| -- | -- |
| [atmosphere](packages/atmosphere/WEBGPU.md) | Done |
| clouds | Work in progress |
| [core](packages/core/WEBGPU.md) | Done |
| effects | To be merged with core |

## Developing

This repository uses a monorepo setup with [Nx](https://nx.dev). Please refer to its documentation for details.

The `packages` directory contains the publishable NPM packages listed above.

The `storybook` directory contains [Storybook](https://storybook.js.org) stories across the libraries. Stories are separated from the libraries to avoid circular dependencies. Story files and components are also separated to enable fast-refresh, which only works with files that contain components only.

The `apps` directory contains standalone applications.

- `data`: A command-line app for generating data.

### Installing

```sh
git clone git@github.com:takram-design-engineering/three-geospatial.git
cd three-geospatial
pnpm install
```

This repository uses [Git LFS](https://git-lfs.com) for assets. You may need to [install it](https://docs.github.com/en/repositories/working-with-files/managing-large-files/installing-git-large-file-storage) and pull/fetch the assets using:

```sh
git lfs pull
```

### Commands

Project level commands are defined in [`project.json`](project.json). Library and app specific commands are defined in their respective `project.json` files, but most of them are inferred targets. You may need to run `nx show project {name}` to see them.

- `nx storybook`: Run Storybook locally.
- `nx build`: Build all libraries and apps.
- `nx build-libs`: Build all libraries.
- `nx build {name}`: Build a specific library or app.
- `nx test`: Run unit tests.
- `nx lint`: Run linter.
- `nx format-all`: Run prettier.

### Environment variables

Create a `.env` file in the root directory with either of the following variables:

<!-- prettier-ignore -->
| Name | Description |
| -- | -- |
| `STORYBOOK_GOOGLE_MAP_API_KEY` | [Google Maps API key](https://developers.google.com/maps/documentation/tile/get-api-key) |
| `STORYBOOK_ION_API_TOKEN` | [Cesium Ion API access token](https://cesium.com/learn/ion/cesium-ion-access-tokens/) |

### Formatting and linting

Run `nx format-all` to format source code using Prettier. Ignore files you did not edit, as other files may also be formatted.

Run `nx lint` to check for non-formatting-related code conventions.

Alternatively, if you use VS Code, the [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) and [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) can help.

### Running Storybook

All examples are created as [Storybook](https://storybook.js.org) stories, hosted at: https://takram-design-engineering.github.io/three-geospatial/.

The command below runs Storybook locally on port 4400 by default. You can override the port with the `--port` option:

```sh
nx storybook
nx storybook --port 8080
```

### Note on Storybook errors

You may occasionally encounter the following errors, especially when switching branches:

```
The file does not exist at "..." which is in the optimize deps directory.
The dependency might be incompatible with the dep optimizer.
Try adding it to `optimizeDeps.exclude`.
```

or even `R3F: Hooks can only be used within the Canvas component!` error in the browser.

If the Storybook build succeeded on the commit you're currently on in Github Actions, the problem is likely not in the source or Storybook configuration. I haven't found a reliable way to prevent or recover from this.

In most cases, removing the Storybook cache, resetting Nx, restarting Storybook, and opening it in a _new browser window_ resolves the issue:

```sh
rm -r storybook/node_modules
nx reset
nx storybook
```

If the problem persists, try clearing the browser cache.

### Generating a library

To generate a React library:

```sh
nx generate @nx/react:library --name={name} --bundler=vite --directory=packages/{name} --compiler=babel --importPath={package_name} --style=none --unitTestRunner=jest --no-interactive
```

To add a Storybook configuration:

```sh
nx generate @nx/storybook:configuration --project={name} --uiFramework=@storybook/react-vite --no-interactive
```

## License

[MIT](LICENSE)
