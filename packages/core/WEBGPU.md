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
"three": ">=0.182.0"
```

## Changes from the WebGL API

- `LensFlareEffect`: moved from effects and replaced by `LensFlareNode`
- `DitheringEffect`: moved from effects and replaced by `dithering`
- Turbo coloring in `DepthEffect`: moved from effects and replaced by `depthToColor`

# API

- [`FnVar`](#fnvar)
- [`FnLayout`](#fnlayout)

**Nodes**

- [`HighpVelocityNode`](#highpvelocitynode)
- [`LensFlareNode`](#lensflarenode)
- [`TemporalAntialiasNode`](#temporalantialiasnode)
- [`ScreenSpaceShadowNode`](#screenspaceshadownode)

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

A node that outputs geometry velocity in the current camera's UV and depth. Unlike `VelocityNode` in Three.js examples, model view matrices of objects are computed on the CPU, so it does not suffer from precision issues when working with large coordinates such as meter-scale ECEF coordinates.

→ [Source](/packages/core/src/webgpu/HighpVelocityNode.ts)

```ts
const passNode = pass(scene, camera).setMRT(
  mrt({
    output,
    velocity: highpVelocity
  })
)
const velocityNode = passNode.getTextureNode('velocity')
```

## LensFlareNode

A post-processing node that simulates lens flare artifacts. The effect consists of the following visual components:

- **Ghosts** : Colored reflections aligned along a line from the screen center through bright areas
- **Halos** : Thin rings with chromatic aberration
- **Bloom** : Soft glow around bright areas
- **Glare** : Directional spike radiating from bright areas, WebGPU only.

The implementation is based on Léna Piquet's [detailed walkthrough of UE4's lens flare effect](https://www.froyok.fr/blog/2021-09-ue4-custom-lens-flare/).

→ [Source](/packages/core/src/webgpu/LensFlareNode.ts)

```ts
const passNode = pass(scene, camera)
const lensFlareNode = lensFlare(passNode)
```

### Constructor

```ts
const lensFlare: (inputNode: Node | null) => LensFlareNode
```

### Dependencies

#### inputNode

```ts
inputNode?: TextureNode | null
```

The node to which the effect is applied.

#### thresholdNode

```ts
thresholdNode: DownsampleThresholdNode
```

The node that extracts bright areas from `inputNode`.

#### blurNode

```ts
blurNode: GaussianBlurNode
```

The node to blur the bright areas extracted by `thresholdNode` before they are used by `ghostNode` and `haloNode`.

#### ghostNode

```ts
ghostNode: LensGhostNode
```

The node that renders ghosts.

#### haloNode

```ts
haloNode: LensHaloNode
```

The node that renders halos.

#### bloomNode

```ts
bloomNode: MipmapSurfaceBlurNode
```

The node that applies bloom to the result of `thresholdNode`

#### glareNode

```ts
glareNode: LensGlareNode
```

The node that applies glare to the result of `thresholdNode`

### Uniforms

#### bloomIntensity

```ts
bloomIntensity = uniform(0.05)
```

A scaling factor that controls the intensity of the bloom.

## TemporalAntialiasNode

A post-processing node that applies antialiasing by accumulating jittered samples across frames.

The key difference from `TRAANode` in Three.js examples is that it synchronizes the unjittered projection matrix with `HighpVelocityNode` instead of `VelocityNode`. The technique used in this node has already been merged upstream.

→ [Source](/packages/core/src/webgpu/TemporalAntialiasNode.ts)

```ts
const passNode = pass(scene, camera).setMRT(
  mrt({
    output,
    velocity: highpVelocity
  })
)
const colorNode = passNode.getTextureNode('output')
const depthNode = passNode.getTextureNode('depth')
const velocityNode = passNode.getTextureNode('velocity')
const taaNode = temporalAntialias(colorNode, depthNode, velocityNode, camera)
```

### Constructor

```ts
const temporalAntialias = (
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

The node to which the effect is applied.

#### depthNode

```ts
depthNode: TextureNode
```

The depth node for the current frame.

#### velocityNode

```ts
velocityNode: TextureNode
```

The node that stores motion vectors in NDC, provided by `HighpVelocityNode`.

### Uniforms

#### temporalAlpha

```ts
temporalAlpha = uniform(0.05)
```

The blending factor between the current frame and the reprojected history.

Lower values produce smoother results but increase ghosting.

#### varianceGamma

```ts
varianceGamma = uniform(1)
```

Controls the size of the variance clipping.

Larger values allow more history to pass through, reducing flickering but increasing ghosting.

#### velocityThreshold

```ts
velocityThreshold = uniform(0.1)
```

The velocity magnitude (in UV space) above which history samples are fully rejected.

#### depthError

```ts
depthError = uniform(0.001)
```

The tolerance for the depth comparison between the reprojected depth and the previous frame's depth.

### Static options

#### camera

```ts
camera: Camera
```

The camera used for rendering the scene. This is required because the effect is rendered in a post-processing stage.

#### debugShowRejection

```ts
debugShowRejection = false
```

When enabled, rejected pixels are displayed in red.

## ScreenSpaceShadowNode

A post-processing node that applies screen-space shadows (SSS).

Unlike `SSSNode` in Three.js examples, this node uses a compute shader with workgroup shared memory, allowing for longer and softer shadows at a lower cost per pixel.

The implementation is based on [Bend Studio's technique](https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/).

→ [Source](/packages/core/src/webgpu/ScreenSpaceShadowNode.ts)

```ts
declare const light: DirectionalLight
light.castShadow = true

// To render shadows correctly, a separate depth pass is required before the
// main pass. In this case, discard color output to keep the pre-pass cheap.
const prePassNode = pass(scene, camera).setMRT(mrt({ output: vec4(0) }))
const depthNode = prePassNode.getTextureNode('depth')
const sssNode = screenSpaceShadow(depthNode, camera, light)

// Setup the main pass with a custom shadow context using the SSS result:
const passNode = pass(scene, camera)
const sssSample = sssNode.getTextureNode().sample(screenUV).r
const sssContext = builtinShadowContext(sssSample, light)
passNode.contextNode = sssContext
```

### Constructor

```ts
const screenSpaceShadow: (
  depthNode: TextureNode,
  camera: Camera,
  mainLight: DirectionalLight
) => ScreenSpaceShadowNode
```

### Dependencies

#### depthNode

```ts
depthNode: TextureNode
```

The depth node for ray-marching.

### Uniforms

#### thickness

```ts
thickness = uniform(0.005)
```

The assumed pixel thickness for shadow-casting, as a fraction of the depth range to the far clip plane.

#### shadowContrast

```ts
shadowContrast = uniform(4)
```

A contrast boost for the shadow transition. Must be >= 1.

#### shadowIntensity

```ts
shadowIntensity = uniform(1)
```

The overall shadow intensity in the range [0, 1].

#### bilinearThreshold

```ts
bilinearThreshold = uniform(0.02)
```

The depth difference threshold for edge detection. When exceeded, point filtering is used instead of bilinear interpolation.

#### nearDepth

```ts
nearDepth = uniform(0)
```

The depth value for the near clip plane.

#### farDepth

```ts
farDepth = uniform(1)
```

The depth value for the far clip plane.

### Static options

#### camera

```ts
camera: Camera
```

The camera used for rendering the scene.

#### mainLight

```ts
mainLight: DirectionalLight
```

The directional light from which shadows are cast.

#### sampleCount

```ts
sampleCount = 60
```

The number of shadow samples per pixel. Controls the maximum shadow length in pixels.

#### hardShadowSamples

```ts
hardShadowSamples = 4
```

The number of initial samples that produce a hard shadow without averaging, grounding pixels close to the shadow caster.

#### fadeOutSamples

```ts
fadeOutSamples = 8
```

The number of samples at the end of the ray that fade the shadow out.

# Acknowledgement

- Poimandres' [postprocessing](https://github.com/pmndrs/postprocessing) as a reference for convolution filters.
- Intel's [reference TAA implementation](https://github.com/GameTechDev/TAA).
- Simon Coenen's [TAA implementation](https://github.com/simco50/D3D12_Research/) for subpixel correction.
- Bend Studio's [screen-space shadows technique](https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/).
- Léna Piquet's [detailed walkthrough of UE4's lens flare effect](https://www.froyok.fr/blog/2021-09-ue4-custom-lens-flare/).

# License

[MIT](LICENSE), except where indicated otherwise.
