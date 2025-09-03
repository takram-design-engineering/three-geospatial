declare module '3d-tiles-renderer/src/three/plugins/fade/wrapFadeMaterial.js' {
  import type { Material } from 'three'

  export function wrapFadeMaterial(
    material: Material,
    previousOnBeforeCompile: unknown
  ): FadeParams
}

declare module '3d-tiles-renderer/src/three/plugins/fade/FadeMaterialManager.js' {
  import type { Material } from 'three'

  export interface FadeParams {
    fadeIn: { value: number }
    fadeOut: { value: number }
    fadeTexture: { value: unknown }
  }

  export class FadeMaterialManager {
    protected _fadeParams: WeakMap<Material, FadeParams>
    prepareMaterial(material: Material): void
  }
}
