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
  exp,
  Fn,
  globalId,
  If,
  int,
  Return,
  texture,
  texture3D,
  textureStore,
  uniform,
  uvec2,
  uvec3,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  Storage3DTexture,
  StorageTexture,
  type ComputeNode,
  type Renderer
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { reinterpretType, type AnyFloatType } from '@takram/three-geospatial'

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

  constructor(parameters: AtmosphereParameters, textureType: AnyFloatType) {
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

  override dispose(): void {
    this.opticalDepth.dispose()
    this.deltaIrradiance.dispose()
    this.deltaRayleighScattering.dispose()
    this.deltaMieScattering.dispose()
    this.deltaScatteringDensity.dispose()
    this.irradianceRead.dispose()
    this.scatteringRead.dispose()
    this.higherOrderScatteringRead.dispose()
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
  private readonly higherOrderScattering = createStorage3DTexture(
    'higherOrderScattering'
  )

  private transmittanceNode?: ComputeNode
  private directIrradianceNode?: ComputeNode
  private singleScatteringNode?: ComputeNode
  private scatteringDensityNode?: ComputeNode
  private indirectIrradianceNode?: ComputeNode
  private multipleScatteringNode?: ComputeNode

  private readonly scatteringOrder = uniform(0)

  get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture {
    return this[name]
  }

  override createContext(): AtmosphereLUTTexturesContextWebGPU {
    invariant(this.parameters != null)
    invariant(this.textureType != null)
    return new AtmosphereLUTTexturesContextWebGPU(
      this.parameters,
      this.textureType
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
      .context({ atmosphere: context })
      .compute(
        // @ts-expect-error "count" can be dimensional
        [Math.ceil(width / 8), Math.ceil(height / 8), 1],
        [8, 8, 1]
      )
      .setName('transmittance')

    void renderer.compute(this.transmittanceNode)
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
      .context({ atmosphere: context })
      .compute(
        // @ts-expect-error "count" can be dimensional
        [Math.ceil(width / 8), Math.ceil(height / 8), 1],
        [8, 8, 1]
      )
      .setName('directIrradiance')

    void renderer.compute(this.directIrradianceNode)
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
      .context({ atmosphere: context })
      .compute(
        // @ts-expect-error "count" can be dimensional
        [Math.ceil(width / 4), Math.ceil(height / 4), Math.ceil(depth / 4)],
        [4, 4, 4]
      )
      .setName('singleScattering')

    void renderer.compute(this.singleScatteringNode)

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
      .context({ atmosphere: context })
      .compute(
        // @ts-expect-error "count" can be dimensional
        [Math.ceil(width / 4), Math.ceil(height / 4), Math.ceil(depth / 4)],
        [4, 4, 4]
      )
      .setName('scatteringDensity')

    this.scatteringOrder.value = scatteringOrder
    void renderer.compute(this.scatteringDensityNode)
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
      irradianceRead
    } = context
    const { x: width, y: height } = parameters.irradianceTextureSize

    // TODO: Use NodeAccess.READ_ONLY, which appears to be not supported yet.
    renderer.copyTextureToTexture(this.irradiance, irradianceRead)

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
        this.irradiance,
        globalId.xy,
        texture(irradianceRead)
          .load(globalId.xy)
          .add(irradiance.mul(luminanceFromRadiance))
      )
      textureStore(deltaIrradiance, globalId.xy, irradiance)
    })()
      .context({ atmosphere: context })
      .compute(
        // @ts-expect-error "count" can be dimensional
        [Math.ceil(width / 8), Math.ceil(height / 8), 1],
        [8, 8, 1]
      )
      .setName('indirectIrradiance')

    this.scatteringOrder.value = scatteringOrder
    void renderer.compute(this.indirectIrradianceNode)
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
      scatteringRead,
      higherOrderScatteringRead
    } = context
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    // TODO: Use NodeAccess.READ_ONLY, which appears to be not supported yet.
    renderer.copyTextureToTexture(
      this.scattering,
      scatteringRead,
      boxScratch.set(
        boxScratch.min.setScalar(0),
        parameters.scatteringTextureSize
      )
    )
    // TODO: Use NodeAccess.READ_ONLY, which appears to be not supported yet.
    renderer.copyTextureToTexture(
      this.higherOrderScattering,
      higherOrderScatteringRead,
      boxScratch.set(
        boxScratch.min.setScalar(0),
        parameters.scatteringTextureSize
      )
    )

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
      const cosViewSun = multipleScattering.get('cosViewSun')
      const luminance = radiance
        .mul(luminanceFromRadiance)
        .div(rayleighPhaseFunction(cosViewSun))

      textureStore(
        this.scattering,
        globalId,
        texture3D(scatteringRead).load(globalId).add(vec4(luminance, 0))
      )
      textureStore(deltaMultipleScattering, globalId, vec4(radiance, 1))
      if (parameters.higherOrderScatteringTexture) {
        textureStore(
          this.higherOrderScattering,
          globalId,
          texture3D(higherOrderScatteringRead)
            .load(globalId)
            .add(vec4(luminance, 1))
        )
      }
    })()
      .context({ atmosphere: context })
      .compute(
        // @ts-expect-error "count" can be dimensional
        [Math.ceil(width / 4), Math.ceil(height / 4), Math.ceil(depth / 4)],
        [4, 4, 4]
      )
      .setName('multipleScattering')

    void renderer.compute(this.multipleScatteringNode)
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
    if (parameters.higherOrderScatteringTexture) {
      setupStorage3DTexture(
        this.higherOrderScattering,
        textureType,
        parameters.scatteringTextureSize
      )
    }
    super.setup(parameters, textureType)
  }

  override dispose(): void {
    this.transmittance.dispose()
    this.irradiance.dispose()
    this.scattering.dispose()
    this.singleMieScattering.dispose()
    this.higherOrderScattering.dispose()
    super.dispose()
  }
}
