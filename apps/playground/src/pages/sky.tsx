import { type NextPage } from 'next'
import { useEffect } from 'react'

/**
 * Copyright (c) 2018 Eric Bruneton
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

/*<h2>atmosphere/demo/webgl/demo.js</h2>

<p>This file is a Javascript transcription of the original
<a href="../demo.cc.html">C++</a> code of the demo, where the code related to
the atmosphere model initialisation is replaced with code to load precomputed
textures and shaders from the network (those are precomputed with
<a href="precompute.cc.html">precompute.cc</a>).

<p>The following constants must have the same values as in
<a href="../../constants.h.html">constants.h</a> and
<a href="../demo.cc.html">demo.cc</a>:
*/

const TRANSMITTANCE_TEXTURE_WIDTH = 256
const TRANSMITTANCE_TEXTURE_HEIGHT = 64
const SCATTERING_TEXTURE_WIDTH = 256
const SCATTERING_TEXTURE_HEIGHT = 128
const SCATTERING_TEXTURE_DEPTH = 32
const IRRADIANCE_TEXTURE_WIDTH = 64
const IRRADIANCE_TEXTURE_HEIGHT = 16

const kSunAngularRadius = 0.00935 / 2
const kSunSolidAngle = Math.PI * kSunAngularRadius * kSunAngularRadius
const kLengthUnitInMeters = 1000

/*
<p>As in the C++ version, the code consists in a single class. Its constructor
initializes the WebGL canvas, declares the fields of the class, sets up the
event handlers and starts the resource loading and the render loop:
*/

class Demo {
  constructor(rootElement) {
    this.canvas = rootElement.querySelector('#glcanvas')
    this.canvas.style.width = `${rootElement.clientWidth}px`
    this.canvas.style.height = `${rootElement.clientHeight}px`
    this.canvas.width = rootElement.clientWidth * window.devicePixelRatio
    this.canvas.height = rootElement.clientHeight * window.devicePixelRatio
    this.help = rootElement.querySelector('#help')
    this.gl = this.canvas.getContext('webgl2')

    this.vertexBuffer = null
    this.transmittanceTexture = null
    this.scatteringTexture = null
    this.irradianceTexture = null
    this.vertexShaderSource = null
    this.fragmentShaderSource = null
    this.atmosphereShaderSource = null
    this.program = null

    this.viewFromClip = new Float32Array(16)
    this.modelFromView = new Float32Array(16)
    this.viewDistanceMeters = 9000
    this.viewZenithAngleRadians = 1.47
    this.viewAzimuthAngleRadians = -0.1
    this.sunZenithAngleRadians = 1.3
    this.sunAzimuthAngleRadians = 2.9
    this.exposure = 10

    this.drag = undefined
    this.previousMouseX = undefined
    this.previousMouseY = undefined

    rootElement.addEventListener('keypress', e => this.onKeyPress(e))
    rootElement.addEventListener('mousedown', e => this.onMouseDown(e))
    rootElement.addEventListener('mousemove', e => this.onMouseMove(e))
    rootElement.addEventListener('mouseup', e => this.onMouseUp(e))
    rootElement.addEventListener('wheel', e => this.onMouseWheel(e))

    this.init()
    requestAnimationFrame(() => this.onRender())
  }

  /*
<p>The init method creates a vertex buffer for a full screen quad, and loads the
precomputed textures and the shaders for the demo (using utility methods defined
in the <code>Utils</code> class below):
*/

