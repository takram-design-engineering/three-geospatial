import styled from '@emotion/styled'
import { OrbitControls } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import {
  AngleFromSun,
  Body,
  Equator,
  Horizon,
  Illumination,
  Observer,
  Pivot,
  RotateVector,
  Rotation_EQD_HOR,
  type AstroTime,
  type EquatorialCoordinates,
  type HorizontalCoordinates
} from 'astronomy-engine'
import { atom, getDefaultStore, useAtomValue, useSetAtom } from 'jotai'
import { useMotionValueEvent, type MotionValue } from 'motion/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentRef,
  type FC,
  type ReactNode
} from 'react'
import {
  AgXToneMapping,
  BufferGeometry,
  Line,
  LinearSRGBColorSpace,
  Matrix4,
  NoColorSpace,
  NoToneMapping,
  Object3D,
  Shape,
  TextureLoader,
  Vector3,
  type Group,
  type PerspectiveCamera
} from 'three'
import { div, pass, texture, toneMapping, uniform } from 'three/tsl'
import {
  LineBasicNodeMaterial,
  LineDashedNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getMoonFixedToECIRotationMatrix,
  getSunDirectionECI,
  toAstroTime
} from '@takram/three-atmosphere'
import { AtmosphereContextNode, sky } from '@takram/three-atmosphere/webgpu'
import {
  degrees,
  Geodetic,
  radians,
  reinterpretType
} from '@takram/three-geospatial'
import { dithering, lensFlare } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControls,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  locationArgs,
  locationArgTypes,
  useLocationControls,
  type LocationArgs
} from '../controls/locationControls'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import { useCombinedChange } from '../hooks/useCombinedChange'
import { useControl } from '../hooks/useControl'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'
import { useSpringControl } from '../hooks/useSpringControl'

extend({ LineObject: Line })

declare module '@react-three/fiber' {
  interface ThreeElements {
    lineObject: ThreeElement<typeof Line>
  }
}

const stateAtom = atom<{
  time: AstroTime
  observer: Observer
  sunEQD: EquatorialCoordinates
  sunHOR: HorizontalCoordinates
  moonEQD: EquatorialCoordinates
  moonHOR: HorizontalCoordinates
  moonScale: number
  moonIntensity: number
}>()

const up = new Vector3(0, 1, 0)
const east = new Vector3(0, 0, 1)
const moonAngularRadius = 0.0045

const geodetic = new Geodetic()
const vector1 = new Vector3()
const vector2 = new Vector3()
const matrix = new Matrix4()

const circleGeometry = new BufferGeometry().setFromPoints(
  new Shape().arc(0, 0, 1, 0, Math.PI * 2).getPoints(90)
)
const semicircleGeometry = new BufferGeometry().setFromPoints(
  new Shape().arc(0, 0, 1, -Math.PI / 2, Math.PI / 2).getPoints(90)
)

const cameraZoom = uniform(1).onRenderUpdate(({ camera }, self) => {
  reinterpretType<PerspectiveCamera>(camera)
  self.value = camera.zoom
})

function directionFromHOR(
  coord: HorizontalCoordinates,
  result: Vector3
): Vector3 {
  return result.setFromSphericalCoords(
    1,
    radians(90 - coord.altitude),
    radians(90 - coord.azimuth)
  )
}

const Overlay: FC<{ children?: ReactNode }> = ({ children }) => {
  const camera = useThree(({ camera }) => camera)
  const groupRef = useRef<Group>(null)
  useGuardedFrame(() => {
    const group = groupRef.current
    if (group != null) {
      group.position.setFromMatrixPosition(camera.matrixWorld)
    }
  })
  const showOverlay = useControl(({ showOverlay }: StoryArgs) => showOverlay)
  return (
    <group ref={groupRef} visible={showOverlay}>
      {children}
    </group>
  )
}

