import type {
  Color,
  Matrix2,
  Matrix3,
  Matrix4,
  Vector2,
  Vector3,
  Vector4
} from 'three'
import type { ShaderNodeObject } from 'three/tsl'
import type { Node as N } from 'three/webgpu'

// These types only provide for annotations, and not guarantee the type safety.
// I'm working on storing the dimensions in the types, but most of TSL functions
// are not generic and don't preserve the types anyways.

export type NodeValue =
  | number
  | boolean
  | Vector2
  | Vector3
  | Vector4
  | Matrix2
  | Matrix3
  | Matrix4
  | Color

export type Node<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  T extends NodeValue
> = N

export type ShaderNode<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  T extends NodeValue
> = ShaderNodeObject<N>
