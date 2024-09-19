// See: https://github.com/NASA-AMMOS/3DTilesRendererJS/tree/master/example/src/plugins

import { Material, MathUtils, type Object3D } from 'three'
import invariant from 'tiny-invariant'

const { clamp } = MathUtils

interface State {
  fadeInTarget: number
  fadeOutTarget: number
  fadeIn: number
  fadeOut: number
}

interface Params {
  fadeIn: { value: number }
  fadeOut: { value: number }
}

export class FadeManager {
  duration = 250
  fadeCount = 0

  private lastTick = -1
  private readonly fadeState = new Map<Object3D, State>()
  private readonly fadeParams = new WeakMap<Material, Params>()

  onFadeComplete?: (object: Object3D) => void
  onFadeStart?: (object: Object3D) => void
  onFadeSetComplete?: () => void
  onFadeSetStart?: () => void

  // Initialize materials in the object.
  prepareObject(object: Object3D): void {
    object.traverse(child => {
      if ('material' in child && child.material instanceof Material) {
        this.prepareMaterial(child.material)
      }
    })
  }

  // Delete the object from the fade, reset the material data.
  deleteObject(object: Object3D): void {
    this.completeFade(object)

    const fadeParams = this.fadeParams
    object.traverse(child => {
      if ('material' in child && child.material instanceof Material) {
        const material = child.material
        fadeParams.delete(material)
        material.onBeforeCompile = () => {}
        material.needsUpdate = true
      }
    })
  }

