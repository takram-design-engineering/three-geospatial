import { Matrix3, Vector3, type Texture } from 'three'
import { uniform } from 'three/tsl'
import type { Renderer } from 'three/webgpu'

import type { AnyFloatType } from '@takram/three-geospatial'

import { AtmosphereContextBaseNode } from './AtmosphereContextBaseNode'
import type {
  AtmosphereLUTTexture3DName,
  AtmosphereLUTTextureName
} from './AtmosphereLUTNode'
import type { AtmosphereParameters } from './AtmosphereParameters'

export abstract class AtmosphereLUTTexturesContext extends AtmosphereContextBaseNode {
  textureType: AnyFloatType
  lambdas = uniform(new Vector3(680, 550, 440))
  luminanceFromRadiance = uniform(new Matrix3())

  constructor(parameters: AtmosphereParameters, textureType: AnyFloatType) {
    super(parameters)
    this.textureType = textureType
  }
}

export abstract class AtmosphereLUTTextures {
  protected parameters?: AtmosphereParameters
  protected textureType?: AnyFloatType

  abstract get(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): Texture

  abstract createContext(): AtmosphereLUTTexturesContext

  abstract computeTransmittance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContext
  ): void
  abstract computeDirectIrradiance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContext
  ): void
  abstract computeSingleScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContext
  ): void
  abstract computeScatteringDensity(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContext,
    scatteringOrder: number
  ): void
  abstract computeIndirectIrradiance(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContext,
    scatteringOrder: number
  ): void
  abstract computeMultipleScattering(
    renderer: Renderer,
    context: AtmosphereLUTTexturesContext
  ): void

  setup(parameters: AtmosphereParameters, textureType: AnyFloatType): void {
    this.parameters = parameters
    this.textureType = textureType
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  dispose(): void {}
}
