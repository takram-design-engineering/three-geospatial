/**
 * 3D Earth visualization with atmospheric effects and 3D tiles
 */
import { type StoryFn } from '@storybook/react'
// Core components for 3D globe rendering
import { GlobeControls, TilesRenderer } from '3d-tiles-renderer'
// Plugins for enhancing 3D Tiles functionality
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UnloadTilesPlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
// Post-processing components for visual effects
import {
  EffectComposer,
  EffectMaterial,
  EffectPass,
  NormalPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode
} from 'postprocessing'
import { useLayoutEffect } from 'react'
// Three.js core components
import {
  HalfFloatType,
  Matrix4,
  Mesh,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer
} from 'three'
import { DRACOLoader } from 'three-stdlib'
import invariant from 'tiny-invariant'

// Custom plugins and atmospheric rendering components
import { TileCreasedNormalsPlugin } from '@takram/three-3d-tiles-support'
import {
  AerialPerspectiveEffect,
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI,
  PrecomputedTexturesLoader,
  SkyMaterial,
  type PrecomputedTextures
} from '@takram/three-atmosphere'
// Geospatial utilities for Earth-based positioning
import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'
import {
  DitheringEffect,
  LensFlareEffect
} from '@takram/three-geospatial-effects'

/**
 * Manages 3D Tiles rendering for Earth visualization
 */
class Globe {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  tiles: TilesRenderer
  controls: GlobeControls

  /**
   * Sets up tile rendering and navigation controls
   */
  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer
  ) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer

    // Initialize 3D Tiles renderer with plugins
    this.tiles = new TilesRenderer()
    this.tiles.registerPlugin(
      new GoogleCloudAuthPlugin({
        apiToken: import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY,
        autoRefreshToken: true
      })
    )
    this.tiles.registerPlugin(
      new GLTFExtensionsPlugin({
        dracoLoader: new DRACOLoader().setDecoderPath(
          'https://www.gstatic.com/draco/v1/decoders/'
        )
      })
    )
    // Register plugins for tile management and visual quality
    this.tiles.registerPlugin(new TileCompressionPlugin())
    this.tiles.registerPlugin(new UpdateOnChangePlugin())
    this.tiles.registerPlugin(new UnloadTilesPlugin())
    this.tiles.registerPlugin(new TilesFadePlugin())
    this.tiles.registerPlugin(
      new TileCreasedNormalsPlugin({
        creaseAngle: 45
      })
    )

    // Configure tiles renderer with camera settings
    this.tiles.setResolutionFromRenderer(this.camera, this.renderer)
    this.tiles.setCamera(this.camera)

    // Initialize globe navigation controls
    this.controls = new GlobeControls(
      this.scene,
      this.camera,
      this.renderer.domElement,
      this.tiles
    )
    this.controls.enableDamping = true
  }

  /**
   * Updates globe state for each frame
   */
  update(): void {
    this.controls.enabled = true
    this.controls.update()

    // Update camera and tile renderer state
    this.camera.updateMatrixWorld()
    this.tiles.setResolutionFromRenderer(this.camera, this.renderer)
    this.tiles.setCamera(this.camera)

    this.tiles.update()
  }
}

// Global rendering system variables
let renderer: WebGLRenderer
let camera: PerspectiveCamera
let scene: Scene
let skyMaterial: SkyMaterial
let aerialPerspective: AerialPerspectiveEffect
let composer: EffectComposer
let globe: Globe

// Vectors for celestial calculations
const sunDirection = new Vector3()
const moonDirection = new Vector3()
const rotationMatrix = new Matrix4()

// Reference time for sun/moon position (Tokyo time 06:00AM)
const referenceDate = new Date('2025-05-10T06:00:00+09:00')

/**
 * Initializes the 3D scene, renderer, camera, and visual effects
 */
