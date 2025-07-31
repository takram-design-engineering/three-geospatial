import {
  HalfFloatType,
  LinearFilter,
  WebGLArrayRenderTarget,
  type DataArrayTexture,
  type TextureDataType,
  type WebGLRenderer
} from 'three'
import invariant from 'tiny-invariant'

import { PassBase, type PassBaseOptions } from './PassBase'
import { ShaderArrayPass } from './ShaderArrayPass'
import { ShadowMaterial } from './ShadowMaterial'
import { ShadowResolveMaterial } from './ShadowResolveMaterial'
import type {
  AtmosphereUniforms,
  CloudLayerUniforms,
  CloudParameterUniforms
} from './uniforms'

function createRenderTarget(name: string): WebGLArrayRenderTarget {
  const renderTarget = new WebGLArrayRenderTarget(1, 1, 1, {
    depthBuffer: false
  })
  // Constructor option doesn't work
  renderTarget.texture.type = HalfFloatType
  renderTarget.texture.minFilter = LinearFilter
  renderTarget.texture.magFilter = LinearFilter
  renderTarget.texture.name = name
  return renderTarget
}

export interface ShadowPassOptions extends PassBaseOptions {
  parameterUniforms: CloudParameterUniforms
  layerUniforms: CloudLayerUniforms
  atmosphereUniforms: AtmosphereUniforms
}

export class ShadowPass extends PassBase {
  private currentRenderTarget!: WebGLArrayRenderTarget
  readonly currentMaterial: ShadowMaterial
  readonly currentPass: ShaderArrayPass
  private resolveRenderTarget!: WebGLArrayRenderTarget | null
  readonly resolveMaterial: ShadowResolveMaterial
  readonly resolvePass: ShaderArrayPass
  private historyRenderTarget!: WebGLArrayRenderTarget | null

  private width = 0
  private height = 0

  constructor({
    parameterUniforms,
    layerUniforms,
    atmosphereUniforms,
    ...options
  }: ShadowPassOptions) {
    super('ShadowPass', options)

    this.currentMaterial = new ShadowMaterial({
      parameterUniforms,
      layerUniforms,
      atmosphereUniforms
    })
    this.currentPass = new ShaderArrayPass(this.currentMaterial)
    this.resolveMaterial = new ShadowResolveMaterial()
    this.resolvePass = new ShaderArrayPass(this.resolveMaterial)

    this.initRenderTargets()
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

  private copyShadow(): void {
    const shadow = this.shadow
    const currentUniforms = this.currentMaterial.uniforms
    for (let i = 0; i < shadow.cascadeCount; ++i) {
      const cascade = shadow.cascades[i]
      currentUniforms.inverseShadowMatrices.value[i].copy(cascade.inverseMatrix)
    }
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

  update(renderer: WebGLRenderer, frame: number, deltaTime: number): void {
    this.currentMaterial.uniforms.frame.value = frame
    this.copyShadow()

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

  override setSize(
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