const PrimaryCircles: FC = () => {
  const material = useResource(
    () =>
      new LineDashedNodeMaterial({
        color: '#666666',
        dashSizeNode: div(0.005, cameraZoom),
        gapSizeNode: div(0.005, cameraZoom)
      }),
    []
  )
  const northMaterial = useResource(
    () =>
      new LineDashedNodeMaterial({
        color: '#cc0000',
        dashSizeNode: div(0.005, cameraZoom),
        gapSizeNode: div(0.005, cameraZoom)
      }),
    []
  )
  return (
    <Overlay>
      <lineObject
        ref={ref => ref?.computeLineDistances()}
        geometry={semicircleGeometry}
        material={northMaterial}
      />
      <lineObject
        ref={ref => ref?.computeLineDistances()}
        geometry={semicircleGeometry}
        material={material}
        rotation-z={Math.PI}
      />
      <lineObject
        ref={ref => ref?.computeLineDistances()}
        geometry={circleGeometry}
        material={material}
        rotation-y={Math.PI / 2}
      />
      <lineObject
        ref={ref => ref?.computeLineDistances()}
        geometry={circleGeometry}
        material={material}
        rotation-x={Math.PI / 2}
      />
    </Overlay>
  )
}

const MoonOverlay: FC<{ moonScale: MotionValue<number> }> = ({ moonScale }) => {
  const material = useResource(
    () =>
      new LineBasicNodeMaterial({
        color: '#666666'
      }),
    []
  )
  const [target, azimuth, altitude] = useMemo(
    () => [
      new Line(circleGeometry, material),
      new Line(circleGeometry, material),
      new Line(circleGeometry, material)
    ],
    [material]
  )

  const store = getDefaultStore()

  const update = useCallback(() => {
    const state = store.get(stateAtom)
    if (state == null) {
      return
    }
    const direction = directionFromHOR(state.moonHOR, vector1)
    target.position.copy(direction)
    target.quaternion.setFromUnitVectors(east, direction)
    target.scale.setScalar(moonAngularRadius * moonScale.get() * 2)

    const theta = vector2.copy(up).cross(direction).normalize()
    azimuth.quaternion.setFromUnitVectors(east, theta)

    const phi = vector2.copy(direction).multiplyScalar(direction.dot(up))
    phi.subVectors(up, phi).normalize()
    altitude.quaternion.setFromUnitVectors(east, phi)
  }, [target, azimuth, altitude, store, moonScale])

  useMotionValueEvent(moonScale, 'change', () => {
    update()
  })

  useEffect(() => {
    update()
    return store.sub(stateAtom, update)
  }, [store, update])

  return (
    <Overlay>
      <primitive object={target} />
      <primitive object={azimuth} />
      <primitive object={altitude} />
    </Overlay>
  )
}

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  renderer.toneMapping = NoToneMapping
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const context = useResource(() => new AtmosphereContextNode(), [])
  context.camera = camera

  // Post-processing:

  const [postProcessing, skyNode, toneMappingNode] = useResource(
    manage => {
      const passNode = manage(pass(scene, camera))

      const skyNode = manage(sky(context))
      skyNode.moonNode.colorNode = texture(
        new TextureLoader().load('public/moon/color_large.webp', texture => {
          texture.colorSpace = LinearSRGBColorSpace
          texture.anisotropy = 16
        })
      )
      skyNode.moonNode.normalNode = texture(
        new TextureLoader().load('public/moon/normal_large.webp', texture => {
          texture.colorSpace = NoColorSpace
          texture.anisotropy = 16
        })
      )

      const lensFlareNode = manage(lensFlare(skyNode))
      const toneMappingNode = manage(
        toneMapping(AgXToneMapping, uniform(1), lensFlareNode)
      )

      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = toneMappingNode.rgb
        .mul(passNode.a.oneMinus())
        .add(passNode.rgb)
        .add(dithering)

      return [postProcessing, skyNode, toneMappingNode]
    },
    [renderer, scene, camera, context]
  )

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    postProcessing.needsUpdate = true
  })

  // Location controls:
  const [longitude, latitude, height] = useLocationControls(
    context.matrixWorldToECEF.value
  )

  // Local date controls (depends on the longitude of the location):
  const date = useLocalDateControls()

  // The moon scale and intensity:
  const moonScale = useSpringControl(
    ({ moonScale }: StoryArgs) => moonScale,
    value => {
      skyNode.moonNode.angularRadius.value = moonAngularRadius * value
    }
  )
  const moonIntensity = useSpringControl(
    ({ moonIntensity }: StoryArgs) => moonIntensity,
    value => {
      skyNode.moonNode.intensity.value = value
      skyNode.starsNode.intensity.value = value
    }
  )

  // Update the sun and moon state:
  const set = useSetAtom(stateAtom)
  useCombinedChange(
    [longitude, latitude, height, date, moonScale, moonIntensity],
    ([longitude, latitude, height, date, moonScale, moonIntensity]) => {
      const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context

      const time = toAstroTime(date)
      getECIToECEFRotationMatrix(time, matrixECIToECEF.value)
      getSunDirectionECI(time, sunDirectionECEF.value).applyMatrix4(
        matrixECIToECEF.value
      )
      getMoonDirectionECI(
        time,
        moonDirectionECEF.value,
        geodetic.set(radians(longitude), radians(latitude), height).toECEF()
      ).applyMatrix4(matrixECIToECEF.value)

      const { matrixMoonFixedToECEF } = context
      getMoonFixedToECIRotationMatrix(
        time,
        matrixMoonFixedToECEF.value
      ).multiplyMatrices(matrixECIToECEF.value, matrixMoonFixedToECEF.value)

      try {
        const observer = new Observer(latitude, longitude, height)
        const sunEQD = Equator(Body.Sun, time, observer, true, false)
        const sunHOR = Horizon(time, observer, sunEQD.ra, sunEQD.dec)
        const moonEQD = Equator(Body.Moon, time, observer, true, false)
        const moonHOR = Horizon(time, observer, moonEQD.ra, moonEQD.dec)
        set({
          observer,
          time,
          sunEQD,
          sunHOR,
          moonEQD,
          moonHOR,
          moonScale,
          moonIntensity
        })
      } catch (error) {
        console.error(error)
      }
    }
  )

  // Zoom control:
  useSpringControl(
    ({ zoom }: StoryArgs) => zoom,
    value => {
      camera.zoom = value
      camera.updateProjectionMatrix()
    }
  )

  // Tracking the moon:
  const { trackMoon, northUp } = useControl(
    ({ trackMoon, northUp }: StoryArgs) => ({ trackMoon, northUp })
  )

  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const store = getDefaultStore()

  useGuardedFrame(() => {
    const controls = controlsRef.current
    const state = store.get(stateAtom)
    if (controls == null || state == null) {
      return
    }
    if (northUp) {
      matrix.copy(context.matrixWorldToECEF.value).transpose()
      camera.up.set(0, 0, 1).applyMatrix4(matrix)
    } else {
      camera.up.copy(Object3D.DEFAULT_UP)
    }
    if (trackMoon) {
      const position = vector1.setFromMatrixPosition(camera.matrixWorld)
      const direction = directionFromHOR(state.moonHOR, vector2)
      const target = position.add(direction)
      camera.lookAt(target)
      controls.target.copy(target)
    }
    controls.update()
  })

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enableZoom={false} // Conflicts with the zoom arg
        enabled={!trackMoon}
      />
      <PrimaryCircles />
      <MoonOverlay moonScale={moonScale} />
    </>
  )
}