function init(): void {
  const container = document.getElementById('container')
  invariant(container != null)

  // Initialize WebGL renderer
  renderer = new WebGLRenderer({
    depth: false,
    logarithmicDepthBuffer: false
  })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = NoToneMapping
  renderer.toneMappingExposure = 10
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap

  container.appendChild(renderer.domElement)

  // Initialize camera
  const aspect = window.innerWidth / window.innerHeight
  camera = new PerspectiveCamera(75, aspect, 10, 1e6)

  // Set up camera position using geospatial coordinates (Tokyo)
  const longitude = 139.7671
  const latitude = 35.6812
  const heading = 180
  const pitch = -30
  const distance = 4500

  // Calculate the center point on the globe in ECEF coordinates
  const centerECEF = new Geodetic(
    radians(longitude),
    radians(latitude)
  ).toECEF() // Converts lon/lat to a Vector3 position

  // Calculate camera position and orientation based on the point of view
  new PointOfView(distance, radians(heading), radians(pitch)).decompose(
    centerECEF, // The point to look towards (target)
    camera.position, // Vector3 to store the calculated camera position
    camera.quaternion // Quaternion to store the calculated camera orientation
  )

  // Ensure the camera's up vector is set correctly
  camera.up.set(0, 1, 0)

  // Update projection matrix
  camera.aspect = aspect
  camera.updateProjectionMatrix()

  scene = new Scene()

  // Create sky dome using SkyMaterial
  skyMaterial = new SkyMaterial()
  const sky = new Mesh(new PlaneGeometry(2, 2), skyMaterial)
  sky.frustumCulled = false
  scene.add(sky)

  // Initialize the globe with 3D tiles
  globe = new Globe(scene, camera, renderer)
  scene.add(globe.tiles.group)

  // Set up aerial perspective effect for atmospheric scattering
  // Using forward lighting pipeline
  aerialPerspective = new AerialPerspectiveEffect(camera, {
    correctGeometricError: true,
    correctAltitude: true,
    inscatter: true,
    photometric: true,
    skyIrradiance: true,
    sunIrradiance: true,
    transmittance: true,
    irradianceScale: 2 / Math.PI,
    sky: true,
    sun: true,
    moon: true
  })

  // Set up post-processing pipeline with HDR rendering
  composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling: 0
  })
  const normalPass = new NormalPass(scene, camera)
  aerialPerspective.normalBuffer = normalPass.texture

  // Add rendering passes to the post-processing pipeline
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(normalPass)
  composer.addPass(new EffectPass(camera, aerialPerspective))
  composer.addPass(
    new EffectPass(
      camera,
      new LensFlareEffect(),
      new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
      new DitheringEffect()
    )
  )

  // Load precomputed atmospheric scattering textures
  new PrecomputedTexturesLoader()
    .setTypeFromRenderer(renderer)
    .load('atmosphere', onPrecomputedTexturesLoad)

  window.addEventListener('resize', onWindowResize)
}

/**
 * Handles loaded atmospheric textures and starts rendering
 */
function onPrecomputedTexturesLoad(textures: PrecomputedTextures): void {
  // Apply textures to materials
  Object.assign(skyMaterial, textures)
  Object.assign(aerialPerspective, textures)

  // Start the rendering loop
  renderer.setAnimationLoop(render)
}

/**
 * Handles window resize events
 */
function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

/**
 * Main render function called each frame
 */
function render(): void {
  // Calculate sun and moon directions
  getECIToECEFRotationMatrix(referenceDate, rotationMatrix)
  getSunDirectionECI(referenceDate, sunDirection).applyMatrix4(rotationMatrix)
  getMoonDirectionECI(referenceDate, moonDirection).applyMatrix4(rotationMatrix)

  // Apply sun/moon directions to materials
  skyMaterial.sunDirection.copy(sunDirection)
  skyMaterial.moonDirection.copy(moonDirection)
  aerialPerspective.sunDirection.copy(sunDirection)
  aerialPerspective.moonDirection.copy(moonDirection)

  // Update the globe
  globe.update()

  // Update effect materials with current camera settings
  composer.passes.forEach(pass => {
    if (pass.fullscreenMaterial instanceof EffectMaterial) {
      pass.fullscreenMaterial.adoptCameraSettings(camera)
    }
  })
  composer.render()
}

/**
 * React component for Storybook
 */
const Story: StoryFn = () => {
  useLayoutEffect(() => {
    init()
  }, [])
  return <div id='container' />
}

export default Story
