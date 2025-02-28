import { ScreenQuad } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { button } from 'leva'
import { useEffect, useMemo, useState, type FC } from 'react'
import {
  ClampToEdgeWrapping,
  DataTexture,
  GLSL3,
  LinearFilter,
  NoColorSpace,
  ShaderMaterial,
  Uniform,
  Vector2
} from 'three'
import { EXRLoader } from 'three-stdlib'

import { useControls } from '../../helpers/useControls'
import { createEXRTexture, saveEXRTexture } from './saveEXRTexture'

export const DataTextureViewer: FC<{
  texture: DataTexture
  fileName: string
  zoom?: number
  valueScale?: number
}> = ({
  texture,
  fileName,
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

  const [exrTexture, setEXRTexture] = useState<DataTexture>()
  useEffect(() => {
    let canceled = false
    ;(async () => {
      const data = await createEXRTexture(texture)
      if (canceled) {
        return
      }
      const loader = new EXRLoader()
      const parsed = loader.parse(data)
      const exr = new DataTexture(parsed.data, parsed.width, parsed.height)
      exr.type = parsed.type
      exr.wrapS = ClampToEdgeWrapping
      exr.wrapT = ClampToEdgeWrapping
      exr.minFilter = LinearFilter
      exr.magFilter = LinearFilter
      exr.colorSpace = NoColorSpace
      exr.needsUpdate = true
      setEXRTexture(exr)
    })().catch(error => {
      console.error(error)
    })
    return () => {
      canceled = true
    }
  }, [texture])

  const { gammaCorrect, zoom, valueScaleLog10, previewEXR } = useControls({
    gammaCorrect: true,
    zoom: { value: defaultZoom, min: 0.5, max: 10 },
    valueScaleLog10: { value: Math.log10(defaultValueScale), min: -5, max: 5 },
    previewEXR: false,
    export: button(() => {
      saveEXRTexture(texture, fileName).catch(error => {
        console.error(error)
      })
    })
  })

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