const InfoElement = styled('div')`
  table {
    margin-top: 8px;
  }

  td,
  th {
    padding: 0;
    font-weight: normal;
    vertical-align: top;
  }

  th {
    padding-right: 16px;
    text-align: left;
  }
`

const Value = styled('span')<{ off?: boolean }>`
  color: rgba(
    255,
    255,
    255,
    ${({ off = false }) => (off ? 'calc(2 / 3)' : '1')}
  );
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
`

// Based on https://github.com/cosinekitty/astronomy/blob/master/demo/nodejs/camera.js
const Info: FC = () => {
  const state = useAtomValue(stateAtom)
  if (state == null) {
    return null
  }

  const { time, observer, moonHOR, sunEQD, moonScale, moonIntensity } = state
  const { azimuth, altitude } = moonHOR

  let rotation = Rotation_EQD_HOR(time, observer)
  rotation = Pivot(rotation, 2, moonHOR.azimuth)
  rotation = Pivot(rotation, 1, moonHOR.altitude)

  const sunVector = RotateVector(rotation, sunEQD.vec)
  const tilt = degrees(Math.atan2(sunVector.y, sunVector.z))
  const illumination = Illumination(Body.Moon, time)
  const angle = AngleFromSun(Body.Moon, time)

  return (
    <InfoElement>
      The moon's apparent size is <Value>{moonScale.toFixed(1)}</Value> times
      its actual size, and its luminance is{' '}
      <Value>{moonIntensity.toFixed(1)}</Value> times its actual luminance.
      <table>
        <tbody>
          <tr>
            <th>Azimuth</th>
            <td>
              <Value>{azimuth.toFixed(2)}</Value> deg
            </td>
          </tr>
          <tr>
            <th>Altitude</th>
            <td>
              <Value>{altitude.toFixed(2)}</Value> deg
            </td>
          </tr>
          <tr>
            <th>Sun vector</th>
            <td>
              X = <Value>{sunVector.x.toFixed(4)}</Value>, Y ={' '}
              <Value>{sunVector.y.toFixed(4)}</Value>, Z ={' '}
              <Value>{sunVector.z.toFixed(4)}</Value>
            </td>
          </tr>
          <tr>
            <th>Tilt angle of sunlit side</th>
            <td>
              <Value>{Math.abs(tilt).toFixed(2)}</Value> deg{' '}
              {tilt < 0 ? 'clockwise' : 'counter-clockwise'} from up
            </td>
          </tr>
          <tr>
            <th>Magnitude</th>
            <td>
              <Value>{illumination.mag.toFixed(2)}</Value>
            </td>
          </tr>
          <tr>
            <th>Phase angle</th>
            <td>
              <Value>{illumination.phase_angle.toFixed(2)}</Value> deg (
              <Value off>0</Value> deg = full, <Value off>90</Value> deg = half,{' '}
              <Value off>180</Value> deg = new)
            </td>
          </tr>
          <tr>
            <th>Angle between sun and moon</th>
            <td>
              <Value>{angle.toFixed(2)}</Value> deg
            </td>
          </tr>
        </tbody>
      </table>
    </InfoElement>
  )
}

