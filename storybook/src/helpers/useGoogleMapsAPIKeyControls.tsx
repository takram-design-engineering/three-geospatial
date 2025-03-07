import { useAtom } from 'jotai'
import { Components, createPlugin, useInputContext } from 'leva/plugin'
import type React from 'react'

import { googleMapsApiKeyAtom } from './states'
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

export function useGoogleMapsAPIKeyControls(): string {
  const [apiKey, setApiKey] = useAtom(googleMapsApiKeyAtom)
  useControls('google maps', {
    apiKey: {
      value: apiKey,
      onChange: value => {
        setApiKey(value)
      }
    },
    ' ': text('Enter your Google Maps API key if tiles are not being loaded.')
  })
  return apiKey
}
