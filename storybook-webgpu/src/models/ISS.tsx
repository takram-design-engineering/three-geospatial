import { useGLTF } from '@react-three/drei'
import {
  useMotionValueEvent,
  useSpring,
  type SpringOptions
} from 'motion/react'
import { useLayoutEffect, useMemo, type ComponentProps, type FC } from 'react'
import { Matrix3, Vector3, type Matrix4 } from 'three'

import { useGuardedFrame } from '../helpers/useGuardedFrame'

const options: SpringOptions = {
  mass: 2,
  damping: 40
}

const vector = new Vector3()
const rotation = new Matrix3()

interface ISSProps extends ComponentProps<'group'> {
  worldToECEFMatrix: Matrix4
  sunDirectionECEF: Vector3
}

export const ISS: FC<ISSProps> = ({
  worldToECEFMatrix,
  sunDirectionECEF,
  ...props
}) => {
  const iss = useGLTF('public/iss.glb')
  useLayoutEffect(() => {
    Object.values(iss.meshes).forEach(mesh => {
      mesh.receiveShadow = true
      mesh.castShadow = true
    })
  }, [iss])

  const { trusses, solarPanels, radiators } = useMemo(() => {
    const scene = iss.scene
    return {
      trusses: [
        scene.getObjectByName('23_S4_Truss'),
        scene.getObjectByName('20_P4_Truss')
      ].filter(value => value != null),
      solarPanels: [
        scene.getObjectByName('23_S4_Truss_01'),
        scene.getObjectByName('23_S4_Truss_02'),
        scene.getObjectByName('32_S6_Truss_01'),
        scene.getObjectByName('32_S6_Truss_02'),
        scene.getObjectByName('20_P4_Truss_01'),
        scene.getObjectByName('20_P4_Truss_02'),
        scene.getObjectByName('08_P6_Truss_01'),
        scene.getObjectByName('08_P6_Truss_02')
      ].filter(value => value != null),
      radiators: [
        scene.getObjectByName('16_S1_Truss_02'),
        scene.getObjectByName('17_P1_Truss_02')
      ].filter(value => value != null)
    }
  }, [iss.scene])

  const springTrussAngle = useSpring(trusses[0].rotation.x, options)
  const springSolarPanelAngle = useSpring(solarPanels[0].rotation.z, options)
  const springRadiatorAngle = useSpring(radiators[0].rotation.z, options)

  useGuardedFrame(() => {
    const sunDirectionLocal = vector
      .copy(sunDirectionECEF)
      .applyMatrix3(rotation.setFromMatrix4(worldToECEFMatrix).transpose())
      .normalize()
      .applyMatrix3(rotation.setFromMatrix4(iss.scene.matrixWorld).transpose())
      .normalize()

    const { x, y, z } = sunDirectionLocal
    const trussAngle = Math.atan2(z, y)
    const cosTruss = Math.cos(trussAngle)
    const sinTruss = Math.sin(trussAngle)
    const solarPanelAngle = Math.atan2(x, y * cosTruss + z * sinTruss)
    const sunDirectionXY = vector.set(x, y, 0).normalize()
    const radiatorAngle = Math.atan2(sunDirectionXY.x, sunDirectionXY.y)

    springTrussAngle.set(trussAngle)
    springSolarPanelAngle.set(solarPanelAngle)
    springRadiatorAngle.set(radiatorAngle)
  })

  useMotionValueEvent(springTrussAngle, 'change', value => {
    for (const truss of trusses) {
      truss.rotation.x = value
    }
  })
  useMotionValueEvent(springSolarPanelAngle, 'change', value => {
    for (const solarPanel of solarPanels) {
      solarPanel.rotation.z = value
    }
  })
  useMotionValueEvent(springRadiatorAngle, 'change', value => {
    for (const radiator of radiators) {
      radiator.rotation.z = value
    }
  })

  return <primitive object={iss.scene} {...props} />
}
