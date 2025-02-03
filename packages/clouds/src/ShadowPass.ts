import {
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Vector3,
  WebGLArrayRenderTarget,
  type Camera,
  type DataArrayTexture,
  type PerspectiveCamera,
  type TextureDataType,
  type WebGLRenderer
} from 'three'
import invariant from 'tiny-invariant'

import { type AtmosphereParameters } from '@takram/three-atmosphere'
import { lerp } from '@takram/three-geospatial'

import {
  applyVelocity,
  CloudsPassBase,
  type CloudsPassBaseOptions
} from './CloudsPassBase'
import { ShaderArrayPass } from './ShaderArrayPass'
import { ShadowMaterial } from './ShadowMaterial'
import { ShadowResolveMaterial } from './ShadowResolveMaterial'
import { type CloudLayers } from './types'
import { updateCloudLayerUniforms } from './uniforms'

const vectorScratch = /*#__PURE__*/ new Vector3()
const matrixScratch = /*#__PURE__*/ new Matrix4()

function createRenderTarget(name: string): WebGLArrayRenderTarget {
  const renderTarget = new WebGLArrayRenderTarget(1, 1, 1, {
    depthBuffer: false,
    stencilBuffer: false
  })
  // Constructor option doesn't work
  renderTarget.texture.type = HalfFloatType
  renderTarget.texture.minFilter = LinearFilter
  renderTarget.texture.magFilter = LinearFilter
  renderTarget.texture.name = name
  return renderTarget
}

export interface ShadowPassOptions extends CloudsPassBaseOptions {}

export class ShadowPass extends CloudsPassBase {
  private currentRenderTarget!: WebGLArrayRenderTarget
  readonly currentMaterial: ShadowMaterial
  readonly currentPass: ShaderArrayPass
  private resolveRenderTarget!: WebGLArrayRenderTarget | null
  readonly resolveMaterial: ShadowResolveMaterial
  readonly resolvePass: ShaderArrayPass
  private historyRenderTarget!: WebGLArrayRenderTarget | null

  private width = 0
  private height = 0

  constructor(
    options: ShadowPassOptions,
    private readonly atmosphere: AtmosphereParameters
  ) {
    super('ShadowPass', options)

    this.currentMaterial = new ShadowMaterial(
      {
        ellipsoidCenterRef: this.ellipsoidCenter,
        ellipsoidMatrixRef: this.ellipsoidMatrix,
        sunDirectionRef: this.sunDirection
      },
      atmosphere
    )
    this.currentPass = new ShaderArrayPass(this.currentMaterial)
    this.resolveMaterial = new ShadowResolveMaterial()
    this.resolvePass = new ShaderArrayPass(this.resolveMaterial)

    this.initRenderTargets()
  }

  copyCameraSettings(camera: Camera): void {
    this.currentMaterial.copyCameraSettings(camera)
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.currentPass.initialize(renderer, alpha, frameBufferType)
    this.resolvePass.initialize(renderer, alpha, frameBufferType)
  }

  private initRenderTargets(): void {
    this.currentRenderTarget?.dispose()
    this.resolveRenderTarget?.dispose()
    this.historyRenderTarget?.dispose()
    const current = createRenderTarget('Shadow')
    const resolve = this.temporalPass ? createRenderTarget('Shadow.A') : null
    const history = this.temporalPass ? createRenderTarget('Shadow.B') : null
    this.currentRenderTarget = current
    this.resolveRenderTarget = resolve
    this.historyRenderTarget = history

    const resolveUniforms = this.resolveMaterial.uniforms
    resolveUniforms.inputBuffer.value = current.texture
    resolveUniforms.historyBuffer.value = history?.texture ?? null
  }

  private updateShadow(): void {
    // TODO: Position the sun on the top atmosphere sphere.
    // Increase light's distance to the target when the sun is at the horizon.
    const inverseEllipsoidMatrix = matrixScratch
      .copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = this.mainCamera
      .getWorldPosition(vectorScratch)
      .applyMatrix4(inverseEllipsoidMatrix)
      .sub(this.ellipsoidCenter)
    const surfaceNormal = this.currentMaterial.ellipsoid.getSurfaceNormal(
      cameraPositionECEF,
      vectorScratch
    )
    const zenithAngle = this.sunDirection.dot(surfaceNormal)
    const distance = lerp(1e6, 1e3, zenithAngle)

    this.shadow.update(
      this.mainCamera as PerspectiveCamera,
      // The sun direction must be rotated with the ellipsoid to ensure the
      // frusta are constructed correctly. Note this affects the transformation
      // in the shadow shader.
      vectorScratch.copy(this.sunDirection).applyMatrix4(this.ellipsoidMatrix),
      distance
    )
  }

