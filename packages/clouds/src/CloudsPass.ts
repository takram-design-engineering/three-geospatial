import {
  RedFormat,
  type DataArrayTexture,
  type Texture,
  type WebGLRenderer
} from 'three'

import type { AtmosphereParameters } from '@takram/three-atmosphere'
import { TemporalPass, type CascadedShadow } from '@takram/three-geospatial'

import { CloudsMaterial, type CloudsMaterialParameters } from './CloudsMaterial'
import { CloudsResolveMaterial } from './CloudsResolveMaterial'
import { defaults } from './qualityPresets'

export interface CloudsPassOptions extends CloudsMaterialParameters {
  shadow: CascadedShadow
}

interface TextureFields {
  shadowLength: Texture | null
}

export class CloudsPass extends TemporalPass<
  CloudsMaterial,
  CloudsResolveMaterial,
  TextureFields
> {
  shadow: CascadedShadow

  constructor(
    { shadow, ...others }: CloudsPassOptions,
    atmosphere: AtmosphereParameters
  ) {
    super(
      'CloudsPass',
      new CloudsMaterial(others, atmosphere),
      new CloudsResolveMaterial(),
      {
        augmentRenderTarget: (
          renderTarget,
          { shadowLength = defaults.lightShafts }
        ) => {
          let shadowLengthBuffer
          if (shadowLength) {
            shadowLengthBuffer = renderTarget.texture.clone()
            shadowLengthBuffer.isRenderTargetTexture = true
            shadowLengthBuffer.format = RedFormat
            renderTarget.shadowLength = shadowLengthBuffer
            renderTarget.textures.push(shadowLengthBuffer)
          }
          return Object.assign(renderTarget, {
            shadowLength: shadowLengthBuffer ?? null
          })
        },
        updateResolveUniforms: (uniforms, current, history) => {
          uniforms.shadowLengthBuffer.value = current.shadowLength
          uniforms.shadowLengthHistoryBuffer.value = history.shadowLength
        }
      }
    )
    this.shadow = shadow
  }

  override update(
    renderer: WebGLRenderer,
    frame: number,
    deltaTime: number
  ): void {
    const shadow = this.shadow
    const uniforms = this.currentMaterial.uniforms
    for (let i = 0; i < shadow.cascadeCount; ++i) {
      const cascade = shadow.cascades[i]
      uniforms.shadowIntervals.value[i].copy(cascade.interval)
      uniforms.shadowMatrices.value[i]
        .copy(cascade.projectionMatrix)
        .multiply(cascade.viewMatrix)
    }
    uniforms.shadowFar.value = shadow.far
    uniforms.mipLevelScale.value = this.temporalUpscale ? 0.25 : 1

    super.update(renderer, frame, deltaTime)
  }

  setShadowSize(width: number, height: number, depth: number): void {
    this.currentMaterial.uniforms.shadowCascadeCount.value = depth
    this.currentMaterial.setShadowSize(width, height)
  }

  get shadowBuffer(): DataArrayTexture | null {
    return this.currentMaterial.uniforms.shadowBuffer.value
  }

  set shadowBuffer(value: DataArrayTexture | null) {
    this.currentMaterial.uniforms.shadowBuffer.value = value
  }

  get shadowLengthBuffer(): Texture | null {
    // Resolve and history render targets are already swapped.
    return this.historyRenderTarget.shadowLength
  }

  get lightShafts(): boolean {
    return this.currentMaterial.shadowLength
  }

  set lightShafts(value: boolean) {
    if (value !== this.lightShafts) {
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
