import { Pass, ShaderPass } from 'postprocessing'
import {
  Camera,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  WebGLRenderTarget,
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
    reprojectionMatrix: Uniform<Matrix4>
    viewReprojectionMatrix: Uniform<Matrix4>
    resolution: Uniform<Vector2>
    cameraNear: Uniform<number>
    cameraFar: Uniform<number>
    frame: Uniform<number>
    temporalJitterUv: Uniform<Vector2>
    targetUvScale: Uniform<Vector2>
  }

  temporalUpscale: boolean
  depthBuffer: Texture | null
  depthPacking: DepthPackingStrategies | 0

  copyCameraSettings: (camera: Camera) => void
}

interface DefaultTextures {
  depthVelocity: Texture | null
}

type RenderTarget<Textures = {}> = WebGLRenderTarget &
  DefaultTextures & {
    [K in keyof Textures]: Textures[K] | null
  }

type RenderTargetOptions<Textures = {}> = {
  [K in keyof DefaultTextures]: boolean
} & {
  [K in keyof Textures]?: boolean
}

export interface TemporalPassOptions<
  ResolveMaterial extends TemporalResolveMaterial,
  Textures
> {
  augmentRenderTarget: (
    renderTarget: WebGLRenderTarget & Partial<Textures>,
    options: RenderTargetOptions<Textures>
  ) => Textures

  updateResolveUniforms: (
    uniforms: ResolveMaterial['uniforms'],
    current: RenderTarget<Textures>,
    history: RenderTarget<Textures>
  ) => void
}

export class TemporalPass<
  CurrentMaterial extends TemporalMaterial,
  ResolveMaterial extends TemporalResolveMaterial,
  Textures
