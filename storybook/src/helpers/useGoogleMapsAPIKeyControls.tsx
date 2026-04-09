import { useAtom } from 'jotai'
import { Components, createPlugin, useInputContext } from 'leva/plugin'
import type React from 'react'

import { cesiumIonTokenAtom, googleMapsApiKeyAtom } from './states'
import { useControls } from './useControls'

const { Row, String } = Components

function Text(): React.JSX.Element {
  const { value, onUpdate, onChange } = useInputContext<{ value: string }>()
  return (
    <Row>
      <String
        displayValue={value}
        onUpdate={onUpdate}
        onChange={onChange}
        editable={false}
      />
    </Row>
  )
}

const text = createPlugin({
  component: Text
})

export function useGoogleMapsAPIKeyControls(): void {
  const [cesiumIonToken, setCesiumIonToken] = useAtom(cesiumIonTokenAtom)
  const [googleMapsApiKey, setGoogleMapsApiKey] = useAtom(googleMapsApiKeyAtom)
  useControls('3d tiles', {
    cesiumIonToken: {
      value: cesiumIonToken,
      onChange: value => {
        setCesiumIonToken(value)
      }
    },
    googleMapsApiKey: {
      value: googleMapsApiKey,
      onChange: value => {
        setGoogleMapsApiKey(value)
      }
    },
    ' ': text(
      'Enter either a Cesium ion token or a Google Maps API key if tiles are not being loaded.'
    )
  })
}
