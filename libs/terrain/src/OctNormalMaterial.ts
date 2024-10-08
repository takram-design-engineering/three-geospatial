/// <reference types="vite-plugin-glsl/ext" />

import {
  MeshNormalMaterial,
  ShaderChunk,
  ShaderLib,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer
} from 'three'

import octNormal from './shaders/octNormal.glsl'

const vertexShader =
  /* glsl */ `` +
  ShaderLib.normal.vertexShader
    .replace(
      /* glsl */ `#include <normal_pars_vertex>`,
      ShaderChunk.normal_pars_vertex.replace(
        /* glsl */ `varying vec3 vNormal;`,
        /* glsl */ `
          #ifdef OCT_NORMAL_FLAT_SHADED
          flat out vec3 vNormal;
          #else
          out vec3 vNormal;
          #endif
          attribute float packedOctNormal;
          ${octNormal}
        `
      )
    )
    .replace(
      /* glsl */ `#include <beginnormal_vertex>`,
      /* glsl */ `vec3 objectNormal = decodeOctNormal(packedOctNormal);`
    )

const fragmentShader =
  /* glsl */ `` +
  ShaderLib.normal.fragmentShader.replace(
    /* glsl */ `#include <normal_pars_fragment>`,
    ShaderChunk.normal_pars_fragment.replace(
      /* glsl */ `varying vec3 vNormal;`,
      /* glsl */ `
        #ifdef OCT_NORMAL_FLAT_SHADED
        flat in vec3 vNormal;
        #else
        in vec3 vNormal;
        #endif
      `
    )
  )

export interface OctNormalMaterialParameters
  extends Partial<MeshNormalMaterial> {}

// TODO: Changing flatShading doesn't update material. (onBeforeCompile is not
// called)
export class OctNormalMaterial extends MeshNormalMaterial {
  private _flatShading = false

  // @ts-expect-error Ignore
  get flatShading(): boolean {
    return false
  }

  set flatShading(value: boolean) {
    if (value !== this._flatShading) {
      this._flatShading = value
      this.needsUpdate = true
    }
  }

  override onBeforeCompile(
    parameters: WebGLProgramParametersWithUniforms,
    renderer: WebGLRenderer
  ): void {
    parameters.vertexShader = vertexShader
    parameters.fragmentShader = fragmentShader
    parameters.defines ??= {}

    if (this._flatShading) {
      parameters.defines.OCT_NORMAL_FLAT_SHADED = 1
    } else {
      delete parameters.defines.OCT_NORMAL_FLAT_SHADED
    }
  }
}
