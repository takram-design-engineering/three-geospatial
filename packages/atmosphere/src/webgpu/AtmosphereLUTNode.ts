import {
  AddEquation,
  Box3,
  ClampToEdgeWrapping,
  CustomBlending,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  NoBlending,
  NoColorSpace,
  OneFactor,
  Vector3,
  type Data3DTexture,
  type Texture,
  type Vector2
} from 'three'
import {
  exp,
  Fn,
  instanceIndex,
  int,
  mat3,
  nodeObject,
  texture,
  texture3D,
  textureStore,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  Storage3DTexture,
  StorageTexture,
  TempNode,
  type ComputeNode,
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
import { AtmosphereParameters } from './AtmosphereParameters'
import { rayleighPhaseFunction } from './common'
import {
  computeDirectIrradianceTexture,
  computeIndirectIrradianceTexture,
  computeMultipleScatteringTexture,
  computeScatteringDensityTexture,
  computeSingleScatteringTexture,
  computeTransmittanceToTopAtmosphereBoundaryTexture
} from './precompute'

function createStorageTexture(name: string): StorageTexture {
  const texture = new StorageTexture(1, 1)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return texture
}

function createStorage3DTexture(name: string): Storage3DTexture {
  const texture = new Storage3DTexture(1, 1, 1)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return texture
}

function setupStorageTexture(
  texture: Texture,
  textureType: AnyFloatType,
  size: Vector2
): void {
  texture.type = textureType
  texture.image.width = size.x
  texture.image.height = size.y
}

function setupStorage3DTexture(
  texture: Storage3DTexture,
  textureType: AnyFloatType,
  size: Vector3
): void {
  texture.type = textureType
  texture.image.width = size.x
  texture.image.height = size.y
  texture.image.depth = size.z
}

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
  rendererState = RendererUtils.resetRendererState(renderer, rendererState)
  renderer.setClearColor(0, 0)
  renderer.autoClear = false
  task()
  RendererUtils.restoreRendererState(renderer, rendererState)
  return true
}

class Context {
  lambdas = vec3(680, 550, 440)
  luminanceFromRadiance = mat3(new Matrix3().identity())

  opticalDepth = createStorageTexture('opticalDepth')
  deltaIrradiance = createStorageTexture('deltaIrradiance')
  deltaRayleighScattering = createStorage3DTexture('deltaRayleighScattering')
  deltaMieScattering = createStorage3DTexture('deltaMieScattering')
  deltaScatteringDensity = createStorage3DTexture('deltaScatteringDensity')

  irradianceRead = createStorageTexture('irradianceRead')
  scatteringRead = createStorage3DTexture('scatteringRead')
  higherOrderScatteringRead = createStorage3DTexture(
    'higherOrderScatteringRead'
  )

  // deltaMultipleScattering is only needed to compute scattering order 3 or
  // more, while deltaRayleighScattering and deltaMieScattering are only needed
  // to compute double scattering. Therefore, to save memory, we can store
  // deltaRayleighScattering and deltaMultipleScattering in the same GPU
  // texture.
  deltaMultipleScattering = this.deltaRayleighScattering

  constructor(textureType: AnyFloatType, parameters: AtmosphereParameters) {
    if (parameters.transmittancePrecisionLog) {
      setupStorageTexture(
        this.opticalDepth,
        textureType,
        parameters.transmittanceTextureSize
      )
    }
    setupStorageTexture(
      this.deltaIrradiance,
      textureType,
      parameters.irradianceTextureSize
    )
    setupStorage3DTexture(
      this.deltaRayleighScattering,
      textureType,
      parameters.scatteringTextureSize
    )
    setupStorage3DTexture(
      this.deltaMieScattering,
      textureType,
      parameters.scatteringTextureSize
    )
    setupStorage3DTexture(
      this.deltaScatteringDensity,
      textureType,
      parameters.scatteringTextureSize
    )

    setupStorageTexture(
      this.irradianceRead,
      textureType,
      parameters.irradianceTextureSize
    )
    setupStorage3DTexture(
      this.scatteringRead,
      textureType,
      parameters.scatteringTextureSize
    )
    setupStorage3DTexture(
      this.higherOrderScatteringRead,
      textureType,
      parameters.scatteringTextureSize
    )
  }

  dispose(): void {
    this.opticalDepth.dispose()
    this.deltaIrradiance.dispose()
    this.deltaRayleighScattering.dispose()
    this.deltaMieScattering.dispose()
    this.deltaScatteringDensity.dispose()
    this.irradianceRead.dispose()
    this.scatteringRead.dispose()
    this.higherOrderScatteringRead.dispose()
  }
}

