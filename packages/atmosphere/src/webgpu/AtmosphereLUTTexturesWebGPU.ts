import {
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
  float,
  Fn,
  globalId,
  If,
  Return,
  sin,
  sqrt,
  texture,
  texture3D,
  textureStore,
  uint,
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
  type Renderer
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { reinterpretType, type AnyFloatType } from '@takram/three-geospatial'
import { FnVar, type Node } from '@takram/three-geospatial/webgpu'

import type {
  AtmosphereLUTTexture3DName,
  AtmosphereLUTTextureName
} from './AtmosphereLUTNode'
import {
  AtmosphereLUTTextures,
  AtmosphereLUTTexturesContext
} from './AtmosphereLUTTextures'
import type { AtmosphereParameters } from './AtmosphereParameters'
import {
  computeMultipleScatteringTexture,
  computeScatteringTexture,
  getTextureUnitFromSubUV
} from './multiscattering'
import {
  computeIrradianceTexture,
  computeTransmittanceTexture
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

class AtmosphereLUTTexturesContextWebGPU extends AtmosphereLUTTexturesContext {}

export class AtmosphereLUTTexturesWebGPU extends AtmosphereLUTTextures {
  private readonly transmittance: StorageTexture
  private readonly multipleScattering: StorageTexture
  private readonly scattering: Storage3DTexture
  private readonly singleMieScattering: Storage3DTexture
  private readonly higherOrderScattering: Storage3DTexture
  private readonly irradiance: StorageTexture

  private transmittanceNode?: ComputeNode
  private multipleScatteringNode?: ComputeNode
  private scatteringNode?: ComputeNode
  private irradianceNode?: ComputeNode

  constructor() {
    super()
    this.transmittance = createStorageTexture('transmittance')
    this.multipleScattering = createStorageTexture('multipleScattering')
    this.scattering = createStorage3DTexture('scattering')
    this.singleMieScattering = createStorage3DTexture('singleMieScattering')
    this.higherOrderScattering = createStorage3DTexture('higherOrderScattering')
    this.irradiance = createStorageTexture('irradiance')
  }

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
    const { parameters } = context
    const { x: width, y: height } = parameters.transmittanceTextureSize

    this.transmittanceNode?.dispose()
    this.transmittanceNode = Fn(() => {
      const size = uvec2(width, height)
      If(globalId.xy.greaterThanEqual(size).any(), () => {
        Return()
      })

      const transmittance = computeTransmittanceTexture(
        vec2(globalId.xy).add(0.5)
      )
      textureStore(this.transmittance, globalId.xy, transmittance)
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

  computeMultipleScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters, parametersNode } = context
    const { x: width, y: height } = parameters.multipleScatteringTextureSize

    const sampleCount = 64

    const getRayDirection = FnVar((index: Node<'uint'>): Node<'vec3'> => {
      // In the original implementation, theta and phi are uniformly
      // distributed, but they shows artifacts at higher altitudes.
      const sample = float(index)
      const theta = sample.mul((2 * Math.PI) / ((1 + Math.sqrt(5)) / 2))
      const phi = acos(
        sample
          .add(0.5)
          .mul(2 / sampleCount)
          .oneMinus()
      )
      const cosPhi = cos(phi)
      const sinPhi = sin(phi)
      const cosTheta = cos(theta)
      const sinTheta = sin(theta)
      return vec3(cosTheta.mul(sinPhi), sinTheta.mul(sinPhi), cosPhi)
    })

    this.multipleScatteringNode?.dispose()
    this.multipleScatteringNode = Fn(() => {
      const multipleScatteringBuffer = workgroupArray('vec3', sampleCount)
      const transferFactorBuffer = workgroupArray('vec3', sampleCount)

      const size = vec2(width, height).toConst()
      const coord = vec2(globalId.xy).add(0.5)
      const uv = getTextureUnitFromSubUV(coord.div(size), size).toConst()
      const index = globalId.z

      // Construct the parameters of the high-order scattering LUT. They are
      // the cosine of light and zenith [-1, 1], and the view altitude
      // [bottomRadius, topRadius].
      const { topRadius, bottomRadius } = parametersNode
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

      const rayDirection = getRayDirection(index).toConst()
      const cosView = rayDirection.z // rayOrigin is (0, 0, radius)
      const cosViewLight = rayDirection.dot(lightDirection).toConst()

      // Integrate the second-order scattering. This outputs the integrated
      // radiance here (as opposed to luminance) as well as the "transfer
      // factor", which acts as a transfer function on the irradiance of a
      // directional light at a given point.
      const result = computeMultipleScatteringTexture(
        parametersNode,
        texture(this.transmittance),
        radius,
        cosView,
        cosLightZenith,
        cosViewLight
      ).toConst()

      multipleScatteringBuffer
        .element(index)
        .assign(result.get('multipleScattering').div(sampleCount))
      transferFactorBuffer
        .element(index)
        .assign(result.get('transferFactor').div(sampleCount))

      workgroupBarrier()

      // Sum all second-order scattering integrated along the ray directions
      // with respect to the LUT parameters.
      for (let i = sampleCount >> 1; i > 0; i >>>= 1) {
        const level = uint(i)
        If(index.lessThan(level), () => {
          multipleScatteringBuffer
            .element(index)
            .addAssign(multipleScatteringBuffer.element(index.add(level)))
          transferFactorBuffer
            .element(index)
            .addAssign(transferFactorBuffer.element(index.add(level)))
        })

        workgroupBarrier()
      }

      If(index.greaterThan(0), () => {
        Return()
      })

      const multipleScattering = multipleScatteringBuffer.element(uint(0))
      const transferFactor = transferFactorBuffer.element(uint(0))

      textureStore(
        this.multipleScattering,
        globalId.xy,
        // This represents the amount of radiance scattered as if the integral
        // of scattered radiance over the sphere would be 1.
        // For a power-series, such integral is analytically:
        // sum_{n=0}^{n=+inf} = 1 + r + r^2 + r^3 + ... + r^n = 1 / (1 - r)
        vec4(multipleScattering.mul(transferFactor.oneMinus().reciprocal()), 1)
      )
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([1, 1, sampleCount])
      .setName('multipleScattering')

    void renderer.compute(this.multipleScatteringNode, [width, height, 1])
  }

  computeScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters } = context
    const { x: width, y: height, z: depth } = parameters.scatteringTextureSize

    this.scatteringNode?.dispose()
    this.scatteringNode = Fn(() => {
      const size = uvec3(width, height, depth)
      If(globalId.greaterThanEqual(size).any(), () => {
        Return()
      })

      const result = computeScatteringTexture(
        texture(this.transmittance),
        texture(this.multipleScattering),
        vec3(globalId).add(0.5)
      ).toConst()

      const scattering = result.get('scattering')
      const singleMieScattering = result.get('singleMieScattering')

      if (parameters.combinedScatteringTextures) {
        textureStore(
          this.scattering,
          globalId,
          vec4(scattering, singleMieScattering.r)
        )
      } else {
        textureStore(this.scattering, globalId, vec4(scattering, 1))
        textureStore(
          this.singleMieScattering,
          globalId,
          vec4(singleMieScattering, 1)
        )
      }
      if (parameters.higherOrderScatteringTexture) {
        const higherOrderScattering = result.get('higherOrderScattering')
        textureStore(
          this.higherOrderScattering,
          globalId,
          vec4(higherOrderScattering, 1)
        )
      }
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([4, 4, 4])
      .setName('scattering')

    void renderer.compute(this.scatteringNode, [
      Math.ceil(width / 4),
      Math.ceil(height / 4),
      Math.ceil(depth / 4)
    ])
  }

  computeIrradiance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContextWebGPU
  ): void {
    const { parameters } = context
    const { x: width, y: height } = parameters.irradianceTextureSize

    this.irradianceNode?.dispose()
    this.irradianceNode = Fn(() => {
      const size = uvec2(width, height)
      If(globalId.xy.greaterThanEqual(size).any(), () => {
        Return()
      })

      const irradiance = computeIrradianceTexture(
        texture3D(this.scattering),
        texture3D(this.higherOrderScattering),
        vec2(globalId.xy).add(0.5)
      )
      textureStore(this.irradiance, globalId.xy, irradiance)
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel([8, 8, 1])
      .setName('irradiance')

    void renderer.compute(this.irradianceNode, [
      Math.ceil(width / 8),
      Math.ceil(height / 8),
      1
    ])
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
      this.multipleScattering,
      textureType,
      parameters.multipleScatteringTextureSize
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
    setupStorageTexture(
      this.irradiance,
      textureType,
      parameters.irradianceTextureSize
    )
    super.setup(parameters, textureType)
  }

  override dispose(): void {
    this.transmittance.dispose()
    this.multipleScattering.dispose()
    this.scattering.dispose()
    this.singleMieScattering.dispose()
    this.higherOrderScattering.dispose()
    this.irradiance.dispose()
    this.transmittanceNode?.dispose()
    this.multipleScatteringNode?.dispose()
    this.scatteringNode?.dispose()
    this.irradianceNode?.dispose()
    super.dispose()
  }
}
