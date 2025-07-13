import { Pass, Resolution } from 'postprocessing'
import {
  BasicDepthPacking,
  HalfFloatType,
  RGFormat,
  WebGLRenderTarget,
  type Camera,
  type Data3DTexture,
  type DepthPackingStrategies,
  type Texture,
  type Vector3,
  type WebGLRenderer
} from 'three'

import { ScreenSpaceShadowMaterial } from './ScreenSpaceShadowMaterial'
import type { AtmosphereSceneShadow } from './types'

declare module 'postprocessing' {
  interface DepthPass {
    renderPass: RenderPass
  }
}

export interface ScreenSpaceShadowPassOptions {
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
}

export const screenSpaceShadowPassOptionsDefaults = {
  resolutionScale: 1,
  width: Resolution.AUTO_SIZE,
  height: Resolution.AUTO_SIZE
} satisfies ScreenSpaceShadowPassOptions

export class ScreenSpaceShadowPass extends Pass {
  readonly resolution: Resolution
  private readonly renderTarget: WebGLRenderTarget
  private readonly screenSpaceShadowMaterial: ScreenSpaceShadowMaterial

  constructor(options?: ScreenSpaceShadowPassOptions) {
    const {
      resolutionScale,
      width,
      height,
      resolutionX = width,
      resolutionY = height
    } = {
      ...screenSpaceShadowPassOptionsDefaults,
      ...options
    }
    super('ScreenSpaceShadowPass')
    this.needsSwap = false
    this.needsDepthTexture = true

    this.renderTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      format: RGFormat,
      depthBuffer: false
    })
    this.screenSpaceShadowMaterial = new ScreenSpaceShadowMaterial()
    this.resolution = new Resolution(
      this,
      resolutionX,
      resolutionY,
      resolutionScale
    )
    this.resolution.addEventListener('change', this.onResolutionChange)
  }

  private readonly onResolutionChange = (): void => {
    this.setSize(this.resolution.baseWidth, this.resolution.baseHeight)
  }

  // eslint-disable-next-line accessor-pairs
  override set mainCamera(value: Camera) {
    this.screenSpaceShadowMaterial.copyCameraSettings(value)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking: DepthPackingStrategies = BasicDepthPacking
  ): void {
    this.screenSpaceShadowMaterial.depthBuffer = depthTexture
    this.screenSpaceShadowMaterial.depthPacking = depthPacking
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    this.fullscreenMaterial = this.screenSpaceShadowMaterial
    renderer.setRenderTarget(this.renderToScreen ? null : this.renderTarget)
    renderer.render(this.scene, this.camera)
  }

  override setSize(baseWidth: number, baseHeight: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(baseWidth, baseHeight)

    const { width, height } = resolution
    this.renderTarget.setSize(width, height)
    this.screenSpaceShadowMaterial.setSize(width, height)
  }

  get texture(): Texture {
    return this.renderTarget.texture
  }

  get normalBuffer(): Texture | null {
    return this.screenSpaceShadowMaterial.uniforms.normalBuffer.value
  }

  set normalBuffer(value: Texture | null) {
    this.screenSpaceShadowMaterial.uniforms.normalBuffer.value = value
  }

  get sunDirection(): Vector3 {
    return this.screenSpaceShadowMaterial.uniforms.sunDirection.value
  }

  get stbnTexture(): Data3DTexture | null {
    return this.screenSpaceShadowMaterial.uniforms.stbnTexture.value
  }

  set stbnTexture(value: Data3DTexture | null) {
    this.screenSpaceShadowMaterial.uniforms.stbnTexture.value = value
  }

  get frame(): number {
    return this.screenSpaceShadowMaterial.uniforms.frame.value
  }

  set frame(value: number) {
    this.screenSpaceShadowMaterial.uniforms.frame.value = value
  }

  get sceneShadow(): AtmosphereSceneShadow | null {
    return this.screenSpaceShadowMaterial.sceneShadow
  }

  set sceneShadow(value: AtmosphereSceneShadow | null) {
    this.screenSpaceShadowMaterial.sceneShadow = value
  }
}
