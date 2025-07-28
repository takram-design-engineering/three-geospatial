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
  int,
  mrt,
  nodeObject,
  screenCoordinate,
  texture,
  texture3D,
  uniform,
  vec3,
  vec4,
  type ShaderNodeObject
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  TempNode,
  Texture3DNode,
  TextureNode,
  type Node,
  type NodeBuilder,
  type NodeFrame,
  type Renderer,
  type UniformNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  isFloatLinearSupported,
  type AnyFloatType
} from '@takram/three-geospatial'

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

declare module 'three' {
  interface RenderTarget3D {
    texture: Data3DTexture
    textures: Data3DTexture[]
  }
}

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

function run(renderer: Renderer, task: () => void): boolean {
  const prevAutoClear = renderer.autoClear
  renderer.autoClear = false
  task()
  renderer.setRenderTarget(null)
  renderer.autoClear = prevAutoClear
  return true
}

class Context {
  lambdas = uniform(new Vector3(680, 550, 440))
  luminanceFromRadiance = uniform(new Matrix3().identity())

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
    if (parameters.options.transmittancePrecisionLog) {
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

class AdditiveNodeMaterial extends NodeMaterial {
  blendEquation = AddEquation
  blendEquationAlpha = AddEquation
  blendSrc = OneFactor
  blendDst = OneFactor
  blendSrcAlpha = OneFactor
  blendDstAlpha = OneFactor

  // eslint-disable-next-line accessor-pairs
  set additive(value: boolean) {
    this.transparent = value
    this.blending = value ? CustomBlending : NoBlending
  }
}

const lutTypes = {
  transmittance: 2,
  irradiance: 2,
  scattering: 3,
  singleMieScattering: 3,
  higherOrderScattering: 3
} as const

type LUTName<D extends 2 | 3 = 2 | 3, T = typeof lutTypes> = keyof {
  [K in keyof T as T[K] extends D ? K : never]: unknown
}

class LUTTextureNode extends TextureNode {
  static get type(): string {
    return 'LUTTextureNode'
  }

  private readonly lutNode: AtmosphereLUTNode
  private readonly lutName: LUTName<2>

  constructor(lutNode: AtmosphereLUTNode, lutName: LUTName<2>) {
    super(lutNode.getTexture(lutName))
    this.lutNode = lutNode
    this.lutName = lutName
  }

  setup(builder: NodeBuilder): unknown {
    this.lutNode.build(builder)
    return super.setup(builder)
  }

  clone(): this {
    return new LUTTextureNode(this.lutNode, this.lutName) as this
  }
}

class LUTTexture3DNode extends Texture3DNode {
  static get type(): string {
    return 'LUTTexture3DNode'
  }

  private readonly lutNode: AtmosphereLUTNode
  private readonly lutName: LUTName<3>

  constructor(lutNode: AtmosphereLUTNode, lutName: LUTName<3>) {
    super(lutNode.getTexture(lutName))
    this.lutNode = lutNode
    this.lutName = lutName
  }

  setup(builder: NodeBuilder): unknown {
    this.lutNode.build(builder)
    return super.setup(builder)
  }

  clone(): this {
    return new LUTTexture3DNode(this.lutNode, this.lutName) as this
  }
}

export class AtmosphereLUTNode extends TempNode {
  static get type(): string {
    return 'AtmosphereLUTNode'
  }

  readonly parameters: AtmosphereParameters
  textureType?: AnyFloatType // TODO

  private readonly material = new AdditiveNodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  private readonly transmittanceRT: RenderTarget
  private readonly irradianceRT: RenderTarget
  private readonly scatteringRT: RenderTarget3D
  private readonly singleMieScatteringRT: RenderTarget3D
  private readonly higherOrderScatteringRT: RenderTarget3D

  private readonly textureNodes: Partial<
    Record<LUTName, ShaderNodeObject<LUTTextureNode | LUTTexture3DNode>>
  > = {}

  private updating = false
  private disposeQueue: (() => void) | undefined

  constructor(parameters = new AtmosphereParameters()) {
    super(null)

    this.parameters = parameters
    this.transmittanceRT = createRenderTarget('transmittance')
    this.irradianceRT = createRenderTarget('irradiance')
    this.scatteringRT = createRenderTarget3D('scattering')
    this.singleMieScatteringRT = createRenderTarget3D('singleMieScattering')
    this.higherOrderScatteringRT = createRenderTarget3D('higherOrderScattering')

    this.updateBeforeType = NodeUpdateType.NONE
    this.updateType = NodeUpdateType.NONE
    this.global = true // TODO
  }

  getTexture(name: LUTName<2>): Texture
  getTexture(name: LUTName<3>): Data3DTexture
  getTexture(name: LUTName): Texture | Data3DTexture {
    return this[`${name}RT`].texture
  }

  getTextureNode(name: LUTName<2>): ShaderNodeObject<LUTTextureNode>
  getTextureNode(name: LUTName<3>): ShaderNodeObject<LUTTexture3DNode>
  getTextureNode(
    name: LUTName
  ): ShaderNodeObject<LUTTextureNode | LUTTexture3DNode> {
    return (this.textureNodes[name] ??= nodeObject(
      lutTypes[name] === 2
        ? new LUTTextureNode(this, name as LUTName<2>)
        : new LUTTexture3DNode(this, name as LUTName<3>)
    ))
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

  private computeTransmittance(
    renderer: Renderer,
    { opticalDepthRT }: Context
  ): void {
    const result = computeTransmittanceToTopAtmosphereBoundaryTexture(
      this.parameters,
      screenCoordinate
    ).toVar()

    if (this.parameters.options.transmittancePrecisionLog) {
      // Compute the optical depth, and store it in opticalDepth. Avoid having
      // tiny transmittance values underflow to 0 due to half-float precision.
      this.material.fragmentNode = mrt({
        transmittance: exp(result.negate()),
        opticalDepth: result
      })
    } else {
      this.material.fragmentNode = result
    }
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget(renderer, this.transmittanceRT, [
      this.parameters.options.transmittancePrecisionLog
        ? opticalDepthRT.texture
        : undefined
    ])
  }

  private computeDirectIrradiance(
    renderer: Renderer,
    { deltaIrradianceRT, opticalDepthRT }: Context
  ): void {
    const irradiance = computeDirectIrradianceTexture(
      this.parameters,
      texture(
        this.parameters.options.transmittancePrecisionLog
          ? opticalDepthRT.texture
          : this.transmittanceRT.texture
      ),
      screenCoordinate
    )

    this.material.fragmentNode = mrt({
      deltaIrradiance: vec4(irradiance, 1),
      irradiance: vec4(vec3(0), 1)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  private computeSingleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      opticalDepthRT
    }: Context
  ): void {
    const layer = uniform(0)
    const singleScattering = computeSingleScatteringTexture(
      this.parameters,
      texture(
        this.parameters.options.transmittancePrecisionLog
          ? opticalDepthRT.texture
          : this.transmittanceRT.texture
      ),
      vec3(screenCoordinate, layer.add(0.5))
    ).toVar()
    const rayleigh = singleScattering.get('rayleigh')
    const mie = singleScattering.get('mie')

    this.material.fragmentNode = mrt({
      scattering: vec4(
        rayleigh.mul(luminanceFromRadiance),
        mie.mul(luminanceFromRadiance).r
      ),
      deltaRayleighScattering: vec4(rayleigh, 1),
      deltaMieScattering: vec4(mie.mul(luminanceFromRadiance), 1)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaRayleighScattering and deltaMieScattering.
    clearRenderTarget(renderer, deltaRayleighScatteringRT)
    clearRenderTarget(renderer, deltaMieScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, layer, [
      deltaRayleighScatteringRT.texture,
      deltaMieScatteringRT.texture
    ])

    if (!this.parameters.options.combinedScatteringTextures) {
      renderer.copyTextureToTexture(
        deltaMieScatteringRT.texture,
        this.singleMieScatteringRT.texture,
        new Box3(new Vector3(), this.parameters.scatteringTextureSize)
      )
    }
  }

  private computeScatteringDensity(
    renderer: Renderer,
    {
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaScatteringDensityRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    }: Context,
    scatteringOrder: number
  ): void {
    const layer = uniform(0)
    const radiance = computeScatteringDensityTexture(
      this.parameters,
      texture(
        this.parameters.options.transmittancePrecisionLog
          ? opticalDepthRT.texture
          : this.transmittanceRT.texture
      ),
      texture3D(deltaRayleighScatteringRT.texture),
      texture3D(deltaMieScatteringRT.texture),
      texture3D(deltaMultipleScatteringRT.texture),
      texture(deltaIrradianceRT.texture),
      vec3(screenCoordinate, layer.add(0.5)),
      int(scatteringOrder)
    )

    this.material.fragmentNode = vec4(radiance, 1)
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget3D(renderer, deltaScatteringDensityRT, layer)
  }

  private computeIndirectIrradiance(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaMultipleScatteringRT
    }: Context,
    scatteringOrder: number
  ): void {
    const irradiance = computeIndirectIrradianceTexture(
      this.parameters,
      texture3D(deltaRayleighScatteringRT.texture),
      texture3D(deltaMieScatteringRT.texture),
      texture3D(deltaMultipleScatteringRT.texture),
      screenCoordinate,
      int(scatteringOrder - 1)
    ).toVar()

    this.material.fragmentNode = mrt({
      deltaIrradiance: irradiance,
      irradiance: irradiance.mul(luminanceFromRadiance)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  private computeMultipleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaScatteringDensityRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    }: Context
  ): void {
    const layer = uniform(0)
    const multipleScattering = computeMultipleScatteringTexture(
      this.parameters,
      texture(
        this.parameters.options.transmittancePrecisionLog
          ? opticalDepthRT.texture
          : this.transmittanceRT.texture
      ),
      texture3D(deltaScatteringDensityRT.texture),
      vec3(screenCoordinate, layer.add(0.5))
    ).toVar()
    const radiance = multipleScattering.get('radiance')
    const cosViewSun = multipleScattering.get('cosViewSun')
    const luminance = radiance
      .mul(luminanceFromRadiance)
      .div(rayleighPhaseFunction(cosViewSun))
      .toVar()

    const mrtLayout: Record<string, Node> = {
      scattering: vec4(luminance, 0),
      // deltaMultipleScattering is shared with deltaRayleighScattering.
      deltaRayleighScattering: vec4(radiance, 1)
    }
    if (this.parameters.options.higherOrderScatteringTexture) {
      mrtLayout.higherOrderScattering = vec4(luminance, 1)
    }
    this.material.fragmentNode = mrt(mrtLayout)
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaMultipleScattering.
    clearRenderTarget(renderer, deltaMultipleScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, layer, [
      deltaMultipleScatteringRT.texture,
      this.parameters.options.higherOrderScatteringTexture
        ? this.higherOrderScatteringRT.texture
        : undefined
    ])
  }

  private *precompute(renderer: Renderer, context: Context): Iterable<boolean> {
    // MRT doesn't work unless clearing the render target first. Perhaps it's a
    // limitation of WebGPU. I saw a similar comment in Three.js source code but
    // can't recall where.
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

  updateBefore({ renderer }: Partial<NodeFrame>): void {
    if (renderer == null) {
      return
    }
    invariant(this.textureType != null)
    const context = new Context(this.textureType, this.parameters)
    this.updating = true

    timeSlice(this.precompute(renderer, context))
      .catch((error: unknown) => {
        throw error instanceof Error ? error : new Error()
      })
      .finally(() => {
        this.updating = false
        context.dispose()
        this.disposeQueue?.()
      })
  }

  setup(builder: NodeBuilder): unknown {
    this.textureType = isFloatLinearSupported(builder.renderer)
      ? (this.textureType ?? FloatType)
      : HalfFloatType

    setupRenderTarget(
      this.transmittanceRT,
      this.textureType,
      this.parameters.transmittanceTextureSize
    )
    setupRenderTarget(
      this.irradianceRT,
      this.textureType,
      this.parameters.irradianceTextureSize
    )
    setupRenderTarget3D(
      this.scatteringRT,
      this.textureType,
      this.parameters.scatteringTextureSize
    )
    if (!this.parameters.options.combinedScatteringTextures) {
      setupRenderTarget3D(
        this.singleMieScatteringRT,
        this.textureType,
        this.parameters.scatteringTextureSize
      )
    }
    if (this.parameters.options.higherOrderScatteringTexture) {
      setupRenderTarget3D(
        this.higherOrderScatteringRT,
        this.textureType,
        this.parameters.scatteringTextureSize
      )
    }

    this.updateBefore(builder)
    return super.setup(builder)
  }

  dispose(): void {
    if (this.updating) {
      this.disposeQueue = () => {
        this.dispose()
        this.disposeQueue = undefined
      }
      return
    }

    this.transmittanceRT.dispose()
    this.irradianceRT.dispose()
    this.scatteringRT.dispose()
    this.singleMieScatteringRT.dispose()
    this.higherOrderScatteringRT.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}

export const atmosphereLUT = (
  ...args: ConstructorParameters<typeof AtmosphereLUTNode>
): ShaderNodeObject<AtmosphereLUTNode> =>
  nodeObject(new AtmosphereLUTNode(...args))
