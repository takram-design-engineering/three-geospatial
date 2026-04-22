import { Camera, Mesh, Scene } from 'three'
import { positionGeometry, vec4 } from 'three/tsl'
import { NodeMaterial, type Node, type Renderer } from 'three/webgpu'

import { QuadGeometry } from '../QuadGeometry'

async function debugShader(
  renderer: Renderer,
  material: NodeMaterial
): Promise<{
  vertexShader: string | null
  fragmentShader: string | null
}> {
  const mesh = new Mesh(new QuadGeometry(), material)
  try {
    return await renderer.debug.getShaderAsync(new Scene(), new Camera(), mesh)
  } catch (error: unknown) {
    console.error(error)
    return { vertexShader: null, fragmentShader: null }
  } finally {
    mesh.geometry.dispose()
  }
}

export async function debugMaterial(
  renderer: Renderer,
  material: NodeMaterial
): Promise<string | null> {
  const { vertexShader, fragmentShader } = await debugShader(renderer, material)
  return vertexShader != null && fragmentShader != null
    ? `// Vertex shader\n\n${vertexShader}\n// Fragment shader\n\n${fragmentShader}`
    : null
}

export async function debugVertexNode(
  renderer: Renderer,
  material: NodeMaterial
): Promise<string | null> {
  return (await debugShader(renderer, material)).vertexShader
}

export async function debugFragmentNode(
  renderer: Renderer,
  material: NodeMaterial
): Promise<string | null> {
  return (await debugShader(renderer, material)).fragmentShader
}

export async function debugNode(
  renderer: Renderer,
  node: Node
): Promise<string | null> {
  const material = new NodeMaterial()
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)
  material.fragmentNode = node.toConst('debugNode')
  const shader = await debugShader(renderer, material)
  material.dispose()
  return shader.fragmentShader
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
