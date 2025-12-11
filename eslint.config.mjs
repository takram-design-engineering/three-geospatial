import eslint from '@eslint/js'
import nx from '@nx/eslint-plugin'
import love from 'eslint-config-love'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  nx.configs['flat/base'],
  nx.configs['flat/typescript'],
  nx.configs['flat/javascript'],
  nx.configs['flat/react'].map(config => {
    delete config.plugins?.import
    return config
  }),
  ...[eslint.configs.recommended, ...tseslint.configs.recommended].map(
    config => ({
      ...config,
      files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts']
    })
  ),
  {
    ignores: [
      '**/.nx',
      '**/dist',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*'
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*']
            }
          ]
        }
      ]
    }
  },
  {
    files: [
      '*.stories.ts',
      '*.stories.tsx',
      '**/stories/*.ts',
      '**/stories/*.tsx'
    ],
    rules: {
      '@nx/enforce-module-boundaries': 'off'
    }
  },
  {
    ...love,
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs'
    ],
    rules: {
      ...love.rules,

      // Insane nonsenses.
      complexity: 'off',
      'max-depth': 'off',
      'max-lines': 'off',
      'no-console': 'off',
      'no-negated-condition': 'off',
      'no-plusplus': 'off',
      'no-multi-assign': 'off',
      'prefer-named-capture-group': 'off',
      'no-await-in-loop': 'off',
      '@typescript-eslint/init-declarations': 'off',
      '@typescript-eslint/max-lines': 'off',
      '@typescript-eslint/max-params': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/prefer-destructuring': 'off',

      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // Only if the rulesets are error prone.
      'eslint-comments/require-description': 'off',
      'eslint-comments/no-unlimited-disable': 'off',

      // Mostly agree but it makes hook cleanup functions hard to distinguish.
      'arrow-body-style': 'off',

      // Then, how can we resolve promises in callbacks?
      'promise/avoid-new': 'off',

      // Allow in arguments and catch statements.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],

      // Empty interfaces have purposes.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',

      // It's not so harmful to coarse values to strings, especially inside
      // template strings from which we often construct messages.
      '@typescript-eslint/restrict-template-expressions': 'off',

      // Triple slash reference has a different purpose.
      '@typescript-eslint/triple-slash-reference': 'off',

      // Too many false positives. `T extends any` is totally type-safe when
      // used in type constraints.
      '@typescript-eslint/no-explicit-any': 'off',

      // Too many false positives.
      'no-param-reassign': 'off',
      'no-lonely-if': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/unified-signatures': 'off',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/class-literal-property-style': 'off',

      // Method signature has a purpose.
      '@typescript-eslint/method-signature-style': 'off',

      // To be determined. Turn this off for now.
      '@typescript-eslint/no-misused-spread': 'off',

      // This warns our own codes for backward compatibility.
      '@typescript-eslint/no-deprecated': 'off',

      // Overridden functions must use class methods.
      '@typescript-eslint/class-methods-use-this': [
        'error',
        { ignoreOverrideMethods: true }
      ]
    }
  },
  {
    files: ['**/eslint.config.mjs', '**/vite.config.ts', 'types/**/*.d.ts'],
    extends: [tseslint.configs.disableTypeChecked]
  }
)
