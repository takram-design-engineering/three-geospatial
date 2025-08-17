/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/prefer-function-type */

import type { Camera, Data3DTexture, Light, Texture } from 'three'
import type { ShaderNodeObject } from 'three/tsl'
import type { LightingNode, Node, NodeFrame, UniformNode } from 'three/webgpu'

export {}

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }

  interface RenderTarget3D {
    texture: Data3DTexture
    textures: Data3DTexture[]
  }
}

declare module 'three/webgpu' {
  interface Node {
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }

  interface NodeBuilder {
    camera?: Camera
  }

  interface AnalyticLightNode<T extends Light> extends LightingNode {
    colorNode: Node
  }

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

declare module 'three/tsl' {
  export const passTexture: (
    pass: Node,
    texture: Texture
  ) => ShaderNodeObject<PassTextureNode>
}

declare module 'three/src/nodes/TSL.js' {
  interface NodeElements {
    get: (node: Node, name: string) => ShaderNodeObject
  }

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
