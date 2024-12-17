/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { EffectAttribute } from 'postprocessing'
import {
  MathUtils,
  Uniform,
  Vector3,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { depth, packing, transform } from '@takram/three-geospatial/shaders'

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
import skyShader from './shaders/sky.glsl'

const vectorScratch = /*#__PURE__*/ new Vector3()

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
  sky?: boolean
  sun?: boolean
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
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
  irradianceScale: 1,
  sky: false,
  sun: true,
  moon: true,
  moonAngularRadius: 0.0045, // ≈ 15.5 arcminutes
  lunarRadianceScale: 1
} satisfies AerialPerspectiveEffectOptions

export class AerialPerspectiveEffect extends AtmosphereEffectBase {
  constructor(
    camera?: Camera,
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
      sky,
      sun,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      ...others
    } = { ...aerialPerspectiveEffectOptionsDefaults, ...options }

    super(
      'AerialPerspectiveEffect',
      /* glsl */ `
        ${parameters}
        ${functions}
        ${depth}
        ${packing}
        ${transform}
        ${skyShader}
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
          ['irradianceScale', new Uniform(irradianceScale)],
          ['idealSphereAlpha', new Uniform(0)],
          ['moonDirection', new Uniform(moonDirection?.clone() ?? new Vector3())],
          ['moonAngularRadius', new Uniform(moonAngularRadius)],
          ['lunarRadianceScale', new Uniform(lunarRadianceScale)]
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
    this.sky = sky
    this.sun = sun
    this.moon = moon
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    super.update(renderer, inputBuffer, deltaTime)
    const uniforms = this.uniforms

    // calculate the projected scale of the globe in clip space used to
    // interpolate between the globe true normals and idealized normals to avoid
    // lighting artifacts
    const cameraHeight = uniforms.get('cameraHeight')!
    const idealSphereAlphaUniform = uniforms.get('idealSphereAlpha')!
    vectorScratch
      .set(0, this.ellipsoid.maximumRadius, -cameraHeight.value)
      .applyMatrix4(this.camera.projectionMatrix)

    // calculate interpolation alpha
    // interpolation values are picked to match previous rough globe scales to
    // match the previous "camera height" approach for interpolation
    // See: https://github.com/takram-design-engineering/three-geospatial/pull/23
    let a = MathUtils.mapLinear(vectorScratch.y, 41.5, 13.8, 0, 1)
    a = MathUtils.clamp(a, 0, 1)
    idealSphereAlphaUniform.value = a
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

  get sky(): boolean {
    return this.defines.has('SKY')
  }

  set sky(value: boolean) {
    if (value !== this.sky) {
      if (value) {
        this.defines.set('SKY', '1')
      } else {
        this.defines.delete('SKY')
      }
      this.setChanged()
    }
  }

  get sun(): boolean {
    return this.defines.has('SUN')
  }

  set sun(value: boolean) {
    if (value !== this.sun) {
      if (value) {
        this.defines.set('SUN', '1')
      } else {
        this.defines.delete('SUN')
      }
      this.setChanged()
    }
  }

  get moon(): boolean {
    return this.defines.has('MOON')
  }

  set moon(value: boolean) {
    if (value !== this.moon) {
      if (value) {
        this.defines.set('MOON', '1')
      } else {
        this.defines.delete('MOON')
      }
      this.setChanged()
    }
  }

  get moonDirection(): Vector3 {
    return this.uniforms.get('moonDirection')!.value
  }

  get moonAngularRadius(): number {
    return this.uniforms.get('moonAngularRadius')!.value
  }

  set moonAngularRadius(value: number) {
    this.uniforms.get('moonAngularRadius')!.value = value
  }

  get lunarRadianceScale(): number {
    return this.uniforms.get('lunarRadianceScale')!.value
  }

  set lunarRadianceScale(value: number) {
    this.uniforms.get('lunarRadianceScale')!.value = value
  }
}
