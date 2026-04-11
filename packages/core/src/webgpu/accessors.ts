import type { Camera, Vector3 } from 'three'
import {
  cameraFar as cameraFarTSL,
  cameraNear as cameraNearTSL,
  cameraPosition,
  cameraProjectionMatrix,
  cameraProjectionMatrixInverse,
  cameraViewMatrix,
  cameraWorldMatrix,
  reference,
  uniform
} from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'

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

export const projectionMatrix = (camera?: Camera | null): Node<'mat4'> =>
  camera != null
    ? getCache(camera, 'projectionMatrix', () =>
        reference('projectionMatrix', 'mat4', camera).setName(
          'projectionMatrix'
        )
      )
    : cameraProjectionMatrix

export const viewMatrix = (camera?: Camera | null): Node<'mat4'> =>
  camera != null
    ? getCache(camera, 'viewMatrix', () =>
        reference('matrixWorldInverse', 'mat4', camera).setName('viewMatrix')
      )
    : cameraViewMatrix

export const inverseProjectionMatrix = (
  camera?: Camera | null
): Node<'mat4'> =>
  camera != null
    ? getCache(camera, 'inverseProjectionMatrix', () =>
        reference('projectionMatrixInverse', 'mat4', camera).setName(
          'inverseProjectionMatrix'
        )
      )
    : cameraProjectionMatrixInverse

export const inverseViewMatrix = (camera?: Camera | null): Node<'mat4'> =>
  camera != null
    ? getCache(camera, 'inverseViewMatrix', () =>
        reference('matrixWorld', 'mat4', camera).setName('inverseViewMatrix')
      )
    : cameraWorldMatrix // TODO: Not always

export const cameraPositionWorld = (
  camera?: Camera | null
): UniformNode<Vector3> =>
  camera != null
    ? getCache(camera, 'cameraPositionWorld', () =>
        uniform('vec3')
          .setName('cameraPositionWorld')
          .onRenderUpdate((_, { value }) => {
            value.setFromMatrixPosition(camera.matrixWorld)
          })
      )
    : cameraPosition

export const cameraNear = (camera?: Camera | null): Node<'float'> =>
  camera != null
    ? getCache(camera, 'cameraNear', () =>
        reference('near', 'float', camera).setName('cameraNear')
      )
    : cameraNearTSL

export const cameraFar = (camera?: Camera | null): Node<'float'> =>
  camera != null
    ? getCache(camera, 'cameraFar', () =>
        reference('far', 'float', camera).setName('cameraFar')
      )
    : cameraFarTSL
