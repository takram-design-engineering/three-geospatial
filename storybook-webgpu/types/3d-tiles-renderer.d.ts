declare module '3d-tiles-renderer/src/three/plugins/fade/wrapFadeMaterial.js' {
  import type { Material } from 'three'

  export function wrapFadeMaterial(
    material: Material,
    previousOnBeforeCompile: unknown
  ): FadeParams
}

declare module '3d-tiles-renderer/src/three/plugins/fade/FadeMaterialManager.js' {
  import type { Material } from 'three'

  export class FadeMaterialManager {
    protected prepareMaterial(material: Material): void
  }
}
