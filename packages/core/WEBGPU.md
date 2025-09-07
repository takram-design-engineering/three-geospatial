# @takram/three-geospatial/webgpu

[![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

A work-in-progress and experimental WebGPU support for `@takram/three-geospatial`.

## API changes

- `LensFlareEffect` was moved from `effects` to here and replaced by `LensFlareNode`.

# API

- [`FnVar`](#fnvar)
- [`FnLayout`](#fnlayout)
- [`OutputTextureNode`, `OutputTexture3DNode`](#outputtexturenode-outputtexture3dnode)
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

**Accessors**

- [`projectionMatrix`](#projectionmatrix)
- [`viewMatrix`](#viewmatrix)
- [`inverseProjectionMatrix`](#inverseprojectionmatrix)
- [`inverseViewMatrix`](#inverseviewmatrix)
- [`cameraPositionWorld`](#camerapositionworld)
- [`cameraNear`](#cameranear)
- [`cameraFar`](#camerafar)

**Generators**

- [`dithering`](#dithering)

**Sampling**

- [`textureBicubic`](#texturebicubic)
- [`textureCatmullRom`](#texturecatmullrom)

**Transformations**

- [`depthToViewZ`](#depthtoviewz)
- [`logarithmicToPerspectiveDepth`](#logarithmictoperspectivedepth)
- [`perspectiveToLogarithmicDepth`](#perspectivetologarithmicdepth)
- [`screenToPositionView`](#screentopositionview)
- [`turbo`](#turbo)
- [`depthToColor`](#depthtocolor)
- [`equirectDirectionWorld`](#equirectdirectionworld)

The following terms refer to class fields:

- **Property** : A class field whose changes take effect immediately.
- **Dependency** : A class field of type `Node` that the subject depends on.
- **Uniform** : A class field of type `UniformNode`. Changes in its value takes effect immediately.
- **Static option** : A class field whose changes take effect only after calling `setup()`.

## FnVar

A utility function and works identically to `Fn`, except that the parameters of the callback function can be declared as variadic. This improves the colocation of parameters and their types.

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

A utility function and works identically to `Fn.setLayout`, except it’s declared as a higher-order function on `Fn`. This improves the colocation of parameters and their types.

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

## OutputTextureNode, OutputTexture3DNode

Texture nodes that depend on the provided `owner`. These nodes are intended to be used for output textures updated by another node.

Having these nodes as a class field results in [an infinite recursion error](https://github.com/mrdoob/three.js/issues/31522) unless the field name follows the naming convention used internally by Three.js.

→ [Source](/packages/core/src/webgpu/OutputTextureNode.ts)

```ts
class PassNode extends Node {
  renderTarget = new RenderTarget()
  _textureNode?: TextureNode

  getTextureNode(): TextureNode {
    return (this._textureNode ??= outputTexture(
      this,
      this.renderTarget.texture
    ))
  }
}
```

### Constructor

<!-- prettier-ignore -->
```ts
outputTexture: (owner: Node, texture: Texture) => NodeObject<OutputTextureNode>
outputTexture3D: (owner: Node, texture: Texture) => NodeObject<OutputTexture3DNode>
```

## HighpVelocityNode

A node that outputs geometry velocity in the current camera’s UV and depth. Unlike `VelocityNode` in Three.js’s examples, model view matrices of objects are computed on the CPU, so it does not suffer from precision issues when working with large coordinates such as meter-scale ECEF coordinates.

This is not compatible with `VelocityNode` in Three.js’s examples, which outputs velocity in NDC and lacks depth output.

→ [Source](/packages/core/src/webgpu/HighpVelocityNode.ts)

```ts
const passNode = pass(scene, camera).setMRT(
  mrt({
    output,
    velocity: highpVelocity
  })
)
const velocityNode = passNode.getTextureNode()
const deltaUV = velocityNode.xy
const deltaDepth = velocityNode.z
```

### Properties

```ts
projectionMatrix?: Matrix4 | null
```

## LensFlareNode

### Constructor

```ts
lensFlare: (inputNode: Node | null) => NodeObject<LensFlareNode>
```

### Dependencies

#### inputNode

```ts
inputNode?: TextureNode | null
```

#### thresholdNode

```ts
thresholdNode: DownsampleThresholdNode
```

#### blurNode

```ts
blurNode: GaussianBlurNode
```

#### featuresNode

```ts
featuresNode: LensFlareFeaturesNode
```

#### bloomNode

```ts
bloomNode: MipmapSurfaceBlurNode
```

#### glareNode

```ts
glareNode: LensGlareNode
```

### Uniforms

#### bloomIntensity

```ts
bloomIntensity = uniform(0.05)
```

## TemporalAntialiasNode

### Constructor

<!-- prettier-ignore -->
```ts
interface VelocityNodeImmutable {
  projectionMatrix?: Matrix4 | null
}

temporalAntialias: (velocityNodeImmutable: VelocityNodeImmutable) =>
  (
    inputNode: Node,
    depthNode: TextureNode,
    velocityNode: TextureNode,
    camera: Camera
  ) => NodeObject<TemporalAntialiasNode>
```

### Dependencies

#### inputNode

```ts
inputNode: TextureNode
```

#### depthNode

```ts
depthNode: TextureNode
```

#### velocityNode

```ts
velocityNode: TextureNode
```

### Properties

#### camera

```ts
camera: Camera
```

### Uniforms

#### temporalAlpha

```ts
temporalAlpha = uniform(0.1)
```

#### varianceGamma

```ts
varianceGamma = uniform(1)
```

#### velocityThreshold

```ts
velocityThreshold = uniform(0.1)
```

#### depthError

```ts
depthError = uniform(0.001)
```
