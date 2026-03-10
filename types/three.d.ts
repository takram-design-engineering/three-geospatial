import type { Camera, ToneMapping } from 'three'
import type { Node, NodeFrame, Renderer, UniformNode } from 'three/webgpu'

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

declare module 'three/tsl' {
  // The first argument can be a node type
  const uniform: <T>(
    value: T,
    type?: Node | string
  ) => T extends NodeType ? UniformNode<NodeValueTypeOf<T>> : UniformNode<T>
}

declare module 'three/webgpu' {
  // Add "camera"
  interface NodeBuilder {
    camera?: Camera
  }

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

  interface TextureNode {
    // Add missing methods
    setUpdateMatrix: (value: boolean) => this

    // Allow number type
    blur(amountNode: number | Node): TextureNode
    level(levelNode: number | Node): TextureNode
    size(levelNode: number | Node): TextureNode
    bias(biasNode: number | Node): TextureNode
    compare(compareNode: number | Node): TextureNode
    grad(gradeNodeX: number | Node, gradeNodeY: number | Node): TextureNode
    depth(depthNode: number | Node): TextureNode
    offset(offsetNode: Node): TextureNode
  }

  // Add missing methods
  interface ToneMappingNode {
    getToneMapping: () => ToneMapping
    setToneMapping: (value: ToneMapping) => this
  }

  // Add "colorNode"
  interface AnalyticLightNode {
    colorNode: Node
  }
}

declare module 'three/src/renderers/common/RendererUtils.js' {
  // "state" can be optional
  function resetRendererState(
    renderer: Renderer,
    state?: RendererState
  ): RendererState
}

declare module 'three/src/renderers/common/Backend.js' {
  export default interface Backend {
    isWebGPUBackend?: boolean
  }
}
