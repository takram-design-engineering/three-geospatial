// cSpell:words defaultnormal specularmap envmap

import { ShaderLib, type ShaderLibShader } from 'three'

import { packing } from '@takram/three-geospatial/shaders'

const SETUP = Symbol('SETUP')

declare module 'three' {
  interface ShaderLibShader {
    [SETUP]?: boolean
  }
}

function injectNormal(shader: ShaderLibShader): ShaderLibShader {
  const vertexShader = shader.vertexShader
    .replace(
      /* glsl */ `#include <fog_pars_vertex>`,
      /* glsl */ `
        #include <fog_pars_vertex>
        #include <normal_pars_vertex>
      `
    )
    .replace(
      /* glsl */ `#include <defaultnormal_vertex>`,
      /* glsl */ `
        #include <defaultnormal_vertex>
        #include <normal_vertex>
      `
    )
    .replace(
      /* glsl */ `#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )`,
      /* glsl */ `#if 1`
    )
    .replace(
      /* glsl */ `#include <clipping_planes_vertex>`,
      /* glsl */ `
        #include <clipping_planes_vertex>
        vViewPosition = - mvPosition.xyz;
      `
    )
  shader.vertexShader = /* glsl */ `
    #undef FLAT_SHADED
    varying vec3 vViewPosition;
    ${vertexShader}
  `

  const fragmentShader = shader.fragmentShader
    .replace(
      /#ifndef FLAT_SHADED\s+varying vec3 vNormal;\s+#endif/m,
      /* glsl */ `#include <normal_pars_fragment>`
    )
    .replace(
      /* glsl */ `#include <common>`,
      /* glsl */ `
        #include <common>
        #include <packing>
      `
    )
    .replace(
      /* glsl */ `#include <specularmap_fragment>`,
      /* glsl */ `
        #include <specularmap_fragment>
        #include <normal_fragment_begin>
        #include <normal_fragment_maps>
      `
    )
  shader.fragmentShader = /* glsl */ `
    #undef FLAT_SHADED
    varying vec3 vViewPosition;
    ${fragmentShader}
  `

  return shader
}

function injectGBuffer(
  shader: ShaderLibShader,
  { type }: { type?: 'basic' | 'physical' } = {}
): ShaderLibShader {
  if (shader[SETUP] === true) {
    return shader
  }
  if (type === 'basic') {
    injectNormal(shader)
  }
  const outputBuffer1 =
    type === 'physical'
      ? /* glsl */ `
          vec4(
            packNormalToVec2(normal),
            metalnessFactor,
            roughnessFactor
          )
        `
      : /* glsl */ `
          vec4(
            packNormalToVec2(normal),
            reflectivity,
            0.0
          );
        `
  shader.fragmentShader = /* glsl */ `
    layout(location = 1) out vec4 outputBuffer1;

    #if !defined(USE_ENVMAP)
      uniform float reflectivity;
    #endif // !defined(USE_ENVMAP)

    ${packing}
    ${shader.fragmentShader.replace(
      /}\s*$/m, // Assume the last curly brace is of main()
      /* glsl */ `
          outputBuffer1 = ${outputBuffer1};
        }
      `
    )}
  `
  shader[SETUP] = true
  return shader
}

export function setupMaterialsForGeometryPass(): void {
  injectGBuffer(ShaderLib.lambert)
  injectGBuffer(ShaderLib.phong)
  injectGBuffer(ShaderLib.basic, { type: 'basic' })
  injectGBuffer(ShaderLib.standard, { type: 'physical' })
  injectGBuffer(ShaderLib.physical, { type: 'physical' })
}