> extends Pass {
  protected currentRenderTarget!: RenderTarget<Textures>
  readonly currentMaterial: CurrentMaterial
  readonly currentPass: ShaderPass
  protected resolveRenderTarget!: RenderTarget<Textures>
  readonly resolveMaterial: ResolveMaterial
  readonly resolvePass: ShaderPass
  protected historyRenderTarget!: RenderTarget<Textures>

  protected width = 0
  protected height = 0

  private previousProjectionMatrix?: Matrix4
  private previousViewMatrix?: Matrix4

  private _mainCamera = new Camera()

  constructor(
    name: string,
    currentMaterial: CurrentMaterial,
    resolveMaterial: ResolveMaterial,
    readonly options: TemporalPassOptions<ResolveMaterial, Textures>
  ) {
    super(name)

    this.currentMaterial = currentMaterial
    this.resolveMaterial = resolveMaterial
    this.currentPass = new ShaderPass(this.currentMaterial)
    this.resolvePass = new ShaderPass(this.resolveMaterial)

    this.initRenderTargets({
      depthVelocity: true
    })
  }

  override get mainCamera(): Camera {
    return this._mainCamera
  }

  override set mainCamera(value: Camera) {
    this._mainCamera = value
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.currentPass.initialize(renderer, alpha, frameBufferType)
    this.resolvePass.initialize(renderer, alpha, frameBufferType)
  }

  private createRenderTarget(
    name: string,
    options: RenderTargetOptions<Textures>
  ): RenderTarget<Textures> {
    const renderTarget = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType
    }) as RenderTarget

    const texture = renderTarget.texture
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.name = name
    renderTarget.depthVelocity = null

    let depthVelocityBuffer
    if (options.depthVelocity) {
      depthVelocityBuffer = texture.clone()
      depthVelocityBuffer.isRenderTargetTexture = true
      depthVelocityBuffer.name = `${texture.name}.DepthVelocity`
      renderTarget.depthVelocity = depthVelocityBuffer
      renderTarget.textures.push(depthVelocityBuffer)
    }

    return Object.assign(
      renderTarget,
      this.options.augmentRenderTarget(renderTarget, options)
    )
  }

  protected initRenderTargets(options: RenderTargetOptions<Textures>): void {
    this.currentRenderTarget?.dispose()
    this.resolveRenderTarget?.dispose()
    this.historyRenderTarget?.dispose()
    const current = this.createRenderTarget('Temporal.Current', options)
    const resolve = this.createRenderTarget('Temporal.A', {
      ...options,
      depthVelocity: false
    })
    const history = this.createRenderTarget('Temporal.B', {
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
    this.options.updateResolveUniforms(resolveUniforms, current, history)
  }

  copyCameraSettings(camera: Camera): void {
    assertType<PerspectiveCamera | OrthographicCamera>(camera)

    const previousProjectionMatrix =
      this.previousProjectionMatrix ?? camera.projectionMatrix
    const previousViewMatrix =
      this.previousViewMatrix ?? camera.matrixWorldInverse

    const material = this.currentMaterial
    const uniforms = material.uniforms
    const inverseViewMatrix = camera.matrixWorld
    const reprojectionMatrix = uniforms.reprojectionMatrix.value

    reprojectionMatrix
      .copy(previousProjectionMatrix)
      .multiply(previousViewMatrix)
    uniforms.viewReprojectionMatrix.value
      .copy(reprojectionMatrix)
      .multiply(inverseViewMatrix)

    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far

    if (material.temporalUpscale) {
      const resolution = uniforms.resolution.value
      const width = resolution.x / 4.0
      const height = resolution.y / 4.0
      const frame = uniforms.frame.value % 16
      const offset = bayerOffsets[frame]
      const dx = offset.x - 0.5
      const dy = offset.y - 0.5
      uniforms.temporalJitterUv.value.set(dx / width, dy / height)
      camera.setViewOffset(width, height, dx, -dy, width, height)
    } else {
      uniforms.temporalJitterUv.value.setScalar(0)
    }
  }

  private copyReprojection(camera: Camera): void {
    assertType<PerspectiveCamera | OrthographicCamera>(camera)
    camera.clearViewOffset()
    camera.updateProjectionMatrix()
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
    this.options.updateResolveUniforms(
      resolveUniforms,
      this.currentRenderTarget,
      nextHistory
    )
  }

  update(renderer: WebGLRenderer, frame: number, deltaTime: number): void {
    // Update frame uniforms before copyCameraSettings.
    this.currentMaterial.uniforms.frame.value = frame
    this.resolveMaterial.uniforms.frame.value = frame

    this.copyCameraSettings(this.mainCamera)
    this.currentMaterial.copyCameraSettings(this.mainCamera)

    this.currentPass.render(renderer, null, this.currentRenderTarget)
    this.resolvePass.render(renderer, null, this.resolveRenderTarget)

    // Store the current view and projection matrices for the next reprojection.
    this.copyReprojection(this.mainCamera)

    // Swap resolve and history render targets for the next render.
    this.swapBuffers()
  }

  private setCurrentMaterialSize(
    width: number,
    height: number,
    targetWidth?: number,
    targetHeight?: number
  ): void {
    const uniforms = this.currentMaterial.uniforms
    uniforms.resolution.value.set(width, height)
    if (targetWidth != null && targetHeight != null) {
      // The size of the high-resolution target buffer differs from the upscaled
      // resolution, which is a multiple of 4. This must be corrected when
      // reading from the depth buffer.
      uniforms.targetUvScale.value.set(
        width / targetWidth,
        height / targetHeight
      )
    } else {
      uniforms.targetUvScale.value.setScalar(1)
    }
  }

  override setSize(width: number, height: number): void {
    this.width = width
    this.height = height

    if (this.temporalUpscale) {
      const lowResWidth = Math.ceil(width / 4)
      const lowResHeight = Math.ceil(height / 4)
      this.currentRenderTarget.setSize(lowResWidth, lowResHeight)
      this.setCurrentMaterialSize(
        lowResWidth * 4,
        lowResHeight * 4,
        width,
        height
      )
    } else {
      this.currentRenderTarget.setSize(width, height)
      this.setCurrentMaterialSize(width, height)
    }
    this.resolveRenderTarget.setSize(width, height)
    this.resolveMaterial.setSize(width, height)
    this.historyRenderTarget.setSize(width, height)

    // Invalidate reprojection.
    this.previousProjectionMatrix = undefined
    this.previousViewMatrix = undefined
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
