import {
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Group,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type ShaderMaterialParameters,
  type Texture,
  type WebGLRenderer
} from 'three'

import { Cartographic, Ellipsoid } from '@geovanni/core'

import { ATMOSPHERE_PARAMETERS, METER_TO_UNIT_LENGTH } from './constants'

import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'
import fragmentShader from './shaders/stars.frag'
import vertexShader from './shaders/stars.vert'
import vertexCommon from './shaders/vertexCommon.glsl'

const cartographicScratch = new Cartographic()

export interface StarsMaterialParameters
  extends Partial<ShaderMaterialParameters> {
  irradianceTexture?: Texture | null
  scatteringTexture?: Texture | null
  transmittanceTexture?: Texture | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  sunDirection?: Vector3
  pointSize?: number
  radianceScale?: number
  background?: boolean
}

export const starsMaterialParametersDefaults = {
  ellipsoid: Ellipsoid.WGS84,
  pointSize: 1,
  radianceScale: 1,
  background: true
} satisfies StarsMaterialParameters

export class StarsMaterial extends RawShaderMaterial {
  pointSize: number

  constructor(params?: StarsMaterialParameters) {
    const {
      irradianceTexture,
      scatteringTexture,
      transmittanceTexture,
      useHalfFloat,
      ellipsoid,
      sunDirection,
      pointSize,
      radianceScale,
      background,
      ...others
    } = { ...starsMaterialParametersDefaults, ...params }

    super({
      vertexShader: /* glsl */ `
        precision highp float;
        precision highp sampler3D;
        ${parameters}
        ${vertexCommon}
        ${vertexShader}
      `,
      ...others,
      glslVersion: '300 es',
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp sampler3D;
        ${parameters}
        ${functions}
        ${fragmentShader}
      `,
      // prettier-ignore
      uniforms: {
        u_solar_irradiance: new Uniform(ATMOSPHERE_PARAMETERS.solarIrradiance),
        u_sun_angular_radius: new Uniform(ATMOSPHERE_PARAMETERS.sunAngularRadius),
        u_bottom_radius: new Uniform(ATMOSPHERE_PARAMETERS.bottomRadius),
        u_top_radius: new Uniform(ATMOSPHERE_PARAMETERS.topRadius),
        u_rayleigh_scattering: new Uniform(ATMOSPHERE_PARAMETERS.rayleighScattering),
        u_mie_scattering: new Uniform(ATMOSPHERE_PARAMETERS.mieScattering),
        u_mie_phase_function_g: new Uniform(ATMOSPHERE_PARAMETERS.miePhaseFunctionG),
        u_mu_s_min: new Uniform(0),
        u_irradiance_texture: new Uniform(irradianceTexture),
        u_scattering_texture: new Uniform(scatteringTexture),
        u_single_mie_scattering_texture: new Uniform(scatteringTexture),
        u_transmittance_texture: new Uniform(transmittanceTexture),
        projectionMatrix: new Uniform(new Matrix4()),
        modelViewMatrix: new Uniform(new Matrix4()),
        cameraPosition: new Uniform(new Vector3()),
        cameraHeight: new Uniform(0),
        cameraFar: new Uniform(0),
        ellipsoidRadii: new Uniform(new Vector3().copy(ellipsoid.radii)),
        ellipsoidSurface: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),
        pointSize: new Uniform(0),
        magnitudeRange: new Uniform(new Vector2(-2, 8)),
        radianceScale: new Uniform(radianceScale),
      },
      defines: {
        METER_TO_UNIT_LENGTH: `float(${METER_TO_UNIT_LENGTH})`
      },
      toneMapped: false,
      depthWrite: false,
      depthTest: false
    })
    this.useHalfFloat = useHalfFloat === true
    this.pointSize = pointSize
    this.background = background
  }

  override onBeforeRender(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    object: Object3D,
    group: Group
  ): void {
    const uniforms = this.uniforms
    uniforms.projectionMatrix.value.copy(camera.projectionMatrix)
    uniforms.modelViewMatrix.value.copy(camera.modelViewMatrix)
    const position = camera.getWorldPosition(uniforms.cameraPosition.value)
    const cartographic = cartographicScratch.setFromVector(position)
    uniforms.cameraHeight.value = cartographic.height
    uniforms.cameraFar.value = (camera as PerspectiveCamera).far
    cartographic.setHeight(0).toVector(uniforms.ellipsoidSurface.value)
    uniforms.pointSize.value = this.pointSize * renderer.getPixelRatio()
  }

  get irradianceTexture(): Texture | null {
    return this.uniforms.u_irradiance_texture.value
  }

  set irradianceTexture(value: Texture | null) {
    this.uniforms.u_irradiance_texture.value = value
  }

  get scatteringTexture(): Texture | null {
    return this.uniforms.u_scattering_texture.value
  }

  set scatteringTexture(value: Texture | null) {
    this.uniforms.u_scattering_texture.value = value
    this.uniforms.u_single_mie_scattering_texture.value = value
  }

  get transmittanceTexture(): Texture | null {
    return this.uniforms.u_transmittance_texture.value
  }

  set transmittanceTexture(value: Texture | null) {
    this.uniforms.u_transmittance_texture.value = value
  }

  get useHalfFloat(): boolean {
    return (
      this.uniforms.u_mu_s_min.value === ATMOSPHERE_PARAMETERS.muSMinHalfFloat
    )
  }

  set useHalfFloat(value: boolean) {
    this.uniforms.u_mu_s_min.value = value
      ? ATMOSPHERE_PARAMETERS.muSMinHalfFloat
      : ATMOSPHERE_PARAMETERS.muSMinFloat
  }

  get sunDirection(): Vector3 {
    return this.uniforms.sunDirection.value
  }

  set sunDirection(value: Vector3) {
    this.uniforms.sunDirection.value.copy(value)
  }

  get magnitudeRange(): Vector2 {
    return this.uniforms.magnitudeScale.value
  }

  set magnitudeRange(value: Vector2) {
    this.uniforms.magnitudeScale.value.set(value)
  }

  get radianceScale(): number {
    return this.uniforms.radianceScale.value
  }

  set radianceScale(value: number) {
    this.uniforms.radianceScale.value = value
  }

  get background(): boolean {
    return this.defines.BACKGROUND != null
  }

  set background(value: boolean) {
    if (value !== this.background) {
      if (value) {
        this.defines.BACKGROUND = '1'
      } else {
        delete this.defines.BACKGROUND
      }
      this.needsUpdate = true
    }
  }
}
