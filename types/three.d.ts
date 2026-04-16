import type { Camera, RenderTarget, Texture } from 'three'
import type { ShaderNodeFn } from 'three/src/nodes/TSL.js'
import type {
  ContextNode,
  FunctionOverloadingNode,
  Node,
  NodeBuilderContext,
  NodeFrame,
  Renderer,
  StorageTextureNode,
  TextureNode,
  UniformNode
} from 'three/webgpu'
import type { LiteralToPrimitive, Primitive } from 'type-fest'

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
  const uniform: <
    const T,
    U = T extends string ? T : T extends Primitive ? LiteralToPrimitive<T> : T
  >(
    value: T,
    type?: Node | string
  ) => U extends NodeType ? UniformNode<NodeValueTypeOf<U>> : UniformNode<U>

  const viewZToReversedOrthographicDepth: (
    viewZ: Node,
    near: Node,
    far: Node
  ) => Node

  const viewZToReversedPerspectiveDepth: (
    viewZ: Node,
    near: Node,
    far: Node
  ) => Node
}

declare module 'three/webgpu' {
  interface NodeBuilder {
    camera?: Camera
    context: NodeBuilderContext
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

  // Add "colorNode"
  interface AnalyticLightNode {
    colorNode: Node
  }
}

declare module 'three/tsl' {
  const textureStore: (
    value: Texture | TextureNode,
    uvNode?: Node | null,
    storeNode?: Node
  ) => StorageTextureNode

  const overloadingFn: (
    functionNodes: ShaderNodeFn[]
  ) => (...params: Node[]) => FunctionOverloadingNode
}

declare module 'three/src/renderers/common/Renderer.js' {
  interface RendererParameters {
    reversedDepthBuffer?: boolean
  }

  export default interface Renderer {
    contextNode: ContextNode
    reversedDepthBuffer: boolean
    initRenderTarget(renderTarget: RenderTarget): void
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

declare module 'three/src/nodes/accessors/TextureNode.js' {
  export default interface TextureNode {
    size(levelNode?: Node): Node
  }
}
