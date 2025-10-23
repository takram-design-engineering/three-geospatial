/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/prefer-function-type */

import type {
  Camera,
  EventDispatcher,
  Light,
  Matrix3,
  Texture,
  Vector4
} from 'three'
import type InputNode from 'three/src/nodes/core/InputNode.js'
import type { ShaderNodeObject } from 'three/tsl'
import type {
  ConstNode,
  LightingNode,
  Node,
  NodeFrame,
  Texture3DNode,
  TextureNode,
  UniformNode
} from 'three/webgpu'

import type { NodeType, NodeValueTypeOf } from '@takram/three-geospatial/webgpu'

export {}

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
    isOrthographicCamera?: boolean
  }

  interface Material {
    isNodeMaterial?: boolean
  }
}

declare module 'three/src/nodes/Nodes.js' {
  interface Node {
    // Add "self"
    // NOTE: This type is problematic because methods like these (parameter of
    // "self: this") don't intersect with derived classes.
    onFrameUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
    onObjectUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
    onReference(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }
}

declare module 'three/src/nodes/TSL.js' {
  // Add "get"
  interface NodeElements {
    get: (node: Node, name: string) => ShaderNodeObject<Node>
  }

  // Alow elements to be numbers
  interface Matrix3Function {
    (
      n11: number | Node,
      n12: number | Node,
      n13: number | Node,
      n21: number | Node,
      n22: number | Node,
      n23: number | Node,
      n31: number | Node,
      n32: number | Node,
      n33: number | Node
    ): ShaderNodeObject<ConstNode<Matrix3>>
  }
}

declare module 'three/src/renderers/common/RendererUtils.js' {
  // "state" can be optional
  function resetRendererState(
    renderer: Renderer,
    state?: RendererState
  ): RendererState
}

declare module 'three/tsl' {
  // Make "value" nullable
  const texture: (
    value?: Texture | null,
    uvNode?: Node | null,
    levelNode?: Node | number | null,
    biasNode?: Node | null
  ) => ShaderNodeObject<TextureNode>

  // Make "value" nullable
  const texture3D: (
    value: Texture | null,
    uvNode?: Node | null,
    levelNode?: Node | number | null
  ) => ShaderNodeObject<Texture3DNode>

  // The first argument can be a node type
  function uniform<T extends NodeType>(
    arg1: T
  ): ShaderNodeObject<UniformNode<NodeValueTypeOf<T>>>

  // Change to a function type to overload
  function uniform<TValue>(
    arg1: InputNode<TValue> | TValue,
    arg2?: Node | string
  ): ShaderNodeObject<UniformNode<TValue>>

  // "functionNodes" can be ShaderNodeObject
  const overloadingFn: (
    functionNodes: Array<Node, ShaderNodeObject>
  ) => (...params: Node[]) => ShaderNodeObject<FunctionOverloadingNode>
}

declare module 'three/webgpu' {
  // Add "camera"
  interface NodeBuilder {
    camera?: Camera
  }

  // Add "colorNode"
  interface AnalyticLightNode<T extends Light> extends LightingNode {
    colorNode: Node
  }

  // Add missing methods
  interface TextureNode extends UniformNode<Texture> {
    setUpdateMatrix: (value: boolean) => this
    blur(amountNode: number | Node): ShaderNodeObject<TextureNode>
    level(levelNode: number | Node): ShaderNodeObject<TextureNode>
    size(levelNode: number | Node): ShaderNodeObject<TextureNode>
    bias(biasNode: number | Node): ShaderNodeObject<TextureNode>
    compare(compareNode: number | Node): ShaderNodeObject<TextureNode>
    grad(
      gradeNodeX: number | Node,
      gradeNodeY: number | Node
    ): ShaderNodeObject<TextureNode>
    depth(depthNode: number | Node): ShaderNodeObject<TextureNode>
    offset(offsetNode: Node): ShaderNodeObject<TextureNode>
  }

  // Added
  class CanvasTarget {
    domElement: HTMLCanvasElement
    constructor(domElement: HTMLCanvasElement)
    setPixelRatio(value: number): void
    setSize(width: number, height: number): void
    dispose(): void
  }

  interface Renderer {
    setCanvasTarget(canvasTarget: CanvasTarget): void
    getCanvasTarget(): CanvasTarget
  }
}
