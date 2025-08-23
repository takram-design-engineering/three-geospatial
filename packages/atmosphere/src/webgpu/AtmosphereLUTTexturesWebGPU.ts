import {
  Box3,
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  Vector3,
  type Texture,
  type Vector2
} from 'three'
import {
  exp,
  Fn,
  instanceIndex,
  int,
  texture,
  texture3D,
  textureStore,
  uniform,
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

import type { AnyFloatType } from '@takram/three-geospatial'
import type { NodeObject } from '@takram/three-geospatial/webgpu'

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
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return texture
}

export function createStorage3DTexture(name: string): Storage3DTexture {
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

export function setupStorageTexture(
  texture: Texture,
  textureType: AnyFloatType,
  size: Vector2
): void {
  texture.type = textureType
  texture.image.width = size.x
  texture.image.height = size.y
}

export function setupStorage3DTexture(
  texture: Storage3DTexture,
  textureType: AnyFloatType,
  size: Vector3
): void {
  texture.type = textureType
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

  constructor(textureType: AnyFloatType, parameters: AtmosphereParameters) {
    super()

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

const boxScratch = /*#__PURE__*/ new Box3()
const vectorScratch = /*#__PURE__*/ new Vector3()

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

  private transmittanceNode?: NodeObject<ComputeNode>
  private directIrradianceNode?: NodeObject<ComputeNode>
  private singleScatteringNode?: NodeObject<ComputeNode>
  private scatteringDensityNode?: NodeObject<ComputeNode>
  private indirectIrradianceNode?: NodeObject<ComputeNode>
  private multipleScatteringNode?: NodeObject<ComputeNode>

  private readonly scatteringOrder = uniform(0)

  get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture {
    return this[name]
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  override createContext(
    textureType: AnyFloatType,
    parameters: AtmosphereParameters
  ): AtmosphereLUTTexturesContextWebGPU {
    return new AtmosphereLUTTexturesContextWebGPU(textureType, parameters)
  }

  computeTransmittance(
    renderer: Renderer,
    { opticalDepth }: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters } = this
    const { x: width, y: height } = parameters.transmittanceTextureSize

    this.transmittanceNode ??= Fn(() => {
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
    })().compute(width * height, [8, 8, 1])

    void renderer.compute(this.transmittanceNode)
  }

  computeDirectIrradiance(
    renderer: Renderer,
    { deltaIrradiance, opticalDepth }: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters } = this
    const { x: width, y: height } = parameters.irradianceTextureSize

    this.directIrradianceNode ??= Fn(() => {
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
    })().compute(width * height, [8, 8, 1])

    void renderer.compute(this.directIrradianceNode)
  }

  computeSingleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaRayleighScattering,
      deltaMieScattering,
      opticalDepth
    }: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters } = this
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    this.singleScatteringNode ??= Fn(() => {
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

    void renderer.compute(this.singleScatteringNode)

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

  computeScatteringDensity(
    renderer: Renderer,
    {
      deltaIrradiance,
      deltaRayleighScattering,
      deltaMieScattering,
      deltaScatteringDensity,
      deltaMultipleScattering,
      opticalDepth
    }: AtmosphereLUTTexturesContextWebGPU,
    scatteringOrder: number
  ): void {
    const { parameters } = this
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    this.scatteringDensityNode ??= Fn(() => {
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
    void renderer.compute(this.scatteringDensityNode)
  }

  computeIndirectIrradiance(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaIrradiance,
      deltaRayleighScattering,
      deltaMieScattering,
      deltaMultipleScattering,
      irradianceRead
    }: AtmosphereLUTTexturesContextWebGPU,
    scatteringOrder: number
  ): void {
    const { parameters } = this
    const { x: width, y: height } = parameters.irradianceTextureSize

    renderer.copyTextureToTexture(this.irradiance, irradianceRead)

    this.indirectIrradianceNode ??= Fn(() => {
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
    })().compute(width * height, [8, 8, 1])

    this.scatteringOrder.value = scatteringOrder
    void renderer.compute(this.indirectIrradianceNode)
  }

  computeMultipleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaScatteringDensity,
      deltaMultipleScattering,
      opticalDepth,
      scatteringRead,
      higherOrderScatteringRead
    }: AtmosphereLUTTexturesContextWebGPU
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

    this.multipleScatteringNode ??= Fn(() => {
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

    void renderer.compute(this.multipleScatteringNode)
  }

  override setup(textureType: AnyFloatType): void {
    const { parameters } = this
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
  }

  override dispose(): void {
    this.transmittance.dispose()
    this.irradiance.dispose()
    this.scattering.dispose()
    this.singleMieScattering.dispose()
    this.higherOrderScattering.dispose()
  }
}
