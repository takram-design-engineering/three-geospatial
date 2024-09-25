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

const vertexShader = ShaderLib.normal.vertexShader
  .replace(
    /* glsl */ `#include <normal_pars_vertex>`,
    ShaderChunk.normal_pars_vertex.replace(
      /* glsl */ `varying vec3 vNormal;`,
      /* glsl */ `
      flat out vec3 vNormal;
      attribute float encodedNormal;
      ${octNormal}
      `
    )
  )
  .replace(
    /* glsl */ `#include <beginnormal_vertex>`,
    /* glsl */ `
    #include <beginnormal_vertex>
    objectNormal = decodeOct(encodedNormal);
    `
  )

export interface TerrainMaterialParameters
  extends Partial<ShaderMaterialParameters> {}

export class TerrainMaterial extends ShaderMaterial {
  constructor(params: TerrainMaterialParameters) {
    super({
      ...params,
      fragmentShader,
      vertexShader,
      uniforms: ShaderLib.normal.uniforms
    })
  }
}
