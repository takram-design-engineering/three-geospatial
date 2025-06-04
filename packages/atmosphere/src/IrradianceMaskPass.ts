import { Pass, RenderPass, Resolution, Selection } from 'postprocessing'
import {
  Color,
  MeshBasicMaterial,
  NearestFilter,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type Texture,
  type WebGLRenderer
} from 'three'

export interface IrradianceMaskPassOptions {
  renderTarget?: WebGLRenderTarget
  resolutionScale?: number
  width?: number
  height?: number
  resolutionX?: number
  resolutionY?: number
}

export class IrradianceMaskPass extends Pass {
  renderPass: RenderPass
  renderTarget: WebGLRenderTarget
  readonly resolution: Resolution
  readonly selection = new Selection()

  private _mainScene: Scene
  private _mainCamera: Camera

  constructor(
    scene: Scene,
    camera: Camera,
    {
      renderTarget,
      resolutionScale = 1,
      width = Resolution.AUTO_SIZE,
      height = Resolution.AUTO_SIZE,
      resolutionX = width,
      resolutionY = height
    }: IrradianceMaskPassOptions = {}
  ) {
    super('IrradianceMaskPass')

    this._mainScene = scene
    this._mainCamera = camera
    this.needsSwap = false

    this.renderPass = new RenderPass(
      scene,
      camera,
      new MeshBasicMaterial({ color: 0 })
    )
    this.renderPass.ignoreBackground = true
    this.renderPass.skipShadowMapUpdate = true
    this.renderPass.selection = this.selection

    const clearPass = this.renderPass.clearPass
    clearPass.overrideClearColor = new Color(0xffffff)
    clearPass.overrideClearAlpha = 1

    if (renderTarget == null) {
      this.renderTarget = new WebGLRenderTarget(1, 1, {
        minFilter: NearestFilter,
        magFilter: NearestFilter
      })
      this.renderTarget.texture.name = 'IrradianceMaskPass.Target'
    } else {
      this.renderTarget = renderTarget
    }

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

  override get mainScene(): Scene {
    return this._mainScene
  }

  override set mainScene(value: Scene) {
    this._mainScene = value
    this.renderPass.mainScene = value
  }

  override get mainCamera(): Camera {
    return this._mainCamera
  }

  override set mainCamera(value: Camera) {
    this._mainCamera = value
    this.renderPass.mainCamera = value
  }

  get texture(): Texture {
    return this.renderTarget.texture
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
    const renderTarget = this.renderToScreen ? null : this.renderTarget
    this.renderPass.render(renderer, renderTarget, renderTarget)
    renderer.autoClear = autoClear
  }

  override setSize(width: number, height: number): void {
    const resolution = this.resolution
    resolution.setBaseSize(width, height)
    this.renderTarget.setSize(resolution.width, resolution.height)
  }
}
