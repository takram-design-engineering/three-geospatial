# @takram/three-geospatial/webgpu

[![npm version](https://img.shields.io/npm/v/@takram/three-geospatial.svg?style=flat-square)](https://www.npmjs.com/package/@takram/three-geospatial) [![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

A work-in-progress WebGPU support for `@takram/three-geospatial`.

Once all packages support WebGPU, the current implementation of the shader-chunk-based architecture will be archived and superseded by the node-based implementation.

## Installation

```sh
npm install @takram/three-geospatial
pnpm add @takram/three-geospatial
yarn add @takram/three-geospatial
```

Peer dependencies include `three`, as well as `@react-three/fiber` when using R3F.

```
three @react-three/fiber
```

Please note the peer dependencies differ from the required versions to maintain compatibility with the WebGL codebase. When using `@takram/three-geospatial/webgpu`, apply the following rules.

```
"three": ">=0.181.0"
```

## API changes

- `LensFlareEffect` was moved from `effects` to here and replaced by `LensFlareNode`.

# API

- [`FnVar`](#fnvar)
- [`FnLayout`](#fnlayout)

**Nodes**

- [`HighpVelocityNode`](#highpvelocitynode)
- [`LensFlareNode`](#lensflarenode)
- [`TemporalAntialiasNode`](#temporalantialiasnode)

**Generators**

- [`dithering`](#dithering)

**Transformations**

- [`depthToColor`](#depthtocolor)

The following terms refer to class fields:

- **Dependencies** : Class fields of type `Node` that the subject depends on.
- **Parameters** : Class fields whose changes take effect immediately.
- **Uniforms** : Class field of type `UniformNode`. Changes in its value takes effect immediately.
- **Static options** : Class fields whose changes take effect only after calling `setup()`.

## FnVar

A utility function and works identically to `Fn`, except that the parameters of the callback function can be declared as variadic. This improves the colocation of parameters and their types.

When you return a function, it receives the current `NodeBuilder`.

→ [Source](/packages/core/src/webgpu/FnVar.ts)

```ts
const fn = FnVar((a: TextureNode, b: Node, c?: number) => {})
const fn = FnVar((a: TextureNode, b: Node, c?: number) => builder => {})

// Compared to:
const fn = Fn<[TextureNode, Node, number | undefined]>(([a, b, c]) => {})
const fn = Fn<[TextureNode, Node, number | undefined]>(
  ([a, b, c], builder) => {}
)
```

## FnLayout

A utility function and works identically to `Fn.setLayout`, except it's declared as a higher-order function on `Fn`. This improves the colocation of parameters and their types.

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

## HighpVelocityNode

A node that outputs geometry velocity in the current camera's UV and depth. Unlike `VelocityNode` in Three.js's examples, model view matrices of objects are computed on the CPU, so it does not suffer from precision issues when working with large coordinates such as meter-scale ECEF coordinates.

→ [Source](/packages/core/src/webgpu/HighpVelocityNode.ts)

```ts
const passNode = pass(scene, camera).setMRT(
  mrt({
    output,
    velocity: highpVelocity
  })
)
const velocityNode = passNode.getTextureNode('velocity')
const deltaUV = velocityNode.xy.mul(0.5)
const deltaDepth = velocityNode.z.mul(0.5)
```

### Parameters

```ts
projectionMatrix?: Matrix4 | null
```

## LensFlareNode

### Constructor

```ts
const lensFlare: (inputNode: Node | null) => LensFlareNode
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

#### ghostNode

```ts
ghostNode: LensGhostNode
```

#### haloNode

```ts
haloNode: LensHaloNode
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

const temporalAntialias: (velocityNodeImmutable: VelocityNodeImmutable) =>
  (
    inputNode: Node,
    depthNode: TextureNode,
    velocityNode: TextureNode,
    camera: Camera
  ) => TemporalAntialiasNode
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

### Static options

#### camera

```ts
camera: Camera
```
