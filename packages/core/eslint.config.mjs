import { defineConfig } from 'eslint/config'

import baseConfig from '../../eslint.config.mjs'

export default defineConfig(
  baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['**/eslint.config.mjs', '**/vite.config.ts']
        }
      ]
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser')
    }
  },
  {
    files: ['**/*.tsx'],
    rules: {
      'react/display-name': 'error'
    }
  }
)
