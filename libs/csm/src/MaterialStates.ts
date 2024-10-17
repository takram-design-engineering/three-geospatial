// Based on the following work:
// https://github.com/StrandedKitty/three-csm/tree/master/src
// https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm

import { type Material, type WebGLProgramParametersWithUniforms } from 'three'

import { type CascadedShadowMaps } from './CascadedShadowMaps'
import { createFragmentShader } from './createFragmentShader'

type OnBeforeCompile = Material['onBeforeCompile']

export interface MaterialState {
  parameters?: WebGLProgramParametersWithUniforms
  originalHandler?: OnBeforeCompile
}

export class MaterialStates {
  private readonly map = new Map<Material, MaterialState>()

  // TODO: This may leak memory for a large number of material shaders.
  private readonly shaderCache = new Map<string, string>()

  setup<T extends Material>(material: T, csm: CascadedShadowMaps): T {
    if (this.map.has(material)) {
      return material
    }

    material.defines ??= {}
    material.defines.CSM = 1
    material.defines.CSM_CASCADE_COUNT = csm.cascadeCount
    if (csm.fade) {
      material.defines.CSM_FADE = 1
    }

    const stateRef: MaterialState = {}
    this.map.set(material, stateRef)

    const handleBeforeCompile: OnBeforeCompile = parameters => {
      stateRef.parameters = parameters

      const cascades = csm.cascades
      const near = csm.mainCamera.near
      const far = Math.min(csm.mainCamera.far, csm.far)
      const uniforms = parameters.uniforms
      uniforms.csmCascades = { value: cascades }
      uniforms.csmNear = { value: near }
      uniforms.csmFar = { value: far }

      let shader = this.shaderCache.get(parameters.shaderID)
      if (shader == null) {
        shader = createFragmentShader(parameters.fragmentShader)
        this.shaderCache.set(parameters.shaderID, shader)
      }
      parameters.fragmentShader = shader
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalHandler = material.onBeforeCompile
    if (Object.prototype.hasOwnProperty.call(material, 'hasOwnProperty')) {
      stateRef.originalHandler = originalHandler
    }
    material.onBeforeCompile = (...args) => {
      originalHandler.apply(material, args)
      handleBeforeCompile(...args)
    }

    const handleDispose = (): void => {
      // Just discard it from our state map without rolling it back.
      this.map.delete(material)
      material.removeEventListener('dispose', handleDispose)
    }
    material.addEventListener('dispose', handleDispose)

    return material
  }

  update(csm: CascadedShadowMaps): void {
    const cascadeCount = csm.cascadeCount
    const fade = csm.fade
    const cascades = csm.cascades
    const near = csm.mainCamera.near
    const far = Math.min(csm.mainCamera.far, csm.far)

    for (const [material, state] of this.map.entries()) {
      const defines = material.defines
      if (defines != null) {
        let needsUpdate = false
        if ((defines.CSM_FADE != null) !== fade) {
          if (fade) {
            defines.CSM_FADE = 1
          } else {
            delete defines.CSM_FADE
          }
          needsUpdate = true
        }
        if (defines.CSM_CASCADE_COUNT !== cascadeCount) {
          defines.CSM_CASCADE_COUNT = cascadeCount
          needsUpdate = true
        }
        if (needsUpdate) {
          material.needsUpdate = true
        }
      }

      const uniforms = state.parameters?.uniforms
      if (uniforms != null) {
        uniforms.csmCascades.value = cascades
        uniforms.csmNear.value = near
        uniforms.csmFar.value = far
      }
    }
  }

  rollback<T extends Material>(material: T): T {
    const state = this.map.get(material)
    return state != null ? this.rollbackToState(material, state) : material
  }

  private rollbackToState<T extends Material>(
    material: T,
    { parameters, originalHandler }: MaterialState
  ): T {
    if (parameters != null) {
      // TODO: Do we really need to delete uniforms when materials are going to
      // be updated anyways?
      delete parameters.uniforms.csmCascades
      delete parameters.uniforms.csmNear
      delete parameters.uniforms.csmFar
    }
    if (originalHandler != null) {
      material.onBeforeCompile = originalHandler
    } else {
      // @ts-expect-error Restore the prototype function by deleting the handler
      // we've assigned above.
      delete material.onBeforeCompile
    }
    if (material.defines != null) {
      delete material.defines.CSM
      delete material.defines.CSM_CASCADE_COUNT
      delete material.defines.CSM_FADE
    }
    material.needsUpdate = true

    this.map.delete(material)
    return material
  }

  dispose(): void {
    for (const [material, state] of this.map) {
      this.rollbackToState(material, state)
    }
    this.map.clear()
    this.shaderCache.clear()
  }
}
