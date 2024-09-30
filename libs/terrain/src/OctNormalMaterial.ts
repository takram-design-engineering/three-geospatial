/// <reference types="vite-plugin-glsl/ext" />

import {
  MeshNormalMaterial,
  ShaderChunk,
  ShaderLib,
  type WebGLProgramParametersWithUniforms
} from 'three'

import octNormal from './shaders/octNormal.glsl'

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

export interface OctNormalMaterialParameters
  extends Partial<MeshNormalMaterial> {}

export class OctNormalMaterial extends MeshNormalMaterial {
  private currentFlatShading = false

  onBeforeRender(): void {
    // Disable built-in flat shading codes.
    this.currentFlatShading = this.flatShading
    this.flatShading = false
  }

  onBeforeCompile(parameters: WebGLProgramParametersWithUniforms): void {
    parameters.fragmentShader = fragmentShader
    parameters.vertexShader = vertexShader
    parameters.defines ??= {}

    if (this.currentFlatShading) {
      parameters.defines.OCT_NORMAL_FLAT_SHADED = 1
    } else {
      delete parameters.defines.OCT_NORMAL_FLAT_SHADED
    }
    this.flatShading = this.currentFlatShading
  }
}
