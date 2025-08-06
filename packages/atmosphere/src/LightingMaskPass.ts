import {
  ClearPass,
  DepthCopyPass,
  DepthMaskMaterial,
  DepthTestStrategy,
  Pass,
  RenderPass,
  Selection,
  ShaderPass
} from 'postprocessing'
import {
  BasicDepthPacking,
  Color,
  DepthTexture,
  LessEqualDepth,
  MeshBasicMaterial,
  RedFormat,
  RGBADepthPacking,
  Uniform,
  UnsignedIntType,
  WebGLRenderTarget,
  type Camera,
  type DepthPackingStrategies,
  type Scene,
  type Texture,
  type TextureDataType,
  type WebGLRenderer
} from 'three'

import { resolveIncludes } from '@takram/three-geospatial'
import { depth } from '@takram/three-geospatial/shaders'

import fragmentShader from './shaders/lightingMask.frag?raw'

export class LightingMaskPass extends Pass {
  private readonly renderPass: RenderPass
  private readonly depthTexture: DepthTexture
  private readonly renderTarget: WebGLRenderTarget
  private readonly depthCopyPass0: DepthCopyPass
  private readonly depthCopyPass1: DepthCopyPass
  private readonly clearPass: ClearPass
  private readonly depthMaskMaterial: DepthMaskMaterial
  private readonly depthMaskPass: ShaderPass

  readonly selection = new Selection()

  constructor(scene: Scene, camera: Camera) {
    super('LightingMaskPass')
    this.needsSwap = false
    this.needsDepthTexture = true

    this.renderPass = new RenderPass(scene, camera, new MeshBasicMaterial())
    this.renderPass.ignoreBackground = true
    this.renderPass.skipShadowMapUpdate = true
    this.renderPass.selection = this.selection

    // We need a separate depth buffer. See the discussion below.
    this.depthTexture = new DepthTexture(1, 1, UnsignedIntType)
    this.renderTarget = new WebGLRenderTarget(1, 1, {
      format: RedFormat,
      depthTexture: this.depthTexture
    })

    this.depthCopyPass0 = new DepthCopyPass({ depthPacking: RGBADepthPacking })
    this.depthCopyPass1 = new DepthCopyPass({ depthPacking: RGBADepthPacking })

    this.clearPass = new ClearPass(true, false, false)
    this.clearPass.overrideClearColor = new Color(0xffffff)
    this.clearPass.overrideClearAlpha = 1

    const depthMaskMaterial = new DepthMaskMaterial()
    depthMaskMaterial.fragmentShader = resolveIncludes(fragmentShader, {
      core: { depth }
    })
    depthMaskMaterial.uniforms.inverted = new Uniform(false)
    depthMaskMaterial.copyCameraSettings(camera)
    depthMaskMaterial.depthBuffer0 = this.depthCopyPass0.texture
    depthMaskMaterial.depthPacking0 = RGBADepthPacking
    depthMaskMaterial.depthBuffer1 = this.depthCopyPass1.texture
    depthMaskMaterial.depthPacking1 = RGBADepthPacking
    depthMaskMaterial.depthMode = LessEqualDepth
    depthMaskMaterial.maxDepthStrategy = DepthTestStrategy.DISCARD_MAX_DEPTH
    this.depthMaskMaterial = depthMaskMaterial
    this.depthMaskPass = new ShaderPass(depthMaskMaterial)
  }

  // eslint-disable-next-line accessor-pairs
  override set mainScene(value: Scene) {
    this.renderPass.mainScene = value
  }

  // eslint-disable-next-line accessor-pairs
  override set mainCamera(value: Camera) {
    this.renderPass.mainCamera = value
    this.depthMaskMaterial.copyCameraSettings(value)
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.renderPass.initialize(renderer, alpha, frameBufferType)
    this.clearPass.initialize(renderer, alpha, frameBufferType)
    this.depthMaskPass.initialize(renderer, alpha, frameBufferType)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking: DepthPackingStrategies = BasicDepthPacking
  ): void {
    this.depthCopyPass0.setDepthTexture(depthTexture, depthPacking)
    this.depthCopyPass1.setDepthTexture(this.depthTexture, depthPacking)
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null,
    deltaTime?: number,
    stencilTest?: boolean
  ): void {
    const autoClear = renderer.autoClear
    renderer.autoClear = false

    // We cannot precisely compare the depth buffer and a texture rendered with
    // MeshDepthMaterial. Store the current depth and the selection depth with
    // the same packing and create a mask.
    this.depthCopyPass0.render(renderer, null, null)
    this.renderPass.render(renderer, this.renderTarget, null)
    this.depthCopyPass1.render(renderer, null, null)
    this.clearPass.render(renderer, this.renderTarget, null)
    this.depthMaskPass.render(renderer, null, this.renderTarget)

    renderer.autoClear = autoClear
  }

  override setSize(width: number, height: number): void {
    this.renderTarget.setSize(width, height)
    this.depthCopyPass0.setSize(width, height)
    this.depthCopyPass1.setSize(width, height)
  }

  get texture(): Texture {
    return this.renderTarget.texture
  }

  get selectionLayer(): number {
    return this.selection.layer
  }

  set selectionLayer(value: number) {
    this.selection.layer = value
  }

  get inverted(): boolean {
    return this.depthMaskMaterial.uniforms.inverted.value
  }

  set inverted(value: boolean) {
    this.depthMaskMaterial.uniforms.inverted.value = value
  }
}

/** @deprecated Use LightingMaskPass instead. */
export const IrradianceMaskPass = LightingMaskPass
