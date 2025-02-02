import { ShaderPass } from 'postprocessing'
import {
  HalfFloatType,
  LinearFilter,
  RedFormat,
  WebGLRenderTarget,
  type Camera,
  type DataArrayTexture,
  type DepthPackingStrategies,
  type Texture,
  type TextureDataType,
  type WebGLRenderer
} from 'three'

import { type AtmosphereParameters } from '@takram/three-atmosphere'

import { CloudsMaterial } from './CloudsMaterial'
import {
  applyVelocity,
  CloudsPassBase,
  type CloudsPassBaseOptions
} from './CloudsPassBase'
import { CloudsResolveMaterial } from './CloudsResolveMaterial'
import { type CloudLayers } from './types'
import { updateCloudLayerUniforms } from './uniforms'

type RenderTarget = WebGLRenderTarget & {
  depthVelocity: Texture | null
  shadowLength: Texture | null
}

interface RenderTargetOptions {
  depthVelocity: boolean
  shadowLength: boolean
}

function createRenderTarget(
  name: string,
  { depthVelocity, shadowLength }: RenderTargetOptions
): RenderTarget {
  const renderTarget: WebGLRenderTarget & {
    depthVelocity?: Texture
    shadowLength?: Texture
  } = new WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
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
  let shadowLengthBuffer
  if (shadowLength) {
    shadowLengthBuffer = renderTarget.texture.clone()
    shadowLengthBuffer.isRenderTargetTexture = true
    shadowLengthBuffer.format = RedFormat
    renderTarget.shadowLength = shadowLengthBuffer
    renderTarget.textures.push(shadowLengthBuffer)
  }

  return Object.assign(renderTarget, {
    depthVelocity: depthVelocityBuffer ?? null,
    shadowLength: shadowLengthBuffer ?? null
  })
}

export interface CloudsPassOptions extends CloudsPassBaseOptions {}

export class CloudsPass extends CloudsPassBase {
  private currentRenderTarget!: RenderTarget
  readonly currentMaterial: CloudsMaterial
  readonly currentPass: ShaderPass
  private resolveRenderTarget!: RenderTarget
  readonly resolveMaterial: CloudsResolveMaterial
  readonly resolvePass: ShaderPass
  private historyRenderTarget!: RenderTarget

  private width = 0
  private height = 0

  constructor(
    options: CloudsPassOptions,
    private readonly atmosphere: AtmosphereParameters
  ) {
    super('CloudsPass', options)

    this.currentMaterial = new CloudsMaterial(
      {
        ellipsoidCenterRef: this.ellipsoidCenter,
        ellipsoidMatrixRef: this.ellipsoidMatrix,
        sunDirectionRef: this.sunDirection
      },
      atmosphere
    )
    this.currentPass = new ShaderPass(this.currentMaterial)
    this.resolveMaterial = new CloudsResolveMaterial()
    this.resolvePass = new ShaderPass(this.resolveMaterial)

    this.initRenderTargets({
      depthVelocity: true,
      shadowLength: true
    })
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

  private initRenderTargets(options: RenderTargetOptions): void {
    this.currentRenderTarget?.dispose()
    this.resolveRenderTarget?.dispose()
    this.historyRenderTarget?.dispose()
    const current = createRenderTarget('Clouds', options)
    const resolve = createRenderTarget('Clouds.A', {
      ...options,
      depthVelocity: false
    })
    const history = createRenderTarget('Clouds.B', {
      ...options,
      depthVelocity: false
    })
    this.currentRenderTarget = current
    this.resolveRenderTarget = resolve
    this.historyRenderTarget = history

    const resolveUniforms = this.resolveMaterial.uniforms
    resolveUniforms.colorBuffer.value = current.texture
    resolveUniforms.depthVelocityBuffer.value = current.depthVelocity
    resolveUniforms.shadowLengthBuffer.value = current.shadowLength
    resolveUniforms.colorHistoryBuffer.value = history.texture
    resolveUniforms.shadowLengthHistoryBuffer.value = history.shadowLength
  }

  private copyShadowParameters(): void {
    const shadow = this.shadow
    const currentUniforms = this.currentMaterial.uniforms
    for (let i = 0; i < shadow.cascadeCount; ++i) {
      const cascade = shadow.cascades[i]
      currentUniforms.shadowIntervals.value[i].copy(cascade.interval)
      currentUniforms.shadowMatrices.value[i].copy(cascade.matrix)
    }
    currentUniforms.shadowFar.value = shadow.far
  }

  private updateParameters(
    cloudLayers: CloudLayers,
    frame: number,
    deltaTime: number
  ): void {
    const currentUniforms = this.currentMaterial.uniforms
    updateCloudLayerUniforms(currentUniforms, cloudLayers)

    // Update shadow matrices.
    this.copyShadowParameters()

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
    this.currentMaterial.copyReprojectionMatrix(this.mainCamera)
  }

  private swapBuffers(): void {
    const nextResolve = this.historyRenderTarget
    const nextHistory = this.resolveRenderTarget
    this.resolveRenderTarget = nextResolve
    this.historyRenderTarget = nextHistory

    const resolveUniforms = this.resolveMaterial.uniforms
    resolveUniforms.colorHistoryBuffer.value = nextHistory.texture
    resolveUniforms.shadowLengthHistoryBuffer.value = nextHistory.shadowLength
  }

  update(
    renderer: WebGLRenderer,
    cloudLayers: CloudLayers,
    frame: number,
    deltaTime: number
  ): void {
    // Update frame uniforms before copyCameraSettings.
    this.currentMaterial.uniforms.frame.value = frame
    this.resolveMaterial.uniforms.frame.value = frame

    this.copyCameraSettings(this.mainCamera)
    this.updateParameters(cloudLayers, frame, deltaTime)

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

  setShadowSize(width: number, height: number, depth: number): void {
    this.currentMaterial.shadowCascadeCount = depth
    this.currentMaterial.setShadowSize(width, height)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.currentMaterial.depthBuffer = depthTexture
    this.currentMaterial.depthPacking = depthPacking ?? 0
  }

  get outputBuffer(): Texture {
    return this.resolveRenderTarget.texture
  }

  get shadowBuffer(): DataArrayTexture | null {
    return this.currentMaterial.uniforms.shadowBuffer.value
  }

  set shadowBuffer(value: DataArrayTexture | null) {
    this.currentMaterial.uniforms.shadowBuffer.value = value
  }

  get shadowLengthBuffer(): Texture | null {
    return this.resolveRenderTarget.shadowLength
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

  get crepuscularRays(): boolean {
    return this.currentMaterial.shadowLength
  }

  set crepuscularRays(value: boolean) {
    if (value !== this.crepuscularRays) {
      this.currentMaterial.shadowLength = value
      this.resolveMaterial.shadowLength = value
      this.initRenderTargets({
        depthVelocity: true,
        shadowLength: value
      })
      this.setSize(this.width, this.height)
    }
  }
}