class AdditiveNodeMaterial extends NodeMaterial {
  override blendEquation = AddEquation
  override blendEquationAlpha = AddEquation
  override blendSrc = OneFactor
  override blendDst = OneFactor
  override blendSrcAlpha = OneFactor
  override blendDstAlpha = OneFactor

  // eslint-disable-next-line accessor-pairs
  set additive(value: boolean) {
    this.transparent = value
    this.blending = value ? CustomBlending : NoBlending
  }
}

const textureNames = ['transmittance', 'irradiance'] as const
const texture3DNames = [
  'scattering',
  'singleMieScattering',
  'higherOrderScattering'
] as const

export type AtmosphereLUTTextureName = (typeof textureNames)[number]
export type AtmosphereLUTTexture3DName = (typeof texture3DNames)[number]

const boxScratch = /*#__PURE__*/ new Box3()
const vectorScratch = /*#__PURE__*/ new Vector3()

export class AtmosphereLUTNode extends TempNode {
  static override get type(): string {
    return 'AtmosphereLUTNode'
  }

  parameters: AtmosphereParameters
  textureType?: AnyFloatType // TODO

  private readonly material = new AdditiveNodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  private readonly transmittance: StorageTexture
  private readonly irradiance: StorageTexture
  private readonly scattering: Storage3DTexture
  private readonly singleMieScattering: Storage3DTexture
  private readonly higherOrderScattering: Storage3DTexture

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private _transmittanceNode?: NodeObject<ComputeNode>
  private _directIrradianceNode?: NodeObject<ComputeNode>
  private _singleScatteringNode?: NodeObject<ComputeNode>
  private _scatteringDensityNode?: NodeObject<ComputeNode>
  private _indirectIrradianceNode?: NodeObject<ComputeNode>
  private _multipleScatteringNode?: NodeObject<ComputeNode>

  private readonly scatteringOrder = uniform(0)

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

