import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, type ComponentProps, type FC } from 'react'
import { Matrix3, Vector3, type Matrix4 } from 'three'

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
  useEffect(() => {
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

  useFrame(() => {
    const sunDirectionLocal = vector
      .copy(sunDirectionECEF)
      .applyMatrix3(rotation.setFromMatrix4(worldToECEFMatrix).transpose())
      .normalize()
      .applyMatrix3(rotation.setFromMatrix4(iss.scene.matrixWorld).transpose())
      .normalize()

    const { x, y, z } = sunDirectionLocal
    const trussAngle = Math.atan2(z, y)
    const solarPanelAngle = Math.atan2(
      x,
      y * Math.cos(trussAngle) + z * Math.sin(trussAngle)
    )
    for (const truss of trusses) {
      truss.rotation.x = trussAngle
    }
    for (const solarPanel of solarPanels) {
      solarPanel.rotation.z = -solarPanelAngle
    }

    const sunDirectionXY = vector.set(x, y, 0).normalize()
    const radiatorAngle = Math.atan2(sunDirectionXY.x, sunDirectionXY.y)
    for (const radiator of radiators) {
      radiator.rotation.z = -radiatorAngle
    }
  })

  return <primitive object={iss.scene} {...props} />
}