  // Initialize the material.
  prepareMaterial(material: Material): void {
    const fadeParams = this.fadeParams
    if (fadeParams.has(material)) {
      return
    }

    const params = {
      fadeIn: { value: 0 },
      fadeOut: { value: 0 }
    }

    material.defines = {
      FEATURE_FADE: 0
    }

    material.onBeforeCompile = shader => {
      shader.uniforms = {
        ...shader.uniforms,
        ...params
      }

      shader.fragmentShader = shader.fragmentShader
        .replace(
          /void main\(/,
          value => /* glsl */ `
          #if FEATURE_FADE
          // Adapted from https://www.shadertoy.com/view/Mlt3z8
          float bayerDither2x2(vec2 v) {
            return mod(3.0 * v.y + 2.0 * v.x, 4.0);
          }

          float bayerDither4x4(vec2 v) {
            vec2 P1 = mod(v, 2.0);
            vec2 P2 = floor(0.5 * mod(v, 4.0));
            return 4.0 * bayerDither2x2(P1) + bayerDither2x2(P2);
          }

          uniform float fadeIn;
          uniform float fadeOut;
          #endif

					${value}
				`
        )
        .replace(
          /#include <dithering_fragment>/,
          value => /* glsl */ `
					${value}

          #if FEATURE_FADE
          float bayerValue = bayerDither4x4(floor(mod(gl_FragCoord.xy, 4.0)));
          float bayerBins = 16.0;
          float dither = (0.5 + bayerValue) / bayerBins;
          if (dither >= fadeIn) {
            discard;
          }
          if (dither < fadeOut) {
            discard;
          }
          #endif
				`
        )
    }

    fadeParams.set(material, params)
  }

  // Ensure we're storing a fade timer for the provided object.
  // Returns whether a new state had to be added.
  guaranteeState(object: Object3D): boolean {
    const fadeState = this.fadeState
    if (fadeState.has(object)) {
      return false
    }

    const state = {
      fadeInTarget: 0,
      fadeOutTarget: 0,
      fadeIn: 0,
      fadeOut: 0
    }

    fadeState.set(object, state)

    const fadeParams = this.fadeParams
    object.traverse(child => {
      if ('material' in child && child.material instanceof Material) {
        const material = child.material
        if (fadeParams.has(material)) {
          const params = fadeParams.get(material)
          invariant(params != null)
          params.fadeIn.value = 0
          params.fadeOut.value = 0
        }
      }
    })

    return true
  }

  // Force the fade to complete in the direction it is already trending.
  completeFade(object: Object3D): void {
    const fadeState = this.fadeState
    if (!fadeState.has(object)) {
      return
    }

    fadeState.delete(object)
    object.traverse(child => {
      if ('material' in child && child.material instanceof Material) {
        const material = child.material
        if (material.defines?.FEATURE_FADE !== 0) {
          material.defines ??= {}
          material.defines.FEATURE_FADE = 0
          material.needsUpdate = true
        }
      }
    })

    // Fire events.
    this.fadeCount--

    if (this.onFadeComplete != null) {
      this.onFadeComplete(object)
    }

    if (this.fadeCount === 0 && this.onFadeSetComplete != null) {
      this.onFadeSetComplete()
    }
  }

  completeAllFades(): void {
    this.fadeState.forEach((value, key) => {
      this.completeFade(key)
    })
  }

  forEachObject(callback: (object: Object3D) => void): void {
    this.fadeState.forEach((info, object) => {
      callback(object)
    })
  }

  // Fade the object in.
  fadeIn(object: Object3D): void {
    const noState = this.guaranteeState(object)
    const state = this.fadeState.get(object)
    invariant(state != null)
    state.fadeInTarget = 1
    state.fadeOutTarget = 0
    state.fadeOut = 0

    // Fire events.
    if (noState) {
      this.fadeCount++
      if (this.fadeCount === 1 && this.onFadeSetStart != null) {
        this.onFadeSetStart()
      }

      if (this.onFadeStart != null) {
        this.onFadeStart(object)
      }
    }
  }

  // Fade the object out.
  fadeOut(object: Object3D): void {
    const noState = this.guaranteeState(object)
    const state = this.fadeState.get(object)
    invariant(state != null)
    state.fadeOutTarget = 1

    // Fire events and initialize state.
    if (noState) {
      state.fadeInTarget = 1
      state.fadeIn = 1

      this.fadeCount++
      if (this.fadeCount === 1 && this.onFadeSetStart != null) {
        this.onFadeSetStart()
      }

      if (this.onFadeStart != null) {
        this.onFadeStart(object)
      }
    }
  }

  // Tick the fade timer for each actively fading object.
  update(): void {
    // Clamp delta in case duration is really small or 0.
    const time = window.performance.now()
    if (this.lastTick === -1) {
      this.lastTick = time
    }

    const delta = clamp((time - this.lastTick) / this.duration, 0, 1)
    this.lastTick = time

    const fadeState = this.fadeState
    const fadeParams = this.fadeParams
    fadeState.forEach((state, object) => {
      // Tick the fade values.
      const { fadeOutTarget, fadeInTarget } = state

      let { fadeOut, fadeIn } = state

      const fadeInSign = Math.sign(fadeInTarget - fadeIn)
      fadeIn = clamp(fadeIn + fadeInSign * delta, 0, 1)

      const fadeOutSign = Math.sign(fadeOutTarget - fadeOut)
      fadeOut = clamp(fadeOut + fadeOutSign * delta, 0, 1)

      state.fadeIn = fadeIn
      state.fadeOut = fadeOut

      // Update the material fields.
      const defineValue = Number(
        fadeOut !== fadeOutTarget || fadeIn !== fadeInTarget
      )
      object.traverse(child => {
        if ('material' in child && child.material instanceof Material) {
          const material = child.material
          if (fadeParams.has(material)) {
            const uniforms = fadeParams.get(material)
            invariant(uniforms != null)
            uniforms.fadeIn.value = fadeIn
            uniforms.fadeOut.value = fadeOut

            if (defineValue !== material.defines?.FEATURE_FADE) {
              material.defines ??= {}
              material.defines.FEATURE_FADE = defineValue
              material.needsUpdate = true
            }
          }
        }
      })

      // Check if the fade in and fade out animations are complete.
      const fadeOutComplete = fadeOut === 1 || fadeOut === 0
      const fadeInComplete = fadeIn === 1 || fadeIn === 0

      // If they are or the fade out animation is further along than the fade in
      // animation then mark the fade as completed for this tile.
      if ((fadeOutComplete && fadeInComplete) || fadeOut >= fadeIn) {
        this.completeFade(object)
      }
    })
  }
}
