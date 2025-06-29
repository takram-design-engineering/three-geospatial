import {
  AdditiveBlending,
  ClampToEdgeWrapping,
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
  type Data3DTexture,
  type Material,
  type Texture,
  type WebGLRenderer
} from 'three'

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

import definitions from './precompute/definitions.glsl?raw'
import functions from './precompute/functions.glsl?raw'

const header = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  precision highp sampler3D;

  #define assert(x)
  const int TRANSMITTANCE_TEXTURE_WIDTH = ${TRANSMITTANCE_TEXTURE_WIDTH};
  const int TRANSMITTANCE_TEXTURE_HEIGHT = ${TRANSMITTANCE_TEXTURE_HEIGHT};
  const int SCATTERING_TEXTURE_R_SIZE = ${SCATTERING_TEXTURE_R_SIZE};
  const int SCATTERING_TEXTURE_MU_SIZE = ${SCATTERING_TEXTURE_MU_SIZE};
  const int SCATTERING_TEXTURE_MU_S_SIZE = ${SCATTERING_TEXTURE_MU_S_SIZE};
  const int SCATTERING_TEXTURE_NU_SIZE = ${SCATTERING_TEXTURE_NU_SIZE};
  const int IRRADIANCE_TEXTURE_WIDTH = ${IRRADIANCE_TEXTURE_WIDTH};
  const int IRRADIANCE_TEXTURE_HEIGHT = ${IRRADIANCE_TEXTURE_HEIGHT};
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
  const vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE = vec3(114974.916437,71305.954816,65310.548555);
  const vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE = vec3(98242.786222,69954.398112,66475.012354);

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

