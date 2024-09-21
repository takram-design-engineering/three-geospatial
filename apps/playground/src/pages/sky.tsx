import { ScreenQuad } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { type NextPage } from 'next'
import { useEffect, useRef, useState, type FC } from 'react'
import { Data3DTexture, DataTexture, FloatType, RGBAFormat } from 'three'
import invariant from 'tiny-invariant'

import atmosphereShaderSource from '../../public/atmosphere_shader.glsl'
import fragmentShaderSource from '../../public/fragment_shader.glsl'
import vertexShaderSource from '../../public/vertex_shader.glsl'
import { createDataTextureLoader } from '../components/createDataTextureLoader'

const TRANSMITTANCE_TEXTURE_WIDTH = 256
const TRANSMITTANCE_TEXTURE_HEIGHT = 64
const SCATTERING_TEXTURE_WIDTH = 256
const SCATTERING_TEXTURE_HEIGHT = 128
const SCATTERING_TEXTURE_DEPTH = 32
const IRRADIANCE_TEXTURE_WIDTH = 64
const IRRADIANCE_TEXTURE_HEIGHT = 16

const kSunAngularRadius = 0.00935 / 2
const kLengthUnitInMeters = 1000

function createShader(
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)
  invariant(shader != null)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

async function loadTextureData(textureName: string): Promise<Float32Array> {
  return await new Promise<Float32Array>(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', textureName)
    xhr.responseType = 'arraybuffer'
    xhr.onload = event => {
      const data = new DataView(xhr.response)
      const array = new Float32Array(
        data.byteLength / Float32Array.BYTES_PER_ELEMENT
      )
      for (let i = 0; i < array.length; ++i) {
        array[i] = data.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true)
      }
      resolve(array)
    }
    xhr.send()
  })
}

