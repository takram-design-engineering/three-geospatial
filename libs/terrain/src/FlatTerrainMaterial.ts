/// <reference types="vite-plugin-glsl/ext" />

import {
  ShaderChunk,
  ShaderLib,
  ShaderMaterial,
  Uniform,
  Vector3,
  type ShaderMaterialParameters
} from 'three'

const fragmentShader = ShaderLib.normal.fragmentShader.replace(
  /* glsl */ `#include <normal_pars_fragment>`,
  ShaderChunk.normal_pars_fragment.replace(
    /* glsl */ `varying vec3 vNormal;`,
    /* glsl */ `flat in vec3 vNormal;`
  )
)

const vertexShader =
  /* glsl */ `
  uniform vec3 minMaxScaleHeight;
  ` +
  ShaderLib.normal.vertexShader
    .replace(
      /* glsl */ `#include <normal_pars_vertex>`,
      ShaderChunk.normal_pars_vertex.replace(
        /* glsl */ `varying vec3 vNormal;`,
        /* glsl */ `flat out vec3 vNormal;`
      )
    )
    .replace(
      /* glsl */ `#include <beginnormal_vertex>`,
      /* glsl */ `
      #include <beginnormal_vertex>
      float relativeHeight = minMaxScaleHeight.y - minMaxScaleHeight.x;
      float heightScale = relativeHeight * minMaxScaleHeight.z;
      vec3 ellipsoidNormal = vec3(0.0, 0.0, 1.0);
      vec3 projection = dot(objectNormal, ellipsoidNormal) * ellipsoidNormal;
      vec3 rejection = objectNormal - projection;
      objectNormal = normalize(projection + rejection * heightScale);
      `
    )
    .replace(
      /* glsl */ `#include <begin_vertex>`,
      /* glsl */ `
      #include <begin_vertex>
      transformed.z =
        (minMaxScaleHeight.x + relativeHeight * transformed.z) *
        minMaxScaleHeight.z;
    `
    )

export interface FlatTerrainMaterialParameters
  extends Partial<ShaderMaterialParameters> {}

export class FlatTerrainMaterial extends ShaderMaterial {
  constructor(params: FlatTerrainMaterialParameters = {}) {
    super({
      ...params,
      fragmentShader,
      vertexShader,
      uniforms: {
        ...ShaderLib.normal.uniforms,
        minMaxScaleHeight: new Uniform(new Vector3(0, 1, 1))
      }
    })
  }

  get minHeight(): number {
    return this.uniforms.minMaxScaleHeight.value.x
  }

  set minHeight(value: number) {
    this.uniforms.minMaxScaleHeight.value.x = value
  }

  get maxHeight(): number {
    return this.uniforms.minMaxScaleHeight.value.y
  }

  set maxHeight(value: number) {
    this.uniforms.minMaxScaleHeight.value.y = value
  }

  get heightScale(): number {
    return this.uniforms.minMaxScaleHeight.value.z
  }

  set heightScale(value: number) {
    this.uniforms.minMaxScaleHeight.value.z = value
  }
}
