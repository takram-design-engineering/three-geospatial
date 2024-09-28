/// <reference types="vite-plugin-glsl/ext" />

import {
  ShaderChunk,
  ShaderLib,
  ShaderMaterial,
  type ShaderMaterialParameters
} from 'three'

import octNormal from './shaders/octNormal.glsl'

const fragmentShader = ShaderLib.normal.fragmentShader.replace(
  /* glsl */ `#include <normal_pars_fragment>`,
  ShaderChunk.normal_pars_fragment.replace(
    /* glsl */ `varying vec3 vNormal;`,
    /* glsl */ `flat in vec3 vNormal;`
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
        flat out vec3 vNormal;
        attribute float packedOctNormal;
        ${octNormal}
      `
      )
    )
    .replace(
      /* glsl */ `#include <beginnormal_vertex>`,
      /* glsl */ `
      #ifdef USE_OCT_NORMAL
        vec3 objectNormal = decodeOctNormal(packedOctNormal);
      #else
        #include <beginnormal_vertex>
      #endif
      `
    )

export interface TerrainMaterialParameters
  extends Partial<ShaderMaterialParameters> {
  useOctNormal?: boolean
}

export class TerrainMaterial extends ShaderMaterial {
  constructor({
    useOctNormal = true,
    ...params
  }: TerrainMaterialParameters = {}) {
    super({
      ...params,
      fragmentShader,
      vertexShader,
      uniforms: {
        ...ShaderLib.normal.uniforms
      }
    })
    this.useOctNormal = useOctNormal
  }

  get useOctNormal(): boolean {
    return this.defines.USE_OCT_NORMAL === '1'
  }

  set useOctNormal(value: boolean) {
    if (this.useOctNormal !== value) {
      if (value) {
        this.defines.USE_OCT_NORMAL = '1'
      } else {
        delete this.defines.USE_OCT_NORMAL
      }
      this.needsUpdate = true
    }
  }
}
