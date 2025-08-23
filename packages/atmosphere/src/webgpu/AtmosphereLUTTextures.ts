import { Matrix3, Vector3 } from 'three'
import { uniform } from 'three/tsl'
import type { Renderer, Texture } from 'three/webgpu'

import type { AnyFloatType } from '@takram/three-geospatial'

import type {
  AtmosphereLUTTexture3DName,
  AtmosphereLUTTextureName
} from './AtmosphereLUTNode'
import type { AtmosphereParameters } from './AtmosphereParameters'

export abstract class AtmosphereLUTTexturesContext {
  lambdas = uniform(new Vector3(680, 550, 440))
  luminanceFromRadiance = uniform(new Matrix3().identity())

  abstract dispose(): void
}

export abstract class AtmosphereLUTTextures {
  parameters: AtmosphereParameters

  constructor(parameters: AtmosphereParameters) {
    this.parameters = parameters
  }

  abstract get(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): Texture

  abstract createContext(
    textureType: AnyFloatType,
    parameters: AtmosphereParameters
  ): AtmosphereLUTTexturesContext

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

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  setup(textureType: AnyFloatType): void {}

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  dispose(): void {}
}
