import {
  AdditiveBlending,
  HalfFloatType,
  InstancedBufferAttribute,
  LinearFilter,
  RGBAFormat,
  Sprite,
  Vector2,
  type BufferAttribute
} from 'three'
import {
  instancedBufferAttribute,
  mix,
  remapClamp,
  screenUV,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeUpdateType,
  PointsNodeMaterial,
  RendererUtils,
  RenderTarget,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { ArrayBufferLoader } from '@takram/three-geospatial'
import {
  cameraFar,
  cameraNear,
  outputTexture
} from '@takram/three-geospatial/webgpu'

import { DEFAULT_STARS_DATA_URL } from '../constants'
import type { AtmosphereContextNode } from './AtmosphereContextNode'

const { resetRendererState, restoreRendererState } = RendererUtils

function createRenderTarget(): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.name = 'StarsNode'
  return renderTarget
}

const sizeScratch = /*#__PURE__*/ new Vector2()

export class StarsNode extends TempNode {
  static override get type(): string {
    return 'StarsNode'
  }

  private readonly atmosphereContext: AtmosphereContextNode

  readonly data: string | ArrayBufferLike
  private dataPromise?: Promise<void>

  pointSize = uniform(1)
  intensity = uniform(1)
  magnitudeRange = uniform(new Vector2(-2, 8))

  private readonly textureNode: TextureNode

  private readonly renderTarget: RenderTarget
  private readonly material = new PointsNodeMaterial()
  private readonly points = new Sprite(this.material)
  private rendererState?: RendererUtils.RendererState

  private positionBuffer?: BufferAttribute
  private magnitudeBuffer?: BufferAttribute
  private colorBuffer?: BufferAttribute

  constructor(
    atmosphereContext: AtmosphereContextNode,
    data: string | ArrayBufferLike = DEFAULT_STARS_DATA_URL
  ) {
    super('vec3')
    this.atmosphereContext = atmosphereContext
    this.data = data

    this.renderTarget = createRenderTarget()
    this.textureNode = outputTexture(this, this.renderTarget.texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  setSize(width: number, height: number): this {
    this.renderTarget.setSize(width, height)
    return this
  }

  override updateBefore(frame: NodeFrame): void {
    const { renderer } = frame
    const camera = this.atmosphereContext.camera ?? frame.camera
    if (renderer == null || camera == null) {
      return
    }

    // TODO: Skip rendering if not necessary.

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.x, size.y)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    this.points.position.copy(camera.position)

    renderer.setRenderTarget(this.renderTarget)
    renderer.render(this.points, camera)

    restoreRendererState(renderer, this.rendererState)
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

    this.positionBuffer = new InstancedBufferAttribute(positions, 3)
    this.magnitudeBuffer = new InstancedBufferAttribute(magnitudes, 1)
    this.colorBuffer = new InstancedBufferAttribute(colors, 3)
    this.points.count = count
  }

  private setupMaterial(builder: NodeBuilder): void {
    const camera = this.atmosphereContext.camera ?? builder.camera
    if (camera == null) {
      return
    }

    const { material, positionBuffer, magnitudeBuffer, colorBuffer } = this
    invariant(positionBuffer != null)
    invariant(magnitudeBuffer != null)
    invariant(colorBuffer != null)

    const instancePosition = instancedBufferAttribute(positionBuffer, 'vec3')
    const instanceMagnitude = instancedBufferAttribute(magnitudeBuffer, 'float')
    const instanceColor = instancedBufferAttribute(colorBuffer, 'vec3')

    const { matrixECIToECEF, matrixECEFToWorld } = this.atmosphereContext

    const directionECEF = matrixECIToECEF.mul(vec4(instancePosition, 0)).xyz
    const directionWorld = matrixECEFToWorld.mul(vec4(directionECEF, 0)).xyz
    material.positionNode = directionWorld.mul(
      cameraNear(camera).add(cameraFar(camera)).mul(0.5)
    )

    // Magnitude is stored between 0 to 1 within the given range:
    const magnitude = mix(
      this.magnitudeRange.x,
      this.magnitudeRange.y,
      instanceMagnitude.x
    )
    const brightness = vec3(10).pow(
      vec3(this.magnitudeRange, magnitude)
        .mul(1 / 100 ** (1 / 5))
        .negate()
    )
    material.colorNode = instanceColor
      .mul(remapClamp(brightness.z, brightness.y, brightness.x))
      .mul(this.intensity)
      .toVertexStage()

    material.needsUpdate = true
  }

  override setup(builder: NodeBuilder): unknown {
    if (typeof this.data === 'string') {
      this.dataPromise ??= new ArrayBufferLoader()
        .loadAsync(this.data)
        .then(data => {
          this.createBuffers(data)
          this.setupMaterial(builder)
        })
        .catch((error: unknown) => {
          console.error(error)
        })
    } else {
      this.createBuffers(this.data)
      this.setupMaterial(builder)
    }

    const { material } = this
    material.sizeNode = this.pointSize
    material.sizeAttenuation = false
    material.depthTest = false
    material.depthWrite = false
    material.transparent = true
    material.blending = AdditiveBlending
    material.needsUpdate = true

    this.points.frustumCulled = false

    this.textureNode.uvNode = screenUV
    return this.textureNode
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
    super.dispose()
  }
}
