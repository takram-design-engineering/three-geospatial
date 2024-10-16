import { ShaderChunk } from 'three'

import cascadedFadedLights from './shaders/cascadedFadedLights.glsl'
import cascadedLights from './shaders/cascadedLights.glsl'
import cascadedLightsWithoutShadows from './shaders/cascadedLightsWithoutShadows.glsl'
import defaultLights from './shaders/defaultLights.glsl'
import nonShadowCastingLights from './shaders/nonShadowCastingLights.glsl'

const uniforms = /* glsl */ `
  #include <lights_pars_begin>

  #ifdef CSM
    uniform vec2 csmCascades[CSM_CASCADE_COUNT];
    uniform float csmNear;
    uniform float csmFar;
  #endif
`

function body(shader: string): string {
  return shader.replace(/^\s*void\s+\w+\s*\(\s*\)\s*/m, '')
}

const directionalLights = /* glsl */ `
  #if NUM_DIR_LIGHTS > 0 && defined(RE_Direct)
    DirectionalLight directionalLight;
    #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
      DirectionalLightShadow directionalLightShadow;
    #endif

    #ifdef CSM
      #ifdef USE_SHADOWMAP
        #ifdef CSM_FADE
          ${body(cascadedFadedLights)}
        #else
          ${body(cascadedLights)}
        #endif
      #elif NUM_DIR_LIGHT_SHADOWS > 0
        ${body(cascadedLightsWithoutShadows)}
      #endif

      #if NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS
        ${body(nonShadowCastingLights)}
      #endif
    #else
      ${body(defaultLights)}
    #endif
  #endif
`

interface ReplaceRangeParams {
  source: string
  startLine: string
  endLine: string
  replacement: string
}

function findAndReplace({
  source,
  startLine,
  endLine,
  replacement
}: ReplaceRangeParams): string {
  const startText = `\n${startLine}\n`
  const startIndex = source.indexOf(startText)
  if (startIndex < 0) {
    return source
  }
  const endText = `\n${endLine}\n`
  const endIndex = source.indexOf(endText, startIndex + startText.length)
  if (endIndex < 0) {
    return source
  }
  return (
    source.slice(0, startIndex + 1) +
    replacement +
    source.slice(endIndex + endText.length - 1)
  )
}

export function createFragmentShader(fragmentShader: string): string {
  return fragmentShader
    .replace('#include <lights_pars_begin>', uniforms)
    .replace(
      '#include <lights_fragment_begin>',
      findAndReplace({
        source: ShaderChunk.lights_fragment_begin,
        startLine: '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
        endLine: '#endif',
        replacement: directionalLights
      })
    )
}
