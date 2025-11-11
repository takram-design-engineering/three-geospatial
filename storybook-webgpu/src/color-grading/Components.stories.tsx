import styled from '@emotion/styled'
import type { Meta, StoryFn } from '@storybook/react-vite'
import { use } from 'react'

import {
  Histogram as HistogramComponent,
  Vectorscope as VectorscopeComponent,
  VideoContext,
  Waveform as WaveformComponent
} from '@takram/three-color-grading/r3f'

import { WebGPUCanvas } from '../components/WebGPUCanvas'

const Hidden = styled.div`
  overflow: hidden;
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
`

export default {
  title: 'color grading/Components',
  globals: {
    backgrounds: { value: 'dark' }
  },
  decorators: [
    Story => {
      const { r3f } = use(VideoContext)
      return (
        <>
          <Story />
          <Hidden>
            <WebGPUCanvas>
              <r3f.Out />
            </WebGPUCanvas>
          </Hidden>
        </>
      )
    }
  ]
} satisfies Meta

export const Waveform: StoryFn = () => <WaveformComponent />

export const Histogram: StoryFn = () => <HistogramComponent />

export const Vectorscope: StoryFn = () => <VectorscopeComponent />
