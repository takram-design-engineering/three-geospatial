/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/prefer-function-type */

import type { Camera, Data3DTexture, Light, Texture } from 'three'
import type { ShaderNodeObject } from 'three/tsl'
import type {
  LightingNode,
  Node,
  NodeFrame,
  Texture3DNode,
  TextureNode,
  UniformNode
} from 'three/webgpu'

export {}

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
    isOrthographicCamera?: boolean
  }

  // Change texture types to Data3DTexture
  interface RenderTarget3D {
    texture: Data3DTexture
    textures: Data3DTexture[]
  }
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
}

declare module 'three/webgpu' {
  interface Node {
    // Add "self"
    onUpdate(callback: (this: this, frame: NodeFrame, self: this) => void): this
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
  }
}

declare module 'three/src/nodes/TSL.js' {
  // Add "get"
  interface NodeElements {
    get: (node: Node, name: string) => ShaderNodeObject
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
