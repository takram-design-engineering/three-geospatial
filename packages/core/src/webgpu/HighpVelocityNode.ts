import { Matrix4, type Object3D } from 'three'
import {
  nodeImmutable,
  positionLocal,
  positionPrevious,
  sub,
  uniform
} from 'three/tsl'
import {
  NodeUpdateType,
  TempNode,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

export class HighpVelocityNode extends TempNode {
  static override get type(): string {
    return 'HighpVelocityNode'
  }

  projectionMatrix?: Matrix4 | null

  private readonly currentProjectionMatrix = uniform(new Matrix4())
  private readonly previousProjectionMatrix = uniform('mat4' as const)

  private readonly currentModelViewMatrix = uniform(new Matrix4())
  private readonly previousModelViewMatrix = uniform('mat4' as const)
  private readonly objectModelViewMatrices = new WeakMap<Object3D, Matrix4>()

  constructor() {
    super('vec3')

    // Sequence:
    // - updateBefore() for the first object
    // - update() for the current frame
    // - updateAfter() for the first object
    // - updateBefore() for the next object
    // - updateAfter() for the next object
    // - ...
    this.updateType = NodeUpdateType.FRAME
    this.updateBeforeType = NodeUpdateType.OBJECT
    this.updateAfterType = NodeUpdateType.OBJECT
  }

  // Executed once per frame:
  override update({ camera }: NodeFrame): void {
    if (camera == null) {
      return
    }
    const {
      currentProjectionMatrix: current,
      previousProjectionMatrix: previous
    } = this

    const projectionMatrix = this.projectionMatrix ?? camera.projectionMatrix
    if (previous.value == null) {
      previous.value = new Matrix4().copy(projectionMatrix)
    } else {
      previous.value.copy(current.value)
    }
    current.value.copy(projectionMatrix)
  }

  // Executed once per object before rendering:
  override updateBefore({ object, camera }: NodeFrame): void {
    if (object == null || camera == null) {
      return
    }
    const {
      currentModelViewMatrix: current,
      previousModelViewMatrix: previous,
      objectModelViewMatrices: matrices
    } = this

    current.value.multiplyMatrices(
      camera.matrixWorldInverse,
      object.matrixWorld
    )
    previous.value = matrices.get(object) ?? current.value
  }

  // Executed once per object after rendering:
  override updateAfter({ object }: NodeFrame): void {
    if (object == null) {
      return
    }
    const {
      currentModelViewMatrix: current,
      objectModelViewMatrices: matrices
    } = this

    let matrix = matrices.get(object)
    if (matrix == null) {
      matrix = new Matrix4()
      matrices.set(object, matrix)
    }
    matrix.copy(current.value)
  }

  override setup(builder: NodeBuilder): unknown {
    const currentClip = this.currentProjectionMatrix
      .mul(this.currentModelViewMatrix)
      .mul(positionLocal)
      .toVertexStage()
    const previousClip = this.previousProjectionMatrix
      .mul(this.previousModelViewMatrix)
      .mul(positionPrevious)
      .toVertexStage()

    // Perspective divisions cannot be performed in the vertex shader.
    // See: http://john-chapman-graphics.blogspot.com/2013/01/per-object-motion-blur.html
    const currentNDC = currentClip.xyz.div(currentClip.w)
    const previousNDC = previousClip.xyz.div(previousClip.w)

    return sub(currentNDC, previousNDC)
  }
}

export const highpVelocity = /*#__PURE__*/ nodeImmutable(HighpVelocityNode)
