import { add, Fn, uv } from 'three/tsl'
import type { NodeBuilder, TextureNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import type { Node } from './node'
import { SeparableFilterNode } from './SeparableFilterNode'

// Reference: https://github.com/pmndrs/postprocessing/blob/v6.37.8/src/core/GaussKernel.js

function getCoefficients(n: number): Float64Array {
  invariant(n >= 0)
  if (n === 0) {
    return new Float64Array(0)
  }
  if (n === 1) {
    return new Float64Array([1])
  }

  let row0 = new Float64Array(n)
  let row1 = new Float64Array(n)
  let result = row1

  // Incrementally build Pascal's Triangle to get the desired row.
  for (let y = 1; y <= n; ++y) {
    for (let x = 0; x < y; ++x) {
      row1[x] = x === 0 || x === y - 1 ? 1 : row0[x - 1] + row0[x]
    }
    result = row1
    row1 = row0
    row0 = result
  }
  return result
}

interface GaussianKernel {
  weights: Float64Array
  offsets: Float64Array
}

function createGaussianKernel(
  kernelSize: number,
  edgeBias = 2
): GaussianKernel {
  invariant(kernelSize >= 3)

  const n = kernelSize + edgeBias * 2
  const coefficients =
    edgeBias > 0
      ? getCoefficients(n).slice(edgeBias, -edgeBias)
      : getCoefficients(n)

  const mid = Math.floor((coefficients.length - 1) / 2)
  const sum = coefficients.reduce((a, b) => a + b, 0)
  const weights = coefficients.slice(mid)
  const offsets = [...Array(mid + 1).keys()] // [0..mid+1]

  const linearWeights = new Float64Array(Math.floor(offsets.length / 2))
  const linearOffsets = new Float64Array(linearWeights.length)
  linearWeights[0] = weights[0] / sum

  for (let i = 1, j = 1; i < offsets.length - 1; i += 2, ++j) {
    const offset0 = offsets[i]
    const offset1 = offsets[i + 1]
    const weight0 = weights[i]
    const weight1 = weights[i + 1]

    const weight = weight0 + weight1
    const offset = (offset0 * weight0 + offset1 * weight1) / weight
    linearWeights[j] = weight / sum
    linearOffsets[j] = offset
  }

  // Ensure that the weights add up to 1.
  const linearWeightSum =
    (linearWeights.reduce((a, b) => a + b, 0) - linearWeights[0] * 0.5) * 2

  if (linearWeightSum !== 0) {
    const scale = 1 / linearWeightSum
    for (let i = 0; i < linearWeights.length; ++i) {
      linearWeights[i] *= scale
    }
  }

  return {
    offsets: linearOffsets,
    weights: linearWeights
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

  protected override setupOutputNode(builder: NodeBuilder): Node {
    const { inputNode, inputTexelSize, direction } = this
    invariant(inputNode != null)

    const { offsets, weights } = createGaussianKernel(this.kernelSize)

    return Fn(() => {
      const center = uv()
      const offsetSize = direction.mul(inputTexelSize).toVertexStage()

      const output = inputNode.sample(center).mul(weights[0])
      for (let i = 1; i < offsets.length; ++i) {
        const offset = offsetSize.mul(offsets[i])
        output.addAssign(
          add(
            inputNode.sample(center.add(offset)),
            inputNode.sample(center.sub(offset))
          ).mul(weights[i])
        )
      }
      return output
    })()
  }
}

export const gaussianBlur = (
  ...args: ConstructorParameters<typeof GaussianBlurNode>
): GaussianBlurNode => new GaussianBlurNode(...args)
