import {
  InstancedBufferAttribute,
  Sprite,
  Vector2,
  type BufferAttribute,
  type Object3D
} from 'three'
import {
  instancedBufferAttribute,
  log,
  mix,
  pow,
  screenSize,
  uniform,
  vec4
} from 'three/tsl'
import { PointsNodeMaterial, type NodeBuilder } from 'three/webgpu'

import { ArrayBufferLoader } from '@takram/three-geospatial'
import {
  cameraFar,
  FnLayout,
  FnVar,
  projectionMatrix,
  type Node
} from '@takram/three-geospatial/webgpu'

import { DEFAULT_STARS_DATA_URL } from '../constants'
import { getAtmosphereContext } from './AtmosphereContext'

const log10 = FnLayout({
  name: 'log10',
  type: 'float',
  inputs: [{ name: 'x', type: 'float' }]
})(([x]) => log(x).mul(1 / Math.log(10)))

// See: https://en.wikipedia.org/wiki/Surface_brightness
const magnitudeToLuminance = /*#__PURE__*/ FnVar(
  (magnitude: Node<'float'>, solidAngle: Node<'float'>): Node<'float'> => {
    const steradiansToSquareArcSecs = 4.25e10
    const surfaceBrightness = magnitude
      .add(log10(solidAngle.mul(steradiansToSquareArcSecs)).mul(2.5))
      .toConst()
    return pow(10, surfaceBrightness.mul(-0.4)).mul(10.8e4)
  }
)

class StarsNodeMaterial extends PointsNodeMaterial {
  pointSize = uniform(1)
  intensity = uniform(1000)
  magnitudeRange = uniform(new Vector2(-2, 8))

  positionBuffer!: BufferAttribute
  magnitudeBuffer!: BufferAttribute
  colorBuffer!: BufferAttribute

  constructor() {
    super()
    this.depthTest = true
    this.depthWrite = false
    this.sizeAttenuation = false
  }

  override setup(builder: NodeBuilder): void {
    const atmosphereContext = getAtmosphereContext(builder)
    const camera = atmosphereContext.camera ?? builder.camera
    if (camera == null) {
      return
    }

    const { positionBuffer, magnitudeBuffer, colorBuffer } = this
    const instancePosition = instancedBufferAttribute(positionBuffer, 'vec3')
    const instanceMagnitude = instancedBufferAttribute(magnitudeBuffer, 'float')
    const instanceColor = instancedBufferAttribute(colorBuffer, 'vec3')

    const { matrixECIToECEF, matrixECEFToWorld, parametersNode } =
      atmosphereContext
    const { luminanceScale } = parametersNode

    const directionECEF = matrixECIToECEF.mul(vec4(instancePosition, 0)).xyz
    const directionWorld = matrixECEFToWorld.mul(vec4(directionECEF, 0)).xyz
    this.positionNode = directionWorld.mul(cameraFar(camera))

    // Magnitude is stored between 0 to 1 within the given range:
    const magnitude = mix(
      this.magnitudeRange.x,
      this.magnitudeRange.y,
      instanceMagnitude.x
    )

    // This is only true at the screen center, but they are points anyway.
    const solidAngle = this.pointSize
      .mul(2)
      .div(screenSize.y.mul(projectionMatrix(camera)[1][1]))
      .pow2()
    const luminance = magnitudeToLuminance(magnitude, solidAngle)

    this.colorNode = luminance
      .mul(luminanceScale)
      .mul(instanceColor)
      .mul(this.intensity)
      .toVertexStage()

    super.setup(builder)
  }
}

export class Stars extends Sprite {
  override frustumCulled = false

  camera: Object3D

  constructor(
    camera: Object3D,
    data: string | ArrayBufferLike = DEFAULT_STARS_DATA_URL
  ) {
    super()
    this.camera = camera

    if (typeof data === 'string') {
      new ArrayBufferLoader()
        .loadAsync(data)
        .then(data => {
          this.createBuffers(data)
        })
        .catch((error: unknown) => {
          console.error(error)
        })
    } else {
      this.createBuffers(data)
    }
  }

  override updateMatrixWorld(force?: boolean): void {
    this.position.copy(this.camera.position)
    super.updateMatrixWorld(force)
  }

  private createBuffers(data: ArrayBufferLike): void {
    // Byte 0-5: int16 position (x, y, z)
    // Byte 6: uint8 magnitude
    // Byte 7-9: uint8 color (r, g, b)
    const count = data.byteLength / 10
    const positions = new Float32Array(count * 3)
    const magnitudes = new Float32Array(count)
    const colors = new Float32Array(count * 3)

    // As of r180, instancedBufferAttribute doesn't support buffers other than
    // floating-point types. Manually normalize the values here.
    const shorts = new Int16Array(data)
    const bytes = new Uint8Array(data)
    for (
      let index = 0, vec3Index = 0, shortIndex = 0, byteIndex = 0;
      index < count;
      ++index, vec3Index += 3, shortIndex += 5, byteIndex += 10
    ) {
      positions[vec3Index + 0] = shorts[shortIndex + 0] / 0x7fff
      positions[vec3Index + 1] = shorts[shortIndex + 1] / 0x7fff
      positions[vec3Index + 2] = shorts[shortIndex + 2] / 0x7fff
      magnitudes[index] = bytes[byteIndex + 6] / 0xff
      colors[vec3Index + 0] = bytes[byteIndex + 7] / 0xff
      colors[vec3Index + 1] = bytes[byteIndex + 8] / 0xff
      colors[vec3Index + 2] = bytes[byteIndex + 9] / 0xff
    }

    const material = new StarsNodeMaterial()
    material.name = 'Stars'
    material.positionBuffer = new InstancedBufferAttribute(positions, 3)
    material.magnitudeBuffer = new InstancedBufferAttribute(magnitudes, 1)
    material.colorBuffer = new InstancedBufferAttribute(colors, 3)
    material.needsUpdate = true

    this.material = material
    this.count = count
  }

  dispose(): void {
    this.material.dispose()
  }
}
