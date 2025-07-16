import { Pass, ShaderPass } from 'postprocessing'
import {
  HalfFloatType,
  LinearFilter,
  Matrix4,
  WebGLRenderTarget,
  type Camera,
  type DepthPackingStrategies,
  type OrthographicCamera,
  type PerspectiveCamera,
  type ShaderMaterial,
  type Texture,
  type TextureDataType,
  type Uniform,
  type Vector2,
  type WebGLRenderer
} from 'three'

import { assertType } from './assertions'
import { bayerOffsets } from './bayer'
import type { TemporalResolveMaterial } from './TemporalResolveMaterial'

export interface TemporalMaterial extends ShaderMaterial {
  uniforms: {
    viewMatrix: Uniform<Matrix4>
    inverseProjectionMatrix: Uniform<Matrix4>
    inverseViewMatrix: Uniform<Matrix4>
    reprojectionMatrix: Uniform<Matrix4>
    viewReprojectionMatrix: Uniform<Matrix4>
    resolution: Uniform<Vector2>
    cameraNear: Uniform<number>
    cameraFar: Uniform<number>
    frame: Uniform<number>
    temporalJitter: Uniform<Vector2>
  }

  temporalUpscale: boolean
  depthBuffer: Texture | null
  depthPacking: DepthPackingStrategies | 0

  setSize: (
    width: number,
    height: number,
    targetWidth?: number,
    targetHeight?: number
  ) => void
}

type RenderTarget = WebGLRenderTarget & {
  depthVelocity: Texture | null
}

interface RenderTargetOptions {
  depthVelocity: boolean
}

function createRenderTarget(
  name: string,
  { depthVelocity }: RenderTargetOptions
): RenderTarget {
  const renderTarget: WebGLRenderTarget & {
    depthVelocity?: Texture
    shadowLength?: Texture
  } = new WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType
  })
  renderTarget.texture.minFilter = LinearFilter
  renderTarget.texture.magFilter = LinearFilter
  renderTarget.texture.name = name

  let depthVelocityBuffer
  if (depthVelocity) {
    depthVelocityBuffer = renderTarget.texture.clone()
    depthVelocityBuffer.isRenderTargetTexture = true
    renderTarget.depthVelocity = depthVelocityBuffer
    renderTarget.textures.push(depthVelocityBuffer)
  }

  return Object.assign(renderTarget, {
    depthVelocity: depthVelocityBuffer ?? null
  })
}

export class TemporalPass<
  CurrentMaterial extends TemporalMaterial,
  ResolveMaterial extends TemporalResolveMaterial
