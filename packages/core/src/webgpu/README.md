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

## FnVar

This is a utility function and works identically to `Fn`, except that the parameters of the callback function can be declared as variadic. This improves the colocation of parameters and their types.

When you return a function, it receives the current `NodeBuilder`.

→ [Source](/packages/core/src/webgpu/FnVar.ts)

```ts
const fn = FnVar((a: TextureNode, b: NodeObject, c?: number) => {})
const fn = FnVar((a: TextureNode, b: NodeObject, c?: number) => builder => {})

// Compared to:
const fn = Fn<[TextureNode, NodeObject, number | undefined]>(([a, b, c]) => {})
const fn = Fn<[TextureNode, NodeObject, number | undefined]>(
  ([a, b, c], builder) => {}
)
```

## FnLayout

This is a utility function and works identically to `Fn.setLayout`, except it’s declared as a higher-order function on `Fn`. This improves the colocation of parameters and their types.

→ [Source](/packages/core/src/webgpu/FnLayout.ts)

```tsx
const fn = FnLayout({
  name: 'f',
  type: 'vec3',
  inputs: [
    { name: 'a', type: 'vec3' },
    { name: 'b', type: 'vec3' },
    { name: 'c', type: 'float' }
  ]
})(([a, b, c], builder) => {
  // Suppose it's a very long function.
})

// Compared to:
const fn = Fn(([a, b, c], builder) => {
  // Suppose it's a very long function.
}).setLayout({
  name: 'f',
  type: 'vec3',
  inputs: [
    { name: 'a', type: 'vec3' },
    { name: 'b', type: 'vec3' },
    { name: 'c', type: 'float' }
  ]
})
```
