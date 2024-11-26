/* eslint-disable */
import { type Config } from 'jest'

export default {
  displayName: '3d-tiles',
  preset: '../../jest.preset.js',
  transform: {
    '^.+\\.[tj]sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } }
        }
      }
    ],
    '.+\\.(glsl|frag|vert)$': '@glen/jest-raw-loader'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/packages/3d-tiles'
} satisfies Config
