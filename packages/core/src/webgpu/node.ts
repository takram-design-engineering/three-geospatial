import type {
  Color,
  Matrix2,
  Matrix3,
  Matrix4,
  Vector2,
  Vector3,
  Vector4
} from 'three'
import {
  bool,
  bvec2,
  bvec3,
  bvec4,
  color,
  float,
  int,
  ivec2,
  ivec3,
  ivec4,
  mat2,
  mat3,
  mat4,
  uint,
  uvec2,
  uvec3,
  uvec4,
  vec2,
  vec3,
  vec4,
  type ShaderNodeObject
} from 'three/tsl'
import type { Node as N } from 'three/webgpu'

export const nodeFunctions = {
  float,
  int,
  uint,
  bool,
  vec2,
  ivec2,
  uvec2,
  bvec2,
  vec3,
  ivec3,
  uvec3,
  bvec3,
  vec4,
  ivec4,
  uvec4,
  bvec4,
  mat2,
  mat3,
  mat4,
  color
} as const

export type NodeType = keyof typeof nodeFunctions

export type NodeValueType =
  | number
  | boolean
  | Vector2
  | Vector3
  | Vector4
  | Matrix2
  | Matrix3
  | Matrix4
  | Color

// prettier-ignore
export type NodeTypeOf<T extends NodeValueType> =
  T extends number ? 'float' :
  T extends boolean ? 'bool' :
  T extends Vector2 ? 'vec2' :
  T extends Vector3 ? 'vec3' :
  T extends Vector4 ? 'vec4' :
  T extends Matrix2 ? 'mat2' :
  T extends Matrix3 ? 'mat3' :
  T extends Matrix4 ? 'mat4' :
  T extends Color ? 'color' : never

// prettier-ignore
export type NodeValueTypeOf<T extends NodeType> =
  T extends 'float' ? number :
  T extends 'int' ? number :
  T extends 'uint' ? number :
  T extends 'bool' ? boolean :
  T extends 'vec2' ? Vector2 :
  T extends 'ivec2' ? Vector2 :
  T extends 'uvec2' ? Vector2 :
  T extends 'bvec2' ? Vector2 :
  T extends 'vec3' ? Vector3 :
  T extends 'ivec3' ? Vector3 :
  T extends 'uvec3' ? Vector3 :
  T extends 'bvec3' ? Vector3 :
  T extends 'vec4' ? Vector4 :
  T extends 'ivec4' ? Vector4 :
  T extends 'uvec4' ? Vector4 :
  T extends 'bvec4' ? Vector4 :
  T extends 'mat2' ? Matrix2 :
  T extends 'mat3' ? Matrix3 :
  T extends 'mat4' ? Matrix4 :
  T extends 'color' ? Color : never

// These types only provide for annotations, and not guarantee the type safety.
// I'm working on storing the dimensions in the types, but most of TSL functions
// are not generic and don't preserve the types anyways.

export type Node<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  T extends NodeType | N = NodeType | N
> = N

export type ShaderNode<T extends NodeType | N = NodeType | N> =
  ShaderNodeObject<T extends N ? T : Node<T>>

export function node<T extends NodeType>(type: T): (typeof nodeFunctions)[T] {
  return nodeFunctions[type]
}
