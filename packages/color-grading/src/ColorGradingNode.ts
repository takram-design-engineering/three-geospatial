import { LinearFilter, NoColorSpace, Vector3 } from 'three'
import {
  Fn,
  globalId,
  If,
  Return,
  texture3D,
  textureStore,
  uniform,
  uvec3,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeUpdateType,
  Storage3DTexture,
  TempNode,
  type ComputeNode,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

import type { Node } from '@takram/three-geospatial/webgpu'

import { channelMixer } from './ChannelMixerNode'
import { colorBalance } from './ColorBalanceNode'
import { contrast } from './ContrastNode'
import { liftGammaGain } from './LiftGammaGainNode'
import { saturation } from './SaturationNode'
import { shadowsMidtonesHighlights } from './ShadowsMidtonesHighlightsNode'
import { vibrance } from './VibranceNode'

function createStorage3DTexture(size: number): Storage3DTexture {
  const texture = new Storage3DTexture(size, size, size)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  return texture
}

export class ColorGradingNode extends TempNode {
  inputNode: Node
  readonly size: number

  temperature = 0
  tint = 0

  channelMixerR = new Vector3(1, 0, 0)
  channelMixerG = new Vector3(0, 1, 0)
  channelMixerB = new Vector3(0, 0, 1)

  shadows = new Vector3().setScalar(1)
  midtones = new Vector3().setScalar(1)
  highlights = new Vector3().setScalar(1)

  lift = new Vector3().setScalar(0)
  gamma = new Vector3().setScalar(0)
  gain = new Vector3().setScalar(0)

  contrast = 1
  vibrance = 1
  saturation = 1

  private readonly colorBalance = colorBalance()
  private readonly shadowsMidtonesHighlights = shadowsMidtonesHighlights()
  private readonly liftGammaGain = liftGammaGain()
  private readonly uniforms = {
    channelMixerR: uniform('vec3' as const),
    channelMixerG: uniform('vec3' as const),
    channelMixerB: uniform('vec3' as const),
    contrast: uniform('float' as const),
    vibrance: uniform('float' as const),
    saturation: uniform('float' as const)
  }

  private computeNode?: ComputeNode
  private readonly lutTexture: Storage3DTexture

  constructor(inputNode: Node, size = 32) {
    super('vec4')
    this.inputNode = inputNode
    this.size = size
    this.lutTexture = createStorage3DTexture(size)

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null || this.computeNode == null) {
      return
    }

    this.uniforms.channelMixerR.value.copy(this.channelMixerR)
    this.uniforms.channelMixerG.value.copy(this.channelMixerG)
    this.uniforms.channelMixerB.value.copy(this.channelMixerB)
    this.colorBalance.setParams(this.temperature, this.tint)
    this.shadowsMidtonesHighlights.setShadows(this.shadows)
    this.shadowsMidtonesHighlights.setMidtones(this.midtones)
    this.shadowsMidtonesHighlights.setHighlights(this.highlights)
    this.liftGammaGain.setLift(this.lift)
    this.liftGammaGain.setGamma(this.gamma)
    this.liftGammaGain.setGain(this.gain)
    this.uniforms.contrast.value = this.contrast
    this.uniforms.vibrance.value = this.vibrance
    this.uniforms.saturation.value = this.saturation

    void renderer.compute(this.computeNode)
  }

  override setup(builder: NodeBuilder): unknown {
    const dispatchSize = Math.ceil(this.size / 4)

    this.computeNode = Fn(() => {
      const size = uvec3(this.size)
      If(globalId.greaterThanEqual(size).any(), () => {
        Return()
      })

      let node: Node = vec3(globalId).add(0.5).div(size)
      node = this.colorBalance.setInputNode(node)
      node = channelMixer(
        node,
        this.uniforms.channelMixerR,
        this.uniforms.channelMixerG,
        this.uniforms.channelMixerB
      )
      node = this.shadowsMidtonesHighlights.setInputNode(node)
      node = this.liftGammaGain.setInputNode(node)
      node = contrast(node, this.uniforms.contrast)
      node = vibrance(node, this.uniforms.vibrance)
      node = saturation(node, this.uniforms.saturation)

      textureStore(this.lutTexture, globalId, node.saturate())
    })().compute(
      // @ts-expect-error "count" can be dimensional
      [dispatchSize, dispatchSize, dispatchSize],
      [4, 4, 4]
    )

    return vec4(
      texture3D(this.lutTexture).sample(this.inputNode.rgb).rgb,
      this.inputNode.a
    )
  }
}

export const colorGrading = (
  ...args: ConstructorParameters<typeof ColorGradingNode>
): ColorGradingNode => new ColorGradingNode(...args)
