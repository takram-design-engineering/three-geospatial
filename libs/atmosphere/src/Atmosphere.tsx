/// <reference types="vite-plugin-glsl/ext" />

import { ScreenQuad } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type FC } from 'react'
import { Matrix4, Vector2, Vector3 } from 'three'

import { useConstant } from '@geovanni/core'

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  LENGTH_UNIT_IN_METERS,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  SUN_ANGULAR_RADIUS,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'
import { usePrecomputedData } from './usePrecomputedData'

import atmosphereShader from './shader/atmosphereShader.glsl'
import fragmentShader from './shader/fragmentShader.glsl'
import vertexShader from './shader/vertexShader.glsl'

export interface AtmosphereProps {
  exposure?: number
  sunDirection?: Vector3
  sunSize?: Vector2
}

export const Atmosphere: FC<AtmosphereProps> = ({
  exposure,
  sunDirection,
  sunSize
}: AtmosphereProps) => {
  const irradianceTexture = usePrecomputedData('/irradiance.bin', {
    width: IRRADIANCE_TEXTURE_WIDTH,
    height: IRRADIANCE_TEXTURE_HEIGHT
  })
  const scatteringTexture = usePrecomputedData('/scattering.bin', {
    width: SCATTERING_TEXTURE_WIDTH,
    height: SCATTERING_TEXTURE_HEIGHT,
    depth: SCATTERING_TEXTURE_DEPTH
  })
  const transmittanceTexture = usePrecomputedData('/transmittance.bin', {
    width: TRANSMITTANCE_TEXTURE_WIDTH,
    height: TRANSMITTANCE_TEXTURE_HEIGHT
  })

  const uniforms = useConstant(() => ({
    projection_matrix_inverse: {
      value: new Matrix4()
    },
    view_matrix_inverse: {
      value: new Matrix4()
    },
    camera: {
      value: new Vector3()
    },
    transmittance_texture: {
      value: transmittanceTexture
    },
    scattering_texture: {
      value: scatteringTexture
    },
    single_mie_scattering_texture: {
      value: scatteringTexture
    },
    irradiance_texture: {
      value: irradianceTexture
    },
    exposure: {
      value: 0
    },
    earth_center: {
      value: new Vector3()
    },
    sun_direction: {
      value: new Vector3()
    },
    sun_size: {
      value: new Vector2()
    }
  }))

  const stateRef = useRef({
    viewDistanceMeters: 9000,
    viewZenithAngleRadians: 1.47,
    viewAzimuthAngleRadians: -0.1,
    sunZenithAngleRadians: 1.3,
    sunAzimuthAngleRadians: 2.9,
    exposure: 10
  })

  useFrame(() => {
    const state = stateRef.current
    state.viewZenithAngleRadians = 0.47
    state.viewAzimuthAngleRadians = -1.1
    state.sunZenithAngleRadians = 1.6
    state.sunAzimuthAngleRadians = 0.9

    uniforms.exposure.value = state.exposure
    uniforms.sun_direction.value.set(
      Math.cos(state.sunAzimuthAngleRadians) *
        Math.sin(state.sunZenithAngleRadians),
      Math.sin(state.sunAzimuthAngleRadians) *
        Math.sin(state.sunZenithAngleRadians),
      Math.cos(state.sunZenithAngleRadians)
    )
    uniforms.sun_size.value.set(
      Math.tan(SUN_ANGULAR_RADIUS),
      Math.cos(SUN_ANGULAR_RADIUS)
    )
  })

  return (
    <ScreenQuad renderOrder={-1}>
      <rawShaderMaterial
        args={[
          {
            glslVersion: '300 es',
            fragmentShader: `${atmosphereShader}${fragmentShader}`,
            vertexShader,
            uniforms,
            depthWrite: false,
            depthTest: false
          }
        ]}
        onBeforeRender={(renderer, scene, camera) => {
          const scale = 1 / LENGTH_UNIT_IN_METERS
          uniforms.view_matrix_inverse.value.copy(camera.matrixWorld)
          uniforms.view_matrix_inverse.value.elements[12] *= scale
          uniforms.view_matrix_inverse.value.elements[13] *= scale
          uniforms.view_matrix_inverse.value.elements[14] *= scale
          uniforms.projection_matrix_inverse.value.copy(
            camera.projectionMatrixInverse
          )
          uniforms.camera.value.copy(camera.position).multiplyScalar(scale)
        }}
      />
    </ScreenQuad>
  )
}
