/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { EffectComposerContext } from '@react-three/postprocessing'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import {
  Matrix4,
  Uniform,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { type EffectProps } from './types'

import fragmentShader from './shaders/normal.frag'

export interface NormalEffectOptions {
  blendFunction?: BlendFunction
  normalBuffer?: Texture | null
  reconstructFromDepth?: boolean
}

export class NormalEffect extends Effect {
  constructor(
    private camera: Camera,
    {
      blendFunction = BlendFunction.NORMAL,
      normalBuffer = null,
      reconstructFromDepth = false
    }: NormalEffectOptions = {}
  ) {
    super('NormalEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['normalBuffer', new Uniform(normalBuffer)],
        ['projectionMatrix', new Uniform(new Matrix4())],
        ['inverseProjectionMatrix', new Uniform(new Matrix4())],
        ['inverseViewMatrix', new Uniform(new Matrix4())]
      ])
    })
    if (camera != null) {
      this.mainCamera = camera
    }
    this.reconstructFromDepth = reconstructFromDepth
  }

  get mainCamera(): Camera {
    return this.camera
  }

  override set mainCamera(value: Camera) {
    this.camera = value
  }

  initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: number
  ): void {
    super.initialize(renderer, alpha, frameBufferType)
    if (renderer.capabilities.logarithmicDepthBuffer) {
      this.defines.set('LOG_DEPTH', '1')
    } else {
      this.defines.delete('LOG_DEPTH')
    }
  }

  update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    const uniforms = this.uniforms
    const projectionMatrix = uniforms.get('projectionMatrix')!
    const inverseProjectionMatrix = uniforms.get('inverseProjectionMatrix')!
    const inverseViewMatrix = uniforms.get('inverseViewMatrix')!
    const camera = this.camera
    if (camera != null) {
      projectionMatrix.value.copy(camera.projectionMatrix)
      inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
      inverseViewMatrix.value.copy(camera.matrixWorld)
    }
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer')!.value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer')!.value = value
  }

  get reconstructFromDepth(): boolean {
    return this.defines.has('RECONSTRUCT_FROM_DEPTH')
  }

  set reconstructFromDepth(value: boolean) {
    if (value !== this.reconstructFromDepth) {
      if (value) {
        this.defines.set('RECONSTRUCT_FROM_DEPTH', '1')
      } else {
        this.defines.delete('RECONSTRUCT_FROM_DEPTH')
      }
      this.setChanged()
    }
  }
}

export interface NormalProps extends EffectProps<typeof NormalEffect> {}

export const Normal = forwardRef<NormalEffect, NormalProps>(function Normal(
  { blendFunction, ...props },
  forwardedRef
) {
  const { camera, normalPass } = useContext(EffectComposerContext)
  const effect = useMemo(
    () => new NormalEffect(camera, { blendFunction }),
    [camera, blendFunction]
  )
  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return (
    <primitive
      ref={forwardedRef}
      object={effect}
      mainCamera={camera}
      normalBuffer={normalPass?.texture ?? null}
      {...props}
    />
  )
})
