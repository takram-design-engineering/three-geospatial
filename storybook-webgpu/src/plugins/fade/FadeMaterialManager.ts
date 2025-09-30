import { FadeMaterialManager as FadeMaterialManagerBase } from '3d-tiles-renderer/src/three/plugins/fade/FadeMaterialManager.js'
import { wrapFadeMaterial } from '3d-tiles-renderer/src/three/plugins/fade/wrapFadeMaterial.js'
import type { Material } from 'three'
import { NodeMaterial } from 'three/webgpu'

import { wrapFadeNodeMaterial } from './wrapFadeNodeMaterial'

export interface FadeParams {
  fadeIn: { value: number }
  fadeOut: { value: number }
  fadeTexture: { value: unknown }
}

export class FadeMaterialManager extends FadeMaterialManagerBase {
  declare protected _fadeParams: WeakMap<Material, FadeParams>

  // HACK: Override "wrapFadeMaterial" to support NodeMaterial:
  override prepareMaterial(material: Material): void {
    const fadeParams = this._fadeParams
    if (fadeParams.has(material)) {
      return
    }

    let params
    if (material instanceof NodeMaterial) {
      params = wrapFadeNodeMaterial(material)
    } else {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      params = wrapFadeMaterial(material, material.onBeforeCompile)
    }
    fadeParams.set(material, params)
  }
}
