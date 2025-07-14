import {
  AddEquation,
  Camera,
  ClampToEdgeWrapping,
  CustomBlending,
  FloatType,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  Mesh,
  NoBlending,
  NoColorSpace,
  OneFactor,
  PlaneGeometry,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  Uniform,
  Vector3,
  WebGL3DRenderTarget,
  WebGLRenderTarget,
  type ShaderMaterialParameters,
  type Texture,
  type WebGLRenderer
} from 'three'
import invariant from 'tiny-invariant'

import {
  isFloatLinearSupported,
  resolveIncludes,
  type AnyFloatType
} from '@takram/three-geospatial'

import { AtmosphereParameters } from './AtmosphereParameters'
import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_MU_S_SIZE,
  SCATTERING_TEXTURE_MU_SIZE,
  SCATTERING_TEXTURE_NU_SIZE,
  SCATTERING_TEXTURE_R_SIZE,
  SCATTERING_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'
import { requestIdleCallback } from './helpers/requestIdleCallback'
import type { PrecomputedTextures } from './types'

import common from './shaders/bruneton/common.glsl?raw'
import definitions from './shaders/bruneton/definitions.glsl?raw'
import precompute from './shaders/bruneton/precompute.glsl?raw'
import directIrradianceShader from './shaders/precompute/directIrradiance.frag?raw'
import indirectIrradianceShader from './shaders/precompute/indirectIrradiance.frag?raw'
import multipleScatteringShader from './shaders/precompute/multipleScattering.frag?raw'
import scatteringDensityShader from './shaders/precompute/scatteringDensity.frag?raw'
import singleScatteringShader from './shaders/precompute/singleScattering.frag?raw'
import transmittanceShader from './shaders/precompute/transmittance.frag?raw'

const vertexShader = /* glsl */ `
  precision highp float;
  in vec2 position;
  void main() {
    gl_Position = vec4(position, 1.0, 1.0);
  }
`

