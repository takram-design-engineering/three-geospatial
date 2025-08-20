import {
  AddEquation,
  Box3,
  ClampToEdgeWrapping,
  CustomBlending,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  NoBlending,
  NoColorSpace,
  OneFactor,
  RenderTarget,
  RenderTarget3D,
  RGBAFormat,
  Vector3,
  type Data3DTexture,
  type Texture,
  type Vector2
} from 'three'
import {
  exp,
  mrt,
  nodeObject,
  screenCoordinate,
  texture,
  texture3D,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  TempNode,
  type NodeBuilder,
  type NodeBuilderContext,
  type NodeFrame,
  type Renderer,
  type Texture3DNode,
  type TextureNode,
  type UniformNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  isFloatLinearSupported,
  type AnyFloatType
} from '@takram/three-geospatial'
import {
  outputTexture,
  outputTexture3D,
  type NodeObject,
  type OutputTexture3DNode,
  type OutputTextureNode
} from '@takram/three-geospatial/webgpu'

import { requestIdleCallback } from '../helpers/requestIdleCallback'
import { AtmosphereParameters } from './AtmosphereParameters'
import { rayleighPhaseFunction } from './common'
import {
  computeDirectIrradianceTexture,
  computeIndirectIrradianceTexture,
  computeMultipleScatteringTexture,
  computeScatteringDensityTexture,
  computeSingleScatteringTexture,
  computeTransmittanceToTopAtmosphereBoundaryTexture
} from './precompute'

function createRenderTarget(name: string): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return renderTarget
}

