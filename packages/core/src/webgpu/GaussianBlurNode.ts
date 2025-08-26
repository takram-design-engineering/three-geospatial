import { GaussKernel } from 'postprocessing'
import { add, Fn, nodeObject, uv } from 'three/tsl'
import type { Node, TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import type { NodeObject } from './node'
import { SeparableFilterNode } from './SeparableFilterNode'

declare module 'postprocessing' {
  interface GaussKernel {
    weights: Float64Array
    offsets: Float64Array
    linearWeights: Float64Array
    linearOffsets: Float64Array
    steps: number
    linearSteps: number
  }
}

export class GaussianBlurNode extends SeparableFilterNode {
  static override get type(): string {
    return 'GaussianBlurNode'
  }

  private readonly kernelSize: number

  constructor(inputNode?: TextureNode | null, kernelSize = 35) {
    super(inputNode)
    this.kernelSize = kernelSize
  }

  protected setupFilterNode(): Node {
    const { inputNode, inputTexelSize, direction } = this
    invariant(inputNode != null)

    // TODO: Remove the dependency to postprocessing.
    const kernel = new GaussKernel(this.kernelSize, 2)

    return Fn(() => {
      const center = uv()
      const offsetSize = direction.mul(inputTexelSize).toVertexStage()

      const output = inputNode.sample(center).mul(kernel.linearWeights[0])
      for (let i = 1; i < kernel.linearSteps; ++i) {
        const offset = offsetSize.mul(kernel.linearOffsets[i])
        output.addAssign(
          add(
            inputNode.sample(center.add(offset)),
            inputNode.sample(center.sub(offset))
          ).mul(kernel.linearWeights[i])
        )
      }
      return output
    })()
  }
}

export const gaussianBlur = (
  ...args: ConstructorParameters<typeof GaussianBlurNode>
): NodeObject<GaussianBlurNode> => nodeObject(new GaussianBlurNode(...args))
