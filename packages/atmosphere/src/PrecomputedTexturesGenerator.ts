import {
  AdditiveBlending,
  ClampToEdgeWrapping,
  Data3DTexture,
  DataTexture,
  FloatType,
  GLSL3,
  LinearFilter,
  Matrix3,
  Mesh,
  NoBlending,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  Uniform,
  Vector3,
  WebGL3DRenderTarget,
  WebGLRenderTarget,
  type Material,
  type Texture,
  type WebGLRenderer
} from 'three'
import invariant from 'tiny-invariant'

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

import definitions from './shaders/definitions.glsl?raw'
import functions from './shaders/precompute/functions.glsl?raw'

const header = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  precision highp sampler3D;

  #define assert(x)
  #define COMBINED_SCATTERING_TEXTURES;

  ${definitions}

  const AtmosphereParameters ATMOSPHERE = AtmosphereParameters(
    vec3(1.474000,1.850400,1.911980),
    0.004675,
    6360.000000,
    6420.000000,
    DensityProfile(DensityProfileLayer[2](
      DensityProfileLayer(0.000000,0.000000,0.000000,0.000000,0.000000),
      DensityProfileLayer(0.000000,1.000000,-0.125000,0.000000,0.000000)
    )),
    vec3(0.005802,0.013558,0.033100),
    DensityProfile(DensityProfileLayer[2](
      DensityProfileLayer(0.000000,0.000000,0.000000,0.000000,0.000000),
      DensityProfileLayer(0.000000,1.000000,-0.833333,0.000000,0.000000)
    )),
    vec3(0.003996,0.003996,0.003996),
    vec3(0.004440,0.004440,0.004440),
    0.800000,
    DensityProfile(DensityProfileLayer[2](
      DensityProfileLayer(25.000000,0.000000,0.000000,0.066667,-0.666667),
      DensityProfileLayer(0.000000,0.000000,0.000000,-0.066667,2.666667)
    )),
    vec3(0.000650,0.001881,0.000085),
    vec3(0.100000,0.100000,0.100000),
    -0.500000
  );

  ${functions}
