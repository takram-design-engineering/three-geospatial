import { type Config } from 'jest'

export default {
  displayName: 'terrain-core',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
    '.+\\.(glsl|frag|vert)$': '@glen/jest-raw-loader'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/packages/terrain-core'
} satisfies Config