  init() {
    const gl = this.gl
    this.vertexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, +1, -1, -1, +1, +1, +1]),
      gl.STATIC_DRAW
    )

    Utils.loadTextureData('transmittance.bin', data => {
      this.transmittanceTexture = Utils.createTexture(
        gl,
        gl.TEXTURE0,
        gl.TEXTURE_2D
      )
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.getExtension('OES_texture_float_linear') ? gl.RGBA32F : gl.RGBA16F,
        TRANSMITTANCE_TEXTURE_WIDTH,
        TRANSMITTANCE_TEXTURE_HEIGHT,
        0,
        gl.RGBA,
        gl.FLOAT,
        data
      )
    })
    Utils.loadTextureData('scattering.bin', data => {
      this.scatteringTexture = Utils.createTexture(
        gl,
        gl.TEXTURE1,
        gl.TEXTURE_3D
      )
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
    })
    Utils.loadTextureData('irradiance.bin', data => {
      this.irradianceTexture = Utils.createTexture(
        gl,
        gl.TEXTURE2,
        gl.TEXTURE_2D
      )
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
    })

    Utils.loadShaderSource('vertex_shader.glsl', source => {
      this.vertexShaderSource = source
    })
    Utils.loadShaderSource('fragment_shader.glsl', source => {
      this.fragmentShaderSource = source
    })
    Utils.loadShaderSource('atmosphere_shader.glsl', source => {
      this.atmosphereShaderSource = source
    })
  }

  /*
<p>The WebGL program cannot be created before all the shaders are loaded. This
is done in the following method, which is called at each frame (the precomputed
shaders are OpenGL 3.3 shaders, so they must be adapted for WebGL2. In
particular, the version id must be changed, and the fragment shaders must be
concatenated because WebGL2 does not support multiple shaders of the same type):
*/

  maybeInitProgram() {
    if (
      this.program ||
      !this.vertexShaderSource ||
      !this.fragmentShaderSource ||
      !this.atmosphereShaderSource
    ) {
      return
    }
    const gl = this.gl
    const vertexShader = Utils.createShader(
      gl,
      gl.VERTEX_SHADER,
      this.vertexShaderSource.replace('#version 330', '#version 300 es')
    )
    const fragmentShader = Utils.createShader(
      gl,
      gl.FRAGMENT_SHADER,
      this.atmosphereShaderSource.replace(
        '#version 330',
        '#version 300 es\n' +
          'precision highp float;\n' +
          'precision highp sampler3D;'
      ) +
        this.fragmentShaderSource
          .replace('#version 330', '')
          .replace('const float PI = 3.14159265;', '')
    )
    this.program = gl.createProgram()
    gl.attachShader(this.program, vertexShader)
    gl.attachShader(this.program, fragmentShader)
    gl.linkProgram(this.program)
  }

  /*
<p>The render loop body sets the program attributes and uniforms, and renders
a full screen quad with it:
*/

  onRender() {
    const gl = this.gl
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    this.maybeInitProgram()
    if (!this.program) {
      requestAnimationFrame(() => this.onRender())
      return
    }

    const kFovY = (50 / 180) * Math.PI
    const kTanFovY = Math.tan(kFovY / 2)
    const aspectRatio = this.canvas.width / this.canvas.height
    this.viewFromClip.set([
      kTanFovY * aspectRatio,
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

    const cosZ = Math.cos(this.viewZenithAngleRadians)
    const sinZ = Math.sin(this.viewZenithAngleRadians)
    const cosA = Math.cos(this.viewAzimuthAngleRadians)
    const sinA = Math.sin(this.viewAzimuthAngleRadians)
    const viewDistance = this.viewDistanceMeters / kLengthUnitInMeters
    this.modelFromView.set([
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

    const program = this.program
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.vertexAttribPointer(
      gl.getAttribLocation(program, 'vertex'),
      /*numComponents=*/ 2,
      /*type=*/ this.gl.FLOAT,
      /*normalize=*/ false,
      /*stride=*/ 0,
      /*offset=*/ 0
    )
    gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vertex'))
    gl.uniformMatrix4fv(
      gl.getUniformLocation(program, 'view_from_clip'),
      true,
      this.viewFromClip
    )
    gl.uniformMatrix4fv(
      gl.getUniformLocation(program, 'model_from_view'),
      true,
      this.modelFromView
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
      this.modelFromView[3],
      this.modelFromView[7],
      this.modelFromView[11]
    )
    gl.uniform3f(gl.getUniformLocation(program, 'white_point'), 1, 1, 1)
    gl.uniform1f(gl.getUniformLocation(program, 'exposure'), this.exposure)
    gl.uniform3f(
      gl.getUniformLocation(program, 'earth_center'),
      0,
      0,
      -6360000 / kLengthUnitInMeters
    )
    gl.uniform3f(
      gl.getUniformLocation(program, 'sun_direction'),
      Math.cos(this.sunAzimuthAngleRadians) *
        Math.sin(this.sunZenithAngleRadians),
      Math.sin(this.sunAzimuthAngleRadians) *
        Math.sin(this.sunZenithAngleRadians),
      Math.cos(this.sunZenithAngleRadians)
    )
    gl.uniform2f(
      gl.getUniformLocation(program, 'sun_size'),
      Math.tan(kSunAngularRadius),
      Math.cos(kSunAngularRadius)
    )
    gl.drawArrays(gl.TRIANGLE_STRIP, /*offset=*/ 0, /*vertexCount=*/ 4)
    requestAnimationFrame(() => this.onRender())
  }

  /*
<p>The last part of the Demo class are the event handler methods, which are
directly adapted from the C++ code:
*/

  onKeyPress(event) {
    const key = event.key
    if (key == 'h') {
      const hidden = this.help.style.display == 'none'
      this.help.style.display = hidden ? 'block' : 'none'
    } else if (key == '+') {
      this.exposure *= 1.1
    } else if (key == '-') {
      this.exposure /= 1.1
    } else if (key == '1') {
      this.setView(9000, 1.47, 0, 1.3, 3, 10)
    } else if (key == '2') {
      this.setView(9000, 1.47, 0, 1.564, -3, 10)
    } else if (key == '3') {
      this.setView(7000, 1.57, 0, 1.54, -2.96, 10)
    } else if (key == '4') {
      this.setView(7000, 1.57, 0, 1.328, -3.044, 10)
    } else if (key == '5') {
      this.setView(9000, 1.39, 0, 1.2, 0.7, 10)
    } else if (key == '6') {
      this.setView(9000, 1.5, 0, 1.628, 1.05, 200)
    } else if (key == '7') {
      this.setView(7000, 1.43, 0, 1.57, 1.34, 40)
    } else if (key == '8') {
      this.setView(2.7e6, 0.81, 0, 1.57, 2, 10)
    } else if (key == '9') {
      this.setView(1.2e7, 0.0, 0, 0.93, -2, 10)
    }
  }

  setView(
    viewDistanceMeters,
    viewZenithAngleRadians,
    viewAzimuthAngleRadians,
    sunZenithAngleRadians,
    sunAzimuthAngleRadians,
    exposure
  ) {
    this.viewDistanceMeters = viewDistanceMeters
    this.viewZenithAngleRadians = viewZenithAngleRadians
    this.viewAzimuthAngleRadians = viewAzimuthAngleRadians
    this.sunZenithAngleRadians = sunZenithAngleRadians
    this.sunAzimuthAngleRadians = sunAzimuthAngleRadians
    this.exposure = exposure
  }

  onMouseDown(event) {
    this.previousMouseX = event.offsetX
    this.previousMouseY = event.offsetY
    this.drag = event.altKey ? 'sun' : 'camera'
  }

  onMouseMove(event) {
    const kScale = 500
    const mouseX = event.offsetX
    const mouseY = event.offsetY
    if (this.drag == 'sun') {
      this.sunZenithAngleRadians -= (this.previousMouseY - mouseY) / kScale
      this.sunZenithAngleRadians = Math.max(
        0,
        Math.min(Math.PI, this.sunZenithAngleRadians)
      )
      this.sunAzimuthAngleRadians += (this.previousMouseX - mouseX) / kScale
    } else if (this.drag == 'camera') {
      this.viewZenithAngleRadians += (this.previousMouseY - mouseY) / kScale
      this.viewZenithAngleRadians = Math.max(
        0,
        Math.min(Math.PI / 2, this.viewZenithAngleRadians)
      )
      this.viewAzimuthAngleRadians += (this.previousMouseX - mouseX) / kScale
    }
    this.previousMouseX = mouseX
    this.previousMouseY = mouseY
  }

  onMouseUp(event) {
    this.drag = undefined
  }

  onMouseWheel(event) {
    this.viewDistanceMeters *= event.deltaY > 0 ? 1.05 : 1 / 1.05
  }
}

/*
<p>The <code>Utils</code> class used above provides 4 methods, to load shader
and texture data using XML http requests, and to create WebGL shader and
texture objects from them:
*/

class Utils {
  static loadShaderSource(shaderName, callback) {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', shaderName)
    xhr.responseType = 'text'
    xhr.onload = event => callback(xhr.responseText.trim())
    xhr.send()
  }

  static createShader(gl, type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return shader
  }

  static loadTextureData(textureName, callback) {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', textureName)
    xhr.responseType = 'arraybuffer'
    xhr.onload = event => {
      const data = new DataView(xhr.response)
      const array = new Float32Array(
        data.byteLength / Float32Array.BYTES_PER_ELEMENT
      )
      for (var i = 0; i < array.length; ++i) {
        array[i] = data.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true)
      }
      callback(array)
    }
    xhr.send()
  }

  static createTexture(gl, textureUnit, target) {
    const texture = gl.createTexture()
    gl.activeTexture(textureUnit)
    gl.bindTexture(target, texture)
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return texture
  }
}

const Page: NextPage = () => {
  useEffect(() => {
    new Demo(document.body)
  }, [])
  return <canvas id='glcanvas' />
}

export default Page
