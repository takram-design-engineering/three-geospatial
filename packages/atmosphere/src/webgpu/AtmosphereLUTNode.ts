import { Data3DTexture, FloatType, HalfFloatType, Texture } from 'three'
import {
  Node,
  NodeUpdateType,
  RendererUtils,
  type NodeBuilder,
  type NodeFrame,
  type Renderer,
  type Texture3DNode,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  isFloatLinearSupported,
  type AnyFloatType
} from '@takram/three-geospatial'
import {
  isWebGPU,
  outputTexture,
  outputTexture3D
} from '@takram/three-geospatial/webgpu'

import { requestIdleCallback } from '../helpers/requestIdleCallback'
import type {
  AtmosphereLUTTextures,
  AtmosphereLUTTexturesContext
} from './AtmosphereLUTTextures'
import { AtmosphereLUTTexturesWebGL } from './AtmosphereLUTTexturesWebGL'
import { AtmosphereLUTTexturesWebGPU } from './AtmosphereLUTTexturesWebGPU'
import { AtmosphereParameters } from './AtmosphereParameters'

const { resetRendererState, restoreRendererState } = RendererUtils

async function timeSlice<T>(iterable: Iterable<T>): Promise<T> {
  const iterator = iterable[Symbol.iterator]()
  return await new Promise<T>((resolve, reject) => {
    const callback = (): void => {
      try {
        const { value, done } = iterator.next()
        if (done === true) {
          resolve(value)
        } else {
          requestIdleCallback(callback)
        }
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error())
      }
    }
    requestIdleCallback(callback)
  })
}

let rendererState: RendererUtils.RendererState

function run(renderer: Renderer, task: () => void): boolean {
  rendererState = resetRendererState(renderer, rendererState)
  renderer.setClearColor(0, 0)
  renderer.autoClear = false
  task()
  restoreRendererState(renderer, rendererState)
  return true
}

export type AtmosphereLUTTextureName = 'transmittance' | 'irradiance'
export type AtmosphereLUTTexture3DName =
  | 'scattering'
  | 'singleMieScattering'
  | 'higherOrderScattering'

const emptyTexture = /*#__PURE__*/ new Texture()
const emptyTexture3D = /*#__PURE__*/ new Data3DTexture()

export class AtmosphereLUTNode extends Node {
  static override get type(): string {
    return 'AtmosphereLUTNode'
  }

  parameters: AtmosphereParameters
  textureType?: AnyFloatType

  private textures?: AtmosphereLUTTextures

  private readonly textureNodes = {
    transmittance: outputTexture(this, emptyTexture),
    irradiance: outputTexture(this, emptyTexture),
    scattering: outputTexture3D(this, emptyTexture3D),
    singleMieScattering: outputTexture3D(this, emptyTexture3D),
    higherOrderScattering: outputTexture3D(this, emptyTexture3D)
  }

  private currentVersion?: number
  private updating = false
  private disposeQueue: (() => void) | undefined

  constructor(
    parameters = new AtmosphereParameters(),
    textureType?: AnyFloatType
  ) {
    super(null)
    this.parameters = parameters
    this.textureType = textureType

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(name: AtmosphereLUTTextureName): TextureNode
  getTextureNode(name: AtmosphereLUTTexture3DName): Texture3DNode
  getTextureNode(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): TextureNode | Texture3DNode {
    return this.textureNodes[name]
  }

  private *performCompute(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContext
  ): Iterable<boolean> {
    const { textures } = this
    invariant(textures != null)

    // Compute the transmittance, and store it in transmittanceTexture.
    yield run(renderer, () => {
      textures.computeTransmittance(renderer, context)
    })

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "additive", either initialize irradianceTexture with zeros
    // or leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    yield run(renderer, () => {
      textures.computeDirectIrradiance(renderer, context)
    })

    // Compute the rayleigh and mie single scattering, store them in
    // deltaRayleighScattering and deltaMieScattering, and either store them or
    // accumulate them in scatteringTexture and optional
    // mieScatteringTexture.
    yield run(renderer, () => {
      textures.computeSingleScattering(renderer, context)
    })

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (let scatteringOrder = 2; scatteringOrder <= 4; ++scatteringOrder) {
      // Compute the scattering density, and store it in deltaScatteringDensity.
      yield run(renderer, () => {
        textures.computeScatteringDensity(renderer, context, scatteringOrder)
      })
      // Compute the indirect irradiance, store it in deltaIrradiance and
      // accumulate it in irradianceTexture.
      yield run(renderer, () => {
        textures.computeIndirectIrradiance(renderer, context, scatteringOrder)
      })
      // Compute the multiple scattering, store it in deltaMultipleScattering,
      // and accumulate it in scatteringTexture.
      yield run(renderer, () => {
        textures.computeMultipleScattering(renderer, context)
      })
    }
  }

  async updateTextures(renderer: Renderer): Promise<void> {
    invariant(this.textures != null)

    const context = this.textures.createContext()
    this.updating = true
    try {
      await timeSlice(this.performCompute(renderer, context))
    } finally {
      this.updating = false
      context.dispose()
      this.disposeQueue?.()
    }
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null || this.version === this.currentVersion) {
      return
    }
    this.currentVersion = this.version

    // TODO: Race condition
    this.updateTextures(renderer).catch((error: unknown) => {
      throw error instanceof Error ? error : new Error()
    })
  }

  override setup(builder: NodeBuilder): unknown {
    if (this.textures == null) {
      // Lazily initialize the texture generator depending of the renderer:
      this.textures = isWebGPU(builder)
        ? new AtmosphereLUTTexturesWebGPU()
        : new AtmosphereLUTTexturesWebGL()

      // Swap the contents of the texture nodes. The WebGPU one has storage
      // textures and WebGL one has render target textures, which we cannot
      // populate until the generator is initialized.
      const {
        transmittance,
        irradiance,
        scattering,
        singleMieScattering,
        higherOrderScattering
      } = this.textureNodes
      transmittance.value = this.textures.get('transmittance')
      irradiance.value = this.textures.get('irradiance')
      scattering.value = this.textures.get('scattering')
      singleMieScattering.value = this.textures.get('singleMieScattering')
      higherOrderScattering.value = this.textures.get('higherOrderScattering')
    }

    const textureType = isFloatLinearSupported(builder.renderer)
      ? (this.textureType ?? FloatType)
      : HalfFloatType
    const parameters = this.parameters.clone()
    parameters.transmittancePrecisionLog = textureType === HalfFloatType
    this.textures.setup(parameters, textureType)

    return super.setup(builder)
  }

  override dispose(): void {
    if (this.updating) {
      this.disposeQueue = () => {
        this.dispose()
        this.disposeQueue = undefined
      }
      return
    }

    this.textures?.dispose()
    super.dispose()
  }
}