  private updateParameters(
    cloudLayers: CloudLayers,
    frame: number,
    deltaTime: number
  ): void {
    const currentUniforms = this.currentMaterial.uniforms
    updateCloudLayerUniforms(currentUniforms, cloudLayers)

    // Update shadow matrices.
    const shadow = this.shadow
    for (let i = 0; i < shadow.cascadeCount; ++i) {
      const cascade = shadow.cascades[i]
      currentUniforms.inverseShadowMatrices.value[i].copy(cascade.inverseMatrix)
    }

    // Apply velocity to offset uniforms.
    applyVelocity(
      this.localWeatherVelocity,
      deltaTime,
      currentUniforms.localWeatherOffset.value
    )
    applyVelocity(
      this.shapeVelocity,
      deltaTime,
      currentUniforms.shapeOffset.value
    )
    applyVelocity(
      this.shapeDetailVelocity,
      deltaTime,
      currentUniforms.shapeDetailOffset.value
    )
  }

  private copyReprojection(): void {
    const shadow = this.shadow
    const uniforms = this.currentMaterial.uniforms
    for (let i = 0; i < shadow.cascadeCount; ++i) {
      const cascade = shadow.cascades[i]
      uniforms.reprojectionMatrices.value[i].copy(cascade.matrix)
    }
  }

  private swapBuffers(): void {
    invariant(this.historyRenderTarget != null)
    invariant(this.resolveRenderTarget != null)
    const nextResolve = this.historyRenderTarget
    const nextHistory = this.resolveRenderTarget
    this.resolveRenderTarget = nextResolve
    this.historyRenderTarget = nextHistory
    this.resolveMaterial.uniforms.historyBuffer.value = nextHistory.texture
  }

  update(
    renderer: WebGLRenderer,
    cloudLayers: CloudLayers,
    frame: number,
    deltaTime: number
  ): void {
    // Update frame uniforms before copyCameraSettings.
    this.currentMaterial.uniforms.frame.value = frame

    this.copyCameraSettings(this.mainCamera)
    this.updateShadow()
    this.updateParameters(cloudLayers, frame, deltaTime)

    this.currentPass.render(renderer, null, this.currentRenderTarget)

    if (this.temporalPass) {
      invariant(this.resolveRenderTarget != null)
      this.resolvePass.render(renderer, null, this.resolveRenderTarget)

      // Store the current view and projection matrices for the next reprojection.
      this.copyReprojection()

      // Swap resolve and history render targets for the next render.
      this.swapBuffers()
    }
  }

  setSize(
    width: number,
    height: number,
    depth = this.shadow.cascadeCount
  ): void {
    this.width = width
    this.height = height

    this.currentMaterial.cascadeCount = depth
    this.resolveMaterial.cascadeCount = depth
    this.currentMaterial.setSize(width, height)
    this.resolveMaterial.setSize(width, height)

    this.currentRenderTarget.setSize(
      width,
      height,
      this.temporalPass ? depth * 2 : depth // For depth velocity
    )
    this.resolveRenderTarget?.setSize(width, height, depth)
    this.historyRenderTarget?.setSize(width, height, depth)
  }

  get outputBuffer(): DataArrayTexture {
    if (this.temporalPass) {
      // Resolve and history render targets are already swapped.
      invariant(this.historyRenderTarget != null)
      return this.historyRenderTarget.texture
    }
    return this.currentRenderTarget.texture
  }

  get temporalPass(): boolean {
    return this.currentMaterial.temporalPass
  }

  set temporalPass(value: boolean) {
    if (value !== this.temporalPass) {
      this.currentMaterial.temporalPass = value
      this.initRenderTargets()
      this.setSize(this.width, this.height)
    }
  }
}
