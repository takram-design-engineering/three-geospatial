import { ScreenQuad } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { button } from 'leva'
import { useEffect, useMemo, type FC } from 'react'
import {
  DataTexture,
  GLSL3,
  LinearFilter,
  NoColorSpace,
  ShaderMaterial,
  Uniform,
  Vector2,
  type Texture
} from 'three'
import { EXRLoader } from 'three-stdlib'

import type { AnyFloatType } from '@takram/three-geospatial'

import { useControls } from '../../helpers/useControls'
import { saveBinaryTexture } from './saveBinaryTexture'
import { createEXRTexture, saveEXRTexture } from './saveEXRTexture'

export const DataTextureViewer: FC<{
  texture: Texture
  name: string
  type?: AnyFloatType
  zoom?: number
  valueScale?: number
}> = ({
  texture,
  name,
  type,
  zoom: defaultZoom = 1,
  valueScale: defaultValueScale = 1
}) => {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          resolution: new Uniform(new Vector2()),
          size: new Uniform(
            new Vector2(texture.image.width, texture.image.height)
          ),
          zoom: new Uniform(0),
          inputTexture: new Uniform(texture),
          gammaCorrect: new Uniform(false),
          valueScale: new Uniform(0)
        }
      }),
    [texture]
  )

  const renderer = useThree(({ gl }) => gl)

  const { gammaCorrect, zoom, valueScaleLog10, previewEXR } = useControls({
    gammaCorrect: true,
    zoom: { value: defaultZoom, min: 0.5, max: 10 },
    valueScaleLog10: { value: Math.log10(defaultValueScale), min: -5, max: 5 },
    previewEXR: false,
    saveEXR: button(() => {
      saveEXRTexture(renderer, texture, `${name}.exr`, type).catch(
        (error: unknown) => {
          console.error(error)
        }
      )
    }),
    saveBinary: button(() => {
      saveBinaryTexture(renderer, texture, `${name}.bin`).catch(
        (error: unknown) => {
          console.error(error)
        }
      )
    })
  })

  const exrTexture = useMemo(() => new DataTexture(), [])
  useEffect(() => {
    let canceled = false
    ;(async () => {
      const data = await createEXRTexture(renderer, texture, type)
      if (canceled) {
        return
      }
      const loader = new EXRLoader()
      const parsed = loader.parse(data)
      exrTexture.image = {
        data: parsed.data,
        width: parsed.width,
        height: parsed.height
      }
      exrTexture.type = parsed.type
      exrTexture.minFilter = LinearFilter
      exrTexture.magFilter = LinearFilter
      exrTexture.colorSpace = NoColorSpace
      exrTexture.needsUpdate = true
    })().catch((error: unknown) => {
      console.error(error)
    })
    return () => {
      canceled = true
    }
  }, [texture, type, renderer, previewEXR, exrTexture])

  useFrame(({ size }) => {
    material.uniforms.inputTexture.value = previewEXR ? exrTexture : texture
    material.uniforms.resolution.value.set(size.width, size.height)
    material.uniforms.zoom.value = zoom
    material.uniforms.gammaCorrect.value = gammaCorrect
    material.uniforms.valueScale.value = 10 ** valueScaleLog10
  })

  return <ScreenQuad material={material} />
}

const vertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler2D;

  in vec2 vUv;

  out vec4 outputColor;

  uniform vec2 resolution;
  uniform vec2 size;
  uniform float zoom;
  uniform sampler2D inputTexture;
  uniform bool gammaCorrect;
  uniform float valueScale;

  void main() {
    vec2 scale = resolution / size / zoom;
    vec2 uv = vUv * scale + (1.0 - scale) * 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      discard;
    }

    vec4 color = vec4(texture(inputTexture, uv).rgb * valueScale, 1.0);
    outputColor = gammaCorrect ? linearToOutputTexel(color) : color;
  }
`