function createRenderTarget3D(name: string): RenderTarget3D {
  const renderTarget = new RenderTarget3D(1, 1, 1, {
    depthBuffer: false,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.wrapR = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return renderTarget
}

function setupRenderTarget(
  renderTarget: RenderTarget,
  textureType: AnyFloatType,
  size: Vector2
): void {
  renderTarget.texture.type = textureType
  renderTarget.setSize(size.x, size.y)
}

function setupRenderTarget3D(
  renderTarget: RenderTarget3D,
  textureType: AnyFloatType,
  size: Vector3
): void {
  renderTarget.texture.type = textureType
  renderTarget.setSize(size.x, size.y, size.z)
  // As of r178, calling setSize() to a RenderTarget3D marks the texture as an
  // array texture, and subsequent calls to the texture in the GPU cannot find
  // overloaded functions.
  renderTarget.texture.isArrayTexture = false
}

function clearRenderTarget(
  renderer: Renderer,
  renderTarget?: RenderTarget
): void {
  if (renderTarget != null) {
    if (renderTarget instanceof RenderTarget3D) {
      for (let i = 0; i < renderTarget.depth; ++i) {
        renderer.setRenderTarget(renderTarget, i)
        void renderer.clearColor()
      }
    } else {
      renderer.setRenderTarget(renderTarget)
      void renderer.clearColor()
    }
  }
}

async function timeSlice<T>(iterable: Iterable<T>): Promise<T> {
  const iterator = iterable[Symbol.iterator]()
  return await new Promise<T>((resolve, reject) => {
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

let rendererState: RendererUtils.RendererState

function run(renderer: Renderer, task: () => void): boolean {
  rendererState = RendererUtils.resetRendererState(renderer, rendererState)
  renderer.setClearColor(0, 0)
  renderer.autoClear = false
  task()
  RendererUtils.restoreRendererState(renderer, rendererState)
  return true
}

class Context {
  lambdas = new Vector3(680, 550, 440)
  luminanceFromRadiance = new Matrix3().identity()

  opticalDepthRT = createRenderTarget('opticalDepth')
  deltaIrradianceRT = createRenderTarget('deltaIrradiance')
  deltaRayleighScatteringRT = createRenderTarget3D('deltaRayleighScattering')
  deltaMieScatteringRT = createRenderTarget3D('deltaMieScattering')
  deltaScatteringDensityRT = createRenderTarget3D('deltaScatteringDensity')

  // deltaMultipleScattering is only needed to compute scattering order 3 or
  // more, while deltaRayleighScattering and deltaMieScattering are only needed
  // to compute double scattering. Therefore, to save memory, we can store
  // deltaRayleighScattering and deltaMultipleScattering in the same GPU
  // texture.
  deltaMultipleScatteringRT = this.deltaRayleighScatteringRT

  constructor(textureType: AnyFloatType, parameters: AtmosphereParameters) {
    if (parameters.transmittancePrecisionLog) {
      setupRenderTarget(
        this.opticalDepthRT,
        textureType,
        parameters.transmittanceTextureSize
      )
    }
    setupRenderTarget(
      this.deltaIrradianceRT,
      textureType,
      parameters.irradianceTextureSize
    )
    setupRenderTarget3D(
      this.deltaRayleighScatteringRT,
      textureType,
      parameters.scatteringTextureSize
    )
    setupRenderTarget3D(
      this.deltaMieScatteringRT,
      textureType,
      parameters.scatteringTextureSize
    )
    setupRenderTarget3D(
      this.deltaScatteringDensityRT,
      textureType,
      parameters.scatteringTextureSize
    )
  }

  dispose(): void {
    this.opticalDepthRT.dispose()
    this.deltaIrradianceRT.dispose()
    this.deltaRayleighScatteringRT.dispose()
    this.deltaMieScatteringRT.dispose()
    this.deltaScatteringDensityRT.dispose()
  }
}

class ComputeMaterial extends NodeMaterial {
  override blendEquation = AddEquation
  override blendEquationAlpha = AddEquation
  override blendSrc = OneFactor
  override blendDst = OneFactor
  override blendSrcAlpha = OneFactor
  override blendDstAlpha = OneFactor

  parameters: AtmosphereParameters

  constructor(parameters: AtmosphereParameters) {
    super()
    this.parameters = parameters
  }

  createContext(): NodeBuilderContext {
    return {
      atmosphere: {
        parameters: this.parameters
      }
    }
  }

  // eslint-disable-next-line accessor-pairs
  set additive(value: boolean) {
    this.transparent = value
    this.blending = value ? CustomBlending : NoBlending
  }
}

class TransmittanceMaterial extends ComputeMaterial {
  override setup(builder: NodeBuilder): void {
    const transmittance = computeTransmittanceToTopAtmosphereBoundaryTexture(
      screenCoordinate
    ).context(this.createContext())

    this.fragmentNode = this.parameters.transmittancePrecisionLog
      ? // Compute the optical depth, and store it in opticalDepth. Avoid having
        // tiny transmittance values underflow to 0 due to half-float precision.
        mrt({
          transmittance: exp(transmittance.negate()),
          opticalDepth: transmittance
        })
      : transmittance

    this.additive = false
    super.setup(builder)
  }
}

class DirectIrradianceMaterial extends ComputeMaterial {
  transmittanceTexture = texture()

  override setup(builder: NodeBuilder): void {
    const irradiance = computeDirectIrradianceTexture(
      this.transmittanceTexture,
      screenCoordinate
    ).context(this.createContext())

    this.fragmentNode = mrt({
      deltaIrradiance: vec4(irradiance, 1),
      irradiance: vec4(vec3(0), 1)
    })

    this.additive = true
    super.setup(builder)
  }

  setUniforms(
    { opticalDepthRT }: Context,
    transmittanceRT: RenderTarget
  ): this {
    this.transmittanceTexture.value = this.parameters.transmittancePrecisionLog
      ? opticalDepthRT.texture
      : transmittanceRT.texture
    return this
  }
}

class SingleScatteringMaterial extends ComputeMaterial {
  luminanceFromRadiance = uniform(new Matrix3())
  transmittanceTexture = texture()
  layer = uniform(0)

  override setup(builder: NodeBuilder): void {
    const singleScattering = computeSingleScatteringTexture(
      this.transmittanceTexture,
      vec3(screenCoordinate, this.layer.add(0.5))
    ).context(this.createContext())

    const rayleigh = singleScattering.get('rayleigh')
    const mie = singleScattering.get('mie')

    const { luminanceFromRadiance } = this
    this.fragmentNode = mrt({
      scattering: vec4(
        rayleigh.mul(luminanceFromRadiance),
        mie.mul(luminanceFromRadiance).r
      ),
      deltaRayleighScattering: vec4(rayleigh, 1),
      deltaMieScattering: vec4(mie.mul(luminanceFromRadiance), 1)
    })

    this.additive = true
    super.setup(builder)
  }

  setUniforms(
    { luminanceFromRadiance, opticalDepthRT }: Context,
    transmittanceRT: RenderTarget
  ): this {
    this.luminanceFromRadiance.value.copy(luminanceFromRadiance)
    this.transmittanceTexture.value = this.parameters.transmittancePrecisionLog
      ? opticalDepthRT.texture
      : transmittanceRT.texture
    return this
  }
}

class ScatteringDensityMaterial extends ComputeMaterial {
  transmittanceTexture = texture()
  deltaRayleighScattering = texture3D()
  deltaMieScattering = texture3D()
  deltaMultipleScattering = texture3D()
  deltaIrradiance = texture()
  scatteringOrder = uniform(0)
  layer = uniform(0)

  override setup(builder: NodeBuilder): void {
    const radiance = computeScatteringDensityTexture(
      this.transmittanceTexture,
      this.deltaRayleighScattering,
      this.deltaMieScattering,
      this.deltaMultipleScattering,
      this.deltaIrradiance,
      vec3(screenCoordinate, this.layer.add(0.5)),
      this.scatteringOrder
    ).context(this.createContext())

    this.fragmentNode = vec4(radiance, 1)

    this.additive = false
    super.setup(builder)
  }

  setUniforms(
    {
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    }: Context,
    transmittanceRT: RenderTarget,
    scatteringOrder: number
  ): this {
    this.transmittanceTexture.value = this.parameters.transmittancePrecisionLog
      ? opticalDepthRT.texture
      : transmittanceRT.texture
    this.deltaRayleighScattering.value = deltaRayleighScatteringRT.texture
    this.deltaMieScattering.value = deltaMieScatteringRT.texture
    this.deltaMultipleScattering.value = deltaMultipleScatteringRT.texture
    this.deltaIrradiance.value = deltaIrradianceRT.texture
    this.scatteringOrder.value = scatteringOrder
    return this
  }
}

class IndirectIrradianceMaterial extends ComputeMaterial {
  luminanceFromRadiance = uniform(new Matrix3())
  deltaRayleighScattering = texture3D()
  deltaMieScattering = texture3D()
  deltaMultipleScattering = texture3D()
  scatteringOrder = uniform(0)

  override setup(builder: NodeBuilder): void {
    const irradiance = computeIndirectIrradianceTexture(
      this.deltaRayleighScattering,
      this.deltaMieScattering,
      this.deltaMultipleScattering,
      screenCoordinate,
      this.scatteringOrder.sub(1)
    ).context(this.createContext())

    this.fragmentNode = mrt({
      deltaIrradiance: irradiance,
      irradiance: irradiance.mul(this.luminanceFromRadiance)
    })

    this.additive = true
    super.setup(builder)
  }

  setUniforms(
    {
      luminanceFromRadiance,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaMultipleScatteringRT
    }: Context,
    scatteringOrder: number
  ): this {
    this.luminanceFromRadiance.value.copy(luminanceFromRadiance)
    this.deltaRayleighScattering.value = deltaRayleighScatteringRT.texture
    this.deltaMieScattering.value = deltaMieScatteringRT.texture
    this.deltaMultipleScattering.value = deltaMultipleScatteringRT.texture
    this.scatteringOrder.value = scatteringOrder
    return this
  }
}

class MultipleScatteringMaterial extends ComputeMaterial {
  luminanceFromRadiance = uniform(new Matrix3())
  transmittanceTexture = texture()
  deltaScatteringDensity = texture3D()
  layer = uniform(0)

  override setup(builder: NodeBuilder): void {
    const multipleScattering = computeMultipleScatteringTexture(
      this.transmittanceTexture,
      this.deltaScatteringDensity,
      vec3(screenCoordinate, this.layer.add(0.5))
    ).context(this.createContext())

    const radiance = multipleScattering.get('radiance')
    const cosViewSun = multipleScattering.get('cosViewSun')

    const luminance = radiance
      .mul(this.luminanceFromRadiance)
      .div(rayleighPhaseFunction(cosViewSun))

    this.fragmentNode = mrt({
      scattering: vec4(luminance, 0),
      // deltaMultipleScattering is shared with deltaRayleighScattering.
      deltaRayleighScattering: vec4(radiance, 1),
      ...(this.parameters.higherOrderScatteringTexture && {
        higherOrderScattering: vec4(luminance, 1)
      })
    })

    this.additive = true
    super.setup(builder)
  }

  setUniforms(
    {
      luminanceFromRadiance,
      deltaScatteringDensityRT,
      opticalDepthRT
    }: Context,
    transmittanceRT: RenderTarget
  ): this {
    this.transmittanceTexture.value = this.parameters.transmittancePrecisionLog
      ? opticalDepthRT.texture
      : transmittanceRT.texture
    this.deltaScatteringDensity.value = deltaScatteringDensityRT.texture
    this.luminanceFromRadiance.value.copy(luminanceFromRadiance)
    return this
  }
}

const textureNames = ['transmittance', 'irradiance'] as const
const texture3DNames = [
  'scattering',
  'singleMieScattering',
  'higherOrderScattering'
] as const

export type AtmosphereLUTTextureName = (typeof textureNames)[number]
export type AtmosphereLUTTexture3DName = (typeof texture3DNames)[number]

export class AtmosphereLUTNode extends TempNode {
  static override get type(): string {
    return 'AtmosphereLUTNode'
  }

  parameters: AtmosphereParameters
  textureType?: AnyFloatType // TODO

  private readonly transmittanceMaterial: TransmittanceMaterial
  private readonly directIrradianceMaterial: DirectIrradianceMaterial
  private readonly singleScatteringMaterial: SingleScatteringMaterial
  private readonly scatteringDensityMaterial: ScatteringDensityMaterial
  private readonly indirectIrradianceMaterial: IndirectIrradianceMaterial
  private readonly multipleScatteringMaterial: MultipleScatteringMaterial
  private readonly mesh = new QuadMesh()

  private readonly transmittanceRT: RenderTarget
  private readonly irradianceRT: RenderTarget
  private readonly scatteringRT: RenderTarget3D
  private readonly singleMieScatteringRT: RenderTarget3D
  private readonly higherOrderScatteringRT: RenderTarget3D

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNodes: Partial<
    Record<
      AtmosphereLUTTextureName | AtmosphereLUTTexture3DName,
      NodeObject<OutputTextureNode | OutputTexture3DNode>
    >
  > = {}

  private currentVersion?: number
  private updating = false
  private disposeQueue: (() => void) | undefined

  constructor(parameters = new AtmosphereParameters()) {
    super(null)
    this.parameters = parameters

    this.transmittanceMaterial = new TransmittanceMaterial(parameters)
    this.directIrradianceMaterial = new DirectIrradianceMaterial(parameters)
    this.singleScatteringMaterial = new SingleScatteringMaterial(parameters)
    this.scatteringDensityMaterial = new ScatteringDensityMaterial(parameters)
    this.indirectIrradianceMaterial = new IndirectIrradianceMaterial(parameters)
    this.multipleScatteringMaterial = new MultipleScatteringMaterial(parameters)

    this.transmittanceRT = createRenderTarget('transmittance')
    this.irradianceRT = createRenderTarget('irradiance')
    this.scatteringRT = createRenderTarget3D('scattering')
    this.singleMieScatteringRT = createRenderTarget3D('singleMieScattering')
    this.higherOrderScatteringRT = createRenderTarget3D('higherOrderScattering')

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  getTexture(name: AtmosphereLUTTextureName): Texture
  getTexture(name: AtmosphereLUTTexture3DName): Data3DTexture
  getTexture(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): Texture | Data3DTexture {
    return this[`${name}RT`].texture
  }

  getTextureNode(name: AtmosphereLUTTextureName): NodeObject<TextureNode>
  getTextureNode(name: AtmosphereLUTTexture3DName): NodeObject<Texture3DNode>
  getTextureNode(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): NodeObject<TextureNode> | NodeObject<Texture3DNode> {
    const texture = this._textureNodes[name]
    if (texture != null) {
      return texture
    }
    if (textureNames.includes(name as any)) {
      return (this._textureNodes[name] = outputTexture(
        this,
        this.getTexture(name as any)
      ))
    }
    if (texture3DNames.includes(name as any)) {
      return (this._textureNodes[name] = outputTexture3D(
        this,
        this.getTexture(name as any)
      ))
    }
    throw new Error(`Invalid texture name: ${name}`)
  }

  private renderToRenderTarget(
    renderer: Renderer,
    renderTarget: RenderTarget,
    textures?: ReadonlyArray<Texture | undefined>
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures.filter(value => value != null))
    }
    renderer.setRenderTarget(renderTarget)
    this.mesh.render(renderer)
    renderTarget.textures.length = 1
  }

  private renderToRenderTarget3D(
    renderer: Renderer,
    renderTarget: RenderTarget3D,
    layer: UniformNode<number>,
    textures?: ReadonlyArray<Data3DTexture | undefined>
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures.filter(value => value != null))
    }
    for (let i = 0; i < renderTarget.depth; ++i) {
      layer.value = i
      renderer.setRenderTarget(renderTarget, i)
      this.mesh.render(renderer)
    }
    renderTarget.textures.length = 1
  }

  private computeTransmittance(renderer: Renderer, context: Context): void {
    const material = this.transmittanceMaterial
    this.mesh.material = material

    this.renderToRenderTarget(renderer, this.transmittanceRT, [
      this.parameters.transmittancePrecisionLog
        ? context.opticalDepthRT.texture
        : undefined
    ])
  }

  private computeDirectIrradiance(renderer: Renderer, context: Context): void {
    const material = this.directIrradianceMaterial.setUniforms(
      context,
      this.transmittanceRT
    )
    this.mesh.material = material

    // Turn off blending on the deltaIrradiance.
    const { deltaIrradianceRT } = context
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  private computeSingleScattering(renderer: Renderer, context: Context): void {
    const material = this.singleScatteringMaterial.setUniforms(
      context,
      this.transmittanceRT
    )
    this.mesh.material = material

    // Turn off blending on the deltaRayleighScattering and deltaMieScattering.
    const { deltaRayleighScatteringRT, deltaMieScatteringRT } = context
    clearRenderTarget(renderer, deltaRayleighScatteringRT)
    clearRenderTarget(renderer, deltaMieScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, material.layer, [
      deltaRayleighScatteringRT.texture,
      deltaMieScatteringRT.texture
    ])

    const { parameters } = this
    if (!parameters.combinedScatteringTextures) {
      renderer.copyTextureToTexture(
        deltaMieScatteringRT.texture,
        this.singleMieScatteringRT.texture,
        new Box3(new Vector3(), parameters.scatteringTextureSize)
      )
    }
  }

  private computeScatteringDensity(
    renderer: Renderer,
    context: Context,
    scatteringOrder: number
  ): void {
    const material = this.scatteringDensityMaterial.setUniforms(
      context,
      this.transmittanceRT,
      scatteringOrder
    )
    this.mesh.material = material

    this.renderToRenderTarget3D(
      renderer,
      context.deltaScatteringDensityRT,
      material.layer
    )
  }

  private computeIndirectIrradiance(
    renderer: Renderer,
    context: Context,
    scatteringOrder: number
  ): void {
    const material = this.indirectIrradianceMaterial.setUniforms(
      context,
      scatteringOrder
    )
    this.mesh.material = material

    // Turn off blending on the deltaIrradiance.
    const { deltaIrradianceRT } = context
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  private computeMultipleScattering(
    renderer: Renderer,
    context: Context
  ): void {
    const material = this.multipleScatteringMaterial.setUniforms(
      context,
      this.transmittanceRT
    )
    this.mesh.material = material

    // Turn off blending on the deltaMultipleScattering.
    const { deltaMultipleScatteringRT } = context
    clearRenderTarget(renderer, deltaMultipleScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, material.layer, [
      deltaMultipleScatteringRT.texture,
      this.parameters.higherOrderScatteringTexture
        ? this.higherOrderScatteringRT.texture
        : undefined
    ])
  }

  private *compute(renderer: Renderer, context: Context): Iterable<boolean> {
    // MRT doesn't work unless clearing the render target first. Perhaps it's a
    // limitation of WebGPU. I saw a similar comment in Three.js source code but
    // can't recall where.
    yield run(renderer, () => {
      clearRenderTarget(renderer, this.transmittanceRT)
      clearRenderTarget(renderer, this.irradianceRT)
      clearRenderTarget(renderer, this.scatteringRT)
      clearRenderTarget(renderer, this.singleMieScatteringRT)
      clearRenderTarget(renderer, this.higherOrderScatteringRT)
      clearRenderTarget(renderer, context.opticalDepthRT)
      clearRenderTarget(renderer, context.deltaRayleighScatteringRT)
      clearRenderTarget(renderer, context.deltaMieScatteringRT)
      clearRenderTarget(renderer, context.deltaScatteringDensityRT)
      clearRenderTarget(renderer, context.deltaMultipleScatteringRT)
    })

    // Compute the transmittance, and store it in transmittanceTexture.
    yield run(renderer, () => {
      this.computeTransmittance(renderer, context)
    })

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "additive", either initialize irradianceTexture with zeros
    // or leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    yield run(renderer, () => {
      this.computeDirectIrradiance(renderer, context)
    })

    // Compute the rayleigh and mie single scattering, store them in
    // deltaRayleighScattering and deltaMieScattering, and either store them or
    // accumulate them in scatteringTexture and optional
    // mieScatteringTexture.
    yield run(renderer, () => {
      this.computeSingleScattering(renderer, context)
    })

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (let scatteringOrder = 2; scatteringOrder <= 4; ++scatteringOrder) {
      // Compute the scattering density, and store it in deltaScatteringDensity.
      yield run(renderer, () => {
        this.computeScatteringDensity(renderer, context, scatteringOrder)
      })
      // Compute the indirect irradiance, store it in deltaIrradiance and
      // accumulate it in irradianceTexture.
      yield run(renderer, () => {
        this.computeIndirectIrradiance(renderer, context, scatteringOrder)
      })
      // Compute the multiple scattering, store it in deltaMultipleScattering,
      // and accumulate it in scatteringTexture.
      yield run(renderer, () => {
        this.computeMultipleScattering(renderer, context)
      })
    }
  }

  async updateTextures(renderer: Renderer): Promise<void> {
    invariant(this.textureType != null)
    const context = new Context(this.textureType, this.parameters)
    this.updating = true
    try {
      await timeSlice(this.compute(renderer, context))
    } finally {
      this.updating = false
      context.dispose()
      this.disposeQueue?.()
    }
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null || this.version === this.currentVersion) {
      return
    }
    this.currentVersion = this.version

    // TODO: Race condition
    this.updateTextures(renderer).catch((error: unknown) => {
      throw error instanceof Error ? error : new Error()
    })
  }

  override setup(builder: NodeBuilder): unknown {
    this.textureType = isFloatLinearSupported(builder.renderer)
      ? (this.textureType ?? FloatType)
      : HalfFloatType

    const { parameters } = this
    setupRenderTarget(
      this.transmittanceRT,
      this.textureType,
      parameters.transmittanceTextureSize
    )
    setupRenderTarget(
      this.irradianceRT,
      this.textureType,
      parameters.irradianceTextureSize
    )
    setupRenderTarget3D(
      this.scatteringRT,
      this.textureType,
      parameters.scatteringTextureSize
    )
    if (!parameters.combinedScatteringTextures) {
      setupRenderTarget3D(
        this.singleMieScatteringRT,
        this.textureType,
        parameters.scatteringTextureSize
      )
    }
    if (parameters.higherOrderScatteringTexture) {
      setupRenderTarget3D(
        this.higherOrderScatteringRT,
        this.textureType,
        parameters.scatteringTextureSize
      )
    }
    return super.setup(builder)
  }

  override dispose(): void {
    if (this.updating) {
      this.disposeQueue = () => {
        this.dispose()
        this.disposeQueue = undefined
      }
      return
    }

    this.transmittanceMaterial.dispose()
    this.directIrradianceMaterial.dispose()
    this.singleScatteringMaterial.dispose()
    this.scatteringDensityMaterial.dispose()
    this.indirectIrradianceMaterial.dispose()
    this.multipleScatteringMaterial.dispose()
    this.transmittanceRT.dispose()
    this.irradianceRT.dispose()
    this.scatteringRT.dispose()
    this.singleMieScatteringRT.dispose()
    this.higherOrderScatteringRT.dispose()
    this.mesh.geometry.dispose()
    this.parameters.dispose() // TODO: Conditionally depending on the owner.

    const nodes = this._textureNodes
    for (const key in nodes) {
      if (Object.hasOwn(nodes, key)) {
        const uniform = nodes[key as keyof typeof nodes]
        uniform?.dispose()
      }
    }
  }
}

export const atmosphereLUT = (
  ...args: ConstructorParameters<typeof AtmosphereLUTNode>
): NodeObject<AtmosphereLUTNode> => nodeObject(new AtmosphereLUTNode(...args))
