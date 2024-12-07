/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { EffectAttribute } from 'postprocessing'
import { Uniform, Vector2, type Camera, type Texture } from 'three'

import {
  depthShader,
  packingShader,
  transformShader
} from '@takram/three-geospatial'

import {
  AtmosphereEffectBase,
  atmosphereEffectBaseOptionsDefaults,
  type AtmosphereEffectBaseOptions
} from './AtmosphereEffectBase'
import { type AtmosphereParameters } from './AtmosphereParameters'

import fragmentShader from './shaders/aerialPerspectiveEffect.frag'
import vertexShader from './shaders/aerialPerspectiveEffect.vert'
import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'

export interface AerialPerspectiveEffectOptions
  extends AtmosphereEffectBaseOptions {
  normalBuffer?: Texture | null
  octEncodedNormal?: boolean
  reconstructNormal?: boolean
  correctGeometricError?: boolean
  sunIrradiance?: boolean
  skyIrradiance?: boolean
  transmittance?: boolean
  inscatter?: boolean
  irradianceScale?: number
}

export const aerialPerspectiveEffectOptionsDefaults = {
  ...atmosphereEffectBaseOptionsDefaults,
  octEncodedNormal: false,
  reconstructNormal: false,
  correctGeometricError: true,
  sunIrradiance: false,
  skyIrradiance: false,
  transmittance: true,
  inscatter: true,
  irradianceScale: 1
} satisfies AerialPerspectiveEffectOptions

export class AerialPerspectiveEffect extends AtmosphereEffectBase {
  constructor(
    camera: Camera,
    options?: AerialPerspectiveEffectOptions,
    atmosphere?: AtmosphereParameters
  ) {
    const {
      normalBuffer = null,
      octEncodedNormal,
      reconstructNormal,
      correctGeometricError,
      sunIrradiance,
      skyIrradiance,
      transmittance,
      inscatter,
      irradianceScale,
      ...others
    } = { ...aerialPerspectiveEffectOptionsDefaults, ...options }

    super(
      'AerialPerspectiveEffect',
      /* glsl */ `
        ${parameters}
        ${functions}
        ${depthShader}
        ${packingShader}
        ${transformShader}
        ${fragmentShader}
      `,
      camera,
      {
        ...others,
        vertexShader: /* glsl */ `
          ${parameters}
          ${vertexShader}
        `,
        attributes: EffectAttribute.DEPTH,
        // prettier-ignore
        uniforms: new Map<string, Uniform>([
          ['normalBuffer', new Uniform(normalBuffer)],
          ['geometricErrorAltitudeRange', new Uniform(new Vector2(2e5, 6e5))],
          ['irradianceScale', new Uniform(irradianceScale)]
        ])
      },
      atmosphere
    )

    this.octEncodedNormal = octEncodedNormal
    this.reconstructNormal = reconstructNormal
    this.correctGeometricError = correctGeometricError
    this.sunIrradiance = sunIrradiance
    this.skyIrradiance = skyIrradiance
    this.transmittance = transmittance
    this.inscatter = inscatter
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer')!.value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer')!.value = value
  }

  get octEncodedNormal(): boolean {
    return this.defines.has('OCT_ENCODED_NORMAL')
  }

  set octEncodedNormal(value: boolean) {
    if (value !== this.octEncodedNormal) {
      if (value) {
        this.defines.set('OCT_ENCODED_NORMAL', '1')
      } else {
        this.defines.delete('OCT_ENCODED_NORMAL')
      }
      this.setChanged()
    }
  }

  get reconstructNormal(): boolean {
    return this.defines.has('RECONSTRUCT_NORMAL')
  }

  set reconstructNormal(value: boolean) {
    if (value !== this.reconstructNormal) {
      if (value) {
        this.defines.set('RECONSTRUCT_NORMAL', '1')
      } else {
        this.defines.delete('RECONSTRUCT_NORMAL')
      }
      this.setChanged()
    }
  }

  get correctGeometricError(): boolean {
    return this.defines.has('CORRECT_GEOMETRIC_ERROR')
  }

  set correctGeometricError(value: boolean) {
    if (value !== this.correctGeometricError) {
      if (value) {
        this.defines.set('CORRECT_GEOMETRIC_ERROR', '1')
      } else {
        this.defines.delete('CORRECT_GEOMETRIC_ERROR')
      }
      this.setChanged()
    }
  }

  get geometricErrorAltitudeRange(): Vector2 {
    return this.uniforms.get('geometricErrorAltitudeRange')!.value
  }

  get sunIrradiance(): boolean {
    return this.defines.has('SUN_IRRADIANCE')
  }

  set sunIrradiance(value: boolean) {
    if (value !== this.sunIrradiance) {
      if (value) {
        this.defines.set('SUN_IRRADIANCE', '1')
      } else {
        this.defines.delete('SUN_IRRADIANCE')
      }
      this.setChanged()
    }
  }

  get skyIrradiance(): boolean {
    return this.defines.has('SKY_IRRADIANCE')
  }

  set skyIrradiance(value: boolean) {
    if (value !== this.skyIrradiance) {
      if (value) {
        this.defines.set('SKY_IRRADIANCE', '1')
      } else {
        this.defines.delete('SKY_IRRADIANCE')
      }
      this.setChanged()
    }
  }

  get transmittance(): boolean {
    return this.defines.has('TRANSMITTANCE')
  }

  set transmittance(value: boolean) {
    if (value !== this.transmittance) {
      if (value) {
        this.defines.set('TRANSMITTANCE', '1')
      } else {
        this.defines.delete('TRANSMITTANCE')
      }
      this.setChanged()
    }
  }

  get inscatter(): boolean {
    return this.defines.has('INSCATTER')
  }

  set inscatter(value: boolean) {
    if (value !== this.inscatter) {
      if (value) {
        this.defines.set('INSCATTER', '1')
      } else {
        this.defines.delete('INSCATTER')
      }
      this.setChanged()
    }
  }

  get irradianceScale(): number {
    return this.uniforms.get('irradianceScale')!.value
  }

  set irradianceScale(value: number) {
    this.uniforms.get('irradianceScale')!.value = value
  }
}
