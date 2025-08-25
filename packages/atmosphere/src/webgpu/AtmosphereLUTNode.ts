import { FloatType, HalfFloatType, type Texture } from 'three'
import type Backend from 'three/src/renderers/common/Backend.js'
import { nodeProxy } from 'three/tsl'
import {
  NodeUpdateType,
  RendererUtils,
  TempNode,
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
  outputTexture,
  outputTexture3D,
  type NodeObject,
  type OutputTexture3DNode,
  type OutputTextureNode
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

const textureNames = ['transmittance', 'irradiance'] as const
const texture3DNames = [
  'scattering',
  'singleMieScattering',
  'higherOrderScattering'
] as const

export type AtmosphereLUTTextureName = (typeof textureNames)[number]
export type AtmosphereLUTTexture3DName = (typeof texture3DNames)[number]

const WEBGPU = 'WEBGPU'
const WEBGL = 'WEBGL'

type AtmosphereLUTNodeScope = typeof WEBGPU | typeof WEBGL

export class AtmosphereLUTNode extends TempNode {
  static override get type(): string {
    return 'AtmosphereLUTNode'
  }

  parameters: AtmosphereParameters
  textureType?: AnyFloatType // TODO

  private readonly textures: AtmosphereLUTTextures

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNodes: Partial<
    Record<
      AtmosphereLUTTextureName | AtmosphereLUTTexture3DName,
      NodeObject<OutputTextureNode | OutputTexture3DNode>
    >
  > = {}

  private currentVersion?: number
  private updating = false
  private disposeQueue: (() => void) | undefined

  constructor(
    scope: AtmosphereLUTNodeScope,
    parameters = new AtmosphereParameters()
  ) {
    super(null)

    this.parameters = parameters
    this.textures =
      scope === WEBGPU
        ? new AtmosphereLUTTexturesWebGPU(parameters)
        : new AtmosphereLUTTexturesWebGL(parameters)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTexture(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): Texture {
    return this.textures.get(name)
  }

  getTextureNode(name: AtmosphereLUTTextureName): NodeObject<TextureNode>
  getTextureNode(name: AtmosphereLUTTexture3DName): NodeObject<Texture3DNode>
  getTextureNode(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): NodeObject<TextureNode> | NodeObject<Texture3DNode> {
    const texture = this._textureNodes[name]
    if (texture != null) {
      return texture
    }
    if (textureNames.includes(name as any)) {
      return (this._textureNodes[name] = outputTexture(
        this,
        this.getTexture(name)
      ))
    }
    if (texture3DNames.includes(name as any)) {
      return (this._textureNodes[name] = outputTexture3D(
        this,
        this.getTexture(name)
      ))
    }
    throw new Error(`Invalid texture name: ${name}`)
  }

  private *compute(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContext
  ): Iterable<boolean> {
    const { textures } = this

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
    invariant(this.textureType != null)

    const context = this.textures.createContext(
      this.textureType,
      this.parameters
    )
    this.updating = true
    try {
      await timeSlice(this.compute(renderer, context))
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
    this.textureType = isFloatLinearSupported(builder.renderer)
      ? (this.textureType ?? FloatType)
      : HalfFloatType

    this.textures.setup(this.textureType)
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

    this.parameters.dispose() // TODO: Conditionally depending on the owner.
    this.textures.dispose()

    const nodes = this._textureNodes
    for (const key in nodes) {
      if (Object.hasOwn(nodes, key)) {
        const uniform = nodes[key as keyof typeof nodes]
        uniform?.dispose()
      }
    }
  }
}

export const atmosphereLUTWebGPU = nodeProxy(AtmosphereLUTNode, WEBGPU)
export const atmosphereLUTWebGL = nodeProxy(AtmosphereLUTNode, WEBGL)

export const atmosphereLUT = (
  renderer: Renderer,
  parameters?: AtmosphereParameters
): AtmosphereLUTNode => {
  // The type of Backend cannot be augmented because it is default-exported.
  const backend = renderer.backend as Backend & {
    isWebGPUBackend?: boolean
  }
  return backend.isWebGPUBackend === true
    ? atmosphereLUTWebGPU(parameters)
    : atmosphereLUTWebGL(parameters)
}