class Context {
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

export class Precompute {
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
    `
  })

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
    `
  })

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
    `
  })

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
    `
  })

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
    `
  })

  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly scene = new Scene()
  private readonly quad = new Mesh(new PlaneGeometry(2, 2))

  constructor() {
    this.scene.add(this.quad)
  }

  private renderTransmittance(
    renderer: WebGLRenderer,
    renderTarget: WebGLRenderTarget
  ): void {
    this.quad.material = this.transmittanceMaterial
    renderer.setRenderTarget(renderTarget)
    renderer.render(this.scene, this.camera)
  }

  private renderDirectIrradiance(
    renderer: WebGLRenderer,
    renderTarget: WebGLRenderTarget,
    output: 'deltaIrradiance' | 'irradiance',
    blend = false
  ): void {
    const material = this.directIrradianceMaterial
    material.defines.OUTPUT = output
    material.needsUpdate = true
    setBlending(material, blend)

    Object.assign(material.uniforms, {
      transmittanceTexture: new Uniform(this.transmittanceTexture)
    })
    this.quad.material = material
    renderer.setRenderTarget(renderTarget)
    renderer.render(this.scene, this.camera)
  }

  private renderSingleScattering(
    renderer: WebGLRenderer,
    renderTarget: WebGL3DRenderTarget,
    luminanceFromRadiance: Matrix3,
    output: 'deltaRayleigh' | 'deltaMie' | 'scattering' | 'singleMieScattering',
    blend = false
  ): void {
    const material = this.singleScatteringMaterial
    material.defines.OUTPUT = output
    material.needsUpdate = true
    setBlending(material, blend)

    Object.assign(material.uniforms, {
      luminanceFromRadiance: new Uniform(luminanceFromRadiance),
      transmittanceTexture: new Uniform(this.transmittanceTexture),
      layer: new Uniform(0)
    })
    this.quad.material = material
    for (let layer = 0; layer < SCATTERING_TEXTURE_DEPTH; ++layer) {
      material.uniforms.layer.value = layer
      renderer.setRenderTarget(renderTarget, layer)
      renderer.render(this.scene, this.camera)
    }
  }

  private renderScatteringDensity(
    renderer: WebGLRenderer,
    renderTarget: WebGLRenderTarget,
    deltaRayleighScatteringTexture: Data3DTexture,
    deltaMieScatteringTexture: Data3DTexture,
    deltaMultipleScatteringTexture: Data3DTexture,
    deltaIrradianceTexture: Texture,
    scatteringOrder: number
  ): void {
    const material = this.scatteringDensityMaterial
    // prettier-ignore
    Object.assign(material.uniforms, {
      transmittanceTexture: new Uniform(this.transmittanceTexture),
      singleRayleighScatteringTexture: new Uniform(deltaRayleighScatteringTexture),
      singleMieScatteringTexture: new Uniform(deltaMieScatteringTexture),
      multipleScatteringTexture: new Uniform(deltaMultipleScatteringTexture),
      irradianceTexture: new Uniform(deltaIrradianceTexture),
      scatteringOrder: new Uniform(scatteringOrder),
      layer: new Uniform(0)
    })
    this.quad.material = material
    for (let layer = 0; layer < SCATTERING_TEXTURE_DEPTH; ++layer) {
      material.uniforms.layer.value = layer
      renderer.setRenderTarget(renderTarget, layer)
      renderer.render(this.scene, this.camera)
    }
  }

  private renderIndirectIrradiance(
    renderer: WebGLRenderer,
    renderTarget: WebGLRenderTarget,
    luminanceFromRadiance: Matrix3,
    deltaRayleighScatteringTexture: Data3DTexture,
    deltaMieScatteringTexture: Data3DTexture,
    deltaMultipleScatteringTexture: Data3DTexture,
    scatteringOrder: number,
    output: 'deltaIrradiance' | 'irradiance',
    blend = false
  ): void {
    const material = this.indirectIrradianceMaterial
    material.defines.OUTPUT = output
    material.needsUpdate = true
    setBlending(material, blend)

    // prettier-ignore
    Object.assign(material.uniforms, {
      luminanceFromRadiance: new Uniform(luminanceFromRadiance),
      singleRayleighScatteringTexture: new Uniform(deltaRayleighScatteringTexture),
      singleMieScatteringTexture: new Uniform(deltaMieScatteringTexture),
      multipleScatteringTexture: new Uniform(deltaMultipleScatteringTexture),
      scatteringOrder: new Uniform(scatteringOrder - 1)
    })
    this.quad.material = material
    renderer.setRenderTarget(renderTarget)
    renderer.render(this.scene, this.camera)
  }

  private renderMultipleScattering(
    renderer: WebGLRenderer,
    renderTarget: WebGL3DRenderTarget,
    luminanceFromRadiance: Matrix3,
    deltaScatteringDensityTexture: Data3DTexture,
    output: 'deltaMultipleScattering' | 'scattering',
    blend = false
  ): void {
    const material = this.multipleScatteringMaterial
    material.defines.OUTPUT = output
    material.needsUpdate = true
    setBlending(material, blend)

    // prettier-ignore
    Object.assign(material.uniforms, {
      luminanceFromRadiance: new Uniform(luminanceFromRadiance),
      transmittanceTexture: new Uniform(this.transmittanceTexture),
      scatteringDensityTexture: new Uniform(deltaScatteringDensityTexture),
      layer: new Uniform(0)
    })
    this.quad.material = material
    for (let layer = 0; layer < SCATTERING_TEXTURE_DEPTH; ++layer) {
      material.uniforms.layer.value = layer
      renderer.setRenderTarget(renderTarget, layer)
      renderer.render(this.scene, this.camera)
    }
  }

  private precompute(
    renderer: WebGLRenderer,
    context: Context,
    lambdas: Vector3,
    luminanceFromRadiance: Matrix3,
    blend: boolean,
    numScatteringOrders = 4
  ): void {
    // Compute the transmittance, and store it in transmittanceTexture.
    this.renderTransmittance(renderer, this.transmittanceRenderTarget)

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "blend", either initialize irradianceTexture with zeros or
    // leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    this.renderDirectIrradiance(
      renderer,
      context.deltaIrradiance,
      'deltaIrradiance',
      false
    )
    this.renderDirectIrradiance(
      renderer,
      this.irradianceRenderTarget,
      'irradiance',
      blend
    )

    // Compute the rayleigh and mie single scattering, store them in
    // deltaRayleighScattering and deltaMieScattering, and either store them or
    // accumulate them in scatteringTexture and optional
    // singleMieScatteringTexture.
    this.renderSingleScattering(
      renderer,
      context.deltaRayleighScattering,
      luminanceFromRadiance,
      'deltaRayleigh',
      false
    )
    this.renderSingleScattering(
      renderer,
      context.deltaMieScattering,
      luminanceFromRadiance,
      'deltaMie',
      false
    )
    this.renderSingleScattering(
      renderer,
      this.scatteringRenderTarget,
      luminanceFromRadiance,
      'scattering',
      blend
    )

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (
      let scatteringOrder = 2;
      scatteringOrder <= numScatteringOrders;
      ++scatteringOrder
    ) {
      // Compute the scattering density, and store it in deltaScatteringDensity.
      this.renderScatteringDensity(
        renderer,
        context.deltaScatteringDensity,
        context.deltaRayleighScattering.texture,
        context.deltaMieScattering.texture,
        context.deltaMultipleScattering.texture,
        context.deltaIrradiance.texture,
        scatteringOrder
      )

      // Compute the indirect irradiance, store it in deltaIrradiance and
      // accumulate it in irradianceTexture.
      this.renderIndirectIrradiance(
        renderer,
        context.deltaIrradiance,
        luminanceFromRadiance,
        context.deltaRayleighScattering.texture,
        context.deltaMieScattering.texture,
        context.deltaMultipleScattering.texture,
        scatteringOrder,
        'deltaIrradiance',
        false
      )
      this.renderIndirectIrradiance(
        renderer,
        this.irradianceRenderTarget,
        luminanceFromRadiance,
        context.deltaRayleighScattering.texture,
        context.deltaMieScattering.texture,
        context.deltaMultipleScattering.texture,
        scatteringOrder,
        'irradiance',
        true
      )

      // Compute the multiple scattering, store it in deltaMultipleScattering,
      // and accumulate it in scatteringTexture.
      this.renderMultipleScattering(
        renderer,
        context.deltaMultipleScattering,
        luminanceFromRadiance,
        context.deltaScatteringDensity.texture,
        'deltaMultipleScattering',
        false
      )
      this.renderMultipleScattering(
        renderer,
        this.scatteringRenderTarget,
        luminanceFromRadiance,
        context.deltaScatteringDensity.texture,
        'scattering',
        true
      )
    }

    renderer.setRenderTarget(null)
  }

  render(renderer: WebGLRenderer): void {
    const context = new Context()
    const lambdas = new Vector3(680, 550, 440)
    const luminanceFromRadiance = new Matrix3().identity()
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    this.precompute(renderer, context, lambdas, luminanceFromRadiance, false)
    renderer.autoClear = autoClear
    context.dispose()
  }

  dispose(): void {
    this.transmittanceTexture.dispose()
    this.scatteringRenderTarget.dispose()
    this.irradianceRenderTarget.dispose()
    this.transmittanceMaterial.dispose()
    this.directIrradianceMaterial.dispose()
    this.singleScatteringMaterial.dispose()
    this.scatteringDensityMaterial.dispose()
    this.indirectIrradianceMaterial.dispose()
    this.multipleScatteringMaterial.dispose()
    this.quad.geometry.dispose()
  }

  get transmittanceTexture(): Texture {
    return this.transmittanceRenderTarget.texture
  }

  get scatteringTexture(): Texture {
    return this.scatteringRenderTarget.texture
  }

  get irradianceTexture(): Texture {
    return this.irradianceRenderTarget.texture
  }
}