interface StoryProps {}

interface StoryArgs extends ToneMappingArgs, LocationArgs, LocalDateArgs {
  zoom: number
  showOverlay: boolean
  trackMoon: boolean
  northUp: boolean
  moonScale: number
  moonIntensity: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas camera={{ position: [1, -0.3, 0] }}>
    <Content {...props} />
    <Description>
      <Info />
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  zoom: 1,
  showOverlay: true,
  trackMoon: false,
  northUp: false,
  moonScale: 1,
  moonIntensity: 10,
  ...localDateArgs({
    dayOfYear: 301,
    timeOfDay: 17.5
  }),
  ...locationArgs({
    longitude: 30,
    latitude: 35,
    height: 300
  }),
  ...toneMappingArgs({
    toneMappingEnabled: true,
    toneMappingExposure: 10
  }),
  ...rendererArgs()
}

Story.argTypes = {
  zoom: {
    control: {
      type: 'range',
      min: 1,
      max: 100,
      step: 0.1
    }
  },
  showOverlay: {
    name: 'overlay',
    control: {
      type: 'boolean'
    }
  },
  trackMoon: {
    control: {
      type: 'boolean'
    }
  },
  northUp: {
    control: {
      type: 'boolean'
    }
  },
  moonScale: {
    name: 'scale',
    control: {
      type: 'range',
      min: 1,
      max: 20,
      step: 0.1
    },
    table: { category: 'moon' }
  },
  moonIntensity: {
    name: 'intensity',
    control: {
      type: 'range',
      min: 1,
      max: 1000
    },
    table: { category: 'moon' }
  },
  ...localDateArgTypes(),
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...rendererArgTypes()
}

export default Story
