// Ported to TSL from: https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/v0.4.14/src/three/plugins/fade/wrapFadeMaterial.js

import { Discard, Fn, If, output, screenCoordinate, uniform } from 'three/tsl'
import type { NodeMaterial } from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'
import { FnLayout } from '@takram/three-geospatial/webgpu'

import type { FadeParams } from './FadeMaterialManager'

const FADE_PARAMS = Symbol('FADE_PARAMS')

interface FadeNodeMaterial extends NodeMaterial {
  [FADE_PARAMS]?: FadeParams
  params?: FadeParams
  defines?: Record<string, unknown>
}

const bayerDither2x2 = FnLayout({
  name: 'bayerDither2x2',
  type: 'float',
  inputs: [{ name: 'v', type: 'vec2' }]
})(([v]) => {
  return v.y.mul(3).add(v.x.mul(2)).mod(4)
})

const bayerDither4x4 = FnLayout({
  name: 'bayerDither4x4',
  type: 'float',
  inputs: [{ name: 'v', type: 'vec2' }]
})(([v]) => {
  const P1 = v.mod(2)
  const P2 = v.mod(4).mul(0.5).floor()
  return bayerDither2x2(P1).mul(4).add(bayerDither2x2(P2))
})

// Define shared uniforms for fadeIn/fadeOut so that "outputNode" can be cached.
const fadeIn = uniform(0).onObjectUpdate(({ material }) =>
  material != null
    ? ((material as FadeNodeMaterial)?.params?.fadeIn.value ?? 0)
    : 0
)
const fadeOut = uniform(0).onObjectUpdate(({ material }) =>
  material != null
    ? ((material as FadeNodeMaterial)?.params?.fadeOut.value ?? 0)
    : 0
)

const outputNode = Fn(() => {
  const bayerValue = bayerDither4x4(screenCoordinate.xy.mod(4).floor())
  const bayerBins = 16
  const dither = bayerValue.add(0.5).div(bayerBins)

  If(dither.greaterThanEqual(fadeIn), () => {
    Discard()
  })
  If(dither.lessThan(fadeOut), () => {
    Discard()
  })
  return output
})()

export function wrapFadeNodeMaterial(material: NodeMaterial): FadeParams {
  reinterpretType<FadeNodeMaterial>(material)

  if (material[FADE_PARAMS] != null) {
    return material[FADE_PARAMS]
  }

  const params: FadeParams = {
    fadeIn: { value: 0 },
    fadeOut: { value: 0 },
    fadeTexture: { value: null }
  }

  let FEATURE_FADE = 0

  // Use the interface used in non-node materials:
  material.params = params
  material.defines = {
    get FEATURE_FADE() {
      return FEATURE_FADE
    },

    set FEATURE_FADE(value: number) {
      if (value !== FEATURE_FADE) {
        FEATURE_FADE = value
        material.outputNode = value === 1 ? outputNode : null
      }
    }
  }

  return params
}
