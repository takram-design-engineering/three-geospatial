import storybook from 'eslint-plugin-storybook'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

import baseConfig from '../eslint.config.mjs'

export default defineConfig(
  baseConfig,
  storybook.configs['flat/recommended'],
  {
    files: ['.storybook/preview.tsx'],
    extends: [tseslint.configs.disableTypeChecked]
  },
  {
    ignores: ['storybook-static']
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'storybook/no-uninstalled-addons': [
        'error',
        { packageJsonLocation: '../package.json' }
      ],
      'react-hooks/exhaustive-deps': [
        'warn',
        { additionalHooks: 'useResource' }
      ]
    }
  }
)