function createTexture(
  gl: WebGL2RenderingContext,
  textureUnit: GLenum,
  target: GLenum
): WebGLTexture {
  const texture = gl.createTexture()
  invariant(texture != null)
  gl.activeTexture(textureUnit)
  gl.bindTexture(target, texture)
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

function parseFloat32Array(buffer: ArrayBuffer): Float32Array {
  const data = new DataView(buffer)
  const array = new Float32Array(
    data.byteLength / Float32Array.BYTES_PER_ELEMENT
  )
  for (
    let index = 0, byteIndex = 0;
    index < array.length;
    ++index, byteIndex += Float32Array.BYTES_PER_ELEMENT
  ) {
    array[index] = data.getFloat32(byteIndex, true)
  }
  return array
}

const DataTextureLoader = createDataTextureLoader(
  () => new DataTexture(),
  buffer => ({
    data: parseFloat32Array(buffer),
    type: FloatType
  })
)

const Data3DTextureLoader = createDataTextureLoader(
  () => new Data3DTexture(),
  buffer => ({
    data: parseFloat32Array(buffer),
    type: FloatType
  })
)

const Scene: FC = () => {
  const irradianceTexture = useLoader(
    DataTextureLoader,
    '/irradiance.bin',
    undefined
  )
  const scatteringTexture = useLoader(Data3DTextureLoader, '/scattering.bin')
  const transmittanceTexture = useLoader(
    DataTextureLoader,
    '/transmittance.bin'
  )

  irradianceTexture.image.width = IRRADIANCE_TEXTURE_WIDTH
  irradianceTexture.image.height = IRRADIANCE_TEXTURE_HEIGHT

  scatteringTexture.image.width = SCATTERING_TEXTURE_WIDTH
  scatteringTexture.image.height = SCATTERING_TEXTURE_HEIGHT
  scatteringTexture.image.depth = SCATTERING_TEXTURE_DEPTH
  scatteringTexture.internalFormat = 'RGBA16F'
  scatteringTexture.format = RGBAFormat
  scatteringTexture.type = FloatType
  scatteringTexture.generateMipmaps = false

  transmittanceTexture.image.width = TRANSMITTANCE_TEXTURE_WIDTH
  transmittanceTexture.image.height = TRANSMITTANCE_TEXTURE_HEIGHT

  const stateRef = useRef({
    viewFromClip: new Float32Array(16),
    modelFromView: new Float32Array(16),
    viewDistanceMeters: 9000,
    viewZenithAngleRadians: 1.47,
    viewAzimuthAngleRadians: -0.1,
    sunZenithAngleRadians: 1.3,
    sunAzimuthAngleRadians: 2.9,
    exposure: 10
  })

  const renderer = useThree(({ gl }) => gl)

  useEffect(() => {
    const gl = renderer.getContext()
    invariant(gl instanceof WebGL2RenderingContext)
    ;(async () => {
      const data = await loadTextureData('transmittance.bin')
      createTexture(gl, gl.TEXTURE0, gl.TEXTURE_2D)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.getExtension('OES_texture_float_linear') != null
          ? gl.RGBA32F
          : gl.RGBA16F,
        TRANSMITTANCE_TEXTURE_WIDTH,
        TRANSMITTANCE_TEXTURE_HEIGHT,
        0,
        gl.RGBA,
        gl.FLOAT,
        data
      )
    })().catch(error => {
      console.error(error)
    })
    ;(async () => {
      const data = await loadTextureData('scattering.bin')
      createTexture(gl, gl.TEXTURE1, gl.TEXTURE_3D)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.RGBA16F,
        SCATTERING_TEXTURE_WIDTH,
        SCATTERING_TEXTURE_HEIGHT,
        SCATTERING_TEXTURE_DEPTH,
        0,
        gl.RGBA,
        gl.FLOAT,
        data
      )
    })().catch(error => {
      console.error(error)
    })
    ;(async () => {
      const data = await loadTextureData('irradiance.bin')
      createTexture(gl, gl.TEXTURE2, gl.TEXTURE_2D)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        IRRADIANCE_TEXTURE_WIDTH,
        IRRADIANCE_TEXTURE_HEIGHT,
        0,
        gl.RGBA,
        gl.FLOAT,
        data
      )
    })().catch(error => {
      console.error(error)
    })
  }, [renderer])

  const [program, setProgram] = useState<WebGLProgram>()

  useEffect(() => {
    const gl = renderer.getContext()
    invariant(gl instanceof WebGL2RenderingContext)

    const program = gl.createProgram()
    invariant(program != null)

    const vertexShader = createShader(
      gl,
      gl.VERTEX_SHADER,
      vertexShaderSource.replace('#version 330', '#version 300 es')
    )
    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      `${atmosphereShaderSource.replace(
        '#version 330',
        '#version 300 es\n' +
          'precision highp float;\n' +
          'precision highp sampler3D;'
      )}${fragmentShaderSource
        .replace('#version 330', '')
        .replace('const float PI = 3.14159265;', '')}`
    )
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    setProgram(program)
  }, [renderer])

  useFrame(({ gl: renderer, viewport }) => {
    const gl = renderer.getContext()
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    if (program == null) {
      return
    }

    const state = stateRef.current

    const kFovY = (50 / 180) * Math.PI
    const kTanFovY = Math.tan(kFovY / 2)
    state.viewFromClip.set([
      kTanFovY * viewport.aspect,
      0,
      0,
      0,
      0,
      kTanFovY,
      0,
      0,
      0,
      0,
      0,
      -1,
      0,
      0,
      1,
      1
    ])

    const cosZ = Math.cos(state.viewZenithAngleRadians)
    const sinZ = Math.sin(state.viewZenithAngleRadians)
    const cosA = Math.cos(state.viewAzimuthAngleRadians)
    const sinA = Math.sin(state.viewAzimuthAngleRadians)
    const viewDistance = state.viewDistanceMeters / kLengthUnitInMeters
    state.modelFromView.set([
      -sinA,
      -cosZ * cosA,
      sinZ * cosA,
      sinZ * cosA * viewDistance,
      cosA,
      -cosZ * sinA,
      sinZ * sinA,
      sinZ * sinA * viewDistance,
      0,
      sinZ,
      cosZ,
      cosZ * viewDistance,
      0,
      0,
      0,
      1
    ])

    gl.useProgram(program)
    gl.vertexAttribPointer(
      gl.getAttribLocation(program, 'vertex'),
      2, // numComponents
      gl.FLOAT, // type
      false, // normalize
      0, // stride
      0 // offset
    )
    gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vertex'))
    gl.uniformMatrix4fv(
      gl.getUniformLocation(program, 'view_from_clip'),
      true,
      state.viewFromClip
    )
    gl.uniformMatrix4fv(
      gl.getUniformLocation(program, 'model_from_view'),
      true,
      state.modelFromView
    )
    gl.uniform1i(gl.getUniformLocation(program, 'transmittance_texture'), 0)
    gl.uniform1i(gl.getUniformLocation(program, 'scattering_texture'), 1)
    // Unused texture sampler, but bind a 3D texture to it anyway, just in case.
    gl.uniform1i(
      gl.getUniformLocation(program, 'single_mie_scattering_texture'),
      1
    )
    gl.uniform1i(gl.getUniformLocation(program, 'irradiance_texture'), 2)
    gl.uniform3f(
      gl.getUniformLocation(program, 'camera'),
      state.modelFromView[3],
      state.modelFromView[7],
      state.modelFromView[11]
    )
    gl.uniform3f(gl.getUniformLocation(program, 'white_point'), 1, 1, 1)
    gl.uniform1f(gl.getUniformLocation(program, 'exposure'), state.exposure)
    gl.uniform3f(
      gl.getUniformLocation(program, 'earth_center'),
      0,
      0,
      -6360000 / kLengthUnitInMeters
    )
    gl.uniform3f(
      gl.getUniformLocation(program, 'sun_direction'),
      Math.cos(state.sunAzimuthAngleRadians) *
        Math.sin(state.sunZenithAngleRadians),
      Math.sin(state.sunAzimuthAngleRadians) *
        Math.sin(state.sunZenithAngleRadians),
      Math.cos(state.sunZenithAngleRadians)
    )
    gl.uniform2f(
      gl.getUniformLocation(program, 'sun_size'),
      Math.tan(kSunAngularRadius),
      Math.cos(kSunAngularRadius)
    )
  })

  useEffect(() => {
    const state = stateRef.current

    let drag: string | undefined
    let previousMouseX: number | undefined
    let previousMouseY: number | undefined

    const setView = (
      viewDistanceMeters: number,
      viewZenithAngleRadians: number,
      viewAzimuthAngleRadians: number,
      sunZenithAngleRadians: number,
      sunAzimuthAngleRadians: number,
      exposure: number
    ): void => {
      state.viewDistanceMeters = viewDistanceMeters
      state.viewZenithAngleRadians = viewZenithAngleRadians
      state.viewAzimuthAngleRadians = viewAzimuthAngleRadians
      state.sunZenithAngleRadians = sunZenithAngleRadians
      state.sunAzimuthAngleRadians = sunAzimuthAngleRadians
      state.exposure = exposure
    }

    const onKeyPress = (event: KeyboardEvent): void => {
      const key = event.key
      if (key === '+') {
        state.exposure *= 1.1
      } else if (key === '-') {
        state.exposure /= 1.1
      } else if (key === '1') {
        setView(9000, 1.47, 0, 1.3, 3, 10)
      } else if (key === '2') {
        setView(9000, 1.47, 0, 1.564, -3, 10)
      } else if (key === '3') {
        setView(7000, 1.57, 0, 1.54, -2.96, 10)
      } else if (key === '4') {
        setView(7000, 1.57, 0, 1.328, -3.044, 10)
      } else if (key === '5') {
        setView(9000, 1.39, 0, 1.2, 0.7, 10)
      } else if (key === '6') {
        setView(9000, 1.5, 0, 1.628, 1.05, 200)
      } else if (key === '7') {
        setView(7000, 1.43, 0, 1.57, 1.34, 40)
      } else if (key === '8') {
        setView(2.7e6, 0.81, 0, 1.57, 2, 10)
      } else if (key === '9') {
        setView(1.2e7, 0.0, 0, 0.93, -2, 10)
      }
    }

    const onMouseDown = (event: MouseEvent): void => {
      previousMouseX = event.offsetX
      previousMouseY = event.offsetY
      drag = event.altKey ? 'sun' : 'camera'
    }

    const onMouseMove = (event: MouseEvent): void => {
      if (previousMouseX == null || previousMouseY == null) {
        return
      }
      const kScale = 500
      const mouseX = event.offsetX
      const mouseY = event.offsetY
      if (drag === 'sun') {
        state.sunZenithAngleRadians -= (previousMouseY - mouseY) / kScale
        state.sunZenithAngleRadians = Math.max(
          0,
          Math.min(Math.PI, state.sunZenithAngleRadians)
        )
        state.sunAzimuthAngleRadians += (previousMouseX - mouseX) / kScale
      } else if (drag === 'camera') {
        state.viewZenithAngleRadians += (previousMouseY - mouseY) / kScale
        state.viewZenithAngleRadians = Math.max(
          0,
          Math.min(Math.PI / 2, state.viewZenithAngleRadians)
        )
        state.viewAzimuthAngleRadians += (previousMouseX - mouseX) / kScale
      }
      previousMouseX = mouseX
      previousMouseY = mouseY
    }

    const onMouseUp = (event: MouseEvent): void => {
      drag = undefined
    }

    const onMouseWheel = (event: WheelEvent): void => {
      state.viewDistanceMeters *= event.deltaY > 0 ? 1.05 : 1 / 1.05
    }

    window.addEventListener('keypress', onKeyPress)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('wheel', onMouseWheel)

    return () => {
      window.addEventListener('keypress', onKeyPress)
      window.addEventListener('mousedown', onMouseDown)
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      window.addEventListener('wheel', onMouseWheel)
    }
  }, [])

  return null
}

const Page: NextPage = () => {
  return (
    <Canvas>
      <ambientLight intensity={Math.PI / 2} />
      <spotLight
        position={[10, 10, 10]}
        angle={0.15}
        penumbra={1}
        decay={0}
        intensity={Math.PI}
      />
      <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
      <Scene />
      <ScreenQuad />
    </Canvas>
  )
}

export default Page
