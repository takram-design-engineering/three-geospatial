import { Texture, type Mesh } from 'three'
import { attribute, Fn, texture, uniform } from 'three/tsl'
import type { NodeFrame, NodeMaterial } from 'three/webgpu'

import type { OverlayParams } from './WaterAreaOverlayPlugin'

const OVERLAY_PARAMS = Symbol('OVERLAY_PARAMS')

interface OverlayParamsHost {
  [OVERLAY_PARAMS]?: OverlayParams
  defines?: Record<string, unknown>
}

function getOverlayParams({
  material,
  object
}: NodeFrame): OverlayParams | undefined {
  return (
    (material as OverlayParamsHost)[OVERLAY_PARAMS] ??
    (object as OverlayParamsHost)[OVERLAY_PARAMS]
  )
}

const emptyTexture = new Texture()

const layerMap = texture().onObjectUpdate((frame, self) => {
  const params = getOverlayParams(frame)
  self.value = params?.layerMaps.value[0] ?? emptyTexture
})

// WORKAROUND: ImageBitmap with imageOrientation='flipY' flips the UV in WebGPU
// renderer.
const layerMapFlipY = uniform('bool').onObjectUpdate((frame, self) => {
  const params = getOverlayParams(frame)
  self.value = params?.layerMaps.value[0]?.image instanceof ImageBitmap
})

const layerUV = attribute('layer_uv_0', 'vec3').toVarying('layerUV0')

export const waterAreaMask = Fn(() => {
  const uv = layerMapFlipY.select(layerUV.xy.flipY(), layerUV.xy).uniformFlow()
  return layerMap.sample(uv).r
})().toVar('waterAreaMask')

export function wrapWaterAreaNodeMaterial(
  material: NodeMaterial & OverlayParamsHost,
  mesh: Mesh & OverlayParamsHost
): OverlayParams {
  if (material[OVERLAY_PARAMS] != null) {
    return material[OVERLAY_PARAMS]
  }

  const params: OverlayParams = {
    layerMaps: { value: [] },
    layerInfo: { value: [] }
  }
  material[OVERLAY_PARAMS] = params

  // onObjectUpdate on uniforms are called with the material provided to the
  // wrap function and shadow materials, in which overlay params are not stored.
  // Store it in the object as well, as we need it for castShadowNode.
  mesh[OVERLAY_PARAMS] = params

  let layerCount = 0

  // Use the same interface used for non-node materials:
  material.defines = {
    ...material.defines,

    get LAYER_COUNT() {
      return layerCount
    },

    set LAYER_COUNT(value: number) {
      if (value !== layerCount) {
        layerCount = value
      }
    }
  }

  return params
}
