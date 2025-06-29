import {
  AddEquation,
  Camera,
  ClampToEdgeWrapping,
  CustomBlending,
  DataTexture,
  FloatType,
  GLSL3,
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
  type WebGLRenderer
} from 'three'
import invariant from 'tiny-invariant'

import { resolveIncludes } from '@takram/three-geospatial'

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
import { type PrecomputedTextures } from './types'

import definitions from './shaders/bruneton/definitions.glsl?raw'
import functions from './shaders/bruneton/functions.glsl?raw'
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

function createRenderTarget(width: number, height: number): WebGLRenderTarget {
  const renderTarget = new WebGLRenderTarget(width, height, {
    depthBuffer: false,
    type: FloatType,
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
  width: number,
  height: number,
  depth: number
): WebGL3DRenderTarget {
  const renderTarget = new WebGL3DRenderTarget(width, height, depth, {
    depthBuffer: false,
    type: FloatType,
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

function createDataTexture(width: number, height: number): DataTexture {
  const texture = new DataTexture(
    new Float32Array(width * height * 4),
    width,
    height,
    RGBAFormat,
    FloatType
  )
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  return texture
}

async function readRenderTargetPixels(
  renderer: WebGLRenderer,
  renderTarget: WebGLRenderTarget,
  texture: DataTexture
): Promise<void> {
  const buffer = texture.image.data
  invariant(buffer instanceof Float32Array)
  await renderer.readRenderTargetPixelsAsync(
    renderTarget,
    0,
    0,
    renderTarget.width,
    renderTarget.height,
    buffer
  )
  texture.needsUpdate = true
}

class Context {
  lambdas = new Vector3()
  luminanceFromRadiance = new Matrix3()

  deltaIrradiance = createRenderTarget(
    IRRADIANCE_TEXTURE_WIDTH,
    IRRADIANCE_TEXTURE_HEIGHT
  )

  deltaRayleighScattering = create3DRenderTarget(
    SCATTERING_TEXTURE_WIDTH,
    SCATTERING_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_DEPTH
  )

  deltaMieScattering = create3DRenderTarget(
    SCATTERING_TEXTURE_WIDTH,
    SCATTERING_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_DEPTH
  )

  deltaScatteringDensity = create3DRenderTarget(
    SCATTERING_TEXTURE_WIDTH,
    SCATTERING_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_DEPTH
  )

  // deltaMultipleScattering is only needed to compute scattering order 3 or
  // more, while deltaRayleighScattering and deltaMieScattering are only needed
  // to compute double scattering. Therefore, to save memory, we can store
  // deltaRayleighScattering and deltaMultipleScattering in the same GPU
  // texture.
  deltaMultipleScattering = this.deltaRayleighScattering

  dispose(): void {
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

export class PrecomputedTexturesGenerator {
  scatteringOrderCount = 4

  readonly transmittanceRenderTarget = createRenderTarget(
    TRANSMITTANCE_TEXTURE_WIDTH,
    TRANSMITTANCE_TEXTURE_HEIGHT
  )

  readonly scatteringRenderTarget = create3DRenderTarget(
    SCATTERING_TEXTURE_WIDTH,
    SCATTERING_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_DEPTH
  )

  readonly irradianceRenderTarget = createRenderTarget(
    IRRADIANCE_TEXTURE_WIDTH,
    IRRADIANCE_TEXTURE_HEIGHT
  )

  private readonly transmittanceTexture = createDataTexture(
    TRANSMITTANCE_TEXTURE_WIDTH,
    TRANSMITTANCE_TEXTURE_HEIGHT
  )

  private readonly irradianceTexture = createDataTexture(
    IRRADIANCE_TEXTURE_WIDTH,
    IRRADIANCE_TEXTURE_HEIGHT
  )

  readonly textures: PrecomputedTextures = {
    transmittanceTexture: this.transmittanceTexture,
    scatteringTexture: this.scatteringRenderTarget.texture,
    irradianceTexture: this.irradianceTexture
  }

  transmittanceMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(transmittanceShader, {
      definitions,
      functions
    })
  })

  directIrradianceMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(directIrradianceShader, {
      definitions,
      functions
    }),
    uniforms: {
      transmittanceTexture: new Uniform(null)
    }
  })

  singleScatteringMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(singleScatteringShader, {
      definitions,
      functions
    }),
    uniforms: {
      luminanceFromRadiance: new Uniform(new Matrix3()),
      transmittanceTexture: new Uniform(null),
      layer: new Uniform(0)
    }
  })

  scatteringDensityMaterial = new PrecomputeMaterial({
    fragmentShader: resolveIncludes(scatteringDensityShader, {
      definitions,
      functions
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
      definitions,
      functions
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
      definitions,
      functions
    }),
    uniforms: {
      luminanceFromRadiance: new Uniform(new Matrix3()),
      transmittanceTexture: new Uniform(null),
      scatteringDensityTexture: new Uniform(null),
      layer: new Uniform(0)
    }
  })

  private readonly renderer: WebGLRenderer
  private readonly camera = new Camera()
  private readonly scene = new Scene()
  private readonly mesh = new Mesh(new PlaneGeometry(2, 2))

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.scene.add(this.mesh)
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
    this.mesh.material = this.transmittanceMaterial
    this.renderer.setRenderTarget(params.renderTarget)
    this.renderer.render(this.scene, this.camera)
  }

  private computeDirectIrradiance(params: {
    renderTarget: WebGLRenderTarget
    output: 'deltaIrradiance' | 'irradiance'
    additive: boolean
  }): void {
    const material = this.directIrradianceMaterial
    material.defines.OUTPUT = params.output
    material.additive = params.additive
    material.needsUpdate = true

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value = this.transmittanceRenderTarget.texture

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
    material.needsUpdate = true

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value = this.transmittanceRenderTarget.texture
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
    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value = this.transmittanceRenderTarget.texture
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
    material.needsUpdate = true

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value = this.transmittanceRenderTarget.texture
    material.setUniforms(params.context)

    this.mesh.material = material
    this.render3DRenderTarget(params.renderTarget, material)
  }

  private precompute(context: Context, additive: boolean): void {
    // Note that we have to render the same materials multiple times where:
    // (1) different blending modes (2) rendering into 3D textures, because
    // MRT isn't supported in these situations.

    const renderTarget = this.renderer.getRenderTarget()

    // Compute the transmittance, and store it in transmittanceTexture.
    this.computeTransmittance({
      renderTarget: this.transmittanceRenderTarget
    })

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "additive", either initialize irradianceTexture with zeros
    // or leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    this.computeDirectIrradiance({
      renderTarget: context.deltaIrradiance,
      output: 'deltaIrradiance',
      additive: false
    })
    this.computeDirectIrradiance({
      renderTarget: this.irradianceRenderTarget,
      output: 'irradiance',
      additive
    })

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

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (
      let scatteringOrder = 2;
      scatteringOrder <= this.scatteringOrderCount;
      ++scatteringOrder
    ) {
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
    }

    this.renderer.setRenderTarget(renderTarget)
  }

  update(atmosphere = AtmosphereParameters.DEFAULT): PrecomputedTextures {
    const atmosphereUniform = atmosphere.toStructuredUniform()
    this.transmittanceMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.directIrradianceMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.singleScatteringMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.scatteringDensityMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.indirectIrradianceMaterial.uniforms.ATMOSPHERE = atmosphereUniform
    this.multipleScatteringMaterial.uniforms.ATMOSPHERE = atmosphereUniform

    const renderer = this.renderer
    const context = new Context()
    context.lambdas.set(680, 550, 440)
    context.luminanceFromRadiance.identity()
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    this.precompute(context, false)
    renderer.autoClear = autoClear
    context.dispose()

    // Transmittance and irradiance textures needs access to the pixel data.
    Promise.all([
      readRenderTargetPixels(
        renderer,
        this.transmittanceRenderTarget,
        this.transmittanceTexture
      ),
      readRenderTargetPixels(
        renderer,
        this.irradianceRenderTarget,
        this.irradianceTexture
      )
    ]).catch(error => {
      console.error(error)
    })

    return this.textures
  }

  dispose(): void {
    this.transmittanceRenderTarget.dispose()
    this.scatteringRenderTarget.dispose()
    this.irradianceRenderTarget.dispose()
    this.transmittanceTexture.dispose()
    this.irradianceTexture.dispose()
    this.transmittanceMaterial.dispose()
    this.directIrradianceMaterial.dispose()
    this.singleScatteringMaterial.dispose()
    this.scatteringDensityMaterial.dispose()
    this.indirectIrradianceMaterial.dispose()
    this.multipleScatteringMaterial.dispose()
    this.mesh.geometry.dispose()
  }
}