function createRenderTarget(
  type: AnyFloatType,
  width: number,
  height: number
): WebGLRenderTarget {
  const renderTarget = new WebGLRenderTarget(width, height, {
    depthBuffer: false,
    type,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  return renderTarget
}

function create3DRenderTarget(
  type: AnyFloatType,
  width: number,
  height: number,
  depth: number
): WebGL3DRenderTarget {
  const renderTarget = new WebGL3DRenderTarget(width, height, depth, {
    depthBuffer: false,
    type,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.wrapR = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  return renderTarget
}

// eslint-disable-next-line @typescript-eslint/promise-function-async
function iterateIdle<T>(iterable: Iterable<T>): Promise<T> {
  const iterator = iterable[Symbol.iterator]()
  return new Promise<T>((resolve, reject) => {
    const callback = (): void => {
      try {
        const { value, done } = iterator.next()
        if (done === true) {
          resolve(value)
        } else {
          requestIdleCallback(callback)
        }
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error())
      }
    }
    requestIdleCallback(callback)
  })
}

async function readRenderTargetPixels(
  renderer: WebGLRenderer,
  renderTarget: WebGLRenderTarget,
  texture: Texture
): Promise<void> {
  const { width, height } = renderTarget
  const imageData =
    texture.type === HalfFloatType
      ? new Uint16Array(width * height * 4)
      : new Float32Array(width * height * 4)
  await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    0,
    0,
    renderTarget.width,
    renderTarget.height,
    imageData
  )
  texture.userData.imageData = imageData
}

class Context {
  lambdas = new Vector3()
  luminanceFromRadiance = new Matrix3()
  opticalDepth?: WebGLRenderTarget
  deltaIrradiance: WebGLRenderTarget
  deltaRayleighScattering: WebGL3DRenderTarget
  deltaMieScattering: WebGL3DRenderTarget
  deltaScatteringDensity: WebGL3DRenderTarget
  deltaMultipleScattering: WebGL3DRenderTarget

  constructor(type: AnyFloatType) {
    if (type === HalfFloatType) {
      this.opticalDepth = createRenderTarget(
        type,
        TRANSMITTANCE_TEXTURE_WIDTH,
        TRANSMITTANCE_TEXTURE_HEIGHT
      )
    }
    this.deltaIrradiance = createRenderTarget(
      type,
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT
    )
    this.deltaRayleighScattering = create3DRenderTarget(
      type,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH
    )
    this.deltaMieScattering = create3DRenderTarget(
      type,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH
    )
    this.deltaScatteringDensity = create3DRenderTarget(
      type,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH
    )
    // deltaMultipleScattering is only needed to compute scattering order 3 or
    // more, while deltaRayleighScattering and deltaMieScattering are only needed
    // to compute double scattering. Therefore, to save memory, we can store
    // deltaRayleighScattering and deltaMultipleScattering in the same GPU
    // texture.
    this.deltaMultipleScattering = this.deltaRayleighScattering
  }

  dispose(): void {
    this.opticalDepth?.dispose()
    this.deltaIrradiance.dispose()
    this.deltaRayleighScattering.dispose()
    this.deltaMieScattering.dispose()
    this.deltaScatteringDensity.dispose()
  }
}

class PrecomputeMaterial extends RawShaderMaterial {
  constructor(params: ShaderMaterialParameters) {
    super({
      glslVersion: GLSL3,
      vertexShader,
      ...params,
      defines: {
        TRANSMITTANCE_TEXTURE_WIDTH: TRANSMITTANCE_TEXTURE_WIDTH.toFixed(0),
        TRANSMITTANCE_TEXTURE_HEIGHT: TRANSMITTANCE_TEXTURE_HEIGHT.toFixed(0),
        SCATTERING_TEXTURE_R_SIZE: SCATTERING_TEXTURE_R_SIZE.toFixed(0),
        SCATTERING_TEXTURE_MU_SIZE: SCATTERING_TEXTURE_MU_SIZE.toFixed(0),
        SCATTERING_TEXTURE_MU_S_SIZE: SCATTERING_TEXTURE_MU_S_SIZE.toFixed(0),
        SCATTERING_TEXTURE_NU_SIZE: SCATTERING_TEXTURE_NU_SIZE.toFixed(0),
        IRRADIANCE_TEXTURE_WIDTH: IRRADIANCE_TEXTURE_WIDTH.toFixed(0),
        IRRADIANCE_TEXTURE_HEIGHT: IRRADIANCE_TEXTURE_HEIGHT.toFixed(0),
        ...params.defines
      }
    })
  }

  // eslint-disable-next-line accessor-pairs
  set additive(value: boolean) {
    this.transparent = value
    this.blending = value ? CustomBlending : NoBlending
    this.blendEquation = AddEquation
    this.blendEquationAlpha = AddEquation
    this.blendSrc = OneFactor
    this.blendDst = OneFactor
    this.blendSrcAlpha = OneFactor
    this.blendDstAlpha = OneFactor
  }

  setUniforms(context: Context): void {
    const uniforms = this.uniforms
    if (uniforms.luminanceFromRadiance != null) {
      uniforms.luminanceFromRadiance.value.copy(context.luminanceFromRadiance)
    }
    if (uniforms.singleRayleighScatteringTexture != null) {
      uniforms.singleRayleighScatteringTexture.value =
        context.deltaRayleighScattering.texture
    }
    if (uniforms.singleMieScatteringTexture != null) {
      uniforms.singleMieScatteringTexture.value =
        context.deltaMieScattering.texture
    }
    if (uniforms.multipleScatteringTexture != null) {
      uniforms.multipleScatteringTexture.value =
        context.deltaMultipleScattering.texture
    }
    if (uniforms.scatteringDensityTexture != null) {
      uniforms.scatteringDensityTexture.value =
        context.deltaScatteringDensity.texture
    }
    if (uniforms.irradianceTexture != null) {
      uniforms.irradianceTexture.value = context.deltaIrradiance.texture
    }
  }
}

export interface PrecomputedTexturesGeneratorOptions {
  type?: AnyFloatType
  combinedScattering?: boolean
  higherOrderScattering?: boolean
}

export class PrecomputedTexturesGenerator {
  readonly transmittanceRenderTarget: WebGLRenderTarget
  readonly scatteringRenderTarget: WebGL3DRenderTarget
  readonly irradianceRenderTarget: WebGLRenderTarget
  readonly singleMieScatteringRenderTarget?: WebGL3DRenderTarget
  readonly higherOrderScatteringRenderTarget?: WebGL3DRenderTarget
  readonly textures: PrecomputedTextures

  transmittanceMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(transmittanceShader, {
      bruneton: {
        common,
        definitions,
        precompute
      }
    })
  })

  directIrradianceMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(directIrradianceShader, {
      bruneton: {
        common,
        definitions,
        precompute
      }
    }),
    uniforms: {
      transmittanceTexture: new Uniform(null)
    }
  })

  singleScatteringMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(singleScatteringShader, {
      bruneton: {
        common,
        definitions,
        precompute
      }
    }),
    uniforms: {
      luminanceFromRadiance: new Uniform(new Matrix3()),
      transmittanceTexture: new Uniform(null),
      layer: new Uniform(0)
    }
  })

  scatteringDensityMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(scatteringDensityShader, {
      bruneton: {
        common,
        definitions,
        precompute
      }
    }),
    uniforms: {
      transmittanceTexture: new Uniform(null),
      singleRayleighScatteringTexture: new Uniform(null),
      singleMieScatteringTexture: new Uniform(null),
      multipleScatteringTexture: new Uniform(null),
      irradianceTexture: new Uniform(null),
      scatteringOrder: new Uniform(0),
      layer: new Uniform(0)
    }
  })

  indirectIrradianceMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(indirectIrradianceShader, {
      bruneton: {
        common,
        definitions,
        precompute
      }
    }),
    uniforms: {
      luminanceFromRadiance: new Uniform(new Matrix3()),
      singleRayleighScatteringTexture: new Uniform(null),
      singleMieScatteringTexture: new Uniform(null),
      multipleScatteringTexture: new Uniform(null),
      scatteringOrder: new Uniform(0)
    }
  })

  multipleScatteringMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(multipleScatteringShader, {
      bruneton: {
        common,
        definitions,
        precompute
      }
    }),
    uniforms: {
      luminanceFromRadiance: new Uniform(new Matrix3()),
      transmittanceTexture: new Uniform(null),
      scatteringDensityTexture: new Uniform(null),
      layer: new Uniform(0)
    }
  })

  private readonly renderer: WebGLRenderer
  private readonly type: AnyFloatType
  private readonly mesh = new Mesh(new PlaneGeometry(2, 2))
  private readonly scene = new Scene().add(this.mesh)
  private readonly camera = new Camera()
  private updating = false
  private disposeQueue: (() => void) | undefined

  constructor(
    renderer: WebGLRenderer,
    {
      type = isFloatLinearSupported(renderer) ? FloatType : HalfFloatType,
      combinedScattering = true,
      higherOrderScattering = true
    }: PrecomputedTexturesGeneratorOptions = {}
  ) {
    this.renderer = renderer
    this.type = type

    this.transmittanceRenderTarget = createRenderTarget(
      type,
      TRANSMITTANCE_TEXTURE_WIDTH,
      TRANSMITTANCE_TEXTURE_HEIGHT
    )
    this.scatteringRenderTarget = create3DRenderTarget(
      type,
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH
    )
    this.irradianceRenderTarget = createRenderTarget(
      type,
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT
    )
    if (!combinedScattering) {
      this.singleMieScatteringRenderTarget = create3DRenderTarget(
        type,
        SCATTERING_TEXTURE_WIDTH,
        SCATTERING_TEXTURE_HEIGHT,
        SCATTERING_TEXTURE_DEPTH
      )
    }
    if (higherOrderScattering) {
      this.higherOrderScatteringRenderTarget = create3DRenderTarget(
        type,
        SCATTERING_TEXTURE_WIDTH,
        SCATTERING_TEXTURE_HEIGHT,
        SCATTERING_TEXTURE_DEPTH
      )
    }
    this.textures = {
      transmittanceTexture: this.transmittanceRenderTarget.texture,
      scatteringTexture: this.scatteringRenderTarget.texture,
      irradianceTexture: this.irradianceRenderTarget.texture,
      singleMieScatteringTexture: this.singleMieScatteringRenderTarget?.texture,
      higherOrderScatteringTexture:
        this.higherOrderScatteringRenderTarget?.texture
    }
  }

  private render3DRenderTarget(
    renderTarget: WebGL3DRenderTarget,
    material: PrecomputeMaterial
  ): void {
    for (let layer = 0; layer < renderTarget.depth; ++layer) {
      material.uniforms.layer.value = layer
      this.renderer.setRenderTarget(renderTarget, layer)
      this.renderer.render(this.scene, this.camera)
    }
  }

  private computeTransmittance(params: {
    renderTarget: WebGLRenderTarget
  }): void {
    const material = this.transmittanceMaterial
    delete material.defines.TRANSMITTANCE_PRECISION_LOG
    material.needsUpdate = true

    this.mesh.material = material
    this.renderer.setRenderTarget(params.renderTarget)
    this.renderer.render(this.scene, this.camera)
  }

  private computeOpticalDepth(params: {
    renderTarget: WebGLRenderTarget
  }): void {
    const material = this.transmittanceMaterial
    material.defines.TRANSMITTANCE_PRECISION_LOG = '1'
    material.needsUpdate = true

    this.mesh.material = material
    this.renderer.setRenderTarget(params.renderTarget)
    this.renderer.render(this.scene, this.camera)
  }

  private computeDirectIrradiance(params: {
    renderTarget: WebGLRenderTarget
    context: Context
    output: 'deltaIrradiance' | 'irradiance'
    additive: boolean
  }): void {
    const material = this.directIrradianceMaterial
    material.defines.OUTPUT = params.output
    material.additive = params.additive
    if (this.type === HalfFloatType) {
      material.defines.TRANSMITTANCE_PRECISION_LOG = '1'
    } else {
      delete material.defines.TRANSMITTANCE_PRECISION_LOG
    }
    material.needsUpdate = true

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value =
      params.context.opticalDepth?.texture ??
      this.transmittanceRenderTarget.texture

    this.mesh.material = material
    this.renderer.setRenderTarget(params.renderTarget)
    this.renderer.render(this.scene, this.camera)
  }

  private computeSingleScattering(params: {
    renderTarget: WebGL3DRenderTarget
    context: Context
    output: 'deltaRayleigh' | 'deltaMie' | 'scattering' | 'singleMieScattering'
    additive: boolean
  }): void {
    const material = this.singleScatteringMaterial
    material.defines.OUTPUT = params.output
    material.additive = params.additive
    if (this.type === HalfFloatType) {
      material.defines.TRANSMITTANCE_PRECISION_LOG = '1'
    } else {
      delete material.defines.TRANSMITTANCE_PRECISION_LOG
    }
    material.needsUpdate = true

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value =
      params.context.opticalDepth?.texture ??
      this.transmittanceRenderTarget.texture
    material.setUniforms(params.context)

    this.mesh.material = material
    this.render3DRenderTarget(params.renderTarget, material)
  }

  private computeScatteringDensity(params: {
    renderTarget: WebGL3DRenderTarget
    context: Context
    scatteringOrder: number
  }): void {
    const material = this.scatteringDensityMaterial
    if (this.type === HalfFloatType) {
      material.defines.TRANSMITTANCE_PRECISION_LOG = '1'
    } else {
      delete material.defines.TRANSMITTANCE_PRECISION_LOG
    }
    material.needsUpdate = true

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value =
      params.context.opticalDepth?.texture ??
      this.transmittanceRenderTarget.texture
    uniforms.scatteringOrder.value = params.scatteringOrder
    material.setUniforms(params.context)

    this.mesh.material = material
    this.render3DRenderTarget(params.renderTarget, material)
  }

  private computeIndirectIrradiance(params: {
    renderTarget: WebGLRenderTarget
    context: Context
    scatteringOrder: number
    output: 'deltaIrradiance' | 'irradiance'
    additive: boolean
  }): void {
    const material = this.indirectIrradianceMaterial
    material.defines.OUTPUT = params.output
    material.additive = params.additive
    material.needsUpdate = true

    const uniforms = material.uniforms
    uniforms.scatteringOrder.value = params.scatteringOrder - 1
    material.setUniforms(params.context)

    this.mesh.material = material
    this.renderer.setRenderTarget(params.renderTarget)
    this.renderer.render(this.scene, this.camera)
  }

  private computeMultipleScattering(params: {
    renderTarget: WebGL3DRenderTarget
    context: Context
    output: 'deltaMultipleScattering' | 'scattering'
    additive: boolean
  }): void {
    const material = this.multipleScatteringMaterial
    material.defines.OUTPUT = params.output
    material.additive = params.additive
    if (this.type === HalfFloatType) {
      material.defines.TRANSMITTANCE_PRECISION_LOG = '1'
    } else {
      delete material.defines.TRANSMITTANCE_PRECISION_LOG
    }
    material.needsUpdate = true

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value =
      params.context.opticalDepth?.texture ??
      this.transmittanceRenderTarget.texture
    material.setUniforms(params.context)

    this.mesh.material = material
    this.render3DRenderTarget(params.renderTarget, material)
  }

  private *precompute(context: Context, additive: boolean): Iterable<void> {
    // Note that we have to render the same materials multiple times where:
    // (1) different blending modes (2) rendering into 3D textures, because
    // MRT isn't supported in these situations.

    // Compute the transmittance, and store it in transmittanceTexture.
    this.computeTransmittance({
      renderTarget: this.transmittanceRenderTarget
    })

    // Compute the optical depth, and store it in opticalDepth. Avoid having
    // tiny transmittance values underflow to 0 due to half-float precision.
    if (this.type === HalfFloatType) {
      invariant(context.opticalDepth != null)
      this.computeOpticalDepth({
        renderTarget: context.opticalDepth
      })
    }

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "additive", either initialize irradianceTexture with zeros
    // or leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    this.computeDirectIrradiance({
      renderTarget: context.deltaIrradiance,
      context,
      output: 'deltaIrradiance',
      additive: false
    })
    this.computeDirectIrradiance({
      renderTarget: this.irradianceRenderTarget,
      context,
      output: 'irradiance',
      additive
    })

    this.renderer.setRenderTarget(null)
    yield

    // Compute the rayleigh and mie single scattering, store them in
    // deltaRayleighScattering and deltaMieScattering, and either store them or
    // accumulate them in scatteringTexture and optional
    // mieScatteringTexture.
    this.computeSingleScattering({
      renderTarget: context.deltaRayleighScattering,
      context,
      output: 'deltaRayleigh',
      additive: false
    })
    this.computeSingleScattering({
      renderTarget: context.deltaMieScattering,
      context,
      output: 'deltaMie',
      additive: false
    })
    this.computeSingleScattering({
      renderTarget: this.scatteringRenderTarget,
      context,
      output: 'scattering',
      additive
    })
    if (this.singleMieScatteringRenderTarget != null) {
      this.computeSingleScattering({
        renderTarget: this.singleMieScatteringRenderTarget,
        context,
        output: 'singleMieScattering',
        additive
      })
    }

    this.renderer.setRenderTarget(null)
    yield

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (let scatteringOrder = 2; scatteringOrder <= 4; ++scatteringOrder) {
      // Compute the scattering density, and store it in deltaScatteringDensity.
      this.computeScatteringDensity({
        renderTarget: context.deltaScatteringDensity,
        context,
        scatteringOrder
      })

      // Compute the indirect irradiance, store it in deltaIrradiance and
      // accumulate it in irradianceTexture.
      this.computeIndirectIrradiance({
        renderTarget: context.deltaIrradiance,
        context,
        scatteringOrder,
        output: 'deltaIrradiance',
        additive: false
      })
      this.computeIndirectIrradiance({
        renderTarget: this.irradianceRenderTarget,
        context,
        scatteringOrder,
        output: 'irradiance',
        additive: true
      })

      // Compute the multiple scattering, store it in deltaMultipleScattering,
      // and accumulate it in scatteringTexture.
      this.computeMultipleScattering({
        renderTarget: context.deltaMultipleScattering,
        context,
        output: 'deltaMultipleScattering',
        additive: false
      })
      this.computeMultipleScattering({
        renderTarget: this.scatteringRenderTarget,
        context,
        output: 'scattering',
        additive: true
      })
      if (this.higherOrderScatteringRenderTarget != null) {
        this.computeMultipleScattering({
          renderTarget: this.higherOrderScatteringRenderTarget,
          context,
          output: 'scattering',
          additive: true
        })
      }

      this.renderer.setRenderTarget(null)
      yield
    }
  }

  async update(
    atmosphere = AtmosphereParameters.DEFAULT
  ): Promise<PrecomputedTextures> {
    this.updating = true

    const atmosphereUniform = atmosphere.toUniform()
    this.transmittanceMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.directIrradianceMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.singleScatteringMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.scatteringDensityMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.indirectIrradianceMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.multipleScatteringMaterial.uniforms.ATMOSPHERE = atmosphereUniform

    const renderer = this.renderer
    const context = new Context(this.type)
    context.lambdas.set(680, 550, 440)
    context.luminanceFromRadiance.identity()
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    await iterateIdle(this.precompute(context, false))
    renderer.autoClear = autoClear
    context.dispose()

    // Transmittance and irradiance textures needs access to the pixel data.
    await readRenderTargetPixels(
      this.renderer,
      this.transmittanceRenderTarget,
      this.transmittanceRenderTarget.texture
    )
    await readRenderTargetPixels(
      this.renderer,
      this.irradianceRenderTarget,
      this.irradianceRenderTarget.texture
    )

    this.updating = false
    this.disposeQueue?.()
    return this.textures
  }

  dispose(options: { textures?: boolean } = {}): void {
    if (this.updating) {
      this.disposeQueue = () => {
        this.dispose(options)
        this.disposeQueue = undefined
      }
      return
    }

    const { textures: disposeTextures = true } = options
    if (!disposeTextures) {
      this.transmittanceRenderTarget.textures.splice(0, 1)
      this.scatteringRenderTarget.textures.splice(0, 1)
      this.irradianceRenderTarget.textures.splice(0, 1)
      this.singleMieScatteringRenderTarget?.textures.splice(0, 1)
      this.higherOrderScatteringRenderTarget?.textures.splice(0, 1)
    }

    this.transmittanceRenderTarget.dispose()
    this.scatteringRenderTarget.dispose()
    this.irradianceRenderTarget.dispose()
    this.singleMieScatteringRenderTarget?.dispose()
    this.higherOrderScatteringRenderTarget?.dispose()
    this.transmittanceMaterial.dispose()
    this.directIrradianceMaterial.dispose()
    this.singleScatteringMaterial.dispose()
    this.scatteringDensityMaterial.dispose()
    this.indirectIrradianceMaterial.dispose()
    this.multipleScatteringMaterial.dispose()
    this.mesh.geometry.dispose()
  }
}
