# @takram/three-geospatial/webgpu

[![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

A work-in-progress and experimental WebGPU support for `@takram/three-geospatial`.

## API changes

- `LensFlareEffect` was moved from `effects` to here and replaced by `LensFlareNode`.

# API

- [`FnVar`](#fnvar)
- [`FnLayout`](#fnlayout)
- [`OutputTextureNode`](#outputtexturenode)
- [`OutputTexture3DNode`](#outputtexture3dnode)
- [`HighpVelocityNode`](#highpvelocitynode)

**Effects**

- [`LensFlareNode`](#lensflarenode)
- [`TemporalAntialiasNode`](#temporalantialiasnode)

**Filters**

- [`FilterNode`](#filternode)
- [`SingleFilterNode`](#singlefilternode)
- [`SeparableFilterNode`](#separablefilternode)
- [`DualFilterNode`](#dualfilternode)
- [`GaussianBlurNode`](#gaussianblurnode)
- [`KawaseBlurNode`](#kawaseblurnode)
- [`MipmapBlurNode`](#mipmapblurnode)
- [`MipmapSurfaceBlurNode`](#mipmapsurfaceblurnode)
- [`DownsampleThresholdNode`](#downsamplethresholdnode)
