import { Vector3, type Camera } from 'three'
import { reference, uniform } from 'three/tsl'
import type { UniformNode } from 'three/webgpu'

import type { Node } from './node'

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

export const projectionMatrix = (camera: Camera): Node<'mat4'> =>
  getCache(camera, 'projectionMatrix', () =>
    reference('projectionMatrix', 'mat4', camera).setName('projectionMatrix')
  )

export const viewMatrix = (camera: Camera): Node<'mat4'> =>
  getCache(camera, 'viewMatrix', () =>
    reference('matrixWorldInverse', 'mat4', camera).setName('viewMatrix')
  )

export const inverseProjectionMatrix = (camera: Camera): Node<'mat4'> =>
  getCache(camera, 'inverseProjectionMatrix', () =>
    reference('projectionMatrixInverse', 'mat4', camera).setName(
      'inverseProjectionMatrix'
    )
  )

export const inverseViewMatrix = (camera: Camera): Node<'mat4'> =>
  getCache(camera, 'inverseViewMatrix', () =>
    reference('matrixWorld', 'mat4', camera).setName('inverseViewMatrix')
  )

export const cameraPositionWorld = (camera: Camera): UniformNode<Vector3> =>
  getCache(camera, 'cameraPositionWorld', () =>
    uniform(new Vector3())
      .setName('cameraPositionWorld')
      .onRenderUpdate((_, { value }) => {
        value.setFromMatrixPosition(camera.matrixWorld)
      })
  )

export const cameraNear = (camera: Camera): Node<'float'> =>
  getCache(camera, 'cameraNear', () =>
    reference('near', 'float', camera).setName('cameraNear')
  )

export const cameraFar = (camera: Camera): Node<'float'> =>
  getCache(camera, 'cameraFar', () =>
    reference('far', 'float', camera).setName('cameraFar')
  )
