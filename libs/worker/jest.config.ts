export default {
  displayName: 'worker',
  preset: '../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' }
        }
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../coverage/libs/worker'
}
