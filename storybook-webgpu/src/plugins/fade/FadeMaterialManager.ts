import { FadeMaterialManager as FadeMaterialManagerBase } from '3d-tiles-renderer/src/three/plugins/fade/FadeMaterialManager.js'
import { wrapFadeMaterial } from '3d-tiles-renderer/src/three/plugins/fade/wrapFadeMaterial.js'
import type { Material } from 'three'
import { NodeMaterial } from 'three/webgpu'

import { wrapFadeNodeMaterial } from './wrapFadeNodeMaterial'

export class FadeMaterialManager extends FadeMaterialManagerBase {
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
