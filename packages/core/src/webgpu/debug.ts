import { Camera, Mesh, Scene } from 'three'
import { positionGeometry, vec4 } from 'three/tsl'
import { NodeMaterial, type Node, type Renderer } from 'three/webgpu'

import { QuadGeometry } from '../QuadGeometry'

async function debugShader(
  renderer: Renderer,
  mesh: Mesh
): Promise<
  Awaited<{
    fragmentShader: string | null
    vertexShader: string | null
  }>
> {
  return await renderer.debug
    .getShaderAsync(new Scene(), new Camera(), mesh)
    .then(result => {
      return result
    })
    .catch((error: unknown) => {
      console.error(error)
      return { fragmentShader: null, vertexShader: null }
    })
}

export function debugFragmentNode(
  renderer: Renderer,
  material: NodeMaterial
): void {
  const mesh = new Mesh(new QuadGeometry(), material)
  void debugShader(renderer, mesh)
    .then(result => {
      console.log(result.fragmentShader)
    })
    .finally(() => {
      mesh.geometry.dispose()
    })
}

export function debugVertexNode(
  renderer: Renderer,
  material: NodeMaterial
): void {
  const mesh = new Mesh(new QuadGeometry(), material)
  void debugShader(renderer, mesh)
    .then(result => {
      console.log(result.vertexShader)
    })
    .finally(() => {
      mesh.geometry.dispose()
    })
}

export function debugNode(renderer: Renderer, node: Node): void {
  const material = new NodeMaterial()
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)
  material.fragmentNode = node
  const mesh = new Mesh(new QuadGeometry(), material)
  void debugShader(renderer, mesh)
    .then(result => {
      console.log(result.fragmentShader)
    })
    .finally(() => {
      material.dispose()
      mesh.geometry.dispose()
    })
}

export function hookFunction<
  T,
  K extends keyof {
    [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: unknown
  },
  Args extends unknown[] = T[K] extends (...args: any[]) => any
    ? Parameters<T[K]>
    : never,
  Result = T[K] extends (...args: any[]) => any ? ReturnType<T[K]> : never
>(target: T, name: K, callback: (...args: Args) => void): T {
  const value = target[name] as (...args: Args) => Result
  target[name] = ((...args: Args): Result => {
    callback(...args)
    return value.apply(target, args)
  }) as any
  return target
}
