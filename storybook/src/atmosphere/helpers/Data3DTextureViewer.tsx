import { ScreenQuad } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { button } from 'leva'
import { useEffect, useMemo, useState, type FC } from 'react'
import {
  Data3DTexture,
  GLSL3,
  LinearFilter,
  NoColorSpace,
  ShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  type FloatType,
  type HalfFloatType
} from 'three'
import { EXRLoader } from 'three-stdlib'

import { useControls } from '../../helpers/useControls'
import { createEXR3DTexture, saveEXR3DTexture } from './saveEXR3DTexture'

export const Data3DTextureViewer: FC<{
  texture: Data3DTexture
  fileName: string
  type?: typeof FloatType | typeof HalfFloatType
  zoom?: number
  valueScale?: number
}> = ({
  texture,
  fileName,
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
            new Vector3(
              texture.image.width,
              texture.image.height,
              texture.image.depth
            )
          ),
          zoom: new Uniform(0),
          columns: new Uniform(0),
          inputTexture: new Uniform(texture),
          gammaCorrect: new Uniform(false),
          valueScale: new Uniform(0)
        }
      }),
    [texture]
  )

  const [exrTexture, setEXRTexture] = useState<Data3DTexture>()
  useEffect(() => {
    let canceled = false
    ;(async () => {
      const data = await createEXR3DTexture(texture, type)
      if (canceled) {
        return
      }
      const loader = new EXRLoader()
      const parsed = loader.parse(data)
      const exr = new Data3DTexture(
        parsed.data,
        parsed.width,
        parsed.height / texture.image.depth,
        texture.image.depth
      )
      exr.type = parsed.type
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
  }, [texture, type])

  const { gammaCorrect, zoom, valueScaleLog10, previewEXR } = useControls({
    gammaCorrect: true,
    zoom: { value: defaultZoom, min: 0.5, max: 10 },
    valueScaleLog10: { value: Math.log10(defaultValueScale), min: -5, max: 5 },
    previewEXR: false,
    export: button(() => {
      saveEXR3DTexture(texture, fileName, type).catch(error => {
        console.error(error)
      })
    })
  })

  useFrame(({ size }) => {
    material.uniforms.inputTexture.value = previewEXR ? exrTexture : texture
    material.uniforms.resolution.value.set(size.width, size.height)
    material.uniforms.zoom.value = zoom
    material.uniforms.columns.value = Math.floor(
      size.width / texture.image.width
    )
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
  precision highp sampler3D;

  in vec2 vUv;

  out vec4 outputColor;

  uniform vec2 resolution;
  uniform vec3 size;
  uniform float zoom;
  uniform int columns;
  uniform sampler3D inputTexture;
  uniform bool gammaCorrect;
  uniform float valueScale;

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y) * resolution / size.xy / zoom;
    ivec2 xy = ivec2(uv);
    if (xy.x >= columns) {
      discard;
    }
    int index = xy.y * columns + xy.x % columns;
    if (index >= int(size.z)) {
      discard;
    }
    vec3 uvw = vec3(fract(uv), (float(index) + 0.5) / size.z);
    vec4 color = vec4(texture(inputTexture, uvw).rgb * valueScale, 1.0);
    outputColor = gammaCorrect ? linearToOutputTexel(color) : color;
  }
`
