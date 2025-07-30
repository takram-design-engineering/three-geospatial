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

export type NodeType =
  | 'float'
  | 'int'
  | 'uint'
  | 'bool'
  | 'color'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'mat2'
  | 'mat3'
  | 'mat4'
  | 'ivec2'
  | 'ivec3'
  | 'ivec4'
  | 'uvec2'
  | 'uvec3'
  | 'uvec4'
  | 'bvec2'
  | 'bvec3'
  | 'bvec4'

export type Node<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  T extends NodeType | N = NodeType | N
> = N

export type ShaderNode<T extends NodeType | N = NodeType | N> =
  ShaderNodeObject<T extends N ? T : Node<T>>
