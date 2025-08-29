# @takram/three-atmosphere/webgpu

[![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial-webgpu/)

A work-in-progress and experimental WebGPU support for `@takram/three-atmosphere`.

## API changes

- `PrecomputedTexturesGenerator` was replaced by `AtmosphereLUTNode`.
- `AerialPerspectiveEffect` was replaced by `AerialPerspectiveNode`.
- `SunDirectionalLight` and `SkyLightProbe` were replaced by `AtmosphereLight` and `AtmosphereLightNode`.
- `SkyMaterial` was replaced by `SkyNode` (`skyBackground`) that can be used in `Scene.backgroundNode`.
- `LightingMaskPass` was removed.

# API

- [`AtmosphereContext`](#atmospherecontext)
- [`AtmosphereLight`](#atmospherelight)
- [`AerialPerspectiveNode`](#aerialperspectivenode)
- [`SkyNode`](#skynode)
- [`SkyEnvironmentNode`](#skyenvironmentnode)

**Advanced**

- [`AtmosphereParameters`](#atmosphereparameters)
- [`AtmosphereLUTNode`](#atmospherelutnode)
- [`AtmosphereLightNode`](#atmospherelightnode)

The following terms refer to class fields:

- **Property** : A class field whose changes take effect immediately.
- **Dependency** : A class field of type `Node` that the subject depends on.
- **Uniform** : A class field of type `UniformNode`. Changes in its value takes effect immediately.
- **Static option** : A class field whose changes take effect only after calling `setup()`.

## AtmosphereLight

Represents direct and indirect sunlight. The lighting is correct at large scale regardless of the materials used on surfaces, unlike `SunDirectionalLight` and `SkyLightProbe` in the previous implementation.

Add it along with [`AtmosphereLightNode`](#atmospherelightnode) to the renderer’s node library before use:

```ts
import {
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'

renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
```

→ [Source](/packages/atmosphere/src/webgpu/AtmosphereLight.ts)

### Uniforms

#### direct

```ts
direct: UniformNode<boolean> = uniform(true)
```

Whether to enable direct sunlight. This must be turned off when you use an environment map that includes direct sunlight.

#### indirect

```ts
indirect: UniformNode<boolean> = uniform(true)
```

Whether to enable indirect sunlight. This must be turned off when you use an environment map.

### Properties

#### distance

```ts
distance: number = 1
```

The distance from `DirectionalLight.target` to the light’s position. Adjust the target and this value when shadows are enabled so that the shadow camera covers the objects you want to cast shadows.

## AerialPerspectiveNode

```ts
const aerialPerspective = (
  atmosphereContext: AtmosphereContext,
  colorNode: Node<'vec3' | 'vec4'>,
  depthNode: Node<'float'>,
  normalNode?: Node<'vec3'> | null
) => NodeObject<AerialPerspectiveNode>
```

→ [Source](/packages/atmosphere/src/webgpu/AerialPerspectiveNode.ts)

### Dependencies

#### colorNode

```ts
colorNode: Node<'vec3' | 'vec4'>
```

#### depthNode

```ts
depthNode: Node<'float'>
```

#### normalNode

```ts
normalNode?: Node<'vec3'> | null
```

#### skyNode

```ts
skyNode?: Node<'vec3'> | null = sky()
```

#### shadowLengthNode

```ts
shadowLengthNode?: Node<'float'> | null
```

### Static options

#### correctGeometricError

```ts
correctGeometricError = true
```

#### lighting

```ts
lighting = false
```

#### transmittance

```ts
transmittance = true
```

#### inscatter

```ts
inscatter = true
```
