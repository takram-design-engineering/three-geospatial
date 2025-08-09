import styled from '@emotion/styled'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AngleFromSun,
  Body,
  Equator,
  Horizon,
  Illumination,
  MakeTime,
  Observer,
  Pivot,
  RotateVector,
  Rotation_EQD_HOR,
  type AstroTime,
  type EquatorialCoordinates,
  type HorizontalCoordinates
} from 'astronomy-engine'
import { atom, getDefaultStore, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useMemo, useRef, type FC } from 'react'
import {
  AgXToneMapping,
  BufferGeometry,
  Line,
  Mesh,
  NoToneMapping,
  Shape,
  SphereGeometry,
  Vector3,
  type Group
} from 'three'
import { pass, toneMapping, uniform } from 'three/tsl'
import {
  LineBasicNodeMaterial,
  MeshBasicNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import {
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import {
  atmosphereLUT,
  AtmosphereRenderingContext,
  sky
} from '@takram/three-atmosphere/webgpu'
import { degrees, Geodetic, radians } from '@takram/three-geospatial'

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
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { useCombinedChange } from '../helpers/useCombinedChange'
import { useResource } from '../helpers/useResource'
import { useSpringControl } from '../helpers/useSpringControl'
import { useTransientControl } from '../helpers/useTransientControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

const stateAtom = atom<{
  time: AstroTime
  observer: Observer
  sunEQU: EquatorialCoordinates
  sunHOR: HorizontalCoordinates
  moonEQU: EquatorialCoordinates
  moonHOR: HorizontalCoordinates
}>()

const up = new Vector3(0, 1, 0)
const east = new Vector3(0, 0, 1)

const geodeticScratch = new Geodetic()
const vectorScratch1 = new Vector3()
const vectorScratch2 = new Vector3()

const sphereGeometry = new SphereGeometry(0.0025)
const circleGeometry = new BufferGeometry().setFromPoints(
  new Shape().arc(0, 0, 1, 0, Math.PI * 2).getPoints(90)
)

const Direction: FC<{ name: 'sun' | 'moon' }> = ({ name }) => {
  const camera = useThree(({ camera }) => camera)

  const groupRef = useRef<Group>(null)
  useFrame(() => {
    const group = groupRef.current
    if (group != null) {
      group.position.setFromMatrixPosition(camera.matrixWorld)
    }
  })

  const pointMaterial = useResource(
    () =>
      new MeshBasicNodeMaterial({
        color: '#808080'
      }),
    []
  )
  const directionPoint = useMemo(
    () => new Mesh(sphereGeometry, pointMaterial),
    [pointMaterial]
  )
  const lineMaterial = useResource(
    () =>
      new LineBasicNodeMaterial({
        color: '#808080',
        transparent: true,
        opacity: 0.5
      }),
    []
  )
  const [azimuthLine, altitudeLine] = useMemo(
    () => [
      new Line(circleGeometry, lineMaterial),
      new Line(circleGeometry, lineMaterial)
    ],
    [lineMaterial]
  )

  useEffect(() => {
    const store = getDefaultStore()
    const callback = (): void => {
      const state = store.get(stateAtom)
      if (state == null) {
        return
      }
      const { altitude, azimuth } = state[`${name}HOR`]
      const direction = vectorScratch1.setFromSphericalCoords(
        1,
        radians(90 - altitude),
        radians(90 - azimuth)
      )
      directionPoint.position.copy(direction)

      const theta = vectorScratch2.copy(up).cross(direction).normalize()
      azimuthLine.quaternion.setFromUnitVectors(east, theta)

      const phi = vectorScratch2
        .copy(direction)
        .multiplyScalar(direction.dot(up))
      phi.subVectors(up, phi).normalize()
      altitudeLine.quaternion.setFromUnitVectors(east, phi)
    }
    callback()
    return store.sub(stateAtom, callback)
  }, [name, directionPoint, azimuthLine, altitudeLine])

  return (
    <group ref={groupRef}>
      <primitive object={directionPoint} />
      <primitive object={azimuthLine} />
      <primitive object={altitudeLine} />
    </group>
  )
}

const Scene: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  renderer.toneMapping = NoToneMapping
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const context = useResource(() => new AtmosphereRenderingContext(), [])
  context.camera = camera

  const lutNode = useResource(() => atmosphereLUT(), [])
  const exposureNode = useResource(() => uniform(1), [])

  // Post-processing:

  const [postProcessing, toneMappingNode] = useResource(() => {
    const passNode = pass(scene, camera)

    const skyNode = sky(context, lutNode)
    skyNode.moonAngularRadius *= 5
    skyNode.moonIntensity *= 5

    const toneMappingNode = toneMapping(AgXToneMapping, exposureNode, skyNode)

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = toneMappingNode.rgb
      .mul(passNode.a.oneMinus())
      .add(passNode.rgb)

    return [postProcessing, toneMappingNode]
  }, [renderer, scene, camera, context, lutNode, exposureNode])

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Tone mapping controls:
  useTransientControl(
    ({ toneMappingEnabled, toneMapping }: ToneMappingArgs) => [
      toneMappingEnabled,
      toneMapping
    ],
    ([enabled, value]) => {
      toneMappingNode.toneMapping = enabled ? value : NoToneMapping
      postProcessing.needsUpdate = true
    }
  )
  useSpringControl(
    ({ toneMappingExposure }: ToneMappingArgs) => toneMappingExposure,
    value => {
      exposureNode.value = value
    }
  )

  // Location controls:
  const [longitude, latitude, height] = useLocationControls(
    context.worldToECEFMatrix
  )

  // Local date controls (depends on the longitude of the location):
  const date = useLocalDateControls(longitude, date => {
    const observer = geodeticScratch
      .set(radians(longitude.get()), radians(latitude.get()), height.get())
      .toECEF()
    getSunDirectionECEF(date, context.sunDirectionECEF)
    getMoonDirectionECEF(date, context.moonDirectionECEF, observer)
  })

  const set = useSetAtom(stateAtom)
  useCombinedChange(
    [longitude, latitude, height, date],
    ([longitude, latitude, height, date]) => {
      const observer = new Observer(latitude, longitude, height)
      const time = MakeTime(new Date(date))
      const sunEQU = Equator(Body.Sun, time, observer, true, false)
      const sunHOR = Horizon(time, observer, sunEQU.ra, sunEQU.dec)
      const moonEQU = Equator(Body.Moon, time, observer, true, false)
      const moonHOR = Horizon(time, observer, moonEQU.ra, moonEQU.dec)
      set({
        observer,
        time,
        sunEQU,
        sunHOR,
        moonEQU,
        moonHOR
      })
    }
  )

  return (
    <>
      <OrbitControls target={[0, 0, 0]} minDistance={1} />
      <Direction name='moon' />
      <Direction name='sun' />
    </>
  )
}

interface StoryProps {}

interface StoryArgs extends ToneMappingArgs, LocationArgs, LocalDateArgs {}

const Overlay = styled('div')`
  position: absolute;
  bottom: 16px;
  left: 16px;
  color: rgba(255, 255, 255, calc(2 / 3));
  font-size: small;
  letter-spacing: 0.025em;

  table {
    margin-top: 8px;
  }

  td,
  th {
    padding: 0;
    padding-top: 8px;
  }

  th {
    padding-right: 16px;
    text-align: left;
  }
`

const Value = styled('span')`
  color: white;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
`

// Based on https://github.com/cosinekitty/astronomy/blob/master/demo/nodejs/camera.js
const Info: FC = () => {
  const state = useAtomValue(stateAtom)
  if (state == null) {
    return null
  }
  const { time, observer, moonEQU, moonHOR, sunEQU } = state
  const { azimuth, altitude } = moonHOR

  let rotation = Rotation_EQD_HOR(time, observer)
  rotation = Pivot(rotation, 2 /* zenith */, moonHOR.azimuth)
  rotation = Pivot(rotation, 1 /* west */, moonHOR.altitude)

  let sunVector = RotateVector(rotation, moonEQU.vec)
  const sunRadius = sunVector.Length()
  sunVector.x /= sunRadius
  sunVector.y /= sunRadius
  sunVector.z /= sunRadius
  sunVector = RotateVector(rotation, sunEQU.vec)

  const tilt = degrees(Math.atan2(sunVector.y, sunVector.z))
  const illumination = Illumination(Body.Moon, time)
  const angle = AngleFromSun(Body.Moon, time)
  return (
    <Overlay>
      Moon’s apparent size and brightness are 5 times greater than the actual.
      <table>
        <tbody>
          <tr>
            <th>Azimuth</th>
            <td>
              <Value>{azimuth.toFixed(3)}</Value> degrees
            </td>
          </tr>
          <tr>
            <th>Altitude</th>
            <td>
              <Value>{altitude.toFixed(3)}</Value> degrees
            </td>
          </tr>
          <tr>
            <th>Sun vector</th>
            <td>
              X <Value>{sunVector.x.toFixed(6)}</Value> Y{' '}
              <Value>{sunVector.y.toFixed(6)}</Value> Z{' '}
              <Value>{sunVector.z.toFixed(6)}</Value>
            </td>
          </tr>
          <tr>
            <th>Tilt angle of sunlit side</th>
            <td>
              <Value>{tilt.toFixed(3)}</Value> degrees counterclockwise from up
            </td>
          </tr>
          <tr>
            <th>Magnitude</th>
            <td>
              <Value>{illumination.mag.toFixed(3)}</Value>
            </td>
          </tr>
          <tr>
            <th>Phase angle</th>
            <td>
              <Value>{illumination.phase_angle.toFixed(2)}</Value> degrees
            </td>
          </tr>
          <tr>
            <th>Angle between sun and moon</th>
            <td>
              <Value>{angle.toFixed(2)}</Value> degrees
            </td>
          </tr>
        </tbody>
      </table>
    </Overlay>
  )
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <>
    <WebGPUCanvas camera={{ position: [1, -0.3, 0] }}>
      <Scene {...props} />
    </WebGPUCanvas>
    <Info />
  </>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 300,
    timeOfDay: 17.5
  }),
  ...locationArgs({
    longitude: 30,
    latitude: 35,
    height: 300
  }),
  ...toneMappingArgs({
    toneMappingExposure: 100
  }),
  ...rendererArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...rendererArgTypes()
}

export default Story
