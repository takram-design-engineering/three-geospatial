/// <reference types="vite-plugin-glsl/ext" />

import { ScreenQuad } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type FC } from 'react'
import { Matrix4, Vector2, Vector3 } from 'three'

import { useConstant } from '@geovanni/core'

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  METER_TO_LENGTH_UNIT,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'
import { usePrecomputedData } from './usePrecomputedData'

import atmosphereShader from './shader/atmosphereShader.glsl'
import fragmentShader from './shader/fragmentShader.glsl'
import vertexShader from './shader/vertexShader.glsl'

export interface AtmosphereProps {
  sunDirection?: Vector3
  sunAngularRadius?: number
  exposure?: number
}

export const Atmosphere: FC<AtmosphereProps> = ({
  sunDirection,
  sunAngularRadius = 0.00465, // 16 minutes of arc
  exposure = 10
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
    projectionMatrixInverse: {
      value: new Matrix4()
    },
    viewMatrixInverse: {
      value: new Matrix4()
    },
    cameraPosition: {
      value: new Vector3()
    },
    sunDirection: {
      value: sunDirection?.clone() ?? new Vector3()
    },
    sunSize: {
      value: new Vector2(Math.tan(sunAngularRadius), Math.cos(sunAngularRadius))
    },
    exposure: {
      value: exposure
    }
  }))

  useFrame(() => {
    if (sunDirection != null) {
      uniforms.sunDirection.value.copy(sunDirection)
    }
    uniforms.sunSize.value.set(
      Math.tan(sunAngularRadius),
      Math.cos(sunAngularRadius)
    )
    uniforms.exposure.value = exposure
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
          uniforms.viewMatrixInverse.value.copy(camera.matrixWorld)
          uniforms.viewMatrixInverse.value.elements[12] *= METER_TO_LENGTH_UNIT
          uniforms.viewMatrixInverse.value.elements[13] *= METER_TO_LENGTH_UNIT
          uniforms.viewMatrixInverse.value.elements[14] *= METER_TO_LENGTH_UNIT
          uniforms.projectionMatrixInverse.value.copy(
            camera.projectionMatrixInverse
          )
          uniforms.cameraPosition.value
            .copy(camera.position)
            .multiplyScalar(METER_TO_LENGTH_UNIT)
        }}
      />
    </ScreenQuad>
  )
}