`

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
  texture.needsUpdate = true
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
  texture.needsUpdate = true
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
  texture.needsUpdate = true
  return texture
}

function createData3DTexture(
  width: number,
  height: number,
  depth: number
): Data3DTexture {
  const texture = new Data3DTexture(
    new Float32Array(width * height * depth * 4),
    width,
    height,
    depth
  )
  texture.type = FloatType
  texture.format = RGBAFormat
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.wrapR = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.needsUpdate = true
  return texture
}

function readRenderTargetPixels(
  renderer: WebGLRenderer,
  renderTarget: WebGLRenderTarget,
  texture: DataTexture
): void {
  const buffer = texture.image.data
  invariant(buffer instanceof Float32Array)
  renderer.readRenderTargetPixels(
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

function setBlending(material: Material, value: boolean): void {
  material.transparent = value
  material.blending = value ? AdditiveBlending : NoBlending
}

function setContextUniforms(
  material: RawShaderMaterial,
  context: Context
): void {
  const uniforms = material.uniforms
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

export class PrecomputedTexturesGenerator {
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

  readonly transmittanceTexture = createDataTexture(
    TRANSMITTANCE_TEXTURE_WIDTH,
    TRANSMITTANCE_TEXTURE_HEIGHT
  )

  readonly scatteringTexture = createData3DTexture(
    SCATTERING_TEXTURE_WIDTH,
    SCATTERING_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_DEPTH
  )

  readonly irradianceTexture = createDataTexture(
    IRRADIANCE_TEXTURE_WIDTH,
    IRRADIANCE_TEXTURE_HEIGHT
  )

  transmittanceMaterial = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${header}
      layout(location = 0) out vec4 transmittance;
      void main() {
        transmittance.rgb = ComputeTransmittanceToTopAtmosphereBoundaryTexture(
          ATMOSPHERE,
          gl_FragCoord.xy
        );
        transmittance.a = 1.0;
      }
    `
  })

  directIrradianceMaterial = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${header}
      layout(location = 0) out vec4 outputColor;
      uniform sampler2D transmittanceTexture;
      void main() {
        vec3 deltaIrradiance;
        vec3 irradiance;
        deltaIrradiance = ComputeDirectIrradianceTexture(
          ATMOSPHERE,
          transmittanceTexture,
          gl_FragCoord.xy
        );
        irradiance = vec3(0.0);
        outputColor = vec4(OUTPUT, 1.0);
      }
    `,
    uniforms: {
      transmittanceTexture: new Uniform(null)
    }
  }) as RawShaderMaterial & {
    uniforms: {
      transmittanceTexture: Uniform<Texture>
    }
  }

  singleScatteringMaterial = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${header}
      layout(location = 0) out vec4 outputColor;
      uniform mat3 luminanceFromRadiance;
      uniform sampler2D transmittanceTexture;
      uniform int layer;
      void main() {
        vec4 deltaRayleigh;
        vec4 deltaMie;
        vec4 scattering;
        vec4 singleMieScattering;
        ComputeSingleScatteringTexture(
          ATMOSPHERE,
          transmittanceTexture,
          vec3(gl_FragCoord.xy, float(layer) + 0.5),
          deltaRayleigh.rgb,
          deltaMie.rgb
        );
        deltaRayleigh.a = 1.0;
        deltaMie.a = 1.0;
        scattering = vec4(
          luminanceFromRadiance * deltaRayleigh.rgb,
          (luminanceFromRadiance * deltaMie.rgb).r
        );
        singleMieScattering.rgb = luminanceFromRadiance * deltaMie.rgb;
        singleMieScattering.a = 1.0;
        outputColor = OUTPUT;
      }
    `,
    uniforms: {
      luminanceFromRadiance: new Uniform(new Matrix3()),
      transmittanceTexture: new Uniform(null),
      layer: new Uniform(0)
    }
  }) as RawShaderMaterial & {
    uniforms: {
      luminanceFromRadiance: Uniform<Matrix3>
      transmittanceTexture: Uniform<Texture>
      layer: Uniform<number>
    }
  }

  scatteringDensityMaterial = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${header}
      layout(location = 0) out vec4 scatteringDensity;
      uniform sampler2D transmittanceTexture;
      uniform sampler3D singleRayleighScatteringTexture;
      uniform sampler3D singleMieScatteringTexture;
      uniform sampler3D multipleScatteringTexture;
      uniform sampler2D irradianceTexture;
      uniform int scatteringOrder;
      uniform int layer;
      void main() {
        scatteringDensity.rgb = ComputeScatteringDensityTexture(
          ATMOSPHERE,
          transmittanceTexture,
          singleRayleighScatteringTexture,
          singleMieScatteringTexture,
          multipleScatteringTexture,
          irradianceTexture,
          vec3(gl_FragCoord.xy, float(layer) + 0.5),
          scatteringOrder
        );
        scatteringDensity.a = 1.0;
      }
    `,
    uniforms: {
      transmittanceTexture: new Uniform(null),
      singleRayleighScatteringTexture: new Uniform(null),
      singleMieScatteringTexture: new Uniform(null),
      multipleScatteringTexture: new Uniform(null),
      irradianceTexture: new Uniform(null),
      scatteringOrder: new Uniform(0),
      layer: new Uniform(0)
    }
  }) as RawShaderMaterial & {
    uniforms: {
      transmittanceTexture: Uniform<Texture>
      singleRayleighScatteringTexture: Uniform<Data3DTexture>
      singleMieScatteringTexture: Uniform<Data3DTexture>
      multipleScatteringTexture: Uniform<Data3DTexture>
      irradianceTexture: Uniform<Texture>
      scatteringOrder: Uniform<number>
      layer: Uniform<number>
    }
  }

  indirectIrradianceMaterial = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${header}
      layout(location = 0) out vec4 outputColor;
      uniform mat3 luminanceFromRadiance;
      uniform sampler3D singleRayleighScatteringTexture;
      uniform sampler3D singleMieScatteringTexture;
      uniform sampler3D multipleScatteringTexture;
      uniform int scatteringOrder;
      void main() {
        vec3 deltaIrradiance;
        vec3 irradiance;
        deltaIrradiance = ComputeIndirectIrradianceTexture(
          ATMOSPHERE,
          singleRayleighScatteringTexture,
          singleMieScatteringTexture,
          multipleScatteringTexture,
          gl_FragCoord.xy,
          scatteringOrder
        );
        irradiance = luminanceFromRadiance * deltaIrradiance;
        outputColor = vec4(OUTPUT, 1.0);
      }
    `,
    uniforms: {
      luminanceFromRadiance: new Uniform(new Matrix3()),
      singleRayleighScatteringTexture: new Uniform(null),
      singleMieScatteringTexture: new Uniform(null),
      multipleScatteringTexture: new Uniform(null),
      scatteringOrder: new Uniform(0)
    }
  }) as RawShaderMaterial & {
    uniforms: {
      luminanceFromRadiance: Uniform<Matrix3>
      singleRayleighScatteringTexture: Uniform<Data3DTexture>
      singleMieScatteringTexture: Uniform<Data3DTexture>
      multipleScatteringTexture: Uniform<Data3DTexture>
      scatteringOrder: Uniform<number>
    }
  }

  multipleScatteringMaterial = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${header}
      layout(location = 0) out vec4 outputColor;
      uniform mat3 luminanceFromRadiance;
      uniform sampler2D transmittanceTexture;
      uniform sampler3D scatteringDensityTexture;
      uniform int layer;
      void main() {
        vec4 deltaMultipleScattering;
        vec4 scattering;
        float nu;
        deltaMultipleScattering.rgb = ComputeMultipleScatteringTexture(
          ATMOSPHERE,
          transmittanceTexture,
          scatteringDensityTexture,
          vec3(gl_FragCoord.xy, float(layer) + 0.5),
          nu
        );
        deltaMultipleScattering.a = 1.0;
        scattering = vec4(
          luminanceFromRadiance * deltaMultipleScattering.rgb / RayleighPhaseFunction(nu),
          0.0
        );
        outputColor = OUTPUT;
      }
    `,
    uniforms: {
      luminanceFromRadiance: new Uniform(new Matrix3()),
      transmittanceTexture: new Uniform(null),
      scatteringDensityTexture: new Uniform(null),
      layer: new Uniform(0)
    }
  }) as RawShaderMaterial & {
    uniforms: {
      luminanceFromRadiance: Uniform<Matrix3>
      transmittanceTexture: Uniform<Texture>
      scatteringDensityTexture: Uniform<Data3DTexture>
      layer: Uniform<number>
    }
  }

  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly scene = new Scene()
  private readonly mesh = new Mesh(new PlaneGeometry(2, 2))

  constructor(atmosphere = AtmosphereParameters.DEFAULT) {
    this.configureMaterial(this.transmittanceMaterial, atmosphere)
    this.configureMaterial(this.directIrradianceMaterial, atmosphere)
    this.configureMaterial(this.singleScatteringMaterial, atmosphere)
    this.configureMaterial(this.scatteringDensityMaterial, atmosphere)
    this.configureMaterial(this.indirectIrradianceMaterial, atmosphere)
    this.configureMaterial(this.multipleScatteringMaterial, atmosphere)
    this.scene.add(this.mesh)
  }

  private configureMaterial(
    material: RawShaderMaterial,
    atmosphere: AtmosphereParameters
  ): void {
    // prettier-ignore
    Object.assign(material.defines, {
      TRANSMITTANCE_TEXTURE_WIDTH: TRANSMITTANCE_TEXTURE_WIDTH.toFixed(0),
      TRANSMITTANCE_TEXTURE_HEIGHT: TRANSMITTANCE_TEXTURE_HEIGHT.toFixed(0),
      SCATTERING_TEXTURE_R_SIZE: SCATTERING_TEXTURE_R_SIZE.toFixed(0),
      SCATTERING_TEXTURE_MU_SIZE: SCATTERING_TEXTURE_MU_SIZE.toFixed(0),
      SCATTERING_TEXTURE_MU_S_SIZE: SCATTERING_TEXTURE_MU_S_SIZE.toFixed(0),
      SCATTERING_TEXTURE_NU_SIZE: SCATTERING_TEXTURE_NU_SIZE.toFixed(0),
      IRRADIANCE_TEXTURE_WIDTH: IRRADIANCE_TEXTURE_WIDTH.toFixed(0),
      IRRADIANCE_TEXTURE_HEIGHT: IRRADIANCE_TEXTURE_HEIGHT.toFixed(0),
      SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: `vec3(${atmosphere.sunRadianceToRelativeLuminance.toArray().map(v => v.toFixed(12)).join(',')})`,
      SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: `vec3(${atmosphere.skyRadianceToRelativeLuminance.toArray().map(v => v.toFixed(12)).join(',')})`
    })
  }

  private render3DRenderTarget(
    renderer: WebGLRenderer,
    renderTarget: WebGL3DRenderTarget,
    material: Material & {
      uniforms: {
        layer: Uniform<number>
      }
    }
  ): void {
    for (let layer = 0; layer < renderTarget.depth; ++layer) {
      material.uniforms.layer.value = layer
      renderer.setRenderTarget(renderTarget, layer)
      renderer.render(this.scene, this.camera)
    }
  }

  private computeTransmittance(
    renderer: WebGLRenderer,
    params: {
      renderTarget: WebGLRenderTarget
    }
  ): void {
    this.mesh.material = this.transmittanceMaterial
    renderer.setRenderTarget(params.renderTarget)
    renderer.render(this.scene, this.camera)
  }

  private computeDirectIrradiance(
    renderer: WebGLRenderer,
    params: {
      renderTarget: WebGLRenderTarget
      output: 'deltaIrradiance' | 'irradiance'
      blend: boolean
    }
  ): void {
    const material = this.directIrradianceMaterial
    material.defines.OUTPUT = params.output
    material.needsUpdate = true
    setBlending(material, params.blend)

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value = this.transmittanceRenderTarget.texture

    this.mesh.material = material
    renderer.setRenderTarget(params.renderTarget)
    renderer.render(this.scene, this.camera)
  }

  private computeSingleScattering(
    renderer: WebGLRenderer,
    params: {
      renderTarget: WebGL3DRenderTarget
      context: Context
      output:
        | 'deltaRayleigh'
        | 'deltaMie'
        | 'scattering'
        | 'singleMieScattering'
      blend: boolean
    }
  ): void {
    const material = this.singleScatteringMaterial
    material.defines.OUTPUT = params.output
    material.needsUpdate = true
    setBlending(material, params.blend)

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value = this.transmittanceRenderTarget.texture
    setContextUniforms(material, params.context)

    this.mesh.material = material
    this.render3DRenderTarget(renderer, params.renderTarget, material)
  }

  private computeScatteringDensity(
    renderer: WebGLRenderer,
    params: {
      renderTarget: WebGL3DRenderTarget
      context: Context
      scatteringOrder: number
    }
  ): void {
    const material = this.scatteringDensityMaterial
    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value = this.transmittanceRenderTarget.texture
    uniforms.scatteringOrder.value = params.scatteringOrder
    setContextUniforms(material, params.context)

    this.mesh.material = material
    this.render3DRenderTarget(renderer, params.renderTarget, material)
  }

  private computeIndirectIrradiance(
    renderer: WebGLRenderer,
    params: {
      renderTarget: WebGLRenderTarget
      context: Context
      scatteringOrder: number
      output: 'deltaIrradiance' | 'irradiance'
      blend: boolean
    }
  ): void {
    const material = this.indirectIrradianceMaterial
    material.defines.OUTPUT = params.output
    material.needsUpdate = true
    setBlending(material, params.blend)

    const uniforms = material.uniforms
    uniforms.scatteringOrder.value = params.scatteringOrder - 1
    setContextUniforms(material, params.context)

    this.mesh.material = material
    renderer.setRenderTarget(params.renderTarget)
    renderer.render(this.scene, this.camera)
  }

  private computeMultipleScattering(
    renderer: WebGLRenderer,
    params: {
      renderTarget: WebGL3DRenderTarget
      context: Context
      output: 'deltaMultipleScattering' | 'scattering'
      blend: boolean
    }
  ): void {
    const material = this.multipleScatteringMaterial
    material.defines.OUTPUT = params.output
    material.needsUpdate = true
    setBlending(material, params.blend)

    const uniforms = material.uniforms
    uniforms.transmittanceTexture.value = this.transmittanceRenderTarget.texture
    setContextUniforms(material, params.context)

    this.mesh.material = material
    this.render3DRenderTarget(renderer, params.renderTarget, material)
  }

  private precompute(
    renderer: WebGLRenderer,
    context: Context,
    blend: boolean,
    numScatteringOrders = 4
  ): void {
    // Compute the transmittance, and store it in transmittanceTexture.
    this.computeTransmittance(renderer, {
      renderTarget: this.transmittanceRenderTarget
    })

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "blend", either initialize irradianceTexture with zeros or
    // leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    this.computeDirectIrradiance(renderer, {
      renderTarget: context.deltaIrradiance,
      output: 'deltaIrradiance',
      blend: false
    })
    this.computeDirectIrradiance(renderer, {
      renderTarget: this.irradianceRenderTarget,
      output: 'irradiance',
      blend
    })

    // Compute the rayleigh and mie single scattering, store them in
    // deltaRayleighScattering and deltaMieScattering, and either store them or
    // accumulate them in scatteringTexture and optional
    // mieScatteringTexture.
    this.computeSingleScattering(renderer, {
      renderTarget: context.deltaRayleighScattering,
      context,
      output: 'deltaRayleigh',
      blend: false
    })
    this.computeSingleScattering(renderer, {
      renderTarget: context.deltaMieScattering,
      context,
      output: 'deltaMie',
      blend: false
    })
    this.computeSingleScattering(renderer, {
      renderTarget: this.scatteringRenderTarget,
      context,
      output: 'scattering',
      blend
    })

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (
      let scatteringOrder = 2;
      scatteringOrder <= numScatteringOrders;
      ++scatteringOrder
    ) {
      // Compute the scattering density, and store it in deltaScatteringDensity.
      this.computeScatteringDensity(renderer, {
        renderTarget: context.deltaScatteringDensity,
        context,
        scatteringOrder
      })

      // Compute the indirect irradiance, store it in deltaIrradiance and
      // accumulate it in irradianceTexture.
      this.computeIndirectIrradiance(renderer, {
        renderTarget: context.deltaIrradiance,
        context,
        scatteringOrder,
        output: 'deltaIrradiance',
        blend: false
      })
      this.computeIndirectIrradiance(renderer, {
        renderTarget: this.irradianceRenderTarget,
        context,
        scatteringOrder,
        output: 'irradiance',
        blend: true
      })

      // Compute the multiple scattering, store it in deltaMultipleScattering,
      // and accumulate it in scatteringTexture.
      this.computeMultipleScattering(renderer, {
        renderTarget: context.deltaMultipleScattering,
        context,
        output: 'deltaMultipleScattering',
        blend: false
      })
      this.computeMultipleScattering(renderer, {
        renderTarget: this.scatteringRenderTarget,
        context,
        output: 'scattering',
        blend: true
      })
    }

    renderer.setRenderTarget(null)
  }

  render(renderer: WebGLRenderer): void {
    const context = new Context()
    context.lambdas.set(680, 550, 440)
    context.luminanceFromRadiance.identity()
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    this.precompute(renderer, context, false)
    renderer.autoClear = autoClear
    context.dispose()

    // Transmittance and irradiance textures needs access to the pixel data.
    readRenderTargetPixels(
      renderer,
      this.transmittanceRenderTarget,
      this.transmittanceTexture
    )
    readRenderTargetPixels(
      renderer,
      this.irradianceRenderTarget,
      this.irradianceTexture
    )
    renderer.copyTextureToTexture(
      this.scatteringRenderTarget.texture,
      this.scatteringTexture
    )
  }

  dispose(): void {
    this.transmittanceRenderTarget.dispose()
    this.scatteringRenderTarget.dispose()
    this.irradianceRenderTarget.dispose()
    this.transmittanceTexture.dispose()
    this.scatteringTexture.dispose()
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
