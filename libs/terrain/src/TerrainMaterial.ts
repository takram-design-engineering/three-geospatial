/// <reference types="vite-plugin-glsl/ext" />

import {
  ShaderChunk,
  ShaderLib,
  ShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
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
  /* glsl */ `
  uniform vec3 tileCenter;
  uniform vec2 minMaxHeight;
  ` +
  ShaderLib.normal.vertexShader
    .replace(
      /* glsl */ `#include <begin_vertex>`,
      /* glsl */ `
      #include <begin_vertex>
      transformed.z = minMaxHeight.x + (minMaxHeight.y - minMaxHeight.x) * transformed.z;
    `
    )
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
    // .replace(
    //   /* glsl */ `#include <beginnormal_vertex>`,
    //   /* glsl */ `vec3 objectNormal = decodeOct(encodedNormal);`
    // )
    // For debugging
    .replace(
      /* glsl */ `#include <defaultnormal_vertex>`,
      /* glsl */ `vec3 transformedNormal = normalize(decodeOct(encodedNormal));`
    )

export interface TerrainMaterialParameters
  extends Partial<ShaderMaterialParameters> {}

export class TerrainMaterial extends ShaderMaterial {
  constructor(params: TerrainMaterialParameters) {
    super({
      ...params,
      fragmentShader,
      vertexShader,
      uniforms: {
        ...ShaderLib.normal.uniforms,
        tileCenter: new Uniform(new Vector3()),
        minMaxHeight: new Uniform(new Vector2(0, 1))
      }
    })
  }

  get centerX(): number {
    return this.uniforms.tileCenter.value.x
  }

  set centerX(value: number) {
    this.uniforms.tileCenter.value.x = value
  }

  get centerY(): number {
    return this.uniforms.tileCenter.value.y
  }

  set centerY(value: number) {
    this.uniforms.tileCenter.value.y = value
  }

  get centerZ(): number {
    return this.uniforms.tileCenter.value.z
  }

  set centerZ(value: number) {
    this.uniforms.tileCenter.value.z = value
  }

  get minHeight(): number {
    return this.uniforms.minMaxHeight.value.x
  }

  set minHeight(value: number) {
    this.uniforms.minMaxHeight.value.x = value
  }

  get maxHeight(): number {
    return this.uniforms.minMaxHeight.value.y
  }

  set maxHeight(value: number) {
    this.uniforms.minMaxHeight.value.y = value
  }
}
