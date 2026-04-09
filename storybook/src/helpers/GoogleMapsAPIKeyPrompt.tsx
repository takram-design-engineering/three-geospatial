import { css } from '@emotion/react'
import { useAtomValue } from 'jotai'
import type { FC } from 'react'

import { needsApiKeyAtom } from './states'

export const GoogleMapsAPIKeyPrompt: FC = () => {
  const needsApiKey = useAtomValue(needsApiKeyAtom)
  return (
    needsApiKey && (
      <div
        css={css`
          position: absolute;
          top: 50%;
          left: 50%;
          color: white;
          text-align: center;
          line-height: 1.5;
          transform: translate(-50%, -50%);
        `}
      >
        Tile loading failed with the configured credentials.
        <br />
        Enter a{' '}
        <a
          href='https://ion.cesium.com/tokens'
          target='_blank'
          rel='noreferrer'
          style={{ color: 'inherit' }}
        >
          Cesium ion token
        </a>{' '}
        or a{' '}
        <a
          href='https://developers.google.com/maps/documentation/tile/get-api-key'
          target='_blank'
          rel='noreferrer'
          style={{ color: 'inherit' }}
        >
          Google Maps API key
        </a>{' '}
        at the top right of this screen.
      </div>
    )
  )
}
