import { Matrix4, type Object3D } from 'three'
import type { NodeFrame } from 'three/src/Three.WebGPU.js'
import {
  nodeImmutable,
  positionLocal,
  positionPrevious,
  sub,
  uniform
} from 'three/tsl'
import { NodeUpdateType, TempNode, type NodeBuilder } from 'three/webgpu'

export class HighpVelocityNode extends TempNode {
  static override get type(): string {
    return 'HighpVelocityNode'
  }

  private readonly currentProjectionMatrix = uniform(new Matrix4())
  private readonly previousProjectionMatrix = uniform('mat4')

  private readonly currentModelViewMatrix = uniform(new Matrix4())
  private readonly previousModelViewMatrix = uniform(new Matrix4())
  private readonly objectModelViewMatrices = new WeakMap<Object3D, Matrix4>()

  constructor() {
    super('vec2')

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
    if (previous.value == null) {
      previous.value = new Matrix4().copy(camera.projectionMatrix)
    } else {
      previous.value.copy(current.value)
    }
    current.value.copy(camera.projectionMatrix)
  }

  // Executed once per object after rendering:
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
    previous.value.copy(matrices.get(object) ?? current.value)
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
    const previousClip = this.previousProjectionMatrix
      .mul(this.previousModelViewMatrix)
      .mul(positionPrevious)

    const currentNDC = currentClip.xy.div(currentClip.w)
    const previousNDC = previousClip.xy.div(previousClip.w)

    return sub(currentNDC, previousNDC)
  }
}

export const highpVelocity = /*#__PURE__*/ nodeImmutable(HighpVelocityNode)
