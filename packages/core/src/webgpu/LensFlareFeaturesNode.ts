import {
  abs,
  add,
  distance,
  float,
  fract,
  min,
  mul,
  nodeObject,
  sub,
  uniform,
  uv,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import type { NodeFrame } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { FilterNode } from './FilterNode'
import { FnLayout } from './FnLayout'
import type { Node, NodeObject } from './node'

export class LensFlareFeaturesNode extends FilterNode {
  static override get type(): string {
    return 'LensFlareFeaturesNode'
  }

  ghostAmount = uniform(1e-5)
  haloAmount = uniform(1e-5)
  chromaticAberration = uniform(0.005)

  private readonly aspectRatio = uniform(0)

  override updateBefore(frame: NodeFrame): void {
    const { inputNode } = this
    invariant(inputNode != null)

    const { width, height } = inputNode.value
    this.aspectRatio.value = width / height

    super.updateBefore(frame)
  }

  protected override setupFilterNode(): Node {
    const {
      inputNode,
      ghostAmount,
      haloAmount,
      chromaticAberration,
      aspectRatio
    } = this
    invariant(inputNode != null)

    const sampleGhost = FnLayout({
      name: 'sampleGhost',
      type: 'vec3',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'direction', type: 'vec2' },
        { name: 'color', type: 'vec3' },
        { name: 'offset', type: 'float' }
      ]
    })(([uv, direction, color, offset]) => {
      const suv = direction.mul(offset).add(uv.oneMinus()).saturate()
      const result = inputNode.sample(suv).rgb.mul(color)

      // Falloff at the perimeter:
      const sqrt2 = float(Math.SQRT2)
      const d = sub(0.5, suv).length().div(sqrt2.mul(0.25)).saturate()
      result.mulAssign(d.oneMinus().pow(3))
      return result
    })

    const sampleGhosts = FnLayout({
      name: 'sampleGhosts',
      type: 'vec4',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'amount', type: 'float' }
      ]
    })(([uv, amount]) => {
      const color = vec3(0)
      const direction = uv.sub(0.5)
      color.addAssign(sampleGhost(uv, direction, vec3(0.8, 0.8, 1), -5.0))
      color.addAssign(sampleGhost(uv, direction, vec3(1, 0.8, 0.4), -1.5))
      color.addAssign(sampleGhost(uv, direction, vec3(0.9, 1, 0.8), -0.4))
      color.addAssign(sampleGhost(uv, direction, vec3(1, 0.8, 0.4), -0.2))
      color.addAssign(sampleGhost(uv, direction, vec3(0.9, 0.7, 0.7), -0.1))
      color.addAssign(sampleGhost(uv, direction, vec3(0.5, 1, 0.4), 0.7))
      color.addAssign(sampleGhost(uv, direction, vec3(0.5, 0.5, 0.5), 1))
      color.addAssign(sampleGhost(uv, direction, vec3(1, 1, 0.6), 2.5))
      color.addAssign(sampleGhost(uv, direction, vec3(0.5, 0.8, 1), 10))
      return vec4(color.mul(amount), 1)
    })

    const cubicRingMask = FnLayout({
      name: 'cubicRingMask',
      type: 'float',
      inputs: [
        { name: 'x', type: 'float' },
        { name: 'radius', type: 'float' },
        { name: 'thickness', type: 'float' }
      ]
    })(([x, radius, thickness]) => {
      const v = min(abs(x.sub(radius)).div(thickness), 1)
      return mul(v, v, sub(3, v.mul(2))).oneMinus()
    })

    const sampleHalo = FnLayout({
      name: 'sampleHalo',
      type: 'vec3',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'radius', type: 'float' }
      ]
    })(([uv, radius]) => {
      const scale = vec2(aspectRatio, 1)
      const direction = uv.sub(0.5).mul(scale).normalize().div(scale)
      const offset = vec3(chromaticAberration).mul(vec3(-1, 0, 1))
      const suv = fract(direction.mul(radius).add(uv.oneMinus()))
      const result = vec3(
        inputNode.sample(direction.mul(offset.r).add(suv)).r,
        inputNode.sample(direction.mul(offset.g).add(suv)).g,
        inputNode.sample(direction.mul(offset.b).add(suv)).b
      )

      // Falloff at the center and perimeter:
      const wuv = uv.sub(vec2(0.5, 0)).mul(scale).add(vec2(0.5, 0))
      const d = distance(wuv, vec2(0.5)).saturate()
      result.mulAssign(cubicRingMask(d, 0.45, 0.25))
      return result
    })

    const sampleHalos = FnLayout({
      name: 'sampleHalos',
      type: 'vec4',
      inputs: [
        { name: 'uv', type: 'vec2' },
        { name: 'amount', type: 'float' }
      ]
    })(([uv, amount]) => {
      const color = vec3(0)
      color.addAssign(sampleHalo(uv, 0.3))
      return vec4(color.mul(amount), 1)
    })

    return add(sampleGhosts(uv(), ghostAmount), sampleHalos(uv(), haloAmount))
  }
}

export const lensFlareFeatures = (
  ...args: ConstructorParameters<typeof LensFlareFeaturesNode>
): NodeObject<LensFlareFeaturesNode> =>
  nodeObject(new LensFlareFeaturesNode(...args))
