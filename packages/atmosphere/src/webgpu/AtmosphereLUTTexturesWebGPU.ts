import {
  Box3,
  LinearFilter,
  NoColorSpace,
  type Data3DTextureImageData,
  type DataTextureImageData,
  type Texture,
  type Vector2,
  type Vector3
} from 'three'
import {
  acos,
  cos,
  exp,
  float,
  Fn,
  globalId,
  If,
  int,
  Return,
  sin,
  sqrt,
  storageTexture,
  texture,
  texture3D,
  textureStore,
  uint,
  uniform,
  uvec2,
  uvec3,
  vec2,
  vec3,
  vec4,
  workgroupArray,
  workgroupBarrier
} from 'three/tsl'
import {
  Storage3DTexture,
  StorageTexture,
  type ComputeNode,
  type Renderer,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { reinterpretType, type AnyFloatType } from '@takram/three-geospatial'
import {
  FnVar,
  storageTexture3D,
  type Node
} from '@takram/three-geospatial/webgpu'

import { makeDestructible } from './AtmosphereContextBase'
import type {
  AtmosphereLUTTexture3DName,
  AtmosphereLUTTextureName
} from './AtmosphereLUTNode'
import {
  AtmosphereLUTTextures,
  AtmosphereLUTTexturesContext
} from './AtmosphereLUTTextures'
import type { AtmosphereParameters } from './AtmosphereParameters'
import { rayleighPhaseFunction } from './common'
import {
  getTextureUnitFromSubUV,
  integrateSingleScatteringTexture
} from './multiscattering'
import {
  computeDirectIrradianceTexture,
  computeIndirectIrradianceTexture,
  computeMultipleScatteringTexture,
  computeScatteringDensityTexture,
  computeSingleScatteringTexture,
  computeTransmittanceToTopAtmosphereBoundaryTexture
} from './precompute'

export function createStorageTexture(name: string): StorageTexture {
  const texture = new StorageTexture(1, 1)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return texture
}

export function createStorage3DTexture(name: string): Storage3DTexture {
  const texture = new Storage3DTexture(1, 1, 1)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return texture
}

export function setupStorageTexture(
  texture: Texture,
  textureType: AnyFloatType,
  size: Vector2
): void {
  texture.type = textureType
  reinterpretType<DataTextureImageData>(texture.image)
  texture.image.width = size.x
  texture.image.height = size.y
}

export function setupStorage3DTexture(
  texture: Storage3DTexture,
  textureType: AnyFloatType,
  size: Vector3
): void {
  texture.type = textureType
  reinterpretType<Data3DTextureImageData>(texture.image)
  texture.image.width = size.x
  texture.image.height = size.y
  texture.image.depth = size.z
}

class AtmosphereLUTTexturesContextWebGPU extends AtmosphereLUTTexturesContext {
  opticalDepth = createStorageTexture('opticalDepth')
  deltaIrradiance = createStorageTexture('deltaIrradiance')
  deltaRayleighScattering = createStorage3DTexture('deltaRayleighScattering')
  deltaMieScattering = createStorage3DTexture('deltaMieScattering')
  deltaScatteringDensity = createStorage3DTexture('deltaScatteringDensity')

  irradianceCopy?: StorageTexture
  scatteringCopy?: Storage3DTexture

  // deltaMultipleScattering is only needed to compute scattering order 3 or
  // more, while deltaRayleighScattering and deltaMieScattering are only needed
  // to compute double scattering. Therefore, to save memory, we can store
  // deltaRayleighScattering and deltaMultipleScattering in the same GPU
  // texture.
  deltaMultipleScattering = this.deltaRayleighScattering

  constructor(
    parameters: AtmosphereParameters,
    textureType: AnyFloatType,
    isTier2TextureFormatsSupported: boolean
  ) {
    super(parameters, textureType)

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

    if (!isTier2TextureFormatsSupported) {
      this.irradianceCopy = createStorageTexture('irradianceCopy')
      this.scatteringCopy = createStorage3DTexture('scatteringCopy')

      setupStorageTexture(
        this.irradianceCopy,
        textureType,
        parameters.irradianceTextureSize
      )
      setupStorage3DTexture(
        this.scatteringCopy,
        textureType,
        parameters.scatteringTextureSize
      )
    }
  }

  override dispose(): void {
    this.opticalDepth.dispose()
    this.deltaIrradiance.dispose()
    this.deltaRayleighScattering.dispose()
    this.deltaMieScattering.dispose()
    this.deltaScatteringDensity.dispose()
    this.irradianceCopy?.dispose()
    this.scatteringCopy?.dispose()
    super.dispose()
  }
}

const boxScratch = /*#__PURE__*/ new Box3()

export class AtmosphereLUTTexturesWebGPU extends AtmosphereLUTTextures {
  private readonly transmittance = createStorageTexture('transmittance')
  private readonly irradiance = createStorageTexture('irradiance')
  private readonly scattering = createStorage3DTexture('scattering')
  private readonly singleMieScattering = createStorage3DTexture(
    'singleMieScattering'
  )
  private readonly highOrderScattering = createStorageTexture(
    'highOrderScattering'
  )

  private transmittanceNode?: ComputeNode
  private directIrradianceNode?: ComputeNode
  private singleScatteringNode?: ComputeNode
  private scatteringDensityNode?: ComputeNode
  private indirectIrradianceNode?: ComputeNode
  private multipleScatteringNode?: ComputeNode
  private highOrderScatteringNode?: ComputeNode

  private readonly isTier2TextureFormatsSupported: boolean

  private readonly scatteringOrder = uniform(0)

  constructor(renderer: Renderer) {
    super()
    // We fallback to copying into temporary textures when read-write
    // rgba16float and rgba32float storage textures are not supported.
    // https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createTexture#tier2
    this.isTier2TextureFormatsSupported = renderer.hasFeature(
      'texture-formats-tier2'
    )
  }

  get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture {
    return this[name]
  }

  override createContext(): AtmosphereLUTTexturesContextWebGPU {
    invariant(this.parameters != null)
    invariant(this.textureType != null)
    return new AtmosphereLUTTexturesContextWebGPU(
      this.parameters,
      this.textureType,
      this.isTier2TextureFormatsSupported
    )
  }

  computeTransmittance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters, opticalDepth } = context
    const { x: width, y: height } = parameters.transmittanceTextureSize

    this.transmittanceNode ??= Fn(() => {
      const size = uvec2(width, height)
      If(globalId.xy.greaterThanEqual(size).any(), () => {
        Return()
      })

      const transmittance = computeTransmittanceToTopAtmosphereBoundaryTexture(
        vec2(globalId.xy).add(0.5)
      )

      if (parameters.transmittancePrecisionLog) {
        // Compute the optical depth, and store it in opticalDepth. Avoid having
        // tiny transmittance values underflow to 0 due to half-float precision.
        textureStore(
          this.transmittance,
          globalId.xy,
          exp(transmittance.negate())
        )
        textureStore(opticalDepth, globalId.xy, transmittance)
      } else {
        textureStore(this.transmittance, globalId.xy, transmittance)
      }
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([8, 8, 1])
      .setName('transmittance')

    void renderer.compute(this.transmittanceNode, [
      Math.ceil(width / 8),
      Math.ceil(height / 8),
      1
    ])
  }

  computeDirectIrradiance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters, deltaIrradiance, opticalDepth } = context
    const { x: width, y: height } = parameters.irradianceTextureSize

    this.directIrradianceNode ??= Fn(() => {
      const size = uvec2(width, height)
      If(globalId.xy.greaterThanEqual(size).any(), () => {
        Return()
      })

      const irradiance = computeDirectIrradianceTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepth
            : this.transmittance
        ),
        vec2(globalId.xy).add(0.5)
      )

      textureStore(this.irradiance, globalId.xy, vec4(vec3(0), 1))
      textureStore(deltaIrradiance, globalId.xy, vec4(irradiance, 1))
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([8, 8, 1])
      .setName('directIrradiance')

    void renderer.compute(this.directIrradianceNode, [
      Math.ceil(width / 8),
      Math.ceil(height / 8),
      1
    ])
  }

  computeSingleScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const {
      parameters,
      luminanceFromRadiance,
      deltaRayleighScattering,
      deltaMieScattering,
      opticalDepth
    } = context
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    this.singleScatteringNode ??= Fn(() => {
      const size = uvec3(width, height, depth)
      If(globalId.greaterThanEqual(size).any(), () => {
        Return()
      })

      const singleScattering = computeSingleScatteringTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepth
            : this.transmittance
        ),
        vec3(globalId).add(0.5)
      )

      const rayleigh = singleScattering.get('rayleigh')
      const mie = singleScattering.get('mie')

      textureStore(
        this.scattering,
        globalId,
        vec4(
          rayleigh.mul(luminanceFromRadiance),
          mie.mul(luminanceFromRadiance).r
        )
      )
      textureStore(deltaRayleighScattering, globalId, vec4(rayleigh, 1))
      textureStore(
        deltaMieScattering,
        globalId,
        vec4(mie.mul(luminanceFromRadiance), 1)
      )
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([4, 4, 4])
      .setName('singleScattering')

    void renderer.compute(this.singleScatteringNode, [
      Math.ceil(width / 4),
      Math.ceil(height / 4),
      Math.ceil(depth / 4)
    ])

    if (!parameters.combinedScatteringTextures) {
      renderer.copyTextureToTexture(
        deltaMieScattering,
        this.singleMieScattering,
        boxScratch.set(
          boxScratch.min.setScalar(0),
          parameters.scatteringTextureSize
        )
      )
    }
  }

  computeScatteringDensity(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU,
    scatteringOrder: number
  ): void {
    const {
      parameters,
      deltaIrradiance,
      deltaRayleighScattering,
      deltaMieScattering,
      deltaScatteringDensity,
      deltaMultipleScattering,
      opticalDepth
    } = context
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    this.scatteringDensityNode ??= Fn(() => {
      const size = uvec3(width, height, depth)
      If(globalId.greaterThanEqual(size).any(), () => {
        Return()
      })

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
        vec3(globalId).add(0.5),
        int(this.scatteringOrder)
      )

      textureStore(deltaScatteringDensity, globalId, radiance)
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([4, 4, 4])
      .setName('scatteringDensity')

    this.scatteringOrder.value = scatteringOrder
    void renderer.compute(this.scatteringDensityNode, [
      Math.ceil(width / 4),
      Math.ceil(height / 4),
      Math.ceil(depth / 4)
    ])
  }

  computeIndirectIrradiance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU,
    scatteringOrder: number
  ): void {
    const {
      parameters,
      luminanceFromRadiance,
      deltaIrradiance,
      deltaRayleighScattering,
      deltaMieScattering,
      deltaMultipleScattering,
      irradianceCopy
    } = context
    const { x: width, y: height } = parameters.irradianceTextureSize

    let irradianceRead: TextureNode
    let irradianceWrite: Texture | TextureNode
    if (this.isTier2TextureFormatsSupported) {
      const irradianceReadWrite = storageTexture(this.irradiance).toReadWrite()
      irradianceRead = irradianceReadWrite
      irradianceWrite = irradianceReadWrite
    } else {
      renderer.copyTextureToTexture(this.irradiance, irradianceCopy!)
      irradianceRead = texture(irradianceCopy)
      irradianceWrite = this.irradiance
    }

    this.indirectIrradianceNode ??= Fn(() => {
      const size = uvec2(width, height)
      If(globalId.xy.greaterThanEqual(size).any(), () => {
        Return()
      })

      const irradiance = computeIndirectIrradianceTexture(
        texture3D(deltaRayleighScattering),
        texture3D(deltaMieScattering),
        texture3D(deltaMultipleScattering),
        vec2(globalId.xy).add(0.5),
        int(this.scatteringOrder.sub(1))
      )

      textureStore(
        irradianceWrite,
        globalId.xy,
        irradianceRead
          .load(globalId.xy)
          .add(irradiance.mul(luminanceFromRadiance))
      )
      textureStore(deltaIrradiance, globalId.xy, irradiance)
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([8, 8, 1])
      .setName('indirectIrradiance')

    this.scatteringOrder.value = scatteringOrder
    void renderer.compute(this.indirectIrradianceNode, [
      Math.ceil(width / 8),
      Math.ceil(height / 8),
      1
    ])
  }

  computeMultipleScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const {
      parameters,
      luminanceFromRadiance,
      deltaScatteringDensity,
      deltaMultipleScattering,
      opticalDepth,
      scatteringCopy
    } = context
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    let scatteringRead: TextureNode
    let scatteringWrite: Texture | TextureNode

    if (this.isTier2TextureFormatsSupported) {
      const scatteringReadWrite = storageTexture3D(
        this.scattering
      ).toReadWrite()
      scatteringRead = scatteringReadWrite
      scatteringWrite = scatteringReadWrite
    } else {
      renderer.copyTextureToTexture(
        this.scattering,
        scatteringCopy!,
        boxScratch.set(
          boxScratch.min.setScalar(0),
          parameters.scatteringTextureSize
        )
      )
      scatteringRead = texture3D(scatteringCopy!)
      scatteringWrite = this.scattering
    }

    this.multipleScatteringNode ??= Fn(() => {
      const size = uvec3(width, height, depth)
      If(globalId.greaterThanEqual(size).any(), () => {
        Return()
      })

      const multipleScattering = computeMultipleScatteringTexture(
        texture(
          parameters.transmittancePrecisionLog
            ? opticalDepth
            : this.transmittance
        ),
        texture3D(deltaScatteringDensity),
        vec3(globalId).add(0.5)
      )

      const radiance = multipleScattering.get('radiance')
      const cosViewLight = multipleScattering.get('cosViewLight')
      const luminance = radiance
        .mul(luminanceFromRadiance)
        .div(rayleighPhaseFunction(cosViewLight))

      textureStore(
        scatteringWrite,
        globalId,
        scatteringRead.load(globalId).add(vec4(luminance, 0))
      )
      textureStore(deltaMultipleScattering, globalId, vec4(radiance, 1))
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([4, 4, 4])
      .setName('multipleScattering')

    void renderer.compute(this.multipleScatteringNode, [
      Math.ceil(width / 4),
      Math.ceil(height / 4),
      Math.ceil(depth / 4)
    ])
  }

  computeHighOrderScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters, parametersNode } = context
    const { x: width, y: height } = parameters.highOrderScatteringTextureSize

    const sampleCount = 64

    const getRayDirection = FnVar((index: Node<'uint'>): Node<'vec3'> => {
      const sample = float(index)
      const theta = sample.mul(2 * Math.PI).div((1 + Math.sqrt(5)) / 2)
      const phi = acos(sample.add(0.5).mul(2).div(64).oneMinus())
      const cosPhi = cos(phi)
      const sinPhi = sin(phi)
      const cosTheta = cos(theta)
      const sinTheta = sin(theta)
      return vec3(cosTheta.mul(sinPhi), sinTheta.mul(sinPhi), cosPhi)
    })

    this.highOrderScatteringNode ??= Fn(() => {
      const radianceBuffer = workgroupArray('vec3', 64)
      const transferFactorBuffer = workgroupArray('vec3', 64)

      const size = vec2(width, height).toConst()
      const coord = vec2(globalId.xy).add(0.5)
      const uv = getTextureUnitFromSubUV(coord.div(size), size).toConst()
      const index = globalId.z

      const { topRadius, bottomRadius } = makeDestructible(parametersNode)
      const cosLightZenith = uv.x.mul(2).sub(1).toConst()
      const lightDirection = vec3(
        0,
        sqrt(cosLightZenith.pow2().oneMinus().saturate()),
        cosLightZenith
      ).toConst()
      const radiusOffset = 0
      const radius = bottomRadius
        .add(
          uv.y
            .add(radiusOffset)
            .saturate()
            .mul(topRadius.sub(bottomRadius).sub(radiusOffset))
        )
        .toConst()

      const rayOrigin = vec3(0, 0, radius)
      const rayDirection = getRayDirection(index)

      const result = integrateSingleScatteringTexture(
        parametersNode,
        texture(this.transmittance),
        texture(this.irradiance),
        rayOrigin,
        rayDirection,
        lightDirection,
        20
      ).toConst()

      radianceBuffer
        .element(index)
        .assign(result.get('radiance').div(sampleCount))
      transferFactorBuffer
        .element(index)
        .assign(result.get('transferFactor').div(sampleCount))

      workgroupBarrier()

      for (let i = 32; i > 0; i >>>= 1) {
        const level = uint(i)
        If(index.lessThan(level), () => {
          radianceBuffer
            .element(index)
            .addAssign(radianceBuffer.element(index.add(level)))
          transferFactorBuffer
            .element(index)
            .addAssign(transferFactorBuffer.element(index.add(level)))
        })

        workgroupBarrier()
      }

      If(index.greaterThan(0), () => {
        Return()
      })

      const radiance = radianceBuffer.element(uint(0))
      const transferFactor = transferFactorBuffer.element(uint(0))

      textureStore(
        this.highOrderScattering,
        globalId.xy,
        vec4(radiance.mul(transferFactor.oneMinus().reciprocal()), 1)
      )
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([1, 1, 64])
      .setName('highOrderScattering')

    void renderer.compute(this.highOrderScatteringNode, [width, height, 1])
  }

  override setup(
    parameters: AtmosphereParameters,
    textureType: AnyFloatType
  ): void {
    setupStorageTexture(
      this.transmittance,
      textureType,
      parameters.transmittanceTextureSize
    )
    setupStorageTexture(
      this.irradiance,
      textureType,
      parameters.irradianceTextureSize
    )
    setupStorage3DTexture(
      this.scattering,
      textureType,
      parameters.scatteringTextureSize
    )
    if (!parameters.combinedScatteringTextures) {
      setupStorage3DTexture(
        this.singleMieScattering,
        textureType,
        parameters.scatteringTextureSize
      )
    }
    setupStorageTexture(
      this.highOrderScattering,
      textureType,
      parameters.highOrderScatteringTextureSize
    )
    super.setup(parameters, textureType)
  }

  override dispose(): void {
    this.transmittance.dispose()
    this.irradiance.dispose()
    this.scattering.dispose()
    this.singleMieScattering.dispose()
    this.highOrderScattering.dispose()
    this.transmittanceNode?.dispose()
    this.directIrradianceNode?.dispose()
    this.singleScatteringNode?.dispose()
    this.scatteringDensityNode?.dispose()
    this.indirectIrradianceNode?.dispose()
    this.multipleScatteringNode?.dispose()
    this.highOrderScatteringNode?.dispose()
    super.dispose()
  }
}