  constructor(parameters = new AtmosphereParameters()) {
    super(null)

    this.parameters = parameters
    this.transmittance = createStorageTexture('transmittanceRW')
    this.irradiance = createStorageTexture('irradiance')
    this.scattering = createStorage3DTexture('scattering')
    this.singleMieScattering = createStorage3DTexture('singleMieScattering')
    this.higherOrderScattering = createStorage3DTexture('higherOrderScattering')

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTexture(name: AtmosphereLUTTextureName): Texture
  getTexture(name: AtmosphereLUTTexture3DName): Data3DTexture
  getTexture(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): Texture | Data3DTexture {
    return this[name]
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
        this.getTexture(name as any)
      ))
    }
    if (texture3DNames.includes(name as any)) {
      return (this._textureNodes[name] = outputTexture3D(
        this,
        this.getTexture(name as any)
      ))
    }
    throw new Error(`Invalid texture name: ${name}`)
  }

  private computeTransmittance(
    renderer: Renderer,
    { opticalDepth }: Context
  ): void {
    const { parameters } = this
    const { x: width, y: height } = parameters.transmittanceTextureSize

    this._transmittanceNode ??= Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width)
      const textureCoordinate = vec2(x, y)

      const transmittance = computeTransmittanceToTopAtmosphereBoundaryTexture(
        textureCoordinate.add(0.5)
      ).context({ atmosphere: { parameters } })

      if (parameters.transmittancePrecisionLog) {
        // Compute the optical depth, and store it in opticalDepth. Avoid having
        // tiny transmittance values underflow to 0 due to half-float precision.
        textureStore(
          this.transmittance,
          textureCoordinate,
          exp(transmittance.negate())
        )
        textureStore(opticalDepth, textureCoordinate, transmittance)
      } else {
        textureStore(this.transmittance, textureCoordinate, transmittance)
      }
    })().compute(width * height, [4, 4, 4])

    void renderer.compute(this._transmittanceNode)
  }

  private computeDirectIrradiance(
    renderer: Renderer,
    { deltaIrradiance, opticalDepth }: Context
  ): void {
    const { parameters } = this
    const { x: width, y: height } = parameters.irradianceTextureSize

    this._directIrradianceNode ??= Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width)
      const textureCoordinate = vec2(x, y)

      const irradiance = computeDirectIrradianceTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepth
            : this.transmittance
        ),
        textureCoordinate.add(0.5)
      ).context({ atmosphere: { parameters } })

      textureStore(this.irradiance, textureCoordinate, vec4(vec3(0), 1))
      textureStore(deltaIrradiance, textureCoordinate, vec4(irradiance, 1))
    })().compute(width * height, [4, 4, 4])

    void renderer.compute(this._directIrradianceNode)
  }

  private computeSingleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaRayleighScattering,
      deltaMieScattering,
      opticalDepth
    }: Context
  ): void {
    const { parameters } = this
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    this._singleScatteringNode ??= Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width).mod(height)
      const z = id.div(width * height)
      const textureCoordinate = vec3(x, y, z)

      const singleScattering = computeSingleScatteringTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepth
            : this.transmittance
        ),
        textureCoordinate.add(0.5)
      ).context({ atmosphere: { parameters } })

      const rayleigh = singleScattering.get('rayleigh')
      const mie = singleScattering.get('mie')

      textureStore(
        this.scattering,
        textureCoordinate,
        vec4(
          rayleigh.mul(luminanceFromRadiance),
          mie.mul(luminanceFromRadiance).r
        )
      )
      textureStore(
        deltaRayleighScattering,
        textureCoordinate,
        vec4(rayleigh, 1)
      )
      textureStore(
        deltaMieScattering,
        textureCoordinate,
        vec4(mie.mul(luminanceFromRadiance), 1)
      )
    })().compute(width * height * depth, [4, 4, 4])

    void renderer.compute(this._singleScatteringNode)

    if (!parameters.combinedScatteringTextures) {
      renderer.copyTextureToTexture(
        deltaMieScattering,
        this.singleMieScattering,
        boxScratch.set(
          vectorScratch.setScalar(0),
          parameters.scatteringTextureSize
        )
      )
    }
  }

  private computeScatteringDensity(
    renderer: Renderer,
    {
      deltaIrradiance,
      deltaRayleighScattering,
      deltaMieScattering,
      deltaScatteringDensity,
      deltaMultipleScattering,
      opticalDepth
    }: Context,
    scatteringOrder: number
  ): void {
    const { parameters } = this
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    this._scatteringDensityNode ??= Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width).mod(height)
      const z = id.div(width * height)
      const textureCoordinate = vec3(x, y, z)

      const radiance = computeScatteringDensityTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepth
            : this.transmittance
        ),
        texture3D(deltaRayleighScattering),
        texture3D(deltaMieScattering),
        texture3D(deltaMultipleScattering),
        texture(deltaIrradiance),
        textureCoordinate.add(0.5),
        int(this.scatteringOrder)
      ).context({ atmosphere: { parameters } })

      textureStore(deltaScatteringDensity, textureCoordinate, radiance)
    })().compute(width * height * depth, [4, 4, 4])

    this.scatteringOrder.value = scatteringOrder
    void renderer.compute(this._scatteringDensityNode)
  }

  private computeIndirectIrradiance(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaIrradiance,
      deltaRayleighScattering,
      deltaMieScattering,
      deltaMultipleScattering,
      irradianceRead
    }: Context,
    scatteringOrder: number
  ): void {
    const { parameters } = this
    const { x: width, y: height } = parameters.irradianceTextureSize

    renderer.copyTextureToTexture(this.irradiance, irradianceRead)

    this._indirectIrradianceNode ??= Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width)
      const textureCoordinate = vec2(x, y)

      const irradiance = computeIndirectIrradianceTexture(
        texture3D(deltaRayleighScattering),
        texture3D(deltaMieScattering),
        texture3D(deltaMultipleScattering),
        textureCoordinate.add(0.5),
        int(this.scatteringOrder.sub(1))
      ).context({ atmosphere: { parameters } })

      textureStore(
        this.irradiance,
        textureCoordinate,
        texture(irradianceRead)
          .load(textureCoordinate)
          .add(irradiance.mul(luminanceFromRadiance))
      )
      textureStore(deltaIrradiance, textureCoordinate, irradiance)
    })().compute(width * height, [4, 4, 4])

    this.scatteringOrder.value = scatteringOrder
    void renderer.compute(this._indirectIrradianceNode)
  }

  private computeMultipleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaScatteringDensity,
      deltaMultipleScattering,
      opticalDepth,
      scatteringRead,
      higherOrderScatteringRead
    }: Context
  ): void {
    const { parameters } = this
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    renderer.copyTextureToTexture(
      this.scattering,
      scatteringRead,
      boxScratch.set(
        vectorScratch.setScalar(0),
        parameters.scatteringTextureSize
      )
    )
    renderer.copyTextureToTexture(
      this.higherOrderScattering,
      higherOrderScatteringRead,
      boxScratch.set(
        vectorScratch.setScalar(0),
        parameters.scatteringTextureSize
      )
    )

    this._multipleScatteringNode ??= Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width).mod(height)
      const z = id.div(width * height)
      const textureCoordinate = vec3(x, y, z)

      // WORKAROUND: Texture3DNode seems to have an issue with load() with
      // ivec3() coordinates.
      const textureUV = textureCoordinate
        .add(0.5)
        .div(vec3(width, height, depth))

      const multipleScattering = computeMultipleScatteringTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepth
            : this.transmittance
        ),
        texture3D(deltaScatteringDensity),
        textureCoordinate.add(0.5)
      ).context({ atmosphere: { parameters } })

      const radiance = multipleScattering.get('radiance')
      const cosViewSun = multipleScattering.get('cosViewSun')
      const luminance = radiance
        .mul(luminanceFromRadiance)
        .div(rayleighPhaseFunction(cosViewSun))

      textureStore(
        this.scattering,
        textureCoordinate,
        texture3D(scatteringRead).sample(textureUV).add(vec4(luminance, 0))
      )
      textureStore(
        deltaMultipleScattering,
        textureCoordinate,
        vec4(radiance, 1)
      )
      if (parameters.higherOrderScatteringTexture) {
        textureStore(
          this.higherOrderScattering,
          textureCoordinate,
          texture3D(higherOrderScatteringRead)
            .sample(textureUV)
            .add(vec4(luminance, 1))
        )
      }
    })().compute(width * height * depth, [4, 4, 4])

    void renderer.compute(this._multipleScatteringNode)
  }

  private *compute(renderer: Renderer, context: Context): Iterable<boolean> {
    // Compute the transmittance, and store it in transmittanceTexture.
    yield run(renderer, () => {
      this.computeTransmittance(renderer, context)
    })

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "additive", either initialize irradianceTexture with zeros
    // or leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    yield run(renderer, () => {
      this.computeDirectIrradiance(renderer, context)
    })

    // Compute the rayleigh and mie single scattering, store them in
    // deltaRayleighScattering and deltaMieScattering, and either store them or
    // accumulate them in scatteringTexture and optional
    // mieScatteringTexture.
    yield run(renderer, () => {
      this.computeSingleScattering(renderer, context)
    })

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (let scatteringOrder = 2; scatteringOrder <= 4; ++scatteringOrder) {
      // Compute the scattering density, and store it in deltaScatteringDensity.
      yield run(renderer, () => {
        this.computeScatteringDensity(renderer, context, scatteringOrder)
      })
      // Compute the indirect irradiance, store it in deltaIrradiance and
      // accumulate it in irradianceTexture.
      yield run(renderer, () => {
        this.computeIndirectIrradiance(renderer, context, scatteringOrder)
      })
      // Compute the multiple scattering, store it in deltaMultipleScattering,
      // and accumulate it in scatteringTexture.
      yield run(renderer, () => {
        this.computeMultipleScattering(renderer, context)
      })
    }

    this.material.fragmentNode = null
  }

  async updateTextures(renderer: Renderer): Promise<void> {
    invariant(this.textureType != null)
    const context = new Context(this.textureType, this.parameters)
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

    const { parameters } = this
    setupStorageTexture(
      this.transmittance,
      this.textureType,
      parameters.transmittanceTextureSize
    )
    setupStorageTexture(
      this.irradiance,
      this.textureType,
      parameters.irradianceTextureSize
    )
    setupStorage3DTexture(
      this.scattering,
      this.textureType,
      parameters.scatteringTextureSize
    )
    if (!parameters.combinedScatteringTextures) {
      setupStorage3DTexture(
        this.singleMieScattering,
        this.textureType,
        parameters.scatteringTextureSize
      )
    }
    if (parameters.higherOrderScatteringTexture) {
      setupStorage3DTexture(
        this.higherOrderScattering,
        this.textureType,
        parameters.scatteringTextureSize
      )
    }
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

    this.transmittance.dispose()
    this.irradiance.dispose()
    this.scattering.dispose()
    this.singleMieScattering.dispose()
    this.higherOrderScattering.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    this.parameters.dispose() // TODO: Conditionally depending on the owner.

    const nodes = this._textureNodes
    for (const key in nodes) {
      if (Object.hasOwn(nodes, key)) {
        const uniform = nodes[key as keyof typeof nodes]
        uniform?.dispose()
      }
    }
  }
}

export const atmosphereLUT = (
  ...args: ConstructorParameters<typeof AtmosphereLUTNode>
): NodeObject<AtmosphereLUTNode> => nodeObject(new AtmosphereLUTNode(...args))
