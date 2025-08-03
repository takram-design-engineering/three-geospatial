import { Vector3, type Camera } from 'three'
import { reference, uniform } from 'three/tsl'
import type { NodeFrame, UniformNode } from 'three/webgpu'

import type { NodeObject } from './node'

declare module 'three/webgpu' {
  interface Node {
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }
}

let caches: WeakMap<{}, Record<string, {}>> | undefined

// As of r178, the node builder does not automatically dedupe the reference
// nodes to the same object, thus using accessors to the same object with the
// same property multiple times yields duplicated uniforms.
function getCache<T extends {}, U extends {}>(
  object: T,
  name: string,
  callback: () => U
): U {
  caches ??= new WeakMap<{}, Record<string, {}>>()
  let cache = caches.get(object)
  if (cache == null) {
    cache = {}
    caches.set(object, cache)
  }
  return (cache[name] ??= callback()) as U
}

export const projectionMatrix = (camera: Camera): NodeObject<'mat4'> =>
  getCache(camera, 'projectionMatrix', () =>
    reference('projectionMatrix', 'mat4', camera)
  )

export const viewMatrix = (camera: Camera): NodeObject<'mat4'> =>
  getCache(camera, 'viewMatrix', () =>
    reference('matrixWorldInverse', 'mat4', camera)
  )

export const inverseProjectionMatrix = (camera: Camera): NodeObject<'mat4'> =>
  getCache(camera, 'inverseProjectionMatrix', () =>
    reference('projectionMatrixInverse', 'mat4', camera)
  )

export const inverseViewMatrix = (camera: Camera): NodeObject<'mat4'> =>
  getCache(camera, 'inverseViewMatrix', () =>
    reference('matrixWorld', 'mat4', camera)
  )

export const cameraPositionWorld = (
  camera: Camera
): NodeObject<UniformNode<Vector3>> =>
  getCache(camera, 'cameraPositionWorld', () =>
    uniform(new Vector3()).onRenderUpdate((_, self) =>
      self.value.setFromMatrixPosition(camera.matrixWorld)
    )
  )

export const cameraNear = (camera: Camera): NodeObject<'float'> =>
  getCache(camera, 'cameraNear', () => reference('near', 'float', camera))

export const cameraFar = (camera: Camera): NodeObject<'float'> =>
  getCache(camera, 'cameraFar', () => reference('far', 'float', camera))