> extends Pass {
  private currentRenderTarget!: RenderTarget
  currentMaterial: CurrentMaterial
  readonly currentPass: ShaderPass
  private resolveRenderTarget!: RenderTarget
  readonly resolveMaterial: ResolveMaterial
  readonly resolvePass: ShaderPass
  private historyRenderTarget!: RenderTarget

  private width = 0
  private height = 0

  private previousProjectionMatrix?: Matrix4
  private previousViewMatrix?: Matrix4

  constructor(
    currentMaterial: CurrentMaterial,
    resolveMaterial: ResolveMaterial
  ) {
    super('TemporalPass')

    this.currentMaterial = currentMaterial
    this.resolveMaterial = resolveMaterial
    this.currentPass = new ShaderPass(this.currentMaterial)
    this.resolvePass = new ShaderPass(this.resolveMaterial)

    this.initRenderTargets({
      depthVelocity: true
    })
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.currentPass.initialize(renderer, alpha, frameBufferType)
    this.resolvePass.initialize(renderer, alpha, frameBufferType)
  }

  private initRenderTargets(options: RenderTargetOptions): void {
    this.currentRenderTarget?.dispose()
    this.resolveRenderTarget?.dispose()
    this.historyRenderTarget?.dispose()
    const current = createRenderTarget('Temporal', options)
    const resolve = createRenderTarget('Temporal.A', {
      ...options,
      depthVelocity: false
    })
    const history = createRenderTarget('Temporal.B', {
      ...options,
      depthVelocity: false
    })
    this.currentRenderTarget = current
    this.resolveRenderTarget = resolve
    this.historyRenderTarget = history

    const resolveUniforms = this.resolveMaterial.uniforms
    resolveUniforms.inputBuffer.value = current.texture
    resolveUniforms.depthVelocityBuffer.value = current.depthVelocity
    resolveUniforms.historyBuffer.value = history.texture
  }

  copyCameraSettings(camera: Camera): void {
    const material = this.currentMaterial
    const uniforms = material.uniforms
    uniforms.viewMatrix.value.copy(camera.matrixWorldInverse)
    uniforms.inverseViewMatrix.value.copy(camera.matrixWorld)

    const previousProjectionMatrix =
      this.previousProjectionMatrix ?? camera.projectionMatrix
    const previousViewMatrix =
      this.previousViewMatrix ?? camera.matrixWorldInverse

    const inverseProjectionMatrix = uniforms.inverseProjectionMatrix.value
    const inverseViewMatrix = uniforms.inverseViewMatrix.value
    const reprojectionMatrix = uniforms.reprojectionMatrix.value
    const resolution = uniforms.resolution.value

    if (material.temporalUpscale) {
      const frame = uniforms.frame.value % 16
      const offset = bayerOffsets[frame]
      const dx = ((offset.x - 0.5) / resolution.x) * 4
      const dy = ((offset.y - 0.5) / resolution.y) * 4
      uniforms.temporalJitter.value.set(dx, dy)
      inverseProjectionMatrix.copy(camera.projectionMatrix)
      inverseProjectionMatrix.elements[8] += dx * 2
      inverseProjectionMatrix.elements[9] += dy * 2
      inverseProjectionMatrix.invert()

      // Jitter the previous projection matrix with the current jitter.
      reprojectionMatrix.copy(previousProjectionMatrix)
      reprojectionMatrix.elements[8] += dx * 2
      reprojectionMatrix.elements[9] += dy * 2
      reprojectionMatrix.multiply(previousViewMatrix)
    } else {
      uniforms.temporalJitter.value.setScalar(0)
      inverseProjectionMatrix.copy(camera.projectionMatrixInverse)
      reprojectionMatrix
        .copy(previousProjectionMatrix)
        .multiply(previousViewMatrix)
    }
    uniforms.viewReprojectionMatrix.value
      .copy(reprojectionMatrix)
      .multiply(inverseViewMatrix)

    assertType<PerspectiveCamera | OrthographicCamera>(camera)
    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far
  }

  // copyCameraSettings can be called multiple times within a frame. Only
  // reliable way is to explicitly store the matrices.
  private copyReprojection(): void {
    const camera = this.mainCamera
    this.previousProjectionMatrix ??= new Matrix4()
    this.previousViewMatrix ??= new Matrix4()
    this.previousProjectionMatrix.copy(camera.projectionMatrix)
    this.previousViewMatrix.copy(camera.matrixWorldInverse)
  }

  private swapBuffers(): void {
    const nextResolve = this.historyRenderTarget
    const nextHistory = this.resolveRenderTarget
    this.resolveRenderTarget = nextResolve
    this.historyRenderTarget = nextHistory

    const resolveUniforms = this.resolveMaterial.uniforms
    resolveUniforms.historyBuffer.value = nextHistory.texture
  }

  update(renderer: WebGLRenderer, frame: number, deltaTime: number): void {
    // Update frame uniforms before copyCameraSettings.
    this.currentMaterial.uniforms.frame.value = frame
    this.resolveMaterial.uniforms.frame.value = frame

    this.copyCameraSettings(this.mainCamera)

    this.currentPass.render(renderer, null, this.currentRenderTarget)
    this.resolvePass.render(renderer, null, this.resolveRenderTarget)

    // Store the current view and projection matrices for the next reprojection.
    this.copyReprojection()

    // Swap resolve and history render targets for the next render.
    this.swapBuffers()
  }

  override setSize(width: number, height: number): void {
    this.width = width
    this.height = height

    if (this.temporalUpscale) {
      const lowResWidth = Math.ceil(width / 4)
      const lowResHeight = Math.ceil(height / 4)
      this.currentRenderTarget.setSize(lowResWidth, lowResHeight)
      this.currentMaterial.setSize(
        lowResWidth * 4,
        lowResHeight * 4,
        width,
        height
      )
    } else {
      this.currentRenderTarget.setSize(width, height)
      this.currentMaterial.setSize(width, height)
    }
    this.resolveRenderTarget.setSize(width, height)
    this.resolveMaterial.setSize(width, height)
    this.historyRenderTarget.setSize(width, height)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.currentMaterial.depthBuffer = depthTexture
    this.currentMaterial.depthPacking = depthPacking ?? 0
  }

  get outputBuffer(): Texture {
    // Resolve and history render targets are already swapped.
    return this.historyRenderTarget.texture
  }

  get temporalUpscale(): boolean {
    return this.currentMaterial.temporalUpscale
  }

  set temporalUpscale(value: boolean) {
    if (value !== this.temporalUpscale) {
      this.currentMaterial.temporalUpscale = value
      this.resolveMaterial.temporalUpscale = value
      this.setSize(this.width, this.height)
    }
  }
}
